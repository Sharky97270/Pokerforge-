#!/usr/bin/env node
/**
 * trainer-money-audit — AUDIT DE L'ARITHMÉTIQUE DU TRAINER : tailles de mises,
 * tapis, pot, SPR — mesurés sur des mains RÉELLEMENT générées par l'application.
 *
 * POURQUOI CE SCRIPT EXISTE
 * Les audits existants prouvent la PROVENANCE d'une solution (`audit:provenance`),
 * le RYTHME (`audit:pause`) et le PANNEAU (`audit:solution`). Aucun ne regarde les
 * NOMBRES que la table affiche. Or une table de poker est d'abord une comptabilité :
 * un tapis, un pot, des mises, et un rapport entre les trois. Si le tapis du vilain
 * est faux, le SPR est faux ; si le SPR est faux, la décision enseignée est fausse
 * — quel que soit le moteur derrière.
 *
 * Ce script ne lit pas des pixels : il lit les VALEURS que le rendu écrit
 * (.pf-pot-value, .seat-card-stack, .gto-btn-sizing…) et confronte chacune aux
 * autres. Chaque écart est rendu avec les nombres qui le prouvent.
 *
 * INVARIANTS VÉRIFIÉS
 *   I1 tapis-vilain-constant  Un siège adverse porte-t-il un tapis lié au spot,
 *                             ou une constante indépendante de l'exercice ?
 *                             Deux contrôles : (a) EXACT — le tapis peint vaut
 *                             `profondeur − engagement` pour CHAQUE siège, lu
 *                             sur le ledger publié par la table ; (b) le tapis
 *                             adverse VARIE d'une main à l'autre.
 *   I8 conservation           Pour chaque siège : initial = restant + engagé,
 *                             et Σ engagements = pot. Aucun jeton créé.
 *   I9 statut-fold            Aucun siège marqué « couché » sans action de fold.
 *   I2 spr                    SPR affiché == tapis effectif / pot, le tapis
 *                             effectif étant le PLUS COURT des tapis peints.
 *   I3 mise-hors-tapis        Aucune mise proposée ne dépasse le tapis effectif.
 *   I4 libelle-vs-montant     « Bet 66% » doit valoir 66 % du pot ; l'indice sous
 *                             le bouton doit dire la MÊME fraction que le libellé.
 *   I5 pot-preflop            Préflop : pot == somme des jetons peints (§24).
 *   I6 pas-de-mise            Les montants respectent le pas de 0.5bb annoncé.
 *
 * Prérequis : serveur de dev lancé, Chrome ou Edge installé.
 *   node scripts/trainer-money-audit.mjs --hands=60 --stack=Tous
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const HANDS = +arg('hands', 60);
const SMODE = +arg('smode', 100);
const TABLES = +arg('tables', 1);
const STACK = arg('stack', '');            // '', '200bb', '10bb'… → réglage STACK EFFECTIF
const W = +arg('w', 1920), H = +arg('h', 1080);
const OUT = path.resolve(arg('out', 'design-qa-evidence/trainer-money.json'));
const SHOTS = arg('shots', 'design-qa-evidence/probe');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouve.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HELPERS = () => {
  const bb = t => { const m = String(t || '').replace(',', '.').match(/(-?\d+(?:\.\d+)?)\s*bb/i); return m ? parseFloat(m[1]) : null; };
  window.__mn = {
    bb,
    leaf(t) { return [...document.querySelectorAll('div,span,button')].find(e => e.children.length === 0 && e.textContent.trim() === t); },
    clickLeaf(t) { const e = window.__mn.leaf(t); if (e) { e.click(); return true; } return false; },
    clickNT(n) { const e = [...document.querySelectorAll('.mtbtn')].find(x => x.textContent.trim() === n + 'T'); if (e) { e.click(); return true; } return false; },
    setSmode(n) { const el = [...document.querySelectorAll('.smpill')].find(e => (e.querySelector('.smnum') || {}).textContent === String(n)); if (el) { el.click(); return true; } return false; },
    launch() { const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent)); if (b) { b.click(); return true; } return false; },
    slots() { const s = [...document.querySelectorAll('.mt-slot')]; return s.length ? s : [document.body]; },
    /* Le panneau de droite ne decrit QU'UNE table : celle qui a le focus. Le
       comparer au ledger d'une autre table mesurerait deux objets differents. */
    isActive(root) { return !root.classList || root.classList.contains('mt-slot-focus') || !document.querySelector('.mt-slot'); },

    /* Relevé COMPLET de l'argent visible sur une table. */
    read(root) {
      const q = s => [...root.querySelectorAll(s)];
      const potEl = root.querySelector('.pf-pot-value');
      const pot = potEl ? bb(potEl.textContent) : null;
      /* 1T pose des `.pf-seat-nameplate`, la mosaique des `.pf-mt-nameplate` :
         l'ancienne sonde ne lisait que les premieres, donc l'invariant I1 ne
         pouvait pas se declencher en 2T/3T/4T (limite §6 de l'audit). */
      const POS_RE = /^(UTG\+1|UTG|MP|LJ|HJ|CO|BTN|SB|BB|EP)$/;
      const seats = q('.pf-seat-nameplate, .pf-mt-nameplate').map(n => {
        const spans = [...n.querySelectorAll('span')];
        const posEl = n.querySelector('.seat-card-pos') || spans.find(e => POS_RE.test((e.textContent || '').trim()));
        return {
          pos: ((posEl || {}).textContent || '?').trim(),
          stack: bb((n.querySelector('.seat-card-stack') || {}).textContent),
        };
      });
      /* Jetons peints devant les sièges — engagements ET marqueurs de blinde.
         Un seul tas par joueur (cf. seatShowsChips) : on prend donc TOUT ce qui
         porte un montant sur le feutre, hors pot et hors plaques de tapis. */
      const felt = root.querySelector('.felt-oval') || root;
      const chips = [...felt.querySelectorAll('*')]
        .filter(e => e.children.length === 0 && /^-?\d+(\.\d+)?bb$/.test((e.textContent || '').trim()))
        .filter(e => !/pf-pot-value|seat-card-stack/.test(e.className || ''))
        .map(e => ({ cls: String(e.className || '(none)'), amount: bb(e.textContent) }))
        .filter(c => c.amount != null);
      const acts = q('button.gto-btn').filter(b => b.getBoundingClientRect().width > 0).map(b => ({
        id: (b.className.match(/gto-btn-([A-Z0-9]+)/) || [])[1] || '?',
        label: (b.querySelector('.gto-btn-label') || {}).textContent || '',
        sizing: (b.querySelector('.gto-btn-sizing') || {}).textContent || '',
        hint: (b.querySelector('.gto-btn-hint') || {}).textContent || '',
      }));
      const sizerEl = root.querySelector('.sizing-custom');
      const sizer = sizerEl ? bb(sizerEl.textContent) : null;
      /* Panneau INFORMATIONS (1T) : Street / Stack Hero / Pot / Pot Odds / SPR. */
      const info = {};
      [...document.querySelectorAll('.pf-p2-irow')].forEach(r => {
        const k = (r.querySelector('.k') || r.children[0] || {}).textContent;
        const v = (r.querySelector('.v') || r.children[1] || {}).textContent;
        if (k) info[k.trim()] = (v || '').trim();
      });
      const badge = root.innerText.match(/📊\s*([\d.]+)bb/);
      /* Ledger canonique publié par la table (§ C2) : profondeur, engagement et
         tapis restant de chaque siège. Il permet de contrôler l'ÉGALITÉ exacte
         plutôt que de deviner depuis les pixels. */
      let ledger = null;
      const porteur = root.closest ? (root.closest('[data-pf-ledger]') || root.querySelector('[data-pf-ledger]')) : root.querySelector('[data-pf-ledger]');
      try { ledger = porteur ? JSON.parse(porteur.getAttribute('data-pf-ledger')) : null; } catch (e) { ledger = { erreurParse: String(e).slice(0, 80) }; }
      return {
        pot, seats, chips, acts, sizer, info, ledger,
        active: window.__mn.isActive(root),
        heroBadgeStack: badge ? parseFloat(badge[1]) : null,
        street: (info['Street'] || '').trim() || null,
        desc: (root.innerText.match(/🎮\s*([^\n]+)/) || [])[1] || null,
      };
    },
    actAll() {
      let n = 0;
      window.__mn.slots().forEach(s => {
        const b = [...s.querySelectorAll('button.gto-btn')].filter(x => x.getBoundingClientRect().width > 0);
        const pick = b.find(x => /Fold/i.test(x.textContent)) || b[0];
        if (pick) { pick.click(); n++; }
      });
      return n;
    },
    nextAll() {
      let n = 0;
      [...document.querySelectorAll('button')]
        .filter(b => /suivante/i.test(b.textContent) && !b.disabled && b.getBoundingClientRect().width > 0)
        .forEach(b => { b.click(); n++; });
      return n;
    },
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
const consoleErrors = [];
page.on('response', r => { if (r.status() >= 400 && !/favicon\.ico/.test(r.url())) consoleErrors.push(`ressource ${r.status()} : ${r.url().slice(0, 140)}`); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));

