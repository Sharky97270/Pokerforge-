#!/usr/bin/env node
/**
 * trainer-fullhand-audit — LE COUP COMPLET, JOUÉ JUSQU'À L'ATTRIBUTION (C3/C8)
 *
 * POURQUOI CE SCRIPT EXISTE
 * `test-full-hand-rules.mjs` prouve les règles sur le MOTEUR. Il ne prouve rien
 * sur le CÂBLAGE : c'est précisément là que se trouvaient les défauts mesurés.
 *   M6① `createFullHand` recevait le pot préflop ET les tapis intacts — deux
 *       joueurs à 20bb arrivaient au flop avec 48bb sur la table ;
 *   M6② la plaque du siège lisait `spot.stack`, jamais l'état vivant : le
 *       panneau disait 16bb pendant que le siège disait 20bb ;
 *   M7③ le rendu écrivait `winner==="villain" ? "lose" : "win"` — une égalité
 *       était portée au crédit du joueur ;
 *   M7④ le pot n'était jamais reversé : le coup se terminait sur un pot
 *       orphelin, donc aucun résultat en bb n'était dérivable des jetons.
 *
 * CE QU'IL VÉRIFIE, sur des coups RÉELLEMENT joués dans l'application :
 *   F1 conservation      tapis + pot constant à chaque décision ;
 *   F2 continuité        au flop, les engagements préflop ont quitté les tapis ;
 *   F3 plaque == moteur  la plaque du siège porte le tapis vivant ;
 *   F4 issue distincte   gagnée / perdue / PARTAGÉE, jamais confondues ;
 *   F5 pot versé         le coup se termine sans pot orphelin ;
 *   F6 montants          le bouton annonce ce que le moteur engage.
 *
 * ── AJOUT : LE MULTIWAY EST OBSERVÉ, PLUS SEULEMENT TESTÉ ──────────────────
 * Le coup complet ne se jouait qu'en heads-up ; les side pots étaient calculés
 * par `potDistribution` mais jamais atteints, et le refus multiway ne s'était
 * JAMAIS déclenché sur l'échantillon navigateur (refusExplicite : 0 sur 36
 * tentatives) — la règle était couverte par un test unitaire, pas par une
 * observation à l'écran. Le moteur joue désormais N joueurs, et cet instrument
 * le regarde faire :
 *   F7 paliers emboîtés  chaque side pot est disputé par un SOUS-ensemble
 *                        strict du palier précédent, et les joueurs écartés
 *                        ont engagé moins que ceux qui restent ;
 *   F8 pot entièrement   la somme des paliers et la somme des versements
 *      versé             valent exactement le pot disputé ;
 *   F9 table observée    le nombre de joueurs assis au flop est relevé, main
 *                        par main (`--multiway=N` exige N coups à 3 joueurs+).
 *
 *   node scripts/trainer-fullhand-audit.mjs --url=http://localhost:7799 --hands=20
 *   node scripts/trainer-fullhand-audit.mjs --spot=Squeeze --hands=12 --multiway=4
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const HANDS = +arg('hands', 20);
const W = +arg('w', 1920), H = +arg('h', 1080);
const OUT = path.resolve(arg('out', 'design-qa-evidence/trainer-fullhand.json'));
const SHOTS = arg('shots', 'design-qa-evidence/probe');
const SHOT_NAME = arg('shot', 'trainer-fullhand.png');
/* Types de spot à activer avant le lancement (pastilles « Type de spot »).
   « Squeeze » est le seul générateur qui pose un SUIVEUR entre l'ouvreur et
   Hero : c'est par lui qu'on obtient des coups complets à trois joueurs. */
const SPOTS = arg('spot', '').split(',').map(s => s.trim()).filter(Boolean);
const MULTIWAY_MIN = +arg('multiway', 0);
/* Comment Hero joue sa decision preflop : 'call' (defaut) ou 'raise'. */
const HERO_MODE = arg('hero', 'call');
/* Nombre minimal de sieges supplementaires ayant REPONDU a la relance d Hero.
   Exiger du multiway en mode 'raise' n aurait pas de sens : un suiveur qui se
   couche face a un squeeze fait exactement ce qu il doit faire. Ce qu on veut
   verifier ici, c est qu il a PARLE. */
