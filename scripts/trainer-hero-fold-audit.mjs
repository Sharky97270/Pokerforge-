#!/usr/bin/env node
/**
 * trainer-hero-fold-audit — HERO COUCHÉ : LA MAIN RESTE, EN SOUS-BRILLANCE
 *
 * Ce que le test unitaire prouve : l'ÉTAT (qui est couché, quand, par table).
 * Ce qu'il ne peut pas prouver : ce que l'écran PEINT. Une classe posée ne
 * garantit rien — une keyframe `deal` en `fill: both`, un `style=` inline, ou
 * un voile de siège hérité peuvent tous manger la règle. On mesure donc ici,
 * dans le navigateur, l'opacité EFFECTIVE (produit des opacités de tous les
 * ancêtres) et la chaîne de filtres réellement appliquée à la carte.
 *
 * Relevé, par mode (1T/2T/3T/4T) et par tuile :
 *
 *   AVANT le fold  — cartes d'Hero présentes, opacité effective ≈ 1
 *   APRÈS le fold  — cartes TOUJOURS présentes (mêmes rangs, même boîte),
 *                    opacité effective dans la fourchette lisible, filtre
 *                    de désaturation/assombrissement appliqué
 *   TABLE VOISINE  — inchangée : c'est la preuve que l'état est PAR TABLE
 *   GÉOMÉTRIE      — la boîte des cartes ne bouge pas d'un pixel (§15)
 *   VILAINS        — nombre de cartes adverses inchangé par le fold d'Hero
 *
 * Prérequis : serveur de dev lancé (port 7788).
 *   node scripts/trainer-hero-fold-audit.mjs --modes=1,2,3,4
 *   node scripts/trainer-hero-fold-audit.mjs --modes=1 --fh --shotDir=design-qa-evidence
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const MODES = arg('modes', '1,2,3,4').split(',').map(Number).filter(Boolean);
const W = +arg('w', 1920);
const H = +arg('h', 1080);
const STRUCT = arg('struct', '6J');
const OUT = arg('out', 'design-qa-evidence/trainer-hero-fold.json');
const SHOT_DIR = arg('shotDir', '');
/* Types de spot à demander avant le lancement (pastilles de l'écran de réglage).
   Utile pour atteindre un coup MULTIWAY : à trois joueurs, le fold d'Hero ne
   clôt pas la main — le coup continue entre les vilains, et c'est là seulement
   qu'on peut observer la sous-brillance traverser turn, river et abattement. */
const SPOTS = arg('spot', '').split(',').map(x => x.trim()).filter(Boolean);

/* La CIBLE contractuelle, lue dans la feuille de style : c'est le rendu FINAL
   (produit de toutes les opacités de la chaîne) qui doit la respecter, dans les
   quatre modes. Écrire ici un intervalle large laisserait passer exactement le
   défaut qu'on cherche — deux atténuations qui se multiplient en mosaïque et
   font tomber la carte à 0.30 pendant que le 1T rend 0.42. */