const waitFor = async (fn, a, label, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    await page.evaluate(HELPERS);
    if (await page.evaluate(fn, a)) return;
    if (Date.now() - t0 > ms) throw new Error('introuvable : ' + label);
    await sleep(150);
  }
};

await page.goto(URL, { waitUntil: 'networkidle2' });
await waitFor(() => { const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent)); if (e) { e.click(); return true; } return false; }, null, 'onglet Entraineur');
await waitFor(() => !!document.querySelector('.mtbtn'), null, 'bandeau Multitabling');
await waitFor(n => window.__mn.setSmode(n), SMODE, 'longueur de session'); await sleep(200);
if (STACK) { await waitFor(s => window.__mn.clickLeaf(s), STACK, 'stack ' + STACK); await sleep(200); }
if (TABLES > 1) { await waitFor(n => window.__mn.clickNT(n), TABLES, TABLES + 'T'); await sleep(250); }
await waitFor(() => window.__mn.launch(), null, 'Lancer la session');
await waitFor(() => window.__mn.slots().length > 0, null, 'tables montees');
await sleep(900);

const R2 = v => Math.round(v * 100) / 100;
const records = [];
const findings = [];
/* Contrôle de niveau RUN : le tapis adverse doit VARIER. Une valeur unique sur
   toutes les mains est exactement le défaut d'origine (60bb partout). */
