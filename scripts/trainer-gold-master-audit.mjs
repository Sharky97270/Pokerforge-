#!/usr/bin/env node
/**
 * trainer-gold-master-audit — le Trainer déroule-t-il de VRAIES mains ?
 *
 * Les audits existants (geo, workspace) mesurent une table ARRÊTÉE : boîtes,
 * ancres, homogénéité. Ils peuvent être verts pendant qu'une main foldée reste
 * peinte, qu'un badge de verdict survit trois streets, ou qu'une table s'éteint
 * au flop. Celui-ci joue le coup et regarde ce qui se passe ENTRE les états.
 *
 * Il relève, à chaque street de chaque table :
 *
 *   §4  CARTES DES COUCHÉS  — un siège marqué FOLD ne doit plus porter de main.
 *                             Relevé street par street : le défaut apparaît au
 *                             passage de street, pas à l'instant du fold.
 *   §4  CARTES DU HERO      — présentes tant qu'il est dans le coup, et jamais
 *                             derrière son avatar (comparaison de z-index
 *                             EFFECTIF, pas de la propriété déclarée).
 *   §5  CARTES SOUS AVATAR  — recouvrement carte/avatar avec un empilement qui
 *                             met la carte DESSOUS. C'est le bug BB signalé.
 *   §8  JETONS ROGNÉS       — tout marqueur coupé par un ancêtre qui coupe,
 *                             relevé SÉPARÉMENT au préflop et postflop : le
 *                             défaut signalé n'existait qu'au préflop.
 *   §9  BLINDES ABSORBÉES   — postflop, plus aucune blinde postée ne doit être
 *                             peinte : elle est dans le pot.
 *   §10 TABLE ACTIVE        — la tuile focalisée garde-t-elle son état actif
 *                             d'une street à l'autre ? On relève la classe et
 *                             l'opacité effective.
 *   §15 FEEDBACK PÉRIMÉ     — un badge de verdict qui survit au changement de
 *                             street.
 *   §25 FUITE D'ÉTAT        — board, pot, mises, dealer d'une main qui
 *                             réapparaissent sur la suivante.
 *   §14 LISIBILITÉ          — taille de police réelle du résultat et de l'EV.
 *
 * Il PILOTE la main : il répond, avance de street, va au showdown, passe à la
 * main suivante, et recommence. Les scénarios joués sont journalisés (§40-G).
 *
 * Prérequis : serveur de dev lancé (port 7788).
 *   node scripts/trainer-gold-master-audit.mjs --modes=1,2,3,4 --mains=10
 *   node scripts/trainer-gold-master-audit.mjs --modes=4 --fh --mains=6 --w=1920 --h=1080
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const MODES = arg('modes', '1,2,3,4').split(',').map(Number).filter(Boolean);
const MAINS = +arg('mains', 8);
const W = +arg('w', 1920);
const H = +arg('h', 1080);
const STRUCT = arg('struct', '6J');
const OUT = arg('out', '');
const SHOT_DIR = arg('shotDir', '');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ══ RELEVÉ D'UN INSTANT ══════════════════════════════════════════════════ */
const PROBE = () => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const vu = el => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const b = el.getBoundingClientRect();
    return b.width > 2 && b.height > 2;
  };
  const inter = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  /* ── QUI PEINT PAR-DESSUS QUI ────────────────────────────────────────────
     Les deux éléments comparés sont toujours dans le MÊME siège. On remonte
     donc chacun jusqu'au niveau « enfant direct du siège » et on compare ces
     deux-là, comme le navigateur : d'abord le z-index, et à z-index égal
     l'ordre du document. Comparer les z-index de deux éléments profonds, dans
     des contextes d'empilement différents, ne veut rien dire — c'est le piège
     de ce genre de test. */
  const dessus = (a, b, racine) => {
    const remonte = el => { let n = el; while (n && n.parentElement && n.parentElement !== racine) n = n.parentElement; return n; };
    const A = remonte(a), B = remonte(b);
    if (!A || !B || A === B) return null;            // même branche : non comparable
    const z = el => { const v = getComputedStyle(el).zIndex; return v === 'auto' ? 0 : +v; };
    const za = z(A), zb = z(B);
    if (za !== zb) return za > zb;
    return !!(A.compareDocumentPosition(B) & Node.DOCUMENT_POSITION_PRECEDING);
  };
  const clip = el => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0)) return 0;
    let n = el.parentElement, d = 0;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n);
      if (/hidden|clip/.test(s.overflow + s.overflowX + s.overflowY)) {
        const p = n.getBoundingClientRect();
        d += Math.max(0, p.x - b.x) + Math.max(0, b.x + b.width - (p.x + p.width))
           + Math.max(0, p.y - b.y) + Math.max(0, b.y + b.height - (p.y + p.height));
      }
      n = n.parentElement;
    }
    return +d.toFixed(1);
  };
  const fs_ = el => el ? +getComputedStyle(el).fontSize.replace('px', '') : null;

  const tuiles = [...document.querySelectorAll('.mt-slot')].filter(s => s.getBoundingClientRect().width > 2);
  const zonesSeules = tuiles.length ? [] : [...document.querySelectorAll('.t1-table-area')].filter(vu);
  const conteneurs = tuiles.length ? tuiles : zonesSeules;

  const tables = conteneurs.map((tuile, i) => {
    const zone = tuile.querySelector('.training-table-zone, .t1-table-area') || tuile;
    const felt = zone.querySelector('.felt-oval');
    const board = [...zone.querySelectorAll('.pf-board-zone .card, .mt-board-zone .card')].filter(vu);
    const potEl = zone.querySelector('.pf-pot-readout');
    const potTxt = potEl && vu(potEl) ? (potEl.textContent || '').replace(/\s+/g, ' ').trim() : null;
    const street = (() => {
      const cur = zone.closest('.mt-slot, .t1-left, body').querySelector('.pf-tw-head span[style*="255, 194, 71"], .pf-tw-head .cur');
      const txt = (tuile.textContent || '');
      if (board.length >= 5) return 'river';
      if (board.length === 4) return 'turn';
      if (board.length === 3) return 'flop';
      return 'preflop';
    })();

    /* ── SIÈGES : couché ? cartes ? empilement ? ────────────────────────── */
    const sieges = [...zone.querySelectorAll('.pf-player-seat')].map(s => {
      const pos = s.getAttribute('data-seat');
      const av = s.querySelector('.pf-avatar-premium');
      const wrap = [...s.querySelectorAll('.pf-hole-cards')].filter(vu)[0] || null;
      const cartes = [...s.querySelectorAll('.card')].filter(vu);
      const foldBadge = [...s.querySelectorAll('.pf-fold-chip,.pf-seat-fold-badge')].filter(vu)[0] || null;
      const couche = !!foldBadge || /fold/i.test((s.className || '') + '');
      let sousAvatar = 0;
      if (wrap && av && vu(av)) {
        const s1 = inter(R(wrap), R(av));
        if (s1 > 16 && dessus(wrap, av, s) === false) sousAvatar = Math.round(s1);
      }
      const estHero = !!s.querySelector(".pf-seat-hero-chip");
      return {
        pos, couche, estHero,
        aDesCartes: !!wrap,
        nbCartes: cartes.length,
        faceVisible: cartes.filter(c => !c.classList.contains('card-back')).length,
        sousAvatarPx2: sousAvatar,
        cartesRognees: wrap ? clip(wrap) : 0,
      };
    });

    /* ── MARQUEURS : mises, blindes, dealer ────────────────────────────── */
    const mises = [...zone.querySelectorAll('.pf-seat-action-zone')].filter(vu).map(e => ({
      pos: e.getAttribute('data-seat'),
      rogne: clip(e),
      txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22),
    }));
    const blindes = [...zone.querySelectorAll('.pf-blind-anchor')].filter(vu).map(e => ({
      pos: e.getAttribute('data-seat'), rogne: clip(e),
      txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14),
    }));
    const dealerEl = zone.querySelector('.dealer-btn');
    const dealer = dealerEl && vu(dealerEl) ? { rogne: clip(dealerEl), dansFeutre: felt ? inter(R(dealerEl), R(felt)) > 0 : null } : null;

    /* ── ÉTAT VISUEL DE LA TUILE (§10/§11) ────────────────────────────── */
    const cs = getComputedStyle(tuile);
    const etatTuile = {
      classes: (tuile.className || '').split(/\s+/).filter(c => /slot|focus|answered|paused/.test(c)),
      opacite: +cs.opacity,
      filtre: cs.filter,
      /* Une tuile « terminée » porte une pastille de coche. Elle ne doit pas
         apparaître tant que le coup se joue encore. */
      pastilleTerminee: /table-slot-answered/.test(tuile.className || ''),
    };

    /* ── FEEDBACK / RÉSULTAT (§14/§15) ────────────────────────────────── */
    const badge = [...tuile.querySelectorAll('.seat-action-badge,.pf-verdict,.pf-macaron,[class*="verdict"],[class*="feedback"]')].filter(vu);
    /* Le verdict de fin de coup n a pas de classe : on le reconnait a son
       libelle. C est laid, et c est la seule facon de mesurer ce que l oeil lit. */
    const resultEl = [...tuile.querySelectorAll('div,span')].filter(e => e.children.length === 0 && /MAIN (GAGN|PERD)|POT PARTAG/i.test(e.textContent || '') && vu(e))[0]
      || [...tuile.querySelectorAll('[class*="pf-fh-verdict"],.pf-pause-line b,.mtr-actions b')].filter(vu)[0] || null;

    return {
      i, street,
      potTxt,
      potVal: (() => { const m = String(potTxt || '').match(/(d+(?:[.,]d+)?)s*bb/i); return m ? parseFloat(m[1].replace(',', '.')) : null; })(),
      nbBoard: board.length,
      sieges,
      mises, blindes, dealer,
      etatTuile,
      feedbacks: badge.map(b => ({ cls: String(b.className).slice(0, 40), txt: (b.textContent || '').trim().slice(0, 26) })),
      /* Les boutons de CETTE tuile. Les compter sur la page entière ferait
         croire qu'une table terminée réclame encore une décision dès qu'une
         AUTRE table en demande une — faux positif garanti en mosaïque. */
      aCtaSuivante: [...tuile.querySelectorAll('button')].some(x => x.getBoundingClientRect().width > 2 && /suivante|suivant|résultat|resultat|Rejouer/i.test(x.textContent || '')),
      boutonsTuile: [...tuile.querySelectorAll('button.gto-btn,button.ab,button[class*="gto-btn-"],button[class*="ab-"]')].filter(b => b.getBoundingClientRect().width > 2 && !b.disabled).length,
      taillePoliceResultat: fs_(resultEl),
      feutre: felt && vu(felt) ? { w: +R(felt).w.toFixed(1), h: +R(felt).h.toFixed(1) } : null,
    };
  });

  return {
    tables,
    /* Quelle tuile la page désigne-t-elle comme active ? */
    tuileFocalisee: conteneurs.findIndex(t => /mt-slot-focus/.test(t.className || '')),
    /* Le bandeau de décision demande-t-il une action, et à qui ? */
    boutonsAction: [...document.querySelectorAll('button.gto-btn,button.ab,button[class*="gto-btn-"],button[class*="ab-"]')]
      .filter(b => b.getBoundingClientRect().width > 2 && !b.disabled)
      .map(b => (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)),
  };
};