const CSS = fs.readFileSync(path.resolve(process.cwd(),'src/styles.js'),'utf8');
const CIBLE = Number(/--pf-hero-fold-opacity:\s*(\.?\d*\.?\d+)/.exec(CSS)[1]);
const TOLERANCE = 0.03;
/* Et la garde de bon sens : identifiable, mais pas encore « dans le coup ». */
const OPACITE_MIN = 0.30;
const OPACITE_MAX = 0.55;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ══ RELEVÉ ═══════════════════════════════════════════════════════════════ */
const PROBE = () => {
  /* L'opacité qui compte n'est pas celle déclarée sur la carte : c'est le
     PRODUIT de toutes les opacités de la chaîne d'ancêtres. C'est précisément
     ce qui distingue « la carte est atténuée » de « le siège entier est sous un
     voile » — et c'est là que deux atténuations se cumulent sans qu'on le voie
     dans la feuille de style. */
  const opaciteEffective = el => {
    let o = 1, n = el;
    while (n && n !== document.documentElement) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (Number.isFinite(v)) o *= v;
      n = n.parentElement;
    }
    return +o.toFixed(4);
  };
  const chaineFiltres = el => {
    const out = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const f = getComputedStyle(n).filter;
      if (f && f !== 'none') out.push(f);
      n = n.parentElement;
    }
    return out;
  };
  const boite = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };

  const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
  const conteneurs = tuiles.length ? tuiles : [document.querySelector('.t1-table-area') || document.body];

  return conteneurs.map(c => {
    const wrap = [...c.querySelectorAll('.hero-card-wrap')].filter(vu)[0] || null;
    const cartes = wrap ? [...wrap.querySelectorAll('.card')].filter(vu) : [];
    const c0 = cartes[0] || null;
    /* Les cartes ADVERSES visibles dans la même tuile : la règle Hero ne doit
       rien leur faire. */
    const dosVilains = [...c.querySelectorAll('.pf-villain-backs')].filter(vu).length;
    const facesVilaines = [...c.querySelectorAll('.pf-showdown-hand')].filter(vu).length;
    const boutons = [...c.querySelectorAll('button')].filter(b => vu(b) && !b.disabled)
      .map(b => (b.textContent || '').replace(/\s+/g, ' ').trim());
    return {
      aUnHero: !!wrap,
      nbCartes: cartes.length,
      /* Les rangs peints : si la sous-brillance « supprimait » la main, on le
         verrait ici — et c'est ce qu'on refuse. */
      rangs: cartes.map(k => ((k.querySelector('.card-corner-r') || {}).textContent || '') + ((k.querySelector('.card-corner-s') || {}).textContent || '')),
      classeCouche: wrap ? /hero-cards--folded/.test(wrap.className || '') : null,
      opaciteCarte: c0 ? +getComputedStyle(c0).opacity : null,
      opaciteEffective: c0 ? opaciteEffective(c0) : null,
      /* Qui atténue, exactement ? Sans cette chaîne, une opacité effective hors
         fourchette ne dit pas SI c est la règle Hero, le voile de siège couché ou
         la tuile non focalisée — trois causes, trois corrections différentes. */
      chaineOpacite: c0 ? (() => { const out=[]; let n=c0; while(n&&n!==document.documentElement){ const o=parseFloat(getComputedStyle(n).opacity); if(o<0.999) out.push({cls:(n.className||"").toString().slice(0,80),opacite:+o.toFixed(3)}); n=n.parentElement; } return out; })() : [],
      filtres: c0 ? chaineFiltres(c0) : [],
      boite: c0 ? boite(c0) : null,
      boiteWrap: wrap ? boite(wrap) : null,
      dosVilains, facesVilaines,
      boutons,
      aFold: boutons.some(t => /^fold/i.test(t)),
      street: (() => {
        const n = c.querySelectorAll('.pf-board-zone .card').length;
        return n >= 5 ? 'river' : n === 4 ? 'turn' : n >= 3 ? 'flop' : 'preflop';
      })(),
    };
  });
};

