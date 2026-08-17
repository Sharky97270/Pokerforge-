#!/usr/bin/env node
/**
 * replayer-cfr-shot — vérifie que le solveur CFR postflop remonte RÉELLEMENT
 * jusqu'au panneau du Replayer (§34).
 *
 * Contrairement aux tests Node, rien n'est simulé ici : le Web Worker tourne,
 * le solve est effectué, et on attend que le badge passe d'« ESTIMATION » à
 * « CFR POSTFLOP ». C'est la seule preuve que le pont fonctionne de bout en
 * bout (worker chargé par Vite, requête sérialisable, mapping des actions).
 *
 * Usage : node scripts/replayer-cfr-shot.mjs [--url=…] [--wait=45000] [--out=…]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const WAIT = +arg('wait', 45000);
const W = +arg('w', 1600), H = +arg('h', 950);
const OUT = path.resolve(arg('out', 'replayer-cfr.png'));

/* Heads-up, Hero check-call flop puis check-fold turn : deux décisions
   exactement dans l'arbre modélisé (Hero check → Villain bet → Hero F/C/R). */
const HH = `PokerStars Hand #920001: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'CFR' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Hero: posts small blind $1
Villain: posts big blind $2
Dealt to Hero [Qs Jh]
Hero: raises $4 to $6
Villain: calls $4
*** FLOP *** [Ah Kd 7c]
Hero: checks
Villain: bets $6
Hero: calls $6
*** TURN *** [Ah Kd 7c] [2s]
Hero: checks
Villain: bets $18
Hero: folds`;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Lancement tolérant. Deux pièges rencontrés en usage réel :
   • si l'utilisateur a déjà Chrome ouvert, une seconde instance délègue à
     celle en cours et puppeteer échoue sur un « browser is already running »
     qui n'a rien à voir avec ce qu'on teste → on essaie le navigateur suivant ;
   • un profil partagé se verrouille après un run interrompu → profil dédié à
     chaque exécution. */
async function launchAny() {
  const found = CHROMES.filter(p => fs.existsSync(p));
  if (!found.length) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }
  const errs = [];
  for (const executablePath of found) {
    try {
      return await puppeteer.launch({
        executablePath, headless: 'new', args: ['--hide-scrollbars'],
        userDataDir: path.join(os.tmpdir(), `pf-cfr-shot-${process.pid}-${Date.now()}`),
        defaultViewport: { width: W, height: H },
      });
    } catch (e) { errs.push(`${path.basename(executablePath)} : ${String(e.message).split('\n')[0]}`); }
  }
  console.error('Aucun navigateur n\'a pu démarrer.\n  ' + errs.join('\n  '));
  process.exit(2);
}
const browser = await launchAny();

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message).slice(0, 160)));

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.setItem('pf_active_tab', 'replayer'));
  await page.reload({ waitUntil: 'networkidle2' });
  /* Attendre l'ÉLÉMENT, pas une durée : selon le navigateur réellement utilisé
     (Chrome ou repli Edge) l'hydratation de React prend de 0,3 à plusieurs
     secondes, et un `sleep` fixe cliquait dans le vide. */
  await page.waitForSelector('textarea', { timeout: 20000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some(b => /Charger les mains|Charger la main/.test(b.textContent)),
    { timeout: 20000 });

  await page.evaluate((hh) => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, hh); ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => /Charger les mains|Charger la main/.test(b.textContent))?.click();
  }, HH);
  await page.waitForSelector('.pf-player-seat', { timeout: 5000 });
  await sleep(400);

  // Curseur sur le call flop de Hero (dernière action du flop).
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Flop')?.click());
  await sleep(250);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '▶▶');
    for (let i = 0; i < 3; i++) btn?.click();
  });
  await sleep(400);

  const badgeNow = () => page.evaluate(() => {
    const t = document.body.innerText;
    return {
      cfr: /CFR POSTFLOP/.test(t),
      estimation: /ESTIMATION/.test(t),
      solving: /CFR en cours/.test(t),
      gap: (t.match(/Écart à l'équilibre\s*\n?\s*([-\d]+ pts)/) || [])[1] || null,
      evPerdue: /EV perdue/.test(t),
      niveau: (t.match(/NIVEAU \d[^\n]*/) || [])[0] || null,
    };
  });

  const before = await badgeNow();

  // Le solve tourne dans un Worker : on attend le basculement du badge.
  const t0 = Date.now();
  let after = before;
  while (Date.now() - t0 < WAIT) {
    after = await badgeNow();
    if (after.cfr) break;
    await sleep(1000);
  }
  const elapsedMs = Date.now() - t0;

  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await sleep(200);
  await page.screenshot({ path: OUT, fullPage: false });

  const verdict = after.cfr ? 'CFR REMONTÉ AU PANNEAU' : 'CFR NON REMONTÉ (repli heuristique)';
  console.log(JSON.stringify({
    out: OUT, verdict,
    avant: before, apres: after,
    attenteMs: elapsedMs,
    ecartEnPointsPasEnBb: after.cfr ? (after.gap != null && !after.evPerdue) : null,
    erreursConsole: errors.length ? errors : 'aucune',
  }, null, 1));
  process.exit(after.cfr ? 0 : 1);
} finally {
  await browser.close();
}
