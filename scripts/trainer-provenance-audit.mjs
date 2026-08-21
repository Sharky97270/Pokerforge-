#!/usr/bin/env node
/**
 * trainer-provenance-audit — prouve, sur des mains RÉELLEMENT générées par
 * l'application, qu'aucune solution ne s'affiche avec une provenance plus forte
 * que ce que son modèle autorise.
 *
 * POURQUOI CE SCRIPT EXISTE
 * Le 2026-08-21, une mesure en 2T à 1920×1080 a montré un spot
 * « BTN 25bb — Push ou fold ? » (Cash 6-max) portant le bandeau
 * « 🦈 SOLUTION SOLVEUR — calcul exact ». Le moteur derrière ce badge est
 * déclaré heads-up et chip-EV pur dans son propre en-tête. Un test unitaire
 * verrouille la règle ; ce script vérifie qu'elle tient sur la population de
 * spots que le générateur produit vraiment — c'est-à-dire là où le défaut est né.
 *
 * Il ne lit pas des pixels : il interroge la trace de résolution publiée par
 * src/trainerDiagnostics.js (window.__pfTrainerDiag), donc il mesure ce que
 * l'application a DÉCIDÉ, pas ce qu'un libellé laisse croire.
 *
 * Prérequis : serveur de dev lancé, Chrome ou Edge installé.
 * Exemples :
 *   node scripts/trainer-provenance-audit.mjs --url=http://localhost:7799
 *   node scripts/trainer-provenance-audit.mjs --hands=200 --tables=1
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const HANDS = +arg('hands', 160);
const SMODE = +arg('smode', 100);   // longueur de session : plus la queue est longue, plus l'echantillon de spots l'est
const TABLES = +arg('tables', 1);
const W = +arg('w', 1920), H = +arg('h', 1080);
const OUT = path.resolve(arg('out', 'design-qa-evidence/trainer-provenance.json'));

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
  window.__pv = {
    leaf(t) { return [...document.querySelectorAll('div,span,button')].find(e => e.children.length === 0 && e.textContent.trim() === t); },
    clickLeaf(t) { const e = window.__pv.leaf(t); if (e) { e.click(); return true; } return false; },
    clickNT(n) { const e = [...document.querySelectorAll('.mtbtn')].find(x => x.textContent.trim() === n + 'T'); if (e) { e.click(); return true; } return false; },
    launch() { const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent)); if (b) { b.click(); return true; } return false; },
    slots() { return [...document.querySelectorAll('.mt-slot')]; },
    /* Choisit la longueur de session dans le bandeau gauche (pastilles .smpill). */
    setSmode(n) {
      const el = [...document.querySelectorAll('.smpill')].find(e => (e.querySelector('.smnum') || {}).textContent === String(n));
      if (el) { el.click(); return true; } return false;
    },
    /* Relance une session depuis l'ecran de resultats (nouvelle queue = nouveaux spots). */
    restart() {
      const b = [...document.querySelectorAll('button')].find(x => /Rejouer|Nouvelle session|Recommencer/i.test(x.textContent) && x.getBoundingClientRect().width > 0);
      if (b) { b.click(); return true; } return false;
    },
    /* Joue une action non terminale sur chaque table puis demande la main suivante. */
    actAll() {
      let n = 0;
      window.__pv.slots().forEach(s => {
        const b = [...s.querySelectorAll('button.gto-btn,button[class*="gto-btn-"]')].filter(x => x.getBoundingClientRect().width > 0);
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
    diag() { return window.__pfTrainerDiag ? { s: window.__pfTrainerDiag.summary(), v: window.__pfTrainerDiag.violations(), n: window.__pfTrainerDiag.entries().length } : null; },
    entries() { return window.__pfTrainerDiag ? window.__pfTrainerDiag.entries() : []; },
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
const consoleErrors = [];
/* Cf. trainer-solution-toggle-audit : le message console d'une ressource
   manquante ne nomme pas la ressource. On journalise la requête en échec et on
   exclut le favicon, absent du serveur autonome par construction. */
page.on('response', r => {
  if (r.status() < 400) return;
  const u = r.url();
  if (/\/favicon\.ico(\?|$)/.test(u)) return;
  consoleErrors.push(`ressource ${r.status()} : ${u.slice(0, 140)}`);
});
page.on('console', m => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource/i.test(m.text())) return;
  consoleErrors.push(m.text().slice(0, 200));
});
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
await waitFor(n => window.__pv.setSmode(n), SMODE, 'longueur de session ' + SMODE); await sleep(200);
if (TABLES > 1) { await waitFor(n => window.__pv.clickNT(n), TABLES, TABLES + 'T'); await sleep(250); }
await waitFor(() => window.__pv.launch(), null, 'Lancer la session');
await waitFor(() => window.__pv.slots().length > 0, null, 'tables montées');
await sleep(900);

/* On enchaîne les mains : chaque nouvelle queue repasse par `stampStrategy`,
   donc chaque main laisse une entrée de trace. */
let guard = 0;
while (guard++ < HANDS * 3) {
  await page.evaluate(HELPERS);
  const d = await page.evaluate(() => window.__pv.diag());
  if (d && d.n >= HANDS) break;
  await page.evaluate(() => window.__pv.actAll());
  await sleep(260);
  await page.evaluate(HELPERS);
  const advanced = await page.evaluate(() => window.__pv.nextAll());
  await sleep(advanced ? 320 : 500);
}

await page.evaluate(HELPERS);
const entries = await page.evaluate(() => window.__pv.entries());
const summary = await page.evaluate(() => window.__pfTrainerDiag.summary());
const violations = await page.evaluate(() => window.__pfTrainerDiag.violations());

/* Distribution lisible : quelle source pour quel type de spot. C'est le
   « tableau des moteurs réellement utilisés » demandé en livrable. */
const table = {};
for (const e of entries) {
  const sc = e.scope || {};
  const k = `${sc.street || '?'} · ${sc.players ?? '?'}j · ${sc.payout || '?'} · ${sc.depthBb ? Math.round(sc.depthBb) + 'bb' : '?'}`;
  table[k] = table[k] || {};
  table[k][e.source] = (table[k][e.source] || 0) + 1;
}

/* HONNÊTETÉ DU VERDICT — à lire avant de se réjouir d'un « OK ».
   « Aucune provenance surévaluée » est vrai TRIVIALEMENT si l'échantillon ne
   contient aucun spot résolu par le solveur : on n'a alors rien vérifié du
   chemin positif. Le générateur produit des spots aléatoires, et un tirage de
   100 mains peut ne contenir aucun push/fold heads-up chip-EV. On le dit. */
const solverCount = summary.bySource.solver || 0;
const echantillonUnilateral = solverCount === 0;
const report = {
  ts: new Date().toISOString(), url: URL, viewport: { w: W, h: H }, tables: TABLES,
  handsTraced: entries.length, summary, violations, engineBySpotType: table,
  consoleErrors,
  solverCount,
  echantillonUnilateral,
  avertissement: echantillonUnilateral
    ? 'Aucun spot résolu par le solveur dans cet échantillon : le verdict ne teste que le chemin de repli. Relancer avec --hands plus élevé pour exercer aussi le chemin positif.'
    : null,
  verdict: violations.length === 0 ? 'OK — aucune provenance surévaluée' : `ÉCHEC — ${violations.length} badge(s) hors domaine`,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

console.log(`\nMains tracées : ${entries.length}`);
console.log('Sources :', JSON.stringify(summary.bySource));
console.log('\nMoteur par type de spot :');
for (const [k, v] of Object.entries(table).sort()) console.log(`  ${k.padEnd(38)} ${JSON.stringify(v)}`);
console.log('\nMotifs de repli les plus fréquents :');
for (const [k, v] of Object.entries(summary.byFallback).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(v).padStart(4)} × ${k}`);
if (consoleErrors.length) console.log('\nErreurs console :', consoleErrors.slice(0, 5));
if (report.avertissement) console.log('\n⚠ ' + report.avertissement);
console.log('\n' + report.verdict);
console.log('→ ' + OUT);
await browser.close();
process.exit(violations.length === 0 ? 0 : 1);