const REPONSES_MIN = +arg('reponses', 0);

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouve.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HELPERS = () => {
  const bb = t => { const m = String(t || '').replace(',', '.').match(/(-?\d+(?:\.\d+)?)\s*bb/i); return m ? parseFloat(m[1]) : null; };
  window.__fh = {
    setSmode(n) { const el = [...document.querySelectorAll('.smpill')].find(e => (e.querySelector('.smnum') || {}).textContent === String(n)); if (el) { el.click(); return true; } return false; },
    clickLeaf(t) { const e = [...document.querySelectorAll('div,span,button')].find(x => x.children.length === 0 && x.textContent.trim() === t); if (e) { e.click(); return true; } return false; },
    launch() { const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent)); if (b) { b.click(); return true; } return false; },

    /* Le coup complet est un TYPE DE SESSION : il se choisit AVANT le
       lancement (pastille « Full Hand »), puis chaque main enchaîne
       automatiquement du préflop au showdown. */
    choisirFullHand() {
      const e = [...document.querySelectorAll('div,span,button')]
        .find(x => x.children.length === 0 && /^(?:\S+\s+)?Full Hand$/i.test((x.textContent || '').trim()));
      if (e) { e.click(); return true; }
      return false;
    },
    enCoupComplet() {
      return [...document.querySelectorAll('button.ab')].some(b => b.getBoundingClientRect().width > 0);
    },
    ledger() {
      const e = document.querySelector('[data-pf-ledger]');
      if (!e) return null;
      try { return JSON.parse(e.getAttribute('data-pf-ledger')); } catch { return null; }
    },
    spotInfo() {
      const e = document.querySelector('[data-pf-spot]');
      const v = e && e.getAttribute('data-pf-spot');
      if (!v) return null;
      try { const s = JSON.parse(v); return { cat: s.cat, kind: s.kindLigne, extras: s.extras || [], hpos: s.hpos, vpos: s.vpos, coups: s.coups || [], engagementsLigne: s.engagements || null, toCall: s.toCall, contribs: s.contribs || null, vact: s.vact || null, heroCommitted: s.heroCommitted, facing: s.facing }; } catch { return null; }
    },
    /* État VIVANT du moteur de coup complet : qui est assis, qui parle, quels
       paliers ont été disputés. Le ledger décrit le spot, pas la table assise
       au flop — sans cette sonde, un audit ne peut pas distinguer un coup
       heads-up d'un coup à trois. */
    fullhand() {
      const e = document.querySelector('[data-pf-fullhand]');
      const v = e && e.getAttribute('data-pf-fullhand');
      if (!v) return null;
      try { return JSON.parse(v); } catch { return null; }
    },
    /* Boutons d'action du coup complet (classe `ab`). */
    fhButtons() {
      return [...document.querySelectorAll('button.ab')].filter(b => b.getBoundingClientRect().width > 0).map(b => ({
        label: (b.childNodes[0] && b.childNodes[0].textContent || '').trim(),
        sub: (b.querySelector('.ab-sub') || {}).textContent || '',
        cls: b.className,
      }));
    },
    clickFh(re) {
      const b = [...document.querySelectorAll('button.ab')].filter(x => x.getBoundingClientRect().width > 0)
        .find(x => re.test(x.textContent));
      if (b) { b.click(); return true; }
      return false;
    },
    clickFhAny() {
      const b = [...document.querySelectorAll('button.ab')].filter(x => x.getBoundingClientRect().width > 0 && !/Fold/i.test(x.textContent));
      if (b.length) { b[Math.floor(Math.random() * b.length)].click(); return true; }
      return false;
    },
    /* Verdict de fin de coup. */
    verdict() {
      const t = document.body.innerText;
      if (/POT PARTAG/i.test(t)) return 'split';
      if (/MAIN GAGN/i.test(t)) return 'win';
      if (/MAIN PERDUE/i.test(t)) return 'lose';
      return null;
    },
    resultat() {
      const m = document.body.innerText.match(/R[ée]sultat\s*([+-]?[\d.]+)bb/i);
      const p = document.body.innerText.match(/Pot disput[ée]\s*([\d.]+)bb/i);
      return { net: m ? parseFloat(m[1]) : null, potDispute: p ? parseFloat(p[1]) : null };
    },
    plaques() {
      return [...document.querySelectorAll('.pf-seat-nameplate, .pf-mt-nameplate')].map(n => {
        const spans = [...n.querySelectorAll('span')];
        const POS = /^(UTG\+1|UTG|MP|LJ|HJ|CO|BTN|SB|BB|EP)$/;
        const pos = (n.querySelector('.seat-card-pos') || spans.find(e => POS.test((e.textContent || '').trim())) || {}).textContent || '?';
        return { pos: pos.trim(), stack: bb((n.querySelector('.seat-card-stack') || {}).textContent) };
      });
    },
    nextHand() {
      const b = [...document.querySelectorAll('button')].find(x => /suivante/i.test(x.textContent) && !x.disabled && x.getBoundingClientRect().width > 0);
      if (b) { b.click(); return true; }
      return false;
    },
    /* `mode` = 'call' (par defaut) ou 'raise'.
       En 'raise', Hero prend l'action AGRESSIVE quand elle existe : c'est la
       seule facon d'exercer la reponse des sieges supplementaires, qui ne se
       declenche que si Hero releve le niveau. Un audit qui appelle toujours
       l'ouverture ne fait jamais parler le suiveur. */
    heroAct(mode) {
      const b = [...document.querySelectorAll('button.gto-btn')].filter(x => x.getBoundingClientRect().width > 0);
      const agressif = x => /squeeze|raise|3-?bet|4-?bet|bet|all-?in|shove|jam/i.test(x.textContent);
      const pick = mode === 'raise'
        ? (b.find(agressif) || b.find(x => /Call/i.test(x.textContent)) || b.find(x => !/Fold/i.test(x.textContent)) || b[0])
        : (b.find(x => /Call/i.test(x.textContent)) || b.find(x => !/Fold/i.test(x.textContent)) || b[0]);
      if (pick) { pick.click(); return (pick.querySelector('.gto-btn-label') || {}).textContent || '?'; }
      return null;
    },
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text().slice(0, 180)); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 180)));

