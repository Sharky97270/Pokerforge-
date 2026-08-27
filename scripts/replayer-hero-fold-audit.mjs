#!/usr/bin/env node
/**
 * replayer-hero-fold-audit — HERO COUCHÉ DANS LE REJEU, ET RÉVERSIBLE
 *
 * Le Replayer est TEMPOREL : le rendu doit refléter l'état à l'instant courant
 * de la timeline, pas l'historique des clics. Un état visuel « collant » —
 * atténué une fois, atténué pour toujours — est exactement le défaut que ce
 * test cherche, et un test unitaire sur le moteur ne peut pas le voir : le
 * moteur recalcule proprement, c'est le RENDU qui peut rester bloqué.
 *
 * On parcourt donc la main pas à pas, on relève à chaque étape l'opacité
 * EFFECTIVE des cartes d'Hero, puis on REMONTE la timeline et on recommence.
 * Trois passages : aller, retour, et navigation directe (boutons de street).
 *
 *   avant le fold : opacité ≈ 1
 *   à partir du fold, jusqu'au bout (abattement compris) : la cible partagée
 *   retour en arrière : l'état normal revient de lui-même
 *   changement de main : aucune fuite d'état
 *
 * Prérequis : serveur de dev lancé (port 7788).
 *   node scripts/replayer-hero-fold-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');

const CIBLE_URL = arg('url', 'http://localhost:7788');
const W = +arg('w', 1600);
const H = +arg('h', 950);
const OUT = arg('out', 'design-qa-evidence/replayer-hero-fold.json');
const SHOT_DIR = arg('shotDir', '');

const CSS = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.js'), 'utf8');
const CIBLE = Number(/--pf-hero-fold-opacity:\s*(\.?\d*\.?\d+)/.exec(CSS)[1]);
const TOLERANCE = 0.03;

/* Main 1 : Hero se couche AU PRÉFLOP, et le coup continue sans lui jusqu'à
   l'abattement. C'est le scénario du §7/§18 — l'état doit tenir sur quatre
   streets et survivre au showdown. */
const HH_FOLD_PREFLOP = `PokerStars Hand #900112: Hold'em No Limit ($1/$2) - 2025/07/04
Table 'Vega' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Seat 5: P5 ($200 in chips)
Hero: posts small blind $1
P5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: folds
P5: calls $4
*** FLOP *** [Ah Kd 7c]
P5: checks
Villain: bets $8
P5: calls $8
*** TURN *** [Ah Kd 7c] [2s]
P5: checks
Villain: checks
*** RIVER *** [Ah Kd 7c 2s] [9h]
P5: checks
Villain: bets $20
P5: calls $20
*** SHOW DOWN ***
Villain: shows [Ac Qd]
P5: shows [Kh Ts]`;

/* Main 2 : Hero va au bout et ABAT sa main. Elle ne doit JAMAIS s'atténuer —
   c'est le contre-exemple sans lequel un test « tout est atténué » passerait. */
const HH_SANS_FOLD = `PokerStars Hand #900113: Hold'em No Limit ($0.50/$1) - 2025/07/05
Table 'Nebula' 3-max Seat #1 is the button
Seat 1: Alice ($100 in chips)
Seat 2: Bob ($100 in chips)
Seat 3: Hero ($100 in chips)
Bob: posts small blind $0.50
Hero: posts big blind $1
Dealt to Hero [As Kd]
Alice: raises $2 to $3
Bob: folds
Hero: calls $2
*** FLOP *** [Ah 7c 2d]
Hero: checks
Alice: checks
*** TURN *** [Ah 7c 2d] [9s]
Hero: checks
Alice: checks
*** RIVER *** [Ah 7c 2d 9s] [Jh]
Hero: checks
Alice: checks
*** SHOW DOWN ***
Alice: shows [Qh Qc]
Hero: shows [As Kd]`;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ══ RELEVÉ ═══════════════════════════════════════════════════════════════ */
const PROBE = () => {
  const vu = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
  const opaciteEffective = el => {
    let o = 1, n = el;
    while (n && n !== document.documentElement) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (Number.isFinite(v)) o *= v;
      n = n.parentElement;
    }
    return +o.toFixed(4);
  };
  const w = [...document.querySelectorAll('.hero-card-wrap')].filter(vu)[0] || null;
  const cartes = w ? [...w.querySelectorAll('.card')].filter(vu) : [];
  const c0 = cartes[0] || null;
  const b = c0 ? c0.getBoundingClientRect() : null;
  return {
    aUnHero: !!w,
    nbCartes: cartes.length,
    rangs: cartes.map(k => ((k.querySelector('.card-corner-r') || {}).textContent || '') + ((k.querySelector('.card-corner-s') || {}).textContent || '')),
    classeCouche: w ? /hero-cards--folded/.test(w.className || '') : null,
    opaciteEffective: c0 ? opaciteEffective(c0) : null,
    filtres: c0 ? getComputedStyle(c0).filter : null,
    boite: b ? { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null,
    /* Le siège d'Hero se dit-il couché ? On lit le badge que le Replayer peint
       déjà : c'est la source, indépendante de notre classe. */
    badgeFold: [...document.querySelectorAll('.pf-player-seat')].some(s =>
      /hero/i.test(s.innerHTML) && /Fold/.test((s.textContent || ''))),
    board: document.querySelectorAll('.pf-board-zone .card').length,
  };
};

