#!/usr/bin/env node
/**
 * replayer-bet-audit — audit CHIFFRÉ du système de mises du Replayer.
 *
 * Pour CHAQUE étape de la main, mesure dans le DOM réel :
 *   • l'appartenance de chaque tas de jetons (§27) : le siège propriétaire
 *     doit être le plus proche du BetDisplay, avec une marge nette ;
 *   • les collisions BetDisplay × siège / board / pot / autre mise / dealer ;
 *   • les jetons fantômes (mise affichée sans montant engagé) ;
 *   • le débordement hors du feutre.
 *
 * Usage :
 *   node scripts/replayer-bet-audit.mjs --hand=6max --w=1680 --h=1050
 *   node scripts/replayer-bet-audit.mjs --all            (toutes les mains)
 *   node scripts/replayer-bet-audit.mjs --hand=6max --shot=out.png --step=8
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7799');
const W = +arg('w', 1680);
const H = +arg('h', 1050);
const DPR = +arg('dpr', 1);

/* ── Mains de test : chaque position doit miser au moins une fois ── */
export const AUDIT_HANDS = {
  /* 6-max, Hero = BTN, mise moyenne → reproduit EXACTEMENT le cas du §27
     (Hero BTN mise, CO est le siège de droite). */
  btn_vs_co: `PokerStars Hand #900001: Hold'em No Limit ($1/$2) - 2026/08/01
Table 'Gold' 6-max Seat #1 is the button
Seat 1: Hero ($200 in chips)
Seat 2: SbGuy ($200 in chips)
Seat 3: BbGuy ($200 in chips)
Seat 4: UtgGuy ($200 in chips)
Seat 5: HjGuy ($200 in chips)
Seat 6: CoGuy ($200 in chips)
SbGuy: posts small blind $1
BbGuy: posts big blind $2
Dealt to Hero [Jd Js]
UtgGuy: folds
HjGuy: folds
CoGuy: folds
Hero: raises $4 to $6
SbGuy: folds
BbGuy: calls $4
*** FLOP *** [2d 7d 3h]
BbGuy: checks
Hero: bets $26.6
BbGuy: folds`,

  /* Les SIX positions misent dans la même main (§26). */
  all_six: `PokerStars Hand #900002: Hold'em No Limit ($1/$2) - 2026/08/01
Table 'Ring' 6-max Seat #1 is the button
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
HjGuy: calls $6
CoGuy: calls $6
Hero: calls $6
SbGuy: calls $5
BbGuy: calls $4
*** FLOP *** [Qc 8s 3d]
SbGuy: bets $12
BbGuy: calls $12
UtgGuy: calls $12
HjGuy: raises $36 to $48
CoGuy: calls $48
Hero: calls $48
SbGuy: calls $36
BbGuy: folds
UtgGuy: folds
*** TURN *** [Qc 8s 3d] [2h]
SbGuy: checks
HjGuy: bets $70
CoGuy: folds
Hero: raises $210 to $280
SbGuy: folds
HjGuy: calls $210`,

  /* Hero ailleurs qu'au BTN + all-in + overbet + très petite mise. */
  hero_bb: `PokerStars Hand #900003: Hold'em No Limit ($1/$2) - 2026/08/01
Table 'Edge' 6-max Seat #4 is the button
Seat 1: P1 ($300 in chips)
Seat 2: Hero ($300 in chips)
Seat 3: P3 ($300 in chips)
Seat 4: P4 ($300 in chips)
Seat 5: P5 ($60 in chips)
Seat 6: P6 ($300 in chips)
P5: posts small blind $1
P6: posts big blind $2
Dealt to Hero [7c 7d]
P1: folds
Hero: raises $4 to $6
P3: calls $6
P4: folds
P5: raises $54 to $60 and is all-in
P6: folds
Hero: calls $54
P3: folds
*** FLOP *** [7h 2c 9d]
*** TURN *** [7h 2c 9d] [Kd]
*** RIVER *** [7h 2c 9d Kd] [3s]`,

  /* Heads-up : géométrie extrême (deux sièges opposés). */
  headsup: `PokerStars Hand #900004: Hold'em No Limit ($1/$2) - 2026/08/01
Table 'Duel' 2-max Seat #1 is the button
Seat 1: Hero ($200 in chips)
Seat 2: Villain ($200 in chips)
Hero: posts small blind $1
Villain: posts big blind $2
Dealt to Hero [As Ks]
Hero: raises $4 to $6
Villain: raises $14 to $20
Hero: calls $14
*** FLOP *** [Ah 7c 2d]
Villain: bets $24
Hero: raises $76 to $100
Villain: calls $76
*** TURN *** [Ah 7c 2d] [9s]
Villain: checks
Hero: bets $100 and is all-in
Villain: calls $100`,

  /* 9 joueurs : sièges de flanc serrés, la pire configuration pour les mises. */
  full9: `PokerStars Hand #900005: Tournament #99, 100/200 Hold'em No Limit - Level II (100/200) - 2026/08/01 19:00:00 CET
Table 'Nine 1' 9-max Seat #7 is the button
Seat 1: Hero (20000 in chips)
Seat 2: P2 (20000 in chips)
Seat 3: P3 (20000 in chips)
Seat 4: P4 (20000 in chips)
Seat 5: P5 (20000 in chips)
Seat 6: P6 (20000 in chips)
Seat 7: P7 (20000 in chips)
Seat 8: P8 (20000 in chips)
Seat 9: P9 (20000 in chips)
P8: posts small blind 100
P9: posts big blind 200
*** HOLE CARDS ***
Dealt to Hero [Ad Kc]
Hero: raises 400 to 600
P2: calls 600
P3: calls 600
P4: calls 600
P5: calls 600
P6: calls 600
P7: calls 600
P8: calls 500
P9: calls 400
*** FLOP *** [Ah 7c 2d]
P8: checks
P9: bets 1200
Hero: raises 2400 to 3600
P2: folds
P4: calls 3600
P6: folds
P7: folds
P8: folds
P9: folds`,
};

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Sonde exécutée DANS la page ── */
const PROBE = () => {
  const g = e => e.getBoundingClientRect();
  const ov = (a, b) => {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return Math.round(x * y);
  };
  const ctr = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const d = (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));

  const root = document.querySelector('.pf-replayer-table');
  if (!root) return { error: 'table absente' };
  const felt = root.querySelector('div[style*="border-radius: 50%"]');
  const feltR = felt ? g(felt) : null;

  // Centre d'un siège = son AVATAR (ce que l'œil identifie comme « le joueur »).
  const seats = [...root.querySelectorAll('.pf-player-seat')].map(el => ({
    pos: el.getAttribute('data-seat'),
    block: g(el),
    center: ctr(g(el.querySelector('.player-card-1t') || el)),
  }));
  const bets = [...root.querySelectorAll('.pf-bet-display')].map(el => ({
    pos: el.getAttribute('data-seat'),
    amount: +el.getAttribute('data-amount'),
    swept: +el.getAttribute('data-swept'),
    blocked: el.getAttribute('data-blocked'),
    r: g(el),
    center: ctr(g(el)),
  }));
  const board = root.querySelector('.pf-board-zone');
  const pot = root.querySelector('.pf-pot-readout');
  const dealer = root.querySelector('.pf-dealer-button');

  const issues = [];

  /* §27 — APPARTENANCE. Le propriétaire doit être le siège le plus proche. */
  const ownership = bets.map(b => {
    const owner = seats.find(s => s.pos === b.pos);
    if (!owner) { issues.push(`mise ${b.pos} : siège introuvable`); return null; }
    const own = d(b.center, owner.center);
    let rival = null, rd = Infinity;
    for (const s of seats) {
      if (s.pos === b.pos) continue;
      const dd = d(b.center, s.center);
      if (dd < rd) { rd = dd; rival = s.pos; }
    }
    const ok = own < rd;
    const margin = rd - own;
    if (!ok) issues.push(`AMBIGU ${b.pos} : jetons à ${own}px de ${b.pos} mais ${rd}px de ${rival}`);
    else if (margin < 30) issues.push(`limite ${b.pos} : marge ${margin}px seulement vs ${rival}`);
    return { pos: b.pos, amount: b.amount, own, rival, rivalDist: rd, margin, ok };
  }).filter(Boolean);

  /* §10 — COLLISIONS. */
  for (const b of bets) {
    for (const s of seats) {
      const a = ov(b.r, s.block);
      if (a > 40) issues.push(`mise ${b.pos} × siège ${s.pos} (${a}px²)`);
    }
    if (board && ov(b.r, g(board)) > 40) issues.push(`mise ${b.pos} × board (${ov(b.r, g(board))}px²)`);
    if (pot && ov(b.r, g(pot)) > 40) issues.push(`mise ${b.pos} × pot (${ov(b.r, g(pot))}px²)`);
    if (dealer && ov(b.r, g(dealer)) > 30) issues.push(`mise ${b.pos} × bouton D (${ov(b.r, g(dealer))}px²)`);
    if (feltR && (b.r.left < feltR.left - 4 || b.r.right > feltR.right + 4 || b.r.top < feltR.top - 4 || b.r.bottom > feltR.bottom + 4))
      issues.push(`mise ${b.pos} déborde du feutre`);
  }
  for (let i = 0; i < bets.length; i++)
    for (let j = i + 1; j < bets.length; j++) {
      const a = ov(bets[i].r, bets[j].r);
      if (a > 40) issues.push(`mise ${bets[i].pos} × mise ${bets[j].pos} (${a}px²)`);
    }

  /* §20 — bouton dealer : associé au BTN, sans conflit. */
  let dealerInfo = null;
  if (dealer) {
    const dc = ctr(g(dealer));
    const near = seats.map(s => ({ pos: s.pos, d: d(dc, s.center) })).sort((a, b) => a.d - b.d);
    dealerInfo = { nearest: near[0]?.pos, dist: near[0]?.d, second: near[1]?.pos, secondDist: near[1]?.d };
    for (const s of seats) {
      const a = ov(g(dealer), s.block);
      if (a > 120) issues.push(`bouton D × siège ${s.pos} (${a}px²)`);
    }
  }

  /* §22/§29 — jetons fantômes : un BetDisplay sans montant engagé. */
  for (const b of bets) if (!(b.amount > 0)) issues.push(`jeton fantôme sur ${b.pos}`);

  /* Netteté (§7) : rapport taille source / taille affichée des jetons. */
  const chipImg = root.querySelector('.pf-bet-display .pf-chip-token-img');
  const chip = chipImg ? {
    displayed: Math.round(g(chipImg).width),
    natural: chipImg.naturalWidth || null,
    vector: /\.svg(\?|$)/i.test(chipImg.currentSrc || chipImg.src),
  } : null;

  const boardCard = root.querySelector('.pf-board-zone .card');
  const avatar = root.querySelector('.pf-avatar-premium');

  /* Emprises en % de la zone de table — sert à calibrer les fixtures de
     test-replayer-anchors.mjs sur des mesures RÉELLES plutôt qu'estimées. */
  const R = g(root);
  const pc = r => ({
    x0: +((r.left - R.left) / R.width * 100).toFixed(2), y0: +((r.top - R.top) / R.height * 100).toFixed(2),
    x1: +((r.right - R.left) / R.width * 100).toFixed(2), y1: +((r.bottom - R.top) / R.height * 100).toFixed(2),
  });
  const rects = { box: { w: Math.round(R.width), h: Math.round(R.height) }, seats: {} };
  for (const s of seats) rects.seats[s.pos] = { ...pc(s.block), wPx: Math.round(s.block.width), hPx: Math.round(s.block.height) };
  if (board) rects.board = pc(g(board));
  if (pot) rects.pot = pc(g(pot));

  return {
    rects,
    step: (document.body.innerText.match(/Step (\d+)\/(\d+)/) || [])[0] || null,
    seats: seats.length,
    bets: bets.map(b => ({ pos: b.pos, amount: b.amount, swept: b.swept, blocked: b.blocked, w: Math.round(b.r.width), h: Math.round(b.r.height) })),
    ownership,
    dealer: dealerInfo,
    chip,
    sizes: {
      betW: bets[0] ? Math.round(bets[0].r.width) : null,
      boardCardW: boardCard ? Math.round(g(boardCard).width) : null,
      avatarW: avatar ? Math.round(g(avatar).width) : null,
    },
    issues,
  };
};