const waitFor = async (fn, a, label, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    await page.evaluate(HELPERS);
    if (await page.evaluate(fn, a)) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(150);
  }
};

await page.goto(URL, { waitUntil: 'networkidle2' });
await waitFor(() => { const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent)); if (e) { e.click(); return true; } return false; }, null, 'onglet');
await waitFor(() => !!document.querySelector('.mtbtn'), null, 'bandeau');
await waitFor(n => window.__fh.setSmode(n), 100, 'longueur');
await sleep(200);
/* Types de spot demandés : les pastilles sont de simples boutons portant le
   libellé exact. Un type introuvable fait ÉCHOUER l'audit — mesurer sur un
   filtre qui n'a pas été appliqué reviendrait à mesurer autre chose. */
for (const s of SPOTS) {
  const ok = await waitFor(t => window.__fh.clickLeaf(t), s, `type de spot ${s}`, 6000);
  if (!ok) { console.error(`Type de spot « ${s} » introuvable — audit impossible.`); await browser.close(); process.exit(2); }
  await sleep(150);
}
const modeChoisi = await waitFor(() => window.__fh.choisirFullHand(), null, 'type de session Full Hand');
if (!modeChoisi) { console.error('Type de session « Full Hand » introuvable — audit impossible.'); await browser.close(); process.exit(2); }
await sleep(300);
await waitFor(() => window.__fh.launch(), null, 'lancement');
await sleep(1200);

const R2 = v => Math.round(v * 100) / 100;
const mains = [];
const findings = [];
const note = (code, i, detail) => findings.push({ code, main: i, ...detail });

const tentatives = { total: 0, coupsLances: 0, refusExplicite: 0, resoluPreflop: 0, sansAction: 0, interrompus: 0 };
const kindsJoues = {};
let shotMultiway = false;
let spotsAvecExtras = 0;
let garde = 0;
/* Le plafond de TENTATIVES, pas d'exigence : il faut toujours `HANDS` coups
   complets pour que l'audit passe. Il a été relevé de 6× à 14× parce que le
   Vilain se couche désormais avec les mains faibles — plus de mains se
   résolvent au préflop, donc il faut en tirer davantage pour en jouer 20
   jusqu'au bout. Baisser `HANDS` aurait été un relâchement ; augmenter le
   nombre d'essais n'en est pas un. */
