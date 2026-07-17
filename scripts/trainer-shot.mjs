#!/usr/bin/env node
/**
 * trainer-shot — capture le Trainer dans un PNG, en pilotant un Chrome headless.
 *
 * Pourquoi : le Trainer se règle au pixel (sièges sur l'anneau, écarts pot/board/
 * cartes Hero…). Les mesures DOM seules laissent passer des défauts qu'on ne voit
 * qu'à l'image — ex. le pot posé sur la plaque du joueur du haut, ou les cartes
 * Hero masquant la valeur du pot. Ce script rend le rendu observable.
 *
 * Prérequis : le serveur de dev tourne (npm run dev), et Chrome ou Edge est
 * installé. puppeteer-core réutilise ce navigateur (aucun Chromium téléchargé).
 *
 * Exemples :
 *   npm run shot                                  # 1T · 6J · postflop · 1440x900
 *   npm run shot -- --struct=7J --street=preflop
 *   npm run shot -- --tables=4T --struct=9J --w=1920 --h=1080
 *   npm run shot -- --full                        # page entière (sinon : table seule)
 *
 * Sort un PNG et imprime un JSON de contrôle (sièges, positions, hero, street).
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (name, def) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const flag = name => process.argv.includes(`--${name}`);

const URL = arg('url', 'http://localhost:7788');
const STRUCT = arg('struct', '6J');          // 2J..9J
const TABLES = arg('tables', '1T');          // 1T..4T
const STREET = arg('street', 'postflop');    // preflop | postflop
const W = +arg('w', 1440);
const H = +arg('h', 900);
const OUT = path.resolve(arg('out', `trainer-${TABLES}-${STRUCT}-${STREET}.png`));
const FULL = flag('full');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) {
  console.error('Aucun Chrome/Edge trouve. Renseigne un chemin dans CHROMES (scripts/trainer-shot.mjs).');
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--hide-scrollbars'],
  defaultViewport: { width: W, height: H },
});

try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const click = (txt, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')]
      .find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; }
    return false;
  }, txt, exact);

  await click('Entraineur GTO'); await sleep(800);
  // Les filtres sont verrouilles pendant une session : on choisit AVANT de lancer.
  await click(TABLES); await sleep(150);
  await click(STRUCT); await sleep(250);
  await click('Lancer la session', false); await sleep(1200);

  if (STREET === 'postflop') {
    for (let i = 0; i < 10; i++) {
      if (await page.evaluate(() => !!document.querySelector('.pf-board-zone'))) break;
      await page.evaluate(() => {
        const nx = document.querySelector('.gto-next-btn');
        if (nx) nx.click(); else document.querySelector('.gto-btn')?.click();
      });
      await sleep(1500);
    }
  }

  // Fige les animations : sinon la capture attrape une frame instable.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await sleep(400);

  const info = await page.evaluate(() => {
    const seats = [...document.querySelectorAll('.pf-player-seat')];
    return {
      seats: seats.length,
      positions: seats.map(s => s.getAttribute('data-seat')),
      hero: seats.find(s => s.querySelector('.pf-seat-hero-chip'))?.getAttribute('data-seat') ?? null,
      street: [...document.querySelectorAll('.mtr-street.cur')].map(e => e.textContent)[0] ?? null,
      boardCards: document.querySelectorAll('.pf-board-zone .card').length,
    };
  });

  const target = FULL ? null : await page.$('.t1-left');
  if (target) await target.screenshot({ path: OUT });
  else await page.screenshot({ path: OUT, fullPage: false });

  console.log(JSON.stringify({ out: OUT, viewport: `${W}x${H}`, tables: TABLES, struct: STRUCT, ...info }, null, 1));
} finally {
  await browser.close();
}