/* ══ PILOTAGE ═════════════════════════════════════════════════════════════ */
const browser = await puppeteer.launch({
  executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
const defauts = [];
const releves = [];
const ajoute = (code, detail) => defauts.push({ code, ...detail });

try {
  const page = await browser.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e).slice(0, 240)));
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const click = (txt, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')].find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; } return false;
  }, txt, exact);

  /* ── REVENIR À L'ÉCRAN DE RÉGLAGE, VRAIMENT ─────────────────────────────
     Piège mesuré : un simple `goto` ne suffit pas entre deux modes. La session
     en cours est restaurée, « Lancer la session » n'apparaît jamais, le clic
     sur « 2T » tombe dans le vide — et l'audit mesure alors le mode PRÉCÉDENT
     en croyant avoir changé, ou conclut « aucun spot avec fold ». On arrête donc
     explicitement la session avant de reconfigurer. */
  const ecranDeReglage = async () => {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await click('Entraineur GTO');
    await sleep(600);
    for (let i = 0; i < 40; i++) {
      const pret = await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => b.getBoundingClientRect().width > 2 && /Lancer la session/i.test(b.textContent || '')));
      if (pret) return true;
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find(x => x.getBoundingClientRect().width > 2 && /Arr[êe]ter/i.test(x.textContent || ''));
        if (b) b.click();
      });
      await sleep(400);
    }
    return false;
  };
  if (!(await ecranDeReglage())) ajoute('ecran-de-reglage-inatteignable', {});

  for (const m of MODES) {
    await click(`${m}T`); await sleep(250);
    await click(STRUCT); await sleep(250);
    if (flag('fh')) {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('button,div,span')]
          .filter(e => /Full Hand$/i.test((e.textContent || '').trim()))
          .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
        if (el) (el.closest('button') || el).click();
      });
      await sleep(300);
    }
    for (const t of SPOTS) {
      const ok = await page.evaluate(txt => {
        const e = [...document.querySelectorAll('div,span,button')]
          .find(x => x.children.length === 0 && x.textContent.trim() === txt);
        if (e) { e.click(); return true; } return false;
      }, t);
      if (!ok) ajoute('type-de-spot-introuvable', { mode: `${m}T`, spot: t });
      await sleep(200);
    }
    await click('Lancer la session', false);
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break;
      await sleep(400);
    }
    await sleep(1400);
    const tuilesVues = await page.evaluate(() => [...document.querySelectorAll('.mt-slot')]
      .filter(e => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; }).length);
    if (tuilesVues !== m) ajoute('mode-non-applique', { mode: `${m}T`, tuilesVues });
    /* On fige animations ET transitions : on veut l'ÉTAT STABILISÉ, pas une
       image prise au milieu des 140 ms de bascule. Note : ce gel neutralise
       aussi la keyframe `deal` — la mesure reste donc valable même si la règle
       d'opacité n'avait PAS le `!important` qui la protège en conditions
       réelles ; c'est le test unitaire qui verrouille ce point-là. */
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
    await sleep(200);

    /* ── TROUVER UN SPOT OÙ HERO PEUT SE COUCHER ────────────────────────────
       Tous les spots ne proposent pas Fold : un spot « premier à parler sans
       mise en face » n'offre que Check / Bet. On avance donc de main en main
       jusqu'à en trouver un — sinon on ne mesure rien du tout, et un audit qui
       ne mesure rien passe pour vert. */
    /* Quelle tuile propose Fold ? Exiger que ce soit la tuile 0 rendait l'audit
       dépendant du tirage : mesuré en 3T, la tuile 1 offrait « Fold » pendant
       que la 0 n'avait que Check/Bet, et l'audit concluait « aucun spot avec
       fold » alors que la situation cherchée était à l'écran. On retient la
       PREMIÈRE tuile qui l'offre ; toutes les autres servent de témoins. */
    const indexFold = () => page.evaluate(() => {
      const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
      const cibles = tuiles.length ? tuiles : [document];
      const offre = c => [...c.querySelectorAll('button.gto-btn-FOLD, button.ab-FOLD')].some(x => vu(x) && !x.disabled)
        || [...c.querySelectorAll('button')].some(x => vu(x) && !x.disabled && /^fold/i.test((x.textContent || '').trim()));
      return cibles.findIndex(offre);
    });
    const foldDispo = async () => (await indexFold()) >= 0;
    /* Passer à la main suivante n'est possible QUE sur une table déjà réglée.
       Tant qu'elle attend une décision, il n'y a pas de CTA : il faut d'abord
       répondre — avec n'importe quelle action, puisqu'on ne mesure pas celle-ci.
       Sans ce détour, le mode 4T sortait sur « aucun spot avec fold » alors que
       la table attendait simplement qu'on lui parle. */
    const ctaSuivante = () => page.evaluate(() => {
      const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
      /* En 1T la CTA « Main suivante » vit dans la COLONNE DE DROITE, pas dans
         la tuile. En mosaïque elle est par table (§44) — mais pas toujours au
         même instant : tant que le lot n'est pas réglé, seule une CTA globale
         peut exister. On cherche donc dans la tuile PUIS dans le document ;
         chercher au seul endroit attendu faisait conclure « aucun spot avec
         fold » alors que la table attendait simplement d'être relancée. */
      const dansTuile = tuiles.length > 1 ? tuiles[0] : document;
      const trouve = ou => [...ou.querySelectorAll('button.gto-next-btn')].filter(x => vu(x) && !x.disabled)[0]
        || [...ou.querySelectorAll('button')].filter(x => vu(x) && !x.disabled)
             .find(x => /suivante/i.test((x.textContent || '').trim()));
      const b = trouve(dansTuile) || trouve(document);
      if (b) { b.click(); return true; } return false;
    });
    /* En mosaïque, la CTA « Main suivante » d'une tuile n'apparaît pas tant que
       le lot n'est pas réglé : répondre sur la seule tuile 0 laissait les autres
       en attente, la CTA ne venait jamais, et l'audit sortait sur « aucun spot
       avec fold » — un faux négatif de pilotage, pas un défaut de rendu. On
       répond donc sur TOUTES les tuiles qui réclament encore une décision. */
    const repondNImporteQuoi = () => page.evaluate(() => {
      const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
      const cibles = tuiles.length ? tuiles : [document];
      let n = 0;
      for (const c of cibles) {
        /* JAMAIS Fold : ces clics ne servent qu'à faire défiler les mains. Un
           Fold ici coucherait le Hero des tuiles voisines, et le contrôle
           d'indépendance accuserait ensuite une « fuite d'état » qui n'est que
           la trace du pilotage. Défaut de mesure relevé en 4T. */
        const b = [...c.querySelectorAll('button.gto-btn')].filter(x => vu(x) && !x.disabled)
          .find(x => !/gto-btn-FOLD/.test(x.className) && !/^fold/i.test((x.textContent || '').trim()));
        if (b) { b.click(); n++; }
      }
      return n > 0;
    });
    const mainSuivante = async () => {
      if (await ctaSuivante()) return true;
      /* Deux passes : le vilain répond parfois entre les deux, et la CTA
         n'arrive qu'après sa réponse. */
      for (let i = 0; i < 3; i++) {
        if (!(await repondNImporteQuoi())) break;
        await sleep(1000);
        if (await ctaSuivante()) return true;
      }
      return await ctaSuivante();
    };
    /* ── §7 — LE FOLD DOIT SURVIVRE AU CHANGEMENT DE STREET ─────────────────
       En coup complet, se coucher AU PRÉFLOP clôt la main : il n'y a pas de flop
       à observer, et un audit qui folde au préflop conclut « une seule street »
       en croyant avoir tout vu. Pour éprouver la règle, il faut d'abord ENTRER
       dans le coup (répondre autre chose que Fold), attendre le board, et se
       coucher LÀ. Ce qui suit — turn, river, abattement entre vilains — est
       exactement le scénario du §7. */
    const board = () => page.evaluate(() => {
      const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
      const cible = tuiles.length ? tuiles[0] : document;
      return cible.querySelectorAll('.pf-board-zone .card').length;
    });
    const entreDansLeCoup = () => page.evaluate(() => {
      const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
      const cible = tuiles.length ? tuiles[0] : document;
      const b = [...cible.querySelectorAll('button.gto-btn')].filter(x => vu(x) && !x.disabled)
        .find(x => !/gto-btn-FOLD/.test(x.className));
      if (b) { b.click(); return true; } return false;
    });
    let trouve = false;
    if (flag('fh')) {
      for (let essai = 0; essai < 30; essai++) {
        if ((await board()) >= 3 && (await foldDispo())) { trouve = true; break; }
        if (await entreDansLeCoup()) { await sleep(1100); continue; }
        if (!(await mainSuivante())) break;
        await sleep(900);
      }
    } else {
      trouve = await foldDispo();
      /* La file de spots est aléatoire : certains lots enchaînent longtemps des
         situations sans Fold (premier à parler, rien à payer). On cherche donc
         largement — mais on s'arrête net quand la SESSION est finie, sinon on
         continue de cliquer dans le vide sur l'écran de résultats et le rapport
         accuse le rendu d'un défaut qui n'existe pas. */
      const sessionFinie = () => page.evaluate(() => [...document.querySelectorAll('button')]
        /* Piège : « Relancer » est aussi le verbe des boutons de RELANCE
           (« Relancer à 7bb »). Un motif trop large déclarait la session finie
           au premier spot venu. On ne reconnaît que l'écran de fin. */
        .some(b => b.getBoundingClientRect().width > 2 && /Nouvelle session|Retravailler erreurs|Reprendre la session/i.test(b.textContent || '')));
      for (let essai = 0; essai < 40 && !trouve; essai++) {
        if (await sessionFinie()) { ajoute('session-epuisee-avant-un-spot-avec-fold', { mode: `${m}T`, essais: essai }); break; }
        if (!(await mainSuivante())) break;
        await sleep(800);
        trouve = await foldDispo();
      }
    }
    if (!trouve) {
      /* Sans le détail, « aucun spot avec fold » ne dit pas si le Trainer n'a
         jamais proposé Fold ou si le pilotage n'a pas su avancer. */
      const vuAuDernierEssai = await page.evaluate(PROBE);
      ajoute('aucun-spot-avec-fold', { mode: `${m}T`, tuiles: vuAuDernierEssai.length, boutons: vuAuDernierEssai.map(t => t.boutons) });
      await ecranDeReglage(); continue;
    }

    const avant = await page.evaluate(PROBE);
    if (SHOT_DIR) {
      fs.mkdirSync(path.resolve(SHOT_DIR), { recursive: true });
      await page.screenshot({ path: path.resolve(SHOT_DIR, `hero-fold-${m}T-avant.png`) });
    }

    /* ── Contrôle AVANT : Hero est dans le coup, sa main est en pleine forme ── */
    avant.forEach((t, i) => {
      if (!t.aUnHero) return;
      if (t.classeCouche) ajoute('etat-couche-avant-toute-action', { mode: `${m}T`, tuile: i });
      if (t.opaciteEffective !== null && Math.abs(t.opaciteEffective - CIBLE) <= TOLERANCE)
        ajoute('hero-actif-deja-attenue', { mode: `${m}T`, tuile: i, opacite: t.opaciteEffective });
      if (t.nbCartes !== 2) ajoute('hero-sans-ses-deux-cartes', { mode: `${m}T`, tuile: i, n: t.nbCartes });
    });

    /* ── On couche Hero SUR LA PREMIÈRE TUILE SEULEMENT ─────────────────────
       C'est le cœur de la preuve multitabling : si l'état était global, les
       autres tuiles s'atténueraient aussi. */
    const iFold = Math.max(0, await indexFold());
    const aClique = await page.evaluate(i => {
      const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
      const cible = tuiles.length ? tuiles[i] : document;
      if (!cible) return false;
      const b = [...cible.querySelectorAll('button.gto-btn-FOLD, button.ab-FOLD')].filter(x => vu(x) && !x.disabled)[0]
        || [...cible.querySelectorAll('button')].filter(x => vu(x) && !x.disabled)
             .find(x => /^fold/i.test((x.textContent || '').replace(/\s+/g, ' ').trim()));
      if (b) { b.click(); return true; }
      return false;
    }, iFold);
    if (!aClique) { ajoute('pas-de-bouton-fold', { mode: `${m}T` }); await ecranDeReglage(); continue; }
    await sleep(900);

    const apres = await page.evaluate(PROBE);
    if (SHOT_DIR) await page.screenshot({ path: path.resolve(SHOT_DIR, `hero-fold-${m}T-apres.png`) });

    /* ── Contrôle APRÈS, tuile 0 ────────────────────────────────────────── */
    const a0 = avant[iFold], p0 = apres[iFold];
    let deplacementReponse = null;
    if (p0) {
      if (!p0.classeCouche) ajoute('classe-couche-absente', { mode: `${m}T` });
      if (p0.nbCartes !== 2)
        ajoute('main-hero-disparue-au-fold', { mode: `${m}T`, n: p0.nbCartes });
      if (a0 && JSON.stringify(a0.rangs) !== JSON.stringify(p0.rangs))
        ajoute('cartes-hero-changees-au-fold', { mode: `${m}T`, avant: a0.rangs, apres: p0.rangs });
      const o = p0.opaciteEffective;
      if (o === null) ajoute('opacite-illisible', { mode: `${m}T` });
      else if (o > OPACITE_MAX) ajoute('attenuation-insuffisante', { mode: `${m}T`, opacite: o, max: OPACITE_MAX });
      else if (o < OPACITE_MIN) ajoute('cartes-quasi-supprimees', { mode: `${m}T`, opacite: o, min: OPACITE_MIN });
      else if (Math.abs(o - CIBLE) > TOLERANCE)
        ajoute('rendu-different-de-la-cible-partagee', { mode: `${m}T`, opacite: o, cible: CIBLE, chaine: p0.chaineOpacite });
      const f = (p0.filtres || []).join(' ');
      if (!/saturate\(/.test(f)) ajoute('pas-de-desaturation', { mode: `${m}T`, filtres: p0.filtres });
      if (!/brightness\(/.test(f)) ajoute('pas-d-assombrissement', { mode: `${m}T`, filtres: p0.filtres });
      /* ── §15 — LA SOUS-BRILLANCE NE DÉPLACE NI NE REDIMENSIONNE RIEN ──────
         Piège de mesure : comparer la boîte AVANT la réponse à celle d'APRÈS
         ne prouve rien. Toute réponse d'Hero — Check compris — fait grandir son
         médaillon d'un pixel et redescend ses cartes de ~9 px ; c'est le rendu
         du siège « qui a parlé », mesuré identique sur un CHECK, et cela n'a
         rien à voir avec le fold. On isole donc l'effet réel : on retire la
         classe de sous-brillance SUR PLACE, sans rien changer d'autre, et on
         compare. Tout écart non nul est imputable à la règle, et à elle seule. */
      const geo = await page.evaluate(i => {
        const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
        const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
        const cible = tuiles.length ? tuiles[i] : document;
        const w = [...cible.querySelectorAll('.hero-card-wrap')].filter(vu)[0];
        if (!w) return null;
        const c = [...w.querySelectorAll('.card')].filter(vu)[0];
        if (!c) return null;
        const R = e => { const b = e.getBoundingClientRect(); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
        const avecClasse = { carte: R(c), wrap: R(w) };
        w.classList.remove('hero-cards--folded');
        void w.offsetHeight;
        const sansClasse = { carte: R(c), wrap: R(w) };
        w.classList.add('hero-cards--folded');
        return { avecClasse, sansClasse };
      }, iFold);
      if (geo) {
        for (const cle of ['carte', 'wrap']) {
          const d = ['x', 'y', 'w', 'h'].map(k => Math.abs(geo.avecClasse[cle][k] - geo.sansClasse[cle][k]));
          if (Math.max(...d) > 0.01)
            ajoute('la-sous-brillance-deplace-les-cartes', { mode: `${m}T`, sur: cle, avec: geo.avecClasse[cle], sans: geo.sansClasse[cle], ecarts: d });
        }
      }
      /* Ce que le fold DÉPLACE malgré tout, à titre d'information : c'est le
         siège « qui a parlé », pas la sous-brillance (voir ci-dessus). */
      if (a0 && a0.boite && p0.boite)
        deplacementReponse = ['x', 'y', 'w', 'h'].map(k => +(p0.boite[k] - a0.boite[k]).toFixed(1));
      /* Les cartes vilaines ne sont pas concernées par la règle Hero. */
      if (a0 && a0.dosVilains !== p0.dosVilains)
        ajoute('cartes-vilaines-affectees', { mode: `${m}T`, avant: a0.dosVilains, apres: p0.dosVilains });
    }

    /* ── Contrôle APRÈS, tuiles voisines : rigoureusement intactes ──────── */
    for (let i = 0; i < apres.length; i++) {
      if (i === iFold) continue;
      const t = apres[i];
      if (!t.aUnHero) continue;
      if (t.classeCouche)
        ajoute('etat-couche-fuite-vers-une-autre-table', { mode: `${m}T`, tuile: i });
      /* Une tuile voisine qui a déjà répondu porte le voile « table réglée »
         (0.72) : effet légitime et indépendant. Ce qu'on interdit ici, c'est
         qu'elle tombe au NIVEAU DU HERO COUCHÉ — signe d'un état partagé. */
      if (t.opaciteEffective !== null && Math.abs(t.opaciteEffective - CIBLE) <= TOLERANCE)
        ajoute('table-voisine-attenuee-comme-un-hero-couche', { mode: `${m}T`, tuile: i, opacite: t.opaciteEffective });
    }

    /* ── §7 — le fold traverse les streets (coup complet uniquement) ────── */
    let streets = null;
    if (flag('fh')) {
      streets = [];
      for (let pas = 0; pas < 12; pas++) {
        const s = await page.evaluate(PROBE);
        const t = s[iFold];
        if (t) streets.push({ street: t.street, couche: t.classeCouche, opacite: t.opaciteEffective, nbCartes: t.nbCartes });
        const avance = await page.evaluate(() => {
          const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
          const tuiles = [...document.querySelectorAll('.mt-slot')].filter(vu);
          const cible = tuiles.length ? tuiles[0] : document;
          const b = [...cible.querySelectorAll('button')].filter(x => vu(x) && !x.disabled)
            .find(x => /suivante|continuer|street|river/i.test((x.textContent || '').trim()));
          if (b) { b.click(); return true; } return false;
        });
        if (!avance) break;
        await sleep(700);
      }
      const vues = new Set(streets.map(s => s.street));
      streets.filter(s => s.nbCartes === 2 && s.couche === false).forEach(s =>
        ajoute('fold-oublie-au-changement-de-street', { mode: `${m}T`, street: s.street, opacite: s.opacite }));
      if (vues.size < 2)
        ajoute('info-une-seule-street-observee', { mode: `${m}T`, streets: [...vues] });
    }

    releves.push({ mode: `${m}T`, tuileCouchee: iFold, avant, apres, streets, deplacementReponse });
    /* Retour au réglage pour le mode suivant. */
    if (MODES.indexOf(m) < MODES.length - 1 && !(await ecranDeReglage()))
      ajoute('ecran-de-reglage-inatteignable', { avantMode: `${m}T` });
  }

  const rapport = {
    url: URL, viewport: `${W}x${H}`, modes: MODES, fullHand: flag('fh'),
    fourchetteOpacite: [OPACITE_MIN, OPACITE_MAX],
    erreursPage: erreurs,
    defauts, releves,
  };
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUT), JSON.stringify(rapport, null, 2));
  }

  console.log(`\n══ HERO COUCHÉ — SOUS-BRILLANCE (${W}×${H}) ══`);
  for (const r of releves) {
    const a = r.avant[r.tuileCouchee], p = r.apres[r.tuileCouchee];
    console.log(`\n${r.mode}  (tuile couchée : T${r.tuileCouchee + 1})  avant: opacité ${a?.opaciteEffective}  cartes ${JSON.stringify(a?.rangs)}`);
    console.log(`     après: opacité ${p?.opaciteEffective}  cartes ${JSON.stringify(p?.rangs)}  classe ${p?.classeCouche}`);
    console.log(`     filtres: ${JSON.stringify(p?.filtres)}`);
    if (r.apres.length > 1)
      console.log(`     voisines: ${r.apres.map((t, i) => (i === r.tuileCouchee ? null : `T${i + 1}=${t.opaciteEffective}/${t.classeCouche}`)).filter(Boolean).join(' ')}`);
    if (r.streets) console.log(`     streets: ${r.streets.map(s => `${s.street}:${s.couche ? 'couché' : 'NORMAL'}@${s.opacite}`).join(' → ')}`);
  }
  const durs = defauts.filter(d => !/^info-/.test(d.code));
  console.log(`\n${durs.length ? '❌' : '✅'} ${durs.length} défaut(s)`);
  durs.forEach(d => console.log('  ✗ ' + JSON.stringify(d)));
  if (OUT) console.log(`\nRapport : ${OUT}`);
  process.exitCode = durs.length ? 1 : 0;
} finally {
  await browser.close();
}
