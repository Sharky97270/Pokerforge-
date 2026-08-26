#!/usr/bin/env node
/**
 * solver-perf-probe — MESURE le coût réel de la saisie d'un board dans
 * l'onglet SharkSolver, étape par étape, et profile le thread principal.
 *
 * POURQUOI CE SCRIPT EXISTE
 * Une sonde de QA a rapporté « ~160 s de travail synchrone » à la saisie d'un
 * board, sans dire OÙ. Un timeout de protocole plus généreux rend l'échec
 * lisible mais n'explique rien. Ce script sépare les deux questions :
 *   1. COMBIEN coûte chaque frappe (blocage du thread principal, en ms) ;
 *   2. QUELLES fonctions consomment ce temps (profil CPU V8 agrégé).
 * Sans le point 2, toute « optimisation » serait une supposition.
 *
 * Prérequis : le serveur de dev (`.claude/launch.json` → pokerforge, 7788).
 *
 *   node scripts/solver-perf-probe.mjs --out=design-qa-evidence/solver-perf-avant.json
 *   node scripts/solver-perf-probe.mjs --profile=0        (sans profil CPU)
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? decodeURIComponent(h.split('=').slice(1).join('=')) : d; };

const URL = arg('url', 'http://localhost:7788');
const OUT = path.resolve(arg('out', 'design-qa-evidence/solver-perf.json'));
const W = +arg('w', 1600), H = +arg('h', 1000);
const PROFILE = arg('profile', '1') !== '0';
const LABEL = arg('label', 'mesure');
/* Adaptive Sizing ON/OFF — le vrai drapeau du moteur (`pf_flag_adaptiveSizingEngine`),
   pas une approximation : c'est la seule façon d'établir son coût RÉEL sur la
   saisie d'un board plutôt que de l'affirmer. */
const SIZING = arg('sizing', 'on');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Séquence de frappes : on tape le board CARACTÈRE PAR CARACTÈRE, comme un
   humain. C'est la seule façon de voir apparaître le coût de la 5e carte, qui
   reste invisible si l'on injecte le board complet en une fois. */
const SEQ = [
  ['charge initiale', null],
  ['1 car. « A »', 'A'],
  ['carte 1 « As »', 'As'],
  ['2e rang « As7 »', 'As7'],
  ['carte 2 « As7d »', 'As7d'],
  ['3e rang « As7d2 »', 'As7d2'],
  ['FLOP « As7d2c »', 'As7d2c'],
  ['4e rang « …9 »', 'As7d2c9'],
  ['TURN « …9h »', 'As7d2c9h'],
  ['5e rang « …K »', 'As7d2c9hK'],
  ['RIVER « …Ks »', 'As7d2c9hKs'],
  ['modifier la river (Ks→Kd)', 'As7d2c9hKd'],
  ['modifier le turn (9h→9c)', 'As7d2c9cKd'],
  ['retirer la river', 'As7d2c9c'],
  ['reset du board', ''],
];

const browser = await puppeteer.launch({
  protocolTimeout: 900000, executablePath, headless: 'new',
  args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
const out = { label: LABEL, url: URL, adaptiveSizing: SIZING, when: new Date().toISOString(), steps: [], errors: [], hotspots: [] };

try {
  const page = await browser.newPage();
  page.on('pageerror', e => out.errors.push(String(e).slice(0, 200)));

  /* Le drapeau doit être posé AVANT que l'application ne le lise : on charge une
     page vide de la même origine, on écrit dans localStorage, puis on navigue. */
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate((v) => {
    try { localStorage.setItem('pf_flag_adaptiveSizingEngine', v === 'off' ? '0' : '1'); } catch { /* stockage bloqué */ }
  }, SIZING);

  const t0load = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle2' });
  let navOk = false;
  for (let i = 0; i < 20 && !navOk; i++) {
    navOk = await page.evaluate(() => {
      const el = [...document.querySelectorAll('button, .ntab, div, span')]
        .filter(x => x.children.length === 0 || x.tagName === 'BUTTON')
        .find(x => x.textContent.trim() === 'SharkSolver');
      if (el) { el.click(); return true; } return false;
    });
    if (!navOk) await sleep(400);
  }
  if (!navOk) throw new Error("onglet SharkSolver introuvable");
  await sleep(1500);
  out.steps.push({ step: 'charge initiale (goto + onglet)', totalMs: Date.now() - t0load, blockingMs: null });

  const client = await page.createCDPSession();
  if (PROFILE) {
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 200 }); // µs
    await client.send('Profiler.start');
  }

  for (const [label, value] of SEQ) {
    if (value === null) continue;
    const r = await page.evaluate(async (v) => {
      const el = [...document.querySelectorAll('input')]
        .find(i => /river/i.test(i.placeholder || '') || /board/i.test(i.placeholder || ''));
      if (!el) return { ok: false };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const t0 = performance.now();
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      /* `sync` = ce que React a exécuté dans le gestionnaire d'événement.
         `settled` = jusqu'à ce que le thread principal rende la main (effets
         passifs, rendu suivant compris) : c'est ce que l'utilisateur subit. */
      const t1 = performance.now();
      await new Promise(res => setTimeout(res, 0));
      await new Promise(res => requestAnimationFrame(() => res()));
      const t2 = performance.now();
      return { ok: true, syncMs: Math.round(t1 - t0), settledMs: Math.round(t2 - t0) };
    }, value);
    out.steps.push({ step: label, value, ...r });
    console.error(`  ${label.padEnd(34)} sync=${String(r.syncMs).padStart(7)}ms  settled=${String(r.settledMs).padStart(7)}ms`);
    await sleep(120);
  }

  if (PROFILE) {
    const { profile } = await client.send('Profiler.stop');
    const interval = 0.2; // ms par échantillon
    const agg = new Map();
    for (const n of profile.nodes) {
      const f = n.callFrame;
      const name = (f.functionName || '(anonyme)') +
        ' — ' + (f.url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0] + ':' + (f.lineNumber + 1);
      const cur = agg.get(name) || { selfMs: 0, hits: 0 };
      cur.selfMs += (n.hitCount || 0) * interval;
      cur.hits += n.hitCount || 0;
      agg.set(name, cur);
    }
    const totalSelf = [...agg.values()].reduce((a, b) => a + b.selfMs, 0) || 1;
    out.profileTotalMs = Math.round(totalSelf);
    out.hotspots = [...agg.entries()]
      .map(([name, v]) => ({ name, selfMs: Math.round(v.selfMs), pct: +(v.selfMs / totalSelf * 100).toFixed(1) }))
      .sort((a, b) => b.selfMs - a.selfMs).slice(0, 20);
  }
  out.ok = out.errors.length === 0;
} catch (e) {
  out.errors.push(String((e && e.message) || e));
} finally {
  await browser.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}