const tapisAdversesVus = new Set();
const profondeursVues = new Set();
const note = (code, rec, detail) => findings.push({ code, hand: rec.i, street: rec.street, desc: rec.desc, ...detail });

let guard = 0;
while (guard++ < HANDS * 4 && records.length < HANDS) {
  await page.evaluate(HELPERS);
  const snaps = await page.evaluate(() => window.__mn.slots().map(s => window.__mn.read(s)));
  for (const s of snaps) {
    if (!s || !s.acts.length || s.pot == null) continue;
    const rec = { i: records.length + 1, ...s };
    records.push(rec);

    const stacks = s.seats.filter(x => x.stack != null);
    const hero = s.heroBadgeStack != null ? s.heroBadgeStack : (stacks.length ? Math.max(...stacks.map(x => x.stack)) : null);
    const villains = stacks.filter(x => x.stack !== hero).map(x => x.stack);
    const effective = stacks.length ? Math.min(...stacks.map(x => x.stack)) : hero;
    /* Position d'Hero — lue dans le descriptif de la table (« 🎮 BTN vs CO »). */
    const heroPos = ((s.desc || '').match(/([A-Z]{2,3}\+?\d?)\s*vs/) || [])[1] || null;
    rec.hero = hero; rec.effective = effective; rec.heroPos = heroPos;

    /* ── I1 — le tapis adverse suit-il l'exercice ? ────────────────────────
       L'ancienne formulation (« tous les tapis adverses sont égaux ») était un
       PROXY du défaut : elle attrapait la constante 60bb, mais se déclenchait
       aussi quand deux sièges avaient légitimement le même tapis. On contrôle
       maintenant l'égalité EXACTE, siège par siège, sur le ledger publié par la
       table — un test strictement plus fort. Le contrôle « valeur constante
       d'une main à l'autre » est conservé et vérifié en fin de run. */
    const L = s.ledger;
    if (L && L.sieges) {
      for (const [pos, st] of Object.entries(L.sieges)) {
        const peint = (s.seats.find(x => (x.pos || '').trim() === pos) || {}).stack;
        if (peint != null && Math.abs(peint - st.restant) > 0.051) {
          note('I1-plaque-vs-ledger', rec, { position: pos, tapisPeint: peint, tapisMoteur: st.restant, engage: st.total });
        }
        if (Math.abs(st.initial - (st.restant + st.total)) > 0.051) {
          note('I8-siege-non-conserve', rec, { position: pos, initial: st.initial, restant: st.restant, engage: st.total });
        }
        if (st.restant < -0.011) note('I8-tapis-negatif', rec, { position: pos, restant: st.restant });
        if (st.couche && st.statut !== 'folded') {
          note('I9-statut-incoherent', rec, { position: pos, statut: st.statut });
        }
      }
      const somme = R2(Object.values(L.sieges).reduce((a, x) => a + x.total, 0));
      if (Math.abs(somme - L.pot) > 0.051) {
        note('I8-pot-non-reconstructible', rec, { pot: L.pot, sommeEngagements: somme });
      }
      for (const e of L.ecarts || []) note('I8-ledger-signale', rec, e);
      /* Le tapis adverse doit VARIER. On le lit sur le ledger : la mosaïque ne
         publie pas les mêmes plaques que le 1T, et l'ancien relevé n'y voyait
         donc rien (limite §6 de l'audit précédent). */
      for (const [pos, st] of Object.entries(L.sieges)) {
        if (pos !== heroPos) tapisAdversesVus.add(st.restant);
      }
      profondeursVues.add(L.profondeur);
      /* SPR et cotes : le panneau de droite ne décrit QU'UNE table — celle qui a
         le focus. Le confronter au ledger d'une autre table comparerait deux
         objets différents ; on ne le contrôle donc que sur la table active. */
      if (s.active) {
        const sprAffiche = s.info['SPR'] ? parseFloat(String(s.info['SPR']).replace(',', '.')) : null;
        if (sprAffiche != null && L.spr != null && Math.abs(sprAffiche - L.spr) > 0.11) {
          note('I2-spr-panneau-vs-ledger', rec, { sprAffiche, sprLedger: L.spr, pot: L.pot, tapisEffectif: L.tapisEffectif });
        }
        const oddsAff = (String(s.info['Pot Odds'] || '').match(/(\d+)\s*%/) || [])[1];
        if (oddsAff && L.cotes != null && Math.abs(+oddsAff - L.cotes) > 1) {
          note('I2-cotes-panneau-vs-ledger', rec, { cotesAffichees: +oddsAff, cotesLedger: L.cotes, pot: L.pot, aPayer: L.aPayer });
        }
      }
    } else {
      note('I1-ledger-absent', rec, { detail: 'la table ne publie pas son ledger — invariant invérifiable' });
    }
    /* ── I2 — SPR ─────────────────────────────────────────────────────────
       `s.info` vient du panneau de droite, qui ne décrit QUE la table ayant le
       focus. En mosaïque, le confronter au feutre d'une autre table comparait
       deux tables différentes — trois « écarts » qui n'en étaient pas. On ne
       contrôle donc que la table active ; les trois autres sont couvertes par
       I1-plaque-vs-ledger et I8, qui n'ont pas besoin du panneau. */
    const sprAff = (s.active && s.info['SPR']) ? parseFloat(String(s.info['SPR']).replace(',', '.')) : null;
    if (sprAff != null && s.pot > 0 && effective != null) {
      const sprVrai = R2(effective / s.pot);
      const sprHero = hero != null ? R2(hero / s.pot) : null;
      if (Math.abs(sprAff - sprVrai) > 0.15) note('I2-spr-faux', rec, { sprAffiche: sprAff, sprSelonTapisEffectif: sprVrai, sprSelonTapisHero: sprHero, pot: s.pot, tapisEffectif: effective });
    }
    /* I3 / I4 / I6 — les montants proposés */
    for (const a of s.acts) {
      const amt = /bb/i.test(a.sizing) ? parseFloat(a.sizing) : null;
      if (amt == null) continue;
      /* ── I3 — DEUX BORNES, PAS UNE COMPARAISON APPROXIMATIVE ─────────────
         L'ancienne version comparait un TOTAL atteint (« relancer à X ») au
         plus petit tapis RESTANT peint — deux grandeurs différentes, donc un
         test qui pouvait à la fois manquer une vraie mise hors tapis et
         signaler une taille parfaitement légale. On contrôle maintenant les
         deux bornes réelles, lues sur le ledger :
           ① le total ne peut dépasser ce qu'Hero peut atteindre ;
           ② il ne peut dépasser ce que le mieux doté des adversaires peut
              égaler (sinon personne ne peut suivre). */
      const capH = s.ledger && s.ledger.sieges && s.ledger.sieges[heroPos] ? s.ledger.sieges[heroPos].capacite : null;
      const capV = s.ledger ? s.ledger.capaciteAdverse : null;
      if (capH != null && amt > capH + 0.05) {
        note('I3-mise-hors-tapis', rec, { bouton: a.label, montant: amt, capaciteHero: capH });
      }
      if (capV != null && amt > capV + 0.05 && !/all|tapis|shove|push/i.test(a.label + a.sizing)) {
        note('I3-mise-non-suivable', rec, { bouton: a.label, montant: amt, capaciteAdverse: capV });
      }
      if (capH == null && effective != null && amt > effective + 0.05 && !/all|tapis|shove|push/i.test(a.label + a.sizing)) {
        /* Repli quand le ledger n'est pas publié : l'ancien contrôle, conservé. */
        note('I3-mise-hors-tapis', rec, { bouton: a.label, montant: amt, tapisEffectif: effective });
      }
      /* I7 — deux nombres sur le MÊME bouton : celui du libellé et celui du
         sélecteur de sizing. Un bouton ne peut pas annoncer deux mises. */
      const amtLbl = (a.label.match(/(\d+(?:\.\d+)?)\s*bb/i) || [])[1];
      if (amtLbl && Math.abs(parseFloat(amtLbl) - amt) > 0.051) {
        note('I7-bouton-deux-montants', rec, { bouton: a.label, montantLibelle: parseFloat(amtLbl), montantSelecteur: amt, pot: s.pot });
      }
      const pctLbl = (a.label.match(/(\d+)\s*%/) || [])[1];
      const pctHint = (a.hint.match(/(\d+)\s*%/) || [])[1];
      const pctReel = s.pot > 0 ? Math.round((amt / s.pot) * 100) : null;
      if (pctLbl && pctReel != null && Math.abs(+pctLbl - pctReel) > 6) {
        note('I4-libelle-vs-montant', rec, { bouton: a.label, montant: amt, pot: s.pot, annonce: +pctLbl + '%', reel: pctReel + '%' });
      }
      if (pctHint && pctLbl && +pctHint !== +pctLbl) {
        note('I4-indice-contredit-libelle', rec, { bouton: a.label, indice: a.hint, montant: amt, pot: s.pot, reel: pctReel + '%' });
      }
      /* Un indice peut annoncer DEUX grandeurs différentes : une fraction de
         pot (mise) ou une COTE DU POT (call). Les confondre ferait échouer un
         affichage juste — et laisserait passer une cote fausse. On teste donc
         chacune contre sa propre définition. */
      if (/cote/i.test(a.hint)) {
        const cote = (a.hint.match(/cote\s*(\d+)\s*%/i) || [])[1];
        const coteReelle = s.pot + amt > 0 ? Math.round((amt / (s.pot + amt)) * 100) : null;
        if (cote && coteReelle != null && Math.abs(+cote - coteReelle) > 1) {
          note('I4-cote-fausse', rec, { bouton: a.label, indice: a.hint, aPayer: amt, pot: s.pot, coteReelle: coteReelle + '%' });
        }
      } else if (pctHint && !pctLbl && pctReel != null && Math.abs(+pctHint - pctReel) > 6) {
        note('I4-indice-vs-montant', rec, { bouton: a.label, indice: a.hint, montant: amt, pot: s.pot, reel: pctReel + '%' });
      }
    }
    /* I5 — pot préflop == somme des jetons peints */
    if (/^pre/i.test(s.street || '') && s.chips.length) {
      const somme = R2(s.chips.reduce((x, c) => x + c.amount, 0));
      if (Math.abs(somme - s.pot) > 0.011) note('I5-pot-preflop', rec, { potAffiche: s.pot, sommeJetons: somme, jetons: s.chips.map(c => c.amount) });
    }
  }
  await page.evaluate(() => window.__mn.actAll());
  await sleep(260);
  await page.evaluate(HELPERS);
  const advanced = await page.evaluate(() => window.__mn.nextAll());
  await sleep(advanced ? 320 : 520);
}

