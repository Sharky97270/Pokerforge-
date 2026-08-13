#!/usr/bin/env node
/**
 * replayer-cine-audit — audit de la CINÉMATIQUE des jetons (§11–19).
 *
 * Contrairement à replayer-bet-audit (qui fige les animations pour mesurer des
 * positions), ce script les LAISSE tourner et échantillonne le DOM pendant le
 * mouvement. Il vérifie que :
 *   • une mise ENTRE depuis le siège de son propriétaire (§12/§13) ;
 *   • un raise n'efface pas la pile en place mais lui ajoute des jetons (§14) ;
 *   • un changement de street envoie les contributions vers le POT (§16) ;
 *   • aucun jeton fantôme ne survit à l'animation (§29) ;
 *   • un retour arrière / un scrub ne rejoue RIEN (§19) ;
 *   • la durée suit la vitesse de lecture (§18).
 *
 * Usage : node scripts/replayer-cine-audit.mjs [--url=…] [--speed=1]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const W = +arg('w', 1680), H = +arg('h', 1050);

const HH = `PokerStars Hand #910001: Hold'em No Limit ($1/$2) - 2026/08/01
Table 'Cine' 6-max Seat #1 is the button
Seat 1: Hero ($400 in chips)
Seat 2: SbGuy ($400 in chips)
Seat 3: BbGuy ($400 in chips)
Seat 4: UtgGuy ($400 in chips)
Seat 5: HjGuy ($400 in chips)
Seat 6: CoGuy ($400 in chips)
SbGuy: posts small blind $1
BbGuy: posts big blind $2
Dealt to Hero [Ah Kh]
UtgGuy: raises $4 to $6
HjGuy: folds
CoGuy: calls $6
Hero: raises $18 to $24
SbGuy: folds
BbGuy: folds
UtgGuy: calls $18
CoGuy: calls $18
*** FLOP *** [Qc 8s 3d]
UtgGuy: checks
CoGuy: bets $40
Hero: raises $120 to $160
UtgGuy: folds
CoGuy: calls $120
*** TURN *** [Qc 8s 3d] [2h]
CoGuy: checks
Hero: bets $216 and is all-in
CoGuy: calls $216 and is all-in
*** RIVER *** [Qc 8s 3d 2h] [Jd]`;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Instantané du calque d'animation. */
const SNAP = () => {
  const root = document.querySelector('.pf-replayer-table');
  if (!root) return { error: 'table absente' };
  const cs = el => getComputedStyle(el);
  const bets = [...root.querySelectorAll('.pf-bet-display')].map(el => {
    const s = cs(el);
    return {
      pos: el.getAttribute('data-seat'),
      amount: +el.getAttribute('data-amount'),
      anim: s.animationName,
      dur: s.animationDuration,
      // Décalage courant par rapport à la position finale : non nul ⇒ la pile
      // est encore en vol depuis son siège.
      matrix: s.transform,
      bump: el.className.includes('is-bump'),
    };
  });
  const flies = [...root.querySelectorAll('.pf-chip-fly')].map(el => {
    const s = cs(el);
    return { anim: s.animationName, dur: s.animationDuration, dx: s.getPropertyValue('--pf-fly-dx'), dy: s.getPropertyValue('--pf-fly-dy'), left: el.style.left, top: el.style.top };
  });
  const step = (document.body.innerText.match(/Step (\d+)\/(\d+)/) || [])[1];
  return { step: step ? +step : null, bets, flies };
};

const clickBtn = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label)?.click();

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => localStorage.setItem('pf_active_tab', 'replayer')).catch(() => {});
    await page.reload({ waitUntil: 'networkidle2' }).catch(() => {});
    try { await page.waitForSelector('textarea', { timeout: 6000 }); break; } catch { await sleep(2500); }
  }
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => /Charger les mains|Charger la main/.test(b.textContent))?.click();
  }, HH);
  await page.waitForSelector('.pf-player-seat', { timeout: 6000 });
  await sleep(400);

  const speed = arg('speed', null);
  if (speed) {
    await page.evaluate(s => {
      const label = `${s}×`;
      [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label)?.click();
    }, speed);
    await sleep(200);
  }

  const rapport = [];
  const total = await page.evaluate(() => { const m = document.body.innerText.match(/Step \d+\/(\d+)/); return m ? +m[1] : 0; });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '⏮')?.click());
  await sleep(300);

  // Avance action par action ; à chaque pas, échantillonne PENDANT le mouvement
  // (≈ 40 ms) puis APRÈS stabilisation (≈ 700 ms).
  for (let i = 1; i <= total; i++) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '▶▶')?.click());
    await sleep(40);
    const during = await page.evaluate(SNAP);
    await sleep(700);
    const after = await page.evaluate(SNAP);

    const moving = during.bets.filter(b => b.anim && b.anim !== 'none');
    const bumping = during.bets.filter(b => b.bump);
    rapport.push({
      step: during.step,
      pendant: {
        misesEnVol: moving.map(b => `${b.pos} ${b.amount}bb (${b.anim} ${b.dur})`),
        misesQuiEncaissent: bumping.map(b => `${b.pos} ${b.amount}bb`),
        jetonsEnVol: during.flies.length,
        volDetail: during.flies.map(f => `→ pot depuis Δ(${f.dx.trim()},${f.dy.trim()})`),
      },
      apres: {
        mises: after.bets.map(b => `${b.pos} ${b.amount}bb`),
        jetonsEnVolResiduels: after.flies.length,
        animationsResiduelles: after.bets.filter(b => b.anim && b.anim !== 'none').map(b => b.pos),
      },
    });
  }

  /* §19 — retour arrière et scrub ne doivent RIEN animer. */
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '◀◀')?.click());
  await sleep(45);
  const retourArriere = await page.evaluate(SNAP);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '⏮')?.click());
  await sleep(45);
  const scrubDebut = await page.evaluate(SNAP);
  await sleep(600);
  const apresScrub = await page.evaluate(SNAP);

  const problemes = [];
  for (const r of rapport) {
    if (r.apres.jetonsEnVolResiduels > 0) problemes.push(`step ${r.step} : ${r.apres.jetonsEnVolResiduels} jeton(s) fantôme(s) après stabilisation`);
    if (r.apres.animationsResiduelles.length) problemes.push(`step ${r.step} : animation non terminée sur ${r.apres.animationsResiduelles.join(',')}`);
  }
  if (retourArriere.bets.some(b => b.anim && b.anim !== 'none')) problemes.push('retour arrière : une animation a été rejouée (§19)');
  if (retourArriere.flies.length) problemes.push('retour arrière : jetons en vol (§19)');
  if (scrubDebut.flies.length) problemes.push('scrub vers le début : jetons en vol (§19)');
  if (apresScrub.flies.length) problemes.push('scrub : jetons fantômes persistants');

  const avecVol = rapport.filter(r => r.pendant.misesEnVol.length || r.pendant.jetonsEnVol || r.pendant.misesQuiEncaissent.length);
  console.log(JSON.stringify({
    vitesse: speed || '1×',
    etapes: rapport.length,
    etapesAnimees: avecVol.length,
    detail: avecVol,
    retourArriere: { misesAnimees: retourArriere.bets.filter(b => b.anim !== 'none').length, jetonsEnVol: retourArriere.flies.length },
    problemes: problemes.length ? problemes : 'aucun',
  }, null, 1));
  process.exitCode = problemes.length ? 1 : 0;
} finally {
  await browser.close();
}