while (mains.length < HANDS && garde++ < HANDS * 14) {
  tentatives.total++;
  /* ── ATTENDRE UN ÉTAT JOUABLE, PAS LE CONSOMMER ─────────────────────────
     Entre deux mains, la table passe par des instants sans aucun bouton :
     réflexion du vilain, animation de collecte, CTA « Main suivante » pas
     encore active. L'ancienne boucle comptait chacun de ces instants comme une
     TENTATIVE et repartait — mesuré : 257 tentatives sur 280 sans action, pour
     18 coups réellement lancés. Le plafond servait à attendre, pas à jouer.
     On patiente donc explicitement jusqu'à ce qu'il y ait quelque chose à
     faire, et seules les vraies tentatives sont comptées. */
  const jouable = await waitFor(
    () => window.__fh.enCoupComplet()
      || [...document.querySelectorAll('button.gto-btn')].some(x => x.getBoundingClientRect().width > 0),
    null, 'état jouable', 9000);
  if (!jouable) {
    tentatives.sansAction++;
    await page.evaluate(HELPERS);
    const avance = await page.evaluate(() => window.__fh.nextHand());
    if (!avance) break;                 // la session est terminée : rien à attendre de plus
    await sleep(900);
    continue;
  }
  await page.evaluate(HELPERS);
  /* Le coup complet démarre quand Hero CONTINUE au préflop (call ou relance).
     Tant que la barre d'action du coup complet n'est pas montée, on joue la
     décision préflop. */
  if (!await page.evaluate(() => window.__fh.enCoupComplet())) {
    const joue = await page.evaluate(m => window.__fh.heroAct(m), HERO_MODE);
    if (!joue) { tentatives.sansAction++; await page.evaluate(HELPERS); await page.evaluate(() => window.__fh.nextHand()); await sleep(700); continue; }
    /* ── ATTENDRE LA MONTÉE DU COUP, PAS UNE DURÉE ──────────────────────────
       Ici dormait `sleep(2400)`. Ce délai suffit quand Hero SUIT l'ouverture,
       mais pas quand il RELANCE : le chemin comporte alors une réaction du
       vilain en plus (réflexion ~0.5-0.9s, commit, puis `startFullHand` posé à
       +1.5s), soit ~3.4s. L'instrument déclarait donc « résolu au préflop » des
       coups qui montaient une fraction de seconde plus tard — mesuré en mode
       `--hero=raise` : 25 tentatives sur 41 classées à tort.

       On attend l'ÉVÉNEMENT (la barre d'action du coup complet, ou un verdict
       qui clôt vraiment la main), avec un plafond. Mesurer la patience de
       l'instrument n'apprend rien sur le produit. */
    await waitFor(
      () => window.__fh.enCoupComplet() || !!window.__fh.verdict()
        || /COUP COMPLET INDISPONIBLE/i.test(document.body.innerText),
      null, 'montée du coup complet', 7000);
    await page.evaluate(HELPERS);
    if (!await page.evaluate(() => window.__fh.enCoupComplet())) {
      /* ── POURQUOI CETTE TENTATIVE N'A PAS PRODUIT DE COUP COMPLET ────────
         Sans cette distinction, « 17 mains sur 20 » ne dit pas si l'instrument
         manque de tentatives ou si le produit refuse. Deux causes possibles :
         le Trainer refuse explicitement (multiway → side pots non joués), ou le
         coup s'est simplement résolu au préflop. */
      const refus = await page.evaluate(() => /COUP COMPLET INDISPONIBLE/i.test(document.body.innerText));
      if (refus) tentatives.refusExplicite++; else tentatives.resoluPreflop++;
      await page.evaluate(() => window.__fh.nextHand());
      await sleep(800);
      continue;
    }
  }
  tentatives.coupsLances++;
  /* Nature du spot dont ce coup est issu : sans elle, « 0 main multiway » ne
     dit pas si le moteur refuse le multiway ou si le générateur n'en produit
     pas. Deux causes très différentes, un même chiffre. */
  await page.evaluate(HELPERS);
  const infoSpot = await page.evaluate(() => window.__fh.spotInfo());
  if (infoSpot) { kindsJoues[infoSpot.kind || '?'] = (kindsJoues[infoSpot.kind || '?'] || 0) + 1; if (infoSpot.extras.length) spotsAvecExtras++; }

  const main = { i: mains.length + 1, etapes: [], verdict: null, resultat: null, joueurs: null, nb: null, paliers: null, sidePots: null, spot: infoSpot };
  let pas = 0;
  let totalReference = null;
  let totalMoteur = null;

  while (pas++ < 24) {
    await page.evaluate(HELPERS);
    const snap = await page.evaluate(() => ({
      ledger: window.__fh.ledger(),
      boutons: window.__fh.fhButtons(),
      plaques: window.__fh.plaques(),
      verdict: window.__fh.verdict(),
      fh: window.__fh.fullhand(),
    }));
    /* ── F9 — COMBIEN DE JOUEURS SONT RÉELLEMENT ASSIS ────────────────────
       Relevé à l'écran, pas déduit du spot : c'est la seule façon de dire
       « ce coup s'est joué à trois » sans le supposer. */
    if (snap.fh && snap.fh.actif) {
      if (main.nb == null || snap.fh.nb > main.nb) { main.nb = snap.fh.nb; main.joueurs = snap.fh.joueurs; }
      /* PREUVE VISUELLE d'un coup complet à trois joueurs : un chiffre dans un
         JSON ne montre pas trois sièges avec des jetons devant eux. */
      if (snap.fh.nb >= 3 && !shotMultiway && snap.fh.street !== 'flop') {
        shotMultiway = true;
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, 'trainer-multiway-en-jeu.png') });
      }
      /* ── L'ÉTAT D'ENTRÉE AU FLOP ─────────────────────────────────────────
         Le tour d'enchères préflop est CLOS quand le flop tombe : tout joueur
         encore assis y a donc engagé le MÊME montant. Un écart ici n'est pas
         un side pot, c'est une ligne préflop inachevée.

         On lit l'engagement PRÉFLOP seul, jamais l'engagement total : entre le
         moment où le coup démarre et celui où la sonde est relue, l'adversaire
         hors de position a souvent déjà misé au flop. Comparer des totaux
         faisait alors crier au déséquilibre là où il n'y avait qu'une mise —
         mesuré : 4 « écarts » qui étaient tous des c-bets. */
      if (!main.engagePreflop && snap.fh.engagePreflop) {
        main.engagePreflop = snap.fh.engagePreflop;
        const v = Object.values(snap.fh.engagePreflop);
        if (v.length > 1 && Math.max(...v) - Math.min(...v) > 0.051) {
          note('F10-flop-non-egalise', main.i, {
            engagePreflop: snap.fh.engagePreflop, joueurs: snap.fh.joueurs, pot: snap.fh.pot, spot: infoSpot,
            ledger: snap.ledger && { pot: snap.ledger.pot, potStreet: snap.ledger.potStreet, potCarried: snap.ledger.potCarried },
          });
        }
      }
      /* Conservation vue par le MOTEUR (tapis + pot), en plus de celle vue par
         le ledger du spot : deux comptabilités indépendantes qui doivent dire
         la même chose. */
      const tot = R2(Object.values(snap.fh.tapis || {}).reduce((a, v) => a + v, 0) + snap.fh.pot);
      if (!snap.fh.fini) {
        if (totalMoteur == null) totalMoteur = tot;
        else if (Math.abs(tot - totalMoteur) > 0.051) {
          note('F1-conservation-moteur', main.i, { attendu: totalMoteur, obtenu: tot, street: snap.fh.street, joueurs: snap.fh.nb });
          totalMoteur = tot;
        }
      }
    }
    if (!snap.ledger) break;
    const L = snap.ledger;
    const total = R2(Object.values(L.sieges).reduce((a, s) => a + s.restant, 0) + L.pot);

    /* F1 — conservation : le total ne bouge pas d'une décision à l'autre. */
    if (totalReference == null) totalReference = total;
    else if (Math.abs(total - totalReference) > 0.051) {
      note('F1-conservation', main.i, { totalAttendu: totalReference, totalObtenu: total, pot: L.pot, etape: pas });
      totalReference = total;
    }
    /* F2 — continuité : au flop, les engagements préflop ont quitté les tapis. */
    for (const [pos, s] of Object.entries(L.sieges)) {
      if (Math.abs(s.initial - (s.restant + s.total)) > 0.051) {
        note('F2-siege-non-conserve', main.i, { position: pos, initial: s.initial, restant: s.restant, engage: s.total });
      }
      if (s.restant < -0.011) note('F2-tapis-negatif', main.i, { position: pos, restant: s.restant });
    }
    /* F3 — la plaque du siège porte le tapis du moteur. */
    for (const p of snap.plaques) {
      const s = L.sieges[p.pos];
      if (s && p.stack != null && Math.abs(p.stack - s.restant) > 0.051) {
        note('F3-plaque-vs-moteur', main.i, { position: p.pos, plaque: p.stack, moteur: s.restant });
      }
    }
    /* ── F6 — le bouton annonce ce que le moteur peut engager ──────────────
       La grandeur affichée est un TOTAL atteint sur la street (« Tapis 11.5 »
       = 1.5 déjà devant + 10 restants). La comparer au plus petit tapis
       RESTANT confondait deux grandeurs. La borne juste est la CAPACITÉ
       d'Hero — engagement de street + tapis restant — que le ledger publie. */
    const heroSeat = L.hero ? L.sieges[L.hero] : null;
    for (const b of snap.boutons) {
      const annonce = (String(b.sub).match(/([\d.]+)bb/) || [])[1];
      if (annonce != null && heroSeat && heroSeat.capacite != null) {
        if (parseFloat(annonce) > heroSeat.capacite + 0.051) {
          note('F6-bouton-hors-tapis', main.i, { bouton: b.label, annonce: parseFloat(annonce), capaciteHero: heroSeat.capacite, restant: heroSeat.restant, rue: heroSeat.rue });
        }
      }
    }
    main.etapes.push({ pot: L.pot, total, street: L.sieges && Object.keys(L.sieges).length });

    if (snap.verdict) { main.verdict = snap.verdict; break; }
    const joue = await page.evaluate(() => window.__fh.clickFhAny());
    if (!joue) break;
    await sleep(950);
  }

  await page.evaluate(HELPERS);
  const fin = await page.evaluate(() => ({ ledger: window.__fh.ledger(), verdict: window.__fh.verdict(), res: window.__fh.resultat(), fh: window.__fh.fullhand() }));
  main.verdict = fin.verdict || main.verdict;
  main.resultat = fin.res;

  /* ── F7 / F8 — CE QUE LES PALIERS DOIVENT RESPECTER ────────────────────
     Un side pot n'est pas une ligne comptable de plus : c'est la conséquence
     d'un tapis trop court pour suivre. Sa signature est vérifiable, et c'est
     elle qu'on vérifie ici sur des coups RÉELLEMENT joués à l'écran. */
  if (fin.fh && fin.fh.actif && fin.fh.fini) {
    const F = fin.fh;
    if (main.nb == null || F.nb > main.nb) { main.nb = F.nb; main.joueurs = F.joueurs; }
    main.paliers = F.paliers;
    main.sidePots = F.sidePots;
    main.versements = F.versements;
    main.engageTotal = F.engageTotal;
    main.suiveurs = F.suiveurs || null;
    const paliers = F.paliers || [];
    const eng = F.engageTotal || {};
    /* F8① la somme des paliers PLUS l'argent mort vaut le pot disputé.
       L'argent mort (blindes des sièges couchés avant le flop, antes) n'a pas
       de propriétaire : il n'entre dans aucun palier de contribution, mais il
       est bien dans le pot. Ne pas l'isoler ferait passer pour un écart de
       comptabilité ce qui est une catégorie d'argent différente. */
    const sommePaliers = R2(paliers.reduce((a, p) => a + p.montant, 0));
    const mort = F.argentMort || 0;
    const nonSuivi = F.nonSuivi ? F.nonSuivi.montant : 0;
    const potDispute = fin.res.potDispute;
    /* Le pot se décompose en TROIS catégories, et en trois seulement :
       ce qui est disputé (les paliers), ce que personne n'a suivi (rendu à son
       propriétaire), et ce qui n'appartient à personne (argent mort). */
    if (potDispute != null && Math.abs(sommePaliers + mort + nonSuivi - potDispute) > 0.051) {
      note('F8-decomposition-du-pot', main.i, {
        sommePaliers, argentMort: mort, nonSuivi, potDispute, paliers: paliers.length,
        engageTotal: eng, joueurs: F.joueurs,
      });
    }
    /* F8② la somme des versements vaut le pot disputé : rien n'est perdu, rien
       n'est créé au moment de payer. */
    const sommeVersements = R2(Object.values(F.versements || {}).reduce((a, v) => a + v, 0));
    if (potDispute != null && Math.abs(sommeVersements - potDispute) > 0.051) {
      note('F8-versements-vs-pot', main.i, { sommeVersements, potDispute, versements: F.versements });
    }
    /* F7 les paliers sont EMBOÎTÉS : chaque side pot est disputé par un
       sous-ensemble strict du précédent, et ceux qu'on écarte ont engagé
       moins que ceux qu'on garde. C'est la définition même d'un side pot. */
    for (let k = 1; k < paliers.length; k++) {
      const avant = paliers[k - 1].disputePar || [];
      const apres = paliers[k].disputePar || [];
      const intrus = apres.filter(j => !avant.includes(j));
      if (intrus.length) note('F7-palier-non-emboite', main.i, { palier: paliers[k].nom, intrus, avant, apres });
      const ecartes = avant.filter(j => !apres.includes(j));
      for (const e of ecartes) for (const g of apres) {
        if ((eng[e] ?? 0) > (eng[g] ?? 0) + 0.051) {
          note('F7-ecarte-plus-engage', main.i, { palier: paliers[k].nom, ecarte: e, engageEcarte: eng[e], garde: g, engageGarde: eng[g] });
        }
      }
    }
    /* F7 bis — à tapis inégaux, il DOIT y avoir plus d'un palier. Sans cela,
       « side pots joués » resterait une affirmation sur du heads-up déguisé. */
    const engages = Object.entries(eng).filter(([j]) => !(F.couches || []).includes(j)).map(([, v]) => v);
    const inegaux = engages.length > 2 && Math.max(...engages) - Math.min(...engages) > 0.051;
    if (inegaux && paliers.length < 2) {
      note('F7-side-pot-manquant', main.i, { engageTotal: eng, paliers: paliers.length });
    }
  }
  /* F5 — le pot est versé : aucun pot orphelin à la fin du coup. */
  if (main.verdict && fin.ledger && fin.ledger.pot > 0.051) {
    note('F5-pot-orphelin', main.i, { potRestant: fin.ledger.pot, verdict: main.verdict });
  }
  /* F4 — l'issue est distincte, et le résultat net est publié. */
  if (main.verdict && fin.res.net == null) {
    note('F4-resultat-absent', main.i, { verdict: main.verdict });
  }
  if (main.verdict) mains.push(main); else tentatives.interrompus++;

  await page.evaluate(HELPERS);
  await page.evaluate(() => window.__fh.nextHand());
  await sleep(900);
}