/* ── EXPÉRIENCE DIRIGÉE : le sélecteur de sizing change-t-il l'action jouée ? ──
   On lit le montant proposé sur le bouton RAISE avec le préréglage par défaut,
   on bascule sur ALL-IN, on joue, puis on lit le pot obtenu. Si le pot ne bouge
   pas avec le préréglage, le sélecteur ne pilote rien. */
let sizerExperiment = null;
try {
  await page.evaluate(HELPERS);
  for (let k = 0; k < 40 && !sizerExperiment; k++) {
    const has = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button.gto-btn')].filter(x => x.getBoundingClientRect().width > 0);
      return b.some(x => /gto-btn-(RAISE|3BET|4BET|5BET)/.test(x.className));
    });
    if (has) {
      const before = await page.evaluate(() => {
        const root = window.__mn.slots()[0];
        const s = window.__mn.read(root);
        const btn = [...root.querySelectorAll('button.gto-btn')].find(x => /gto-btn-(RAISE|3BET|4BET|5BET)/.test(x.className) && x.getBoundingClientRect().width > 0);
        return { pot: s.pot, label: btn.querySelector('.gto-btn-label').textContent, sizing: btn.querySelector('.gto-btn-sizing').textContent };
      });
      /* Préréglage ALL-IN : le montant affiché sur le bouton doit devenir le tapis. */
      await page.evaluate(() => { const b = [...document.querySelectorAll('.sizing-btn')].find(x => x.textContent.trim() === 'ALL-IN'); b && b.click(); });
      await sleep(200);
      const after = await page.evaluate(() => {
        const root = window.__mn.slots()[0];
        const s = window.__mn.read(root);
        const btn = [...root.querySelectorAll('button.gto-btn')].find(x => /gto-btn-(RAISE|3BET|4BET|5BET)/.test(x.className) && x.getBoundingClientRect().width > 0);
        btn.click();
        return { pot: s.pot, sizing: btn.querySelector('.gto-btn-sizing').textContent };
      });
      await sleep(600);
      const potApres = await page.evaluate(() => window.__mn.read(window.__mn.slots()[0]).pot);
      sizerExperiment = {
        boutonAvant: before.label, sizingAvant: before.sizing, sizingApresAllIn: after.sizing,
        potAvant: before.pot, potApres,
        deltaPot: potApres != null && before.pot != null ? R2(potApres - before.pot) : null,
        montantAnnonceParLeSelecteur: after.sizing,
      };
    } else {
      await page.evaluate(() => window.__mn.actAll()); await sleep(240);
      await page.evaluate(HELPERS);
      await page.evaluate(() => window.__mn.nextAll()); await sleep(420);
      await page.evaluate(HELPERS);
    }
  }
} catch (e) { sizerExperiment = { erreur: String(e).slice(0, 160) }; }