/* ══ PILOTAGE ═════════════════════════════════════════════════════════════ */
const browser = await puppeteer.launch({
  executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 240)));
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const click = (txt, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')].find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; } return false;
  }, txt, exact);

  await click('Entraineur GTO');
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')))) break;
    await sleep(300);
  }

  const defauts = [];
  const ajoute = (code, mode, detail) => defauts.push({ code, mode, ...detail });
  const scenarios = [];
  const rapportModes = {};

  for (const m of MODES) {
    await click(`${m}T`); await sleep(250);
    await click(STRUCT); await sleep(250);
    if (flag('fh')) {
      await page.evaluate(() => {
        /* Le libellé porte une icône : on vise la FIN du texte, pas l'égalité.
           Et on clique l'élément cliquable le plus proche — remonter quatre
           ancêtres en aveugle finissait par cliquer autre chose et faisait
           démarrer la session sur un écran qui n'était pas prêt. */
        const el = [...document.querySelectorAll('button,div,span')]
          .filter(e => /Full Hand$/i.test((e.textContent || '').trim()))
          .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
        if (el) (el.closest('button') || el).click();
      });
      await sleep(300);
    }
    await click('Lancer la session', false);
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break;
      await sleep(400);
    }
    await sleep(1300);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });

    const suite = [];
    let precedent = null;
    for (let pas = 0; pas < MAINS * 4; pas++) {
      const snap = await page.evaluate(PROBE);
      suite.push(snap);

      snap.tables.forEach((t, ti) => {
        /* §4 — un siège couché ne porte plus de main. */
        /* Le HERO est traité à part par le §4 : ses cartes restent visibles tant
           qu il est dans le coup, et voir ce qu on vient de coucher est utile.
           La règle vise les ADVERSAIRES. */
        t.sieges.filter(s => s.couche && s.aDesCartes && !s.estHero).forEach(s =>
          ajoute('cartes-du-couche', `${m}T`, { table: ti, siege: s.pos, street: t.street, nbCartes: s.nbCartes }));
        t.sieges.filter(s => s.couche && s.aDesCartes && s.estHero).forEach(s =>
          ajoute('info-hero-couche-garde-ses-cartes', `${m}T`, { table: ti, siege: s.pos, street: t.street }));
        /* §5 — une carte sous l'avatar de son propre joueur. */
        t.sieges.filter(s => s.sousAvatarPx2 > 0).forEach(s =>
          ajoute('cartes-sous-avatar', `${m}T`, { table: ti, siege: s.pos, street: t.street, px2: s.sousAvatarPx2 }));
        /* §8 — jeton, blinde ou bouton rogné. La street est notée : le défaut
           signalé n'existait qu'au préflop. */
        t.mises.filter(x => x.rogne > 1.5).forEach(x => ajoute('mise-rognee', `${m}T`, { table: ti, siege: x.pos, street: t.street, px: x.rogne }));
        t.blindes.filter(x => x.rogne > 1.5).forEach(x => ajoute('blinde-rognee', `${m}T`, { table: ti, street: t.street, px: x.rogne }));
        t.sieges.filter(s => s.cartesRognees > 1.5).forEach(s => ajoute('cartes-rognees', `${m}T`, { table: ti, siege: s.pos, street: t.street, px: s.cartesRognees }));
        if (t.dealer && t.dealer.rogne > 1.5) ajoute('dealer-rogne', `${m}T`, { table: ti, street: t.street, px: t.dealer.rogne });
        if (t.dealer && t.dealer.dansFeutre === false) ajoute('dealer-hors-feutre', `${m}T`, { table: ti, street: t.street });
        /* §9 — postflop, plus de blinde postée peinte. */
        if (t.street !== 'preflop' && t.blindes.length)
          ajoute('blinde-survit-au-flop', `${m}T`, { table: ti, street: t.street, n: t.blindes.length, txt: t.blindes.map(b => b.txt) });
        /* §10 — la tuile focalisée ne doit pas s'éteindre pendant que le coup
           se joue encore (board présent = coup en cours). */
        /* Une tuile éteinte alors qu elle réclame ENCORE une décision. Le
           signal « elle a fini » est la CTA de main suivante : tant qu elle
           n est pas là, la tuile attend. Sans cette condition, on flagge une
           table correctement terminée dont les boutons restent affichés en
           rappel de l action jouée. */
        if (snap.tuileFocalisee === ti && t.etatTuile.pastilleTerminee && t.boutonsTuile > 0 && !t.aCtaSuivante)
          ajoute('table-active-eteinte', `${m}T`, { table: ti, street: t.street, classes: t.etatTuile.classes });
      });

      /* §25 — fuite d'état d'une main à l'autre : un board qui RECULE sans
         passer par zéro veut dire qu'on a changé de main en gardant des cartes. */
      /* Un board qui RECULE ne trahit une fuite d'état QU'EN COUP COMPLET :
         en mode Spot, chaque main est un spot indépendant qui peut s'ouvrir
         directement au flop, au turn ou à la river. */
      if (precedent && flag('fh')) {
        snap.tables.forEach((t, ti) => {
          const p = precedent.tables[ti];
          if (!p) return;
          /* Une nouvelle main remet le POT à la blinde : un board qui recule
             en même temps que le pot n est pas une fuite, c est la main
             suivante. On n accuse que si le pot, lui, a grandi ou tenu. */
          const potMonte = p.potVal != null && t.potVal != null && t.potVal >= p.potVal;
          if (p.nbBoard > 0 && t.nbBoard > 0 && t.nbBoard < p.nbBoard && potMonte)
            ajoute('board-recule', `${m}T`, { table: ti, de: p.nbBoard, vers: t.nbBoard });
        });
      }
      precedent = snap;

      /* Journal des scénarios réellement joués. */
      const streets = snap.tables.map(t => t.street).join('/');
      scenarios.push({ mode: `${m}T`, pas, streets, actions: snap.boutonsAction.slice(0, 4) });

      /* Avance : une action au hasard, ou la CTA suivante. */
      const avance = await page.evaluate(() => {
        const vis = s => [...document.querySelectorAll(s)].filter(x => x.getBoundingClientRect().width > 2 && !x.disabled);
        const act = vis('button.gto-btn,button.ab,button[class*="gto-btn-"],button[class*="ab-"]');
        const nx = vis('button').filter(x => /suivant|suivante|résultat|resultat|Rejouer|Avancer/i.test(x.textContent || ''));
        const cible = act.length ? act[Math.floor(Math.random() * act.length)] : nx[0];
        if (cible) { cible.click(); return (cible.textContent || '').trim().slice(0, 20); }
        return null;
      });
      if (!avance) break;
      await sleep(950);
    }

    rapportModes[`${m}T`] = {
      pas: suite.length,
      streetsVues: [...new Set(suite.flatMap(s => s.tables.map(t => t.street)))],
      potsNuls: suite.flatMap(s => s.tables).filter(t => /(^|\D)0bb/.test(t.potTxt || '')).length,
      taillePoliceResultat: (() => {
        const v = suite.flatMap(s => s.tables.map(t => t.taillePoliceResultat)).filter(x => x);
        return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
      })(),
    };

    if (SHOT_DIR) {
      const p = path.resolve(SHOT_DIR, `${W}x${H}-${m}T-jeu.png`);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      await page.screenshot({ path: p });
    }

    /* Retour à la configuration pour le mode suivant. */
    /* Retour à l'écran de configuration. On INSISTE : selon l'état de la
       session, « Arrêter » mène à un écran de résultats qui demande encore un
       clic. Attendre une durée fixe faisait démarrer le mode suivant sur un
       écran qui n'était pas prêt — et le relevé rendait alors zéro table sans
       dire pourquoi. */
    let revenu = false;
    for (let essai = 0; essai < 6 && !revenu; essai++) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /Arr[eê]ter|Quitter|Nouvelle session|Retour|Resultats|Résultats/i.test(x.textContent || ''));
        if (b) b.click();
      });
      await sleep(700);
      revenu = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')));
    }
    if (!revenu) { console.error('Retour à la configuration impossible après le mode ' + m + 'T.'); process.exit(5); }
  }

  /* Regroupement : un défaut répété 40 fois est UN défaut, pas quarante. */
  const parCode = {};
  for (const d of defauts) {
    const k = `${d.code}|${d.mode}`;
    parCode[k] = parCode[k] || { code: d.code, mode: d.mode, n: 0, exemples: [] };
    parCode[k].n++;
    if (parCode[k].exemples.length < 3) parCode[k].exemples.push(d);
  }

  const rapport = {
    viewport: `${W}x${H}`, struct: STRUCT, fullHand: flag('fh'), mainsDemandees: MAINS,
    defauts: Object.values(parCode).sort((a, b) => b.n - a.n),
    totalDefauts: defauts.length,
    modes: rapportModes,
    scenariosJoues: scenarios.length,
    erreursPage: pageErrors,
  };
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(path.resolve(OUT), JSON.stringify({ rapport, scenarios }, null, 1)); }
  console.log(JSON.stringify(rapport, null, 1));
} finally {
  await browser.close();
}
