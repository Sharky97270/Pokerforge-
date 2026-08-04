#!/usr/bin/env node
/**
 * replayer-shot — capture le Replayer dans un PNG (Chrome headless).
 * Rend le rendu observable (chevauchements, débordements, animations figées)
 * là où les mesures DOM seules ne suffisent pas.
 *
 * Usage : node scripts/replayer-shot.mjs --url=http://localhost:7799 --street=turn --out=/chemin/x.png
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };

const URL = arg('url', 'http://localhost:7799');
const STREET = arg('street', 'turn');      // preflop | flop | turn | river
const W = +arg('w', 1440);
const H = +arg('h', 900);
const OUT = path.resolve(arg('out', `replayer-${STREET}.png`));

const HH = `PokerStars Hand #234589012: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'Andromeda' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Seat 5: P5 ($200 in chips)
Hero: posts small blind $1
P5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: calls $5
P5: folds
*** FLOP *** [Ah Kd 7c]
Hero: checks
Villain: bets $7
Hero: calls $7
*** TURN *** [Ah Kd 7c] [2s]
Hero: checks
Villain: bets $19
Hero: calls $19
*** RIVER *** [Ah Kd 7c 2s] [9h]
Hero: checks
Villain: bets $60
Hero: folds`;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });

try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.setItem('pf_active_tab', 'replayer'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(600);

  // Charge la main : textarea contrôlé React → setter natif + event input
  await page.evaluate((hh) => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, hh); ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => /Charger les mains|Charger la main/.test(b.textContent))?.click();
  }, HH);
  await page.waitForSelector('.pf-player-seat', { timeout: 5000 });
  await sleep(400);

  // Avance jusqu'à la street voulue
  const label = { flop: 'Flop', turn: 'Turn', river: 'River' }[STREET];
  if (label) {
    await page.evaluate((l) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === l)?.click(), label);
    await sleep(500);
  }

  // Fige les animations pour une frame stable
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await sleep(300);

  // Scan de collisions + débordements (contrôle chiffré)
  const info = await page.evaluate(() => {
    const g = e => e.getBoundingClientRect();
    const ov = (a, b) => { const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); return Math.round(x * y); };
    const felt = document.querySelector('[style*="border-radius: 50%"]');
    const container = felt ? felt.parentElement.getBoundingClientRect() : null;
    const seats = [...document.querySelectorAll('.player-card-1t')].map(g);
    const board = document.querySelector('.pf-board-zone') && g(document.querySelector('.pf-board-zone'));
    const pot = document.querySelector('.pf-pot-readout') && g(document.querySelector('.pf-pot-readout'));
    const issues = [];
    if (board) seats.forEach((s, i) => { if (ov(s, board) > 120) issues.push(`siège ${i + 1} × board (${ov(s, board)}px²)`); });
    if (board && pot && ov(board, pot) > 80) issues.push(`pot × board (${ov(board, pot)}px²)`);
    const overflow = container ? seats.filter(s => s.bottom > container.bottom + 2 || s.top < container.top - 2).length : 0;
    return {
      containerH: container ? Math.round(container.height) : null,
      seats: seats.length, board: !!board, pot: !!pot,
      overlaps: issues.length ? issues : 'aucun',
      seatsOverflowingContainer: overflow,
    };
  });

  await page.screenshot({ path: OUT, fullPage: false });
  console.log(JSON.stringify({ out: OUT, viewport: `${W}x${H}`, street: STREET, ...info }, null, 1));
} finally {
  await browser.close();
}