fs.mkdirSync(SHOTS, { recursive: true });
await page.screenshot({ path: path.join(SHOTS, SHOT_NAME) });
await browser.close();

const byCode = {};
for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
const issues = {};
for (const m of mains) issues[m.verdict] = (issues[m.verdict] || 0) + 1;
/* Répartition OBSERVÉE du nombre de joueurs assis au flop, et combien de coups
   ont réellement disputé un side pot. C'est le chiffre qui manquait. */
const parNbJoueurs = {};
for (const m of mains) parNbJoueurs[m.nb || '?'] = (parNbJoueurs[m.nb || '?'] || 0) + 1;
const mainsMultiway = mains.filter(m => (m.nb || 0) >= 3);
const mainsAvecSidePot = mains.filter(m => (m.sidePots || 0) >= 1);
const rapport = {
  ts: new Date().toISOString(), url: URL, viewport: { w: W, h: H },
  filtres: { spotTypes: SPOTS, multiwayExige: MULTIWAY_MIN },
  spotsJoues: { parLigne: kindsJoues, avecSiegesSupplementaires: spotsAvecExtras },
  mainsCompletes: mains.length, issues, tentatives,
  multiway: {
    parNbJoueurs,
    mainsA3JoueursOuPlus: mainsMultiway.length,
    mainsAvecSidePotDispute: mainsAvecSidePot.length,
    /* Les paliers réellement observés, pour que le chiffre soit relisible et
       pas seulement compté. */
    /* Croisement « ce que le spot déclarait » × « qui s'est réellement assis
       au flop ». Un spot de squeeze qui produit un coup à deux ne se voit que
       là : le total seul confondrait « le moteur refuse » et « le générateur
       n'en produit pas ». */
    parSpot: mains.map(m => ({ main: m.i, ligne: m.spot && m.spot.kind, extras: m.spot && m.spot.extras, assis: m.nb, joueurs: m.joueurs })),
    /* Ce que les sieges supplementaires ont DECIDE face a la relance d Hero.
       Sans cette colonne, un preflop equilibre ne dit pas si le suiveur a
       reellement parle ou s il a simplement ete ecarte en silence. */
    reponsesSuiveurs: mains.filter(m => m.suiveurs && m.suiveurs.decisions.length)
      .map(m => ({ main: m.i, niveau: m.suiveurs.niveau, totalPaye: m.suiveurs.totalPaye, decisions: m.suiveurs.decisions })),
    exemples: mainsAvecSidePot.slice(0, 6).map(m => ({
      main: m.i, joueurs: m.joueurs, engageTotal: m.engageTotal,
      paliers: m.paliers, versements: m.versements, verdict: m.verdict,
    })),
  },
  ecartsParInvariant: byCode, ecarts: findings.slice(0, 80),
  resultatsNets: mains.map(m => m.resultat && m.resultat.net).filter(v => v != null),
  consoleErrors,
  verdict: findings.length === 0 ? 'OK — comptabilite du coup complet conforme' : `${findings.length} ecart(s) sur ${mains.length} mains`,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rapport, null, 2), 'utf8');