const browser = await puppeteer.launch({
  executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
const defauts = [];
const ajoute = (code, detail) => defauts.push({ code, ...detail });

try {
  const page = await browser.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e).slice(0, 240)));
  await page.goto(CIBLE_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.setItem('pf_active_tab', 'replayer'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);

  const charge = hh => page.evaluate(h => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, h); ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => /Charger les mains|Charger la main/.test(b.textContent))?.click();
  }, hh);
  const bouton = t => page.evaluate(x => {
    const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === x && !e.disabled);
    if (b) { b.click(); return true; } return false;
  }, t);

  /* ── MAIN 1 : ALLER ─────────────────────────────────────────────────── */
  await charge(HH_FOLD_PREFLOP);
  await page.waitForSelector('.pf-player-seat', { timeout: 8000 });
  await sleep(500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await bouton('⏮'); await sleep(400);

  const aller = [];
  for (let i = 0; i < 40; i++) {
    aller.push(await page.evaluate(PROBE));
    if (!(await bouton('▶▶'))) break;
    await sleep(220);
  }
  aller.push(await page.evaluate(PROBE));
  if (SHOT_DIR) {
    fs.mkdirSync(path.resolve(SHOT_DIR), { recursive: true });
    await page.screenshot({ path: path.resolve(SHOT_DIR, 'replayer-hero-fold-fin.png') });
  }

  const premier = aller.findIndex(e => e.classeCouche === true);
  if (premier < 0) ajoute('hero-jamais-couche-alors-que-la-hh-dit-fold', {});
  else {
    if (premier === 0) ajoute('couche-des-la-premiere-etape', {});
    aller.slice(0, premier).forEach((e, i) => {
      if (e.aUnHero && e.opaciteEffective !== null && e.opaciteEffective < 0.95)
        ajoute('hero-attenue-avant-son-fold', { etape: i, opacite: e.opaciteEffective });
    });
    aller.slice(premier).forEach((e, k) => {
      const i = premier + k;
      if (!e.aUnHero) return;
      if (e.classeCouche !== true) ajoute('etat-couche-perdu-en-cours-de-main', { etape: i, board: e.board });
      if (e.nbCartes !== 2) ajoute('main-hero-retiree-au-lieu-d-etre-attenuee', { etape: i, n: e.nbCartes });
      if (e.opaciteEffective !== null && Math.abs(e.opaciteEffective - CIBLE) > TOLERANCE)
        ajoute('rendu-different-de-la-cible-partagee', { etape: i, opacite: e.opaciteEffective, cible: CIBLE });
    });
    /* §18 — l'abattement ne rallume rien. */
    const fin = aller[aller.length - 1];
    if (fin.aUnHero && fin.classeCouche !== true) ajoute('abattement-rallume-la-main-du-hero', { opacite: fin.opaciteEffective });
    /* La main peinte ne change pas : on l'atténue, on ne la remplace pas. */
    const rangsFold = aller[premier].rangs;
    if (JSON.stringify(fin.rangs) !== JSON.stringify(rangsFold))
      ajoute('cartes-hero-changees-pendant-le-rejeu', { auFold: rangsFold, aLaFin: fin.rangs });
  }

  /* ── MAIN 1 : RETOUR ────────────────────────────────────────────────── */
  const retour = [];
  for (let i = 0; i < 40; i++) {
    retour.push(await page.evaluate(PROBE));
    if (!(await bouton('◀◀'))) break;
    await sleep(220);
  }
  retour.push(await page.evaluate(PROBE));
  const finRetour = retour[retour.length - 1];
  if (finRetour.aUnHero && finRetour.classeCouche === true)
    ajoute('etat-bloque-en-remontant-la-timeline', { opacite: finRetour.opaciteEffective });
  if (finRetour.aUnHero && finRetour.opaciteEffective !== null && finRetour.opaciteEffective < 0.95)
    ajoute('hero-reste-attenue-avant-le-fold', { opacite: finRetour.opaciteEffective });
  /* La séquence de retour doit être MONOTONE : couché… couché… normal, et
     jamais l'inverse. Un aller-retour qui repasse par « normal » puis
     « couché » trahirait un rendu qui suit les clics et non la timeline. */
  const basculesRetour = retour.filter((e, i) => i > 0 && e.classeCouche !== retour[i - 1].classeCouche).length;
  if (basculesRetour > 1) ajoute('etat-instable-en-remontant', { bascules: basculesRetour });

  /* ── NAVIGATION DIRECTE PAR STREET ──────────────────────────────────── */
  const parStreet = {};
  for (const s of ['Preflop', 'Flop', 'Turn', 'River']) {
    if (!(await bouton(s))) continue;
    await sleep(400);
    parStreet[s] = await page.evaluate(PROBE);
  }
  for (const [s, e] of Object.entries(parStreet)) {
    if (!e.aUnHero) continue;
    /* Hero s'est couché AU PRÉFLOP : sur toute street postflop il doit être
       atténué, quel que soit le chemin pris pour y arriver. */
    if (e.board >= 3 && e.classeCouche !== true)
      ajoute('saut-direct-de-street-perd-l-etat', { street: s, board: e.board });
    if (e.board >= 3 && e.opaciteEffective !== null && Math.abs(e.opaciteEffective - CIBLE) > TOLERANCE)
      ajoute('saut-direct-rendu-different', { street: s, opacite: e.opaciteEffective, cible: CIBLE });
  }

  /* ── CHANGEMENT DE MAIN : AUCUNE FUITE ──────────────────────────────── */
  await charge(HH_SANS_FOLD);
  await sleep(900);
  await bouton('⏮'); await sleep(400);
  const autre = [];
  for (let i = 0; i < 40; i++) {
    autre.push(await page.evaluate(PROBE));
    if (!(await bouton('▶▶'))) break;
    await sleep(200);
  }
  autre.push(await page.evaluate(PROBE));
  autre.forEach((e, i) => {
    if (!e.aUnHero) return;
    if (e.classeCouche === true) ajoute('fuite-d-etat-sur-la-main-suivante', { etape: i });
    if (e.opaciteEffective !== null && e.opaciteEffective < 0.95)
      ajoute('hero-attenue-alors-qu-il-abat-sa-main', { etape: i, opacite: e.opaciteEffective });
  });

  const rapport = { url: CIBLE_URL, viewport: `${W}x${H}`, cible: CIBLE, tolerance: TOLERANCE, erreursPage: erreurs, defauts, aller, retour, parStreet, autre };
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUT), JSON.stringify(rapport, null, 2));
  }

  console.log(`\n══ REPLAYER — HERO COUCHÉ (${W}×${H}) ══`);
  console.log(`aller   : ${aller.map(e => (e.classeCouche ? 'C' : '·')).join('')}  (C = couché)`);
  console.log(`opacités: ${[...new Set(aller.map(e => e.opaciteEffective))].join(' , ')}`);
  console.log(`retour  : ${retour.map(e => (e.classeCouche ? 'C' : '·')).join('')}`);
  console.log(`streets : ${Object.entries(parStreet).map(([s, e]) => `${s}=${e.classeCouche ? 'couché' : 'normal'}@${e.opaciteEffective}`).join('  ')}`);
  console.log(`main sans fold : ${autre.map(e => (e.classeCouche ? 'C' : '·')).join('')}  opacités ${[...new Set(autre.map(e => e.opaciteEffective))].join(' , ')}`);
  console.log(`\n${defauts.length ? '❌' : '✅'} ${defauts.length} défaut(s)`);
  defauts.forEach(d => console.log('  ✗ ' + JSON.stringify(d)));
  if (OUT) console.log(`\nRapport : ${OUT}`);
  process.exitCode = defauts.length ? 1 : 0;
} finally {
  await browser.close();
}
