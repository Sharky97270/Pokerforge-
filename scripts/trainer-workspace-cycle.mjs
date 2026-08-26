#!/usr/bin/env node
/**
 * trainer-workspace-cycle — reste-t-il quelque chose du mode précédent ?
 *
 * Le nettoyage d'un layout ne se prouve pas en regardant UN écran : il se prouve
 * en enchaînant les modes SANS RECHARGER la page. Une classe résiduelle, une
 * largeur laissée en ligne, un état React jamais remis à zéro ne se voient que
 * là — au premier rechargement, tout redevient propre et le défaut disparaît de
 * la vue sans disparaître du code.
 *
 * Deux enchaînements, ceux que la mission demande :
 *     1T → 2T → 3T → 4T → 1T
 *     2T → 4T → 3T → 2T
 *
 * Ce qu'on compare : la géométrie d'un mode atteint par un CHEMIN doit être
 * identique à celle du même mode atteint par un AUTRE chemin. Si 3T mesuré
 * après 2T diffère de 3T mesuré après 4T, c'est qu'il reste quelque chose.
 *
 * On relève aussi, à chaque étape :
 *   · la largeur du workspace (une sidebar résiduelle la ferait chuter) ;
 *   · les classes de grille présentes (grid1..grid4 : une seule à la fois) ;
 *   · la présence du panneau de configuration DANS le flux ;
 *   · l'ouverture/fermeture du drawer, et son effet sur les tuiles (0 px).
 *
 * Prérequis : serveur de dev lancé (port 7788).
 *   node scripts/trainer-workspace-cycle.mjs --w=1920 --h=1080
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const URL = arg('url', 'http://localhost:7788');
const W = +arg('w', 1920);
const H = +arg('h', 1080);
const OUT = arg('out', '');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ETAT = () => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const grid = document.querySelector('.grid1,.grid2,.grid3,.grid4');
  const cfg = document.querySelector('.trainer-sidebar');
  const slots = [...document.querySelectorAll('.mt-slot')].filter(s => s.getBoundingClientRect().width > 1);
  const felts = [...document.querySelectorAll('.felt-oval')].filter(f => f.getBoundingClientRect().width > 1);
  return {
    grilles: ['grid1', 'grid2', 'grid3', 'grid4'].filter(c => document.querySelector('.' + c) != null),
    workspace: grid ? R(grid) : null,
    /* Le panneau est-il ENCORE dans le flux ? `position` le dit sans ambiguïté :
       « absolute » = drawer, tout le reste = colonne qui prend de la largeur. */
    configPosition: cfg ? getComputedStyle(cfg).position : null,
    configLargeurEnFlux: cfg && getComputedStyle(cfg).position !== 'absolute' && getComputedStyle(cfg).position !== 'fixed'
      ? +cfg.getBoundingClientRect().width.toFixed(1) : 0,
    tuiles: slots.map(R),
    feutres: felts.map(f => { const b = R(f); return { w: b.w, h: b.h }; }),
    scrollH: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 240)));
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const click = (txt, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')].find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; } return false;
  }, txt, exact);

  await click('Entraineur GTO');
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')))) break;
    await sleep(300);
  }

  /* Un mode = arrêter la session en cours, choisir le mode, relancer. C'est le
     parcours réel d'un utilisateur qui change de multitabling. */
  const allerAuMode = async (m) => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Arr[eê]ter/i.test(x.textContent || '')); if (b) b.click(); });
    await sleep(700);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Quitter|Nouvelle session|Retour/i.test(x.textContent || '')); if (b) b.click(); });
    await sleep(600);
    for (let i = 0; i < 30; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')))) break;
      await sleep(300);
    }
    await click(`${m}T`); await sleep(250);
    await click('Lancer la session', false);
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break;
      await sleep(400);
    }
    await sleep(1300);
    return page.evaluate(ETAT);
  };

  const parcours = { 'A: 1→2→3→4→1': [1, 2, 3, 4, 1], 'B: 2→4→3→2': [2, 4, 3, 2] };
  const releves = {};
  for (const [nom, suite] of Object.entries(parcours)) {
    releves[nom] = [];
    for (const m of suite) {
      const e = await allerAuMode(m);
      releves[nom].push({ mode: `${m}T`, ...e });
    }
  }

  /* Le même mode, atteint par deux chemins, doit rendre EXACTEMENT la même
     géométrie. C'est le test qui débusque un état résiduel. */
  const parMode = {};
  for (const suite of Object.values(releves)) for (const e of suite) (parMode[e.mode] = parMode[e.mode] || []).push(e);
  const coherence = Object.fromEntries(Object.entries(parMode).map(([m, l]) => {
    if (l.length < 2) return [m, { visites: l.length, ecartFeutreMax: null }];
    let d = 0;
    for (const e of l) for (const f of e.feutres) { d = Math.max(d, Math.abs(f.w - l[0].feutres[0].w), Math.abs(f.h - l[0].feutres[0].h)); }
    return [m, { visites: l.length, ecartFeutreMax: +d.toFixed(1), feutres: l.map(x => x.feutres[0]) }];
  }));

  const rapport = {
    viewport: `${W}x${H}`,
    coherence,
    grillesMultiples: Object.values(releves).flat().filter(e => e.grilles.length > 1).map(e => ({ mode: e.mode, grilles: e.grilles })),
    configEnFlux: Object.values(releves).flat().filter(e => e.configLargeurEnFlux > 0).map(e => ({ mode: e.mode, px: e.configLargeurEnFlux })),
    scrollHorizontal: Object.values(releves).flat().filter(e => e.scrollH).map(e => e.mode),
    workspaceParEtape: Object.fromEntries(Object.entries(releves).map(([k, v]) => [k, v.map(e => `${e.mode}:${e.workspace ? e.workspace.w : '-'}`)])),
    erreursPage: pageErrors,
  };
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(path.resolve(OUT), JSON.stringify({ rapport, releves }, null, 1)); }
  console.log(JSON.stringify(rapport, null, 1));
} finally {
  await browser.close();
}