fs.mkdirSync(SHOTS, { recursive: true });
await page.screenshot({ path: path.join(SHOTS, `trainer-money-${TABLES}T${STACK ? '-' + STACK : ''}.png`) });

/* Contrôle de niveau RUN pour I1 : sur un échantillon de plusieurs mains et de
   plusieurs profondeurs, le tapis adverse ne peut pas être une valeur unique. */
if (records.length >= 10 && tapisAdversesVus.size <= 1) {
  findings.push({ code: 'I1-tapis-vilain-constant', detail: `une seule valeur de tapis adverse sur ${records.length} mains`, valeurs: [...tapisAdversesVus] });
}
const report_i1 = { valeursDistinctes: tapisAdversesVus.size, profondeursDistinctes: profondeursVues.size };

const byCode = {};
for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
const report = {
  ts: new Date().toISOString(), url: URL, viewport: { w: W, h: H }, tables: TABLES, stackFiltre: STACK || '(par defaut)',
  mainsRelevees: records.length,
  ecartsParInvariant: byCode,
  tapisAdverses: report_i1,
  ecarts: findings.slice(0, 120),
  experienceSelecteurDeSizing: sizerExperiment,
  consoleErrors,
  verdict: findings.length === 0 ? 'OK — aucune incoherence arithmetique relevee' : `${findings.length} ecart(s) sur ${records.length} mains`,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

console.log(`\nMains relevees : ${records.length}`);
console.log('Ecarts par invariant :', JSON.stringify(byCode, null, 1));
console.log('Selecteur de sizing :', JSON.stringify(sizerExperiment));
console.log('Erreurs console :', consoleErrors.length);
console.log('Rapport :', OUT);
await browser.close();

/* ── UN INSTRUMENT QUI MESURE DOIT POUVOIR ÉCHOUER ─────────────────────────
   Le script écrivait son rapport puis sortait toujours en 0 : `npm run
   audit:money` était vert même avec 116 écarts. Un audit qui ne peut pas
   échouer ne garde rien. Trois causes de sortie non nulle, toutes issues de
   mesures déjà prises ci-dessus — aucune tolérance n'est relâchée :
     ① au moins un écart d'invariant ;
     ② une erreur console pendant la session ;
     ③ un relevé vide (l'instrument n'a rien mesuré : il ne valide rien). */

const echecs = [];
if (findings.length) echecs.push(`${findings.length} ecart(s) d'invariant`);
if (consoleErrors.length) echecs.push(`${consoleErrors.length} erreur(s) console`);
if (records.length < HANDS) echecs.push(`${records.length} main(s) relevee(s) sur ${HANDS} demandees`);
if (echecs.length) {
  console.error('\nECHEC audit:money — ' + echecs.join(' · '));
  process.exit(1);
}
console.log('\nOK audit:money — aucune incoherence arithmetique sur', records.length, 'mains');