console.log(`\nMains completes jouees : ${mains.length}`);
console.log('Issues :', JSON.stringify(issues));
console.log('Tentatives :', JSON.stringify(tentatives));
console.log('Joueurs assis au flop :', JSON.stringify(parNbJoueurs), `-> ${mainsMultiway.length} main(s) a 3 joueurs+`);
console.log('Side pots reellement disputes :', mainsAvecSidePot.length);
const avecReponse = mains.filter(m => m.suiveurs && m.suiveurs.decisions.some(d => d.aPayer > 0 || d.action === "FOLD"));
console.log("Sieges supplementaires ayant repondu a la relance :", avecReponse.length);
console.log('Ecarts par invariant :', JSON.stringify(byCode, null, 1));
console.log('Erreurs console :', consoleErrors.length);
console.log('Rapport :', OUT);

const echecs = [];
if (findings.length) echecs.push(`${findings.length} ecart(s)`);
if (consoleErrors.length) echecs.push(`${consoleErrors.length} erreur(s) console`);
if (mains.length < HANDS) echecs.push(`${mains.length} main(s) completee(s) sur ${HANDS}`);
/* Exiger le multiway est le point de la manoeuvre : sans ce seuil, un audit
   vert prouverait seulement que le heads-up marche toujours. */
if (REPONSES_MIN && avecReponse.length < REPONSES_MIN) echecs.push(`${avecReponse.length} reponse(s) de siege supplementaire sur ${REPONSES_MIN} exigee(s)`);
if (MULTIWAY_MIN && mainsMultiway.length < MULTIWAY_MIN) echecs.push(`${mainsMultiway.length} main(s) multiway observee(s) sur ${MULTIWAY_MIN} exigee(s)`);
if (echecs.length) { console.error('\nECHEC audit:fullhand — ' + echecs.join(' · ')); process.exit(1); }
console.log('\nOK audit:fullhand —', mains.length, 'coups complets, comptabilite conforme');