/* Le serveur de dev est partagé : une autre session peut laisser un module en
   erreur 500 quelques secondes. On retente plutôt que d'échouer l'audit. */
async function openReplayer(page, tries = 4) {
  for (let i = 0; i < tries; i++) {
    await page.evaluate(() => localStorage.setItem('pf_active_tab', 'replayer')).catch(() => {});
    await page.reload({ waitUntil: 'networkidle2' }).catch(() => {});
    try {
      await page.waitForSelector('textarea', { timeout: 6000 });
      return;
    } catch {
      if (i === tries - 1) {
        const errs = await page.evaluate(() => (window.__pfErrors || []).slice(-3)).catch(() => []);
        throw new Error(`Replayer non monté après ${tries} essais (bundle en erreur ?) ${JSON.stringify(errs)}`);
      }
      await sleep(2500);
    }
  }
}

async function auditHand(page, name, hh, { shot = null, onlyStep = null } = {}) {
  await openReplayer(page);
  await sleep(400);
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => /Charger les mains|Charger la main/.test(b.textContent))?.click();
  }, hh);
  await page.waitForSelector('.pf-player-seat', { timeout: 6000 });
  await sleep(400);

  const total = await page.evaluate(() => {
    const m = document.body.innerText.match(/Step (\d+)\/(\d+)/);
    return m ? +m[2] : 0;
  });

  // Fige les animations : on audite la position STABILISÉE, pas une frame de vol.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });

  const perStep = [];
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '⏮')?.click());
  await sleep(220);
  for (let i = 0; i <= total; i++) {
    if (onlyStep == null || i === +onlyStep) {
      const info = await page.evaluate(PROBE);
      perStep.push({ i, ...info });
      if (shot && onlyStep != null && i === +onlyStep) {
        // --clip=x,y,w,h : gros plan (utile pour juger netteté et collisions).
        const clip = arg('clip', null);
        await page.screenshot({
          path: path.resolve(shot),
          ...(clip ? { clip: (([x, y, w, h]) => ({ x: +x, y: +y, width: +w, height: +h }))(clip.split(',')) } : {}),
        });
      }
    }
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '▶▶')?.click());
    await sleep(90);
  }

  const issues = [];
  for (const st of perStep) for (const s of (st.issues || [])) issues.push(`step ${st.i} — ${s}`);
  const withBets = perStep.filter(s => (s.bets || []).length);
  /* Garde-fou anti « faux vert » : une main sans AUCUNE mise affichée à aucune
     étape signifie que la sonde n'a rien vu (bundle en erreur, sélecteur
     obsolète…), pas que tout va bien. */
  if (!withBets.length) issues.push('AUCUNE mise détectée — la sonde n\'a rien mesuré, résultat non concluant');
  const worst = withBets.flatMap(s => s.ownership || []).sort((a, b) => a.margin - b.margin)[0] || null;

  // Décalages tangentiels effectivement appliqués : un système sain en applique
  // peu et de faible amplitude (l'idéal §4 restant l'alignement pur).
  const swept = {};
  for (const st of perStep) for (const b of (st.bets || [])) {
    const k = `${b.pos}`;
    if (!swept[k] || Math.abs(b.swept) > Math.abs(swept[k].deg)) swept[k] = { deg: b.swept, blocked: b.blocked || null };
  }

  if (flag('rects')) return { hand: name, rects: withBets.at(-1)?.rects || perStep.at(-1)?.rects };

  return {
    hand: name,
    steps: perStep.length,
    decalagesTangentiels: swept,
    stepsWithBets: withBets.length,
    positionsTested: [...new Set(withBets.flatMap(s => s.bets.map(b => b.pos)))].sort(),
    pireMargeAppartenance: worst,
    dealer: withBets.at(-1)?.dealer || perStep.at(-1)?.dealer || null,
    chip: withBets.find(s => s.chip)?.chip || null,
    sizes: withBets.find(s => s.sizes?.boardCardW)?.sizes || withBets[0]?.sizes || null,
    problemes: issues.length ? issues : 'aucun',
  };
}

const browser = await puppeteer.launch({
  executablePath, headless: 'new', args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: DPR },
});
try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const names = flag('all') ? Object.keys(AUDIT_HANDS) : [arg('hand', 'btn_vs_co')];
  const out = [];
  for (const n of names) {
    if (!AUDIT_HANDS[n]) { console.error(`main inconnue : ${n}`); continue; }
    out.push(await auditHand(page, n, AUDIT_HANDS[n], { shot: arg('shot', null), onlyStep: arg('step', null) }));
  }
  const totalIssues = out.reduce((a, o) => a + (!o.problemes || o.problemes === 'aucun' ? 0 : o.problemes.length), 0);
  console.log(JSON.stringify({ viewport: `${W}x${H}@${DPR}x`, mains: out, totalProblemes: totalIssues }, null, 1));
  process.exitCode = totalIssues ? 1 : 0;
} finally {
  await browser.close();
}
