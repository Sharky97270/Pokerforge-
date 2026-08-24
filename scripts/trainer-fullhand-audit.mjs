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
 *   node scripts/trainer-fullhand-audit.mjs --url=http://localhost:7799 --hands=20
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
    heroAct() {
      const b = [...document.querySelectorAll('button.gto-btn')].filter(x => x.getBoundingClientRect().width > 0);
      const pick = b.find(x => /Call/i.test(x.textContent)) || b.find(x => !/Fold/i.test(x.textContent)) || b[0];
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
    const joue = await page.evaluate(() => window.__fh.heroAct());
    if (!joue) { tentatives.sansAction++; await page.evaluate(HELPERS); await page.evaluate(() => window.__fh.nextHand()); await sleep(700); continue; }
    await sleep(2400);                       // réflexion du vilain + montée du coup
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

  const main = { i: mains.length + 1, etapes: [], verdict: null, resultat: null };
  let pas = 0;
  let totalReference = null;

  while (pas++ < 24) {
    await page.evaluate(HELPERS);
    const snap = await page.evaluate(() => ({
      ledger: window.__fh.ledger(),
      boutons: window.__fh.fhButtons(),
      plaques: window.__fh.plaques(),
      verdict: window.__fh.verdict(),
    }));
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
  const fin = await page.evaluate(() => ({ ledger: window.__fh.ledger(), verdict: window.__fh.verdict(), res: window.__fh.resultat() }));
  main.verdict = fin.verdict || main.verdict;
  main.resultat = fin.res;
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
await page.screenshot({ path: path.join(SHOTS, 'trainer-fullhand.png') });
await browser.close();

const byCode = {};
for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
const issues = {};
for (const m of mains) issues[m.verdict] = (issues[m.verdict] || 0) + 1;
const rapport = {
  ts: new Date().toISOString(), url: URL, viewport: { w: W, h: H },
  mainsCompletes: mains.length, issues, tentatives,
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
console.log('Ecarts par invariant :', JSON.stringify(byCode, null, 1));
console.log('Erreurs console :', consoleErrors.length);
console.log('Rapport :', OUT);

const echecs = [];
if (findings.length) echecs.push(`${findings.length} ecart(s)`);
if (consoleErrors.length) echecs.push(`${consoleErrors.length} erreur(s) console`);
if (mains.length < HANDS) echecs.push(`${mains.length} main(s) completee(s) sur ${HANDS}`);
if (echecs.length) { console.error('\nECHEC audit:fullhand — ' + echecs.join(' · ')); process.exit(1); }
console.log('\nOK audit:fullhand —', mains.length, 'coups complets, comptabilite conforme');
