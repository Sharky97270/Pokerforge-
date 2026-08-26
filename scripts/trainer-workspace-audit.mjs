#!/usr/bin/env node
/**
 * trainer-workspace-audit — à qui appartient la largeur de l'écran ?
 *
 * La mission « workspace immersif » se juge sur une seule grandeur : la part de
 * la fenêtre qui revient aux TABLES une fois la session lancée. Ce script la
 * mesure, et mesure aussi tout ce qui la lui dispute.
 *
 * Ce qu'il relève, pour chaque mode (1T..4T) et chaque résolution :
 *
 *   BANDES      — largeur réelle de la navigation PokerForge, du panneau de
 *                 configuration du Trainer, du workspace et du panneau droit.
 *                 Leur somme doit faire la fenêtre : sinon il reste une marge
 *                 que personne n'a demandée.
 *   TUILES      — boîte de chaque tuile de table. En mosaïque elles doivent
 *                 être IDENTIQUES : une grille 2x2 dont les cellules diffèrent
 *                 n'est pas une grille.
 *   FEUTRES     — boîte du feutre peint dans chaque tuile, et son échelle. Deux
 *                 tables de même tuile mais d'échelle différente se lisent
 *                 différemment — c'est ce que le §11 interdit.
 *   VIDE        — surface de workspace que personne n'occupe. C'est la mesure
 *                 du « les tables ressemblent à des miniatures ».
 *   STABILITÉ   — les mêmes boîtes relevées deux fois (drawer fermé / ouvert /
 *                 refermé, ou avant / après changement de street) : l'écart doit
 *                 être STRICTEMENT nul (§17, §addendum 15).
 *   DÉBORDEMENT — scroll horizontal, tuile qui sort du workspace.
 *
 * Prérequis : serveur de dev lancé (.claude/launch.json, port 7788).
 *
 *   node scripts/trainer-workspace-audit.mjs --modes=1,2,3,4 --w=1920 --h=1080
 *   node scripts/trainer-workspace-audit.mjs --modes=3 --drawer --shot=x.png
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const MODES = arg('modes', '1,2,3,4').split(',').map(Number).filter(Boolean);
const W = +arg('w', 1920);
const H = +arg('h', 1080);
const STRUCT = arg('struct', '6J');
const OUT = arg('out', '');
const SHOT_DIR = arg('shotDir', '');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Relevé des BANDES et des TUILES, dans un seul frame. */
const PROBE = () => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const vu = el => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const b = el.getBoundingClientRect();
    return b.width > 0.5 && b.height > 0.5;
  };
  const q = s => document.querySelector(s);

  const nav = q('.pf-nav, .nav-rail, aside, [class*="sidenav"]');
  const config = q('.trainer-sidebar');
  const droite = q('.mt-right-panel, .trainer-right, .t1-right, [class*="right-panel"]');
  const slots = [...document.querySelectorAll('.mt-slot')].filter(vu);
  const zones = [...document.querySelectorAll('.training-table-zone, .t1-table-area')].filter(vu);
  const felts = [...document.querySelectorAll('.felt-oval')].filter(vu);
  const grid = q('.grid1, .grid2, .grid3, .grid4');

  /* Le workspace n'a pas de classe propre : c'est le parent commun des tuiles.
     On le prend par la grille, qui est l'élément qui les dispose. */
  const ws = grid || (slots[0] ? slots[0].parentElement : null);

  const bandes = {
    fenetre: { w: innerWidth, h: innerHeight },
    navigation: vu(nav) ? R(nav) : null,
    configuration: vu(config) ? R(config) : null,
    workspace: ws ? R(ws) : null,
    panneauDroit: vu(droite) ? R(droite) : null,
  };

  /* Surface de workspace que personne n'occupe : aire du workspace moins la
     somme des aires de feutre. C'est la mesure du « miniatures ». */
  const aireWs = bandes.workspace ? bandes.workspace.w * bandes.workspace.h : 0;
  const aireFeutres = felts.reduce((a, f) => { const b = f.getBoundingClientRect(); return a + b.width * b.height; }, 0);

  const tuiles = slots.map((s, i) => {
    const b = R(s);
    const z = s.querySelector('.training-table-zone, .t1-table-area');
    const f = s.querySelector('.felt-oval');
    return {
      i, box: b,
      zone: vu(z) ? R(z) : null,
      felt: vu(f) ? R(f) : null,
      ratioFeutre: vu(f) ? +(f.getBoundingClientRect().width / f.getBoundingClientRect().height).toFixed(3) : null,
      /* Une tuile qui sort du workspace est rognée ou provoque du scroll. */
      horsWorkspace: bandes.workspace ? +(Math.max(0, bandes.workspace.x - b.x)
        + Math.max(0, (b.x + b.w) - (bandes.workspace.x + bandes.workspace.w))
        + Math.max(0, bandes.workspace.y - b.y)
        + Math.max(0, (b.y + b.h) - (bandes.workspace.y + bandes.workspace.h))).toFixed(1) : null,
    };
  });

  return {
    bandes,
    /* Ce qui reste après les trois bandes : de la marge que personne n'a
       demandée si le chiffre est gros. */
    margeInexpliquee: +(innerWidth
      - (bandes.navigation ? bandes.navigation.w : 0)
      - (bandes.configuration ? bandes.configuration.w : 0)
      - (bandes.workspace ? bandes.workspace.w : 0)
      - (bandes.panneauDroit ? bandes.panneauDroit.w : 0)).toFixed(1),
    partWorkspacePct: +(((bandes.workspace ? bandes.workspace.w : 0) / innerWidth) * 100).toFixed(1),
    remplissagePct: aireWs > 0 ? +((aireFeutres / aireWs) * 100).toFixed(1) : null,
    tuiles,
    nbTuiles: slots.length, nbZones: zones.length, nbFeutres: felts.length,
    scrollH: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    /* Bouton de rappel des paramètres pendant la session. */
    boutonParametres: !!q('.pf-ws-settings-btn'),
    drawerOuvert: !!q('.pf-settings-drawer.open'),
  };
};

const browser = await puppeteer.launch({
  executablePath, headless: 'new',
  args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
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
  let pret = false;
  for (let i = 0; i < 40; i++) {
    pret = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')));
    if (pret) break;
    await sleep(300);
  }
  if (!pret) { console.error("L'onglet Entraineur ne s'est pas monté."); process.exit(4); }

  const rapport = { viewport: `${W}x${H}`, struct: STRUCT, avantSession: null, modes: {}, erreursPage: pageErrors };
  rapport.avantSession = await page.evaluate(PROBE);

  const capture = async (nom) => {
    if (!SHOT_DIR) return;
    const p = path.resolve(SHOT_DIR, `${nom}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p });
  };

  for (const m of MODES) {
    await click(`${m}T`); await sleep(250);
    await click(STRUCT); await sleep(250);
    await click('Lancer la session', false);
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break;
      await sleep(400);
    }
    await sleep(1400);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });

    const ferme = await page.evaluate(PROBE);
    await capture(`${W}x${H}-${m}T-ferme`);

    /* ── STABILITÉ : le drawer ne doit RIEN déplacer (§addendum 15) ────────
       On relève les mêmes boîtes dans les trois états et on compare au pixel.
       Un écart, même de 1 px, veut dire que le drawer participe encore au
       layout — ce que la mission interdit explicitement. */
    let ouvert = null, refeme = null;
    if (flag('drawer')) {
      await page.evaluate(() => { const b = document.querySelector('.pf-ws-settings-btn'); if (b) b.click(); });
      await sleep(450);
      ouvert = await page.evaluate(PROBE);
      await capture(`${W}x${H}-${m}T-drawer`);
      await page.evaluate(() => { const b = document.querySelector('.pf-settings-drawer .pf-drawer-close'); if (b) b.click(); });
      await sleep(450);
      refeme = await page.evaluate(PROBE);
    }

    const ecart = (a, b) => {
      if (!a || !b) return null;
      const boites = x => x.tuiles.map(t => t.box);
      const A = boites(a), B = boites(b);
      if (A.length !== B.length) return { erreur: `nombre de tuiles ${A.length} vs ${B.length}` };
      let dx = 0, dy = 0, dw = 0, dh = 0;
      for (let i = 0; i < A.length; i++) {
        dx = Math.max(dx, Math.abs(A[i].x - B[i].x)); dy = Math.max(dy, Math.abs(A[i].y - B[i].y));
        dw = Math.max(dw, Math.abs(A[i].w - B[i].w)); dh = Math.max(dh, Math.abs(A[i].h - B[i].h));
      }
      return { dxMax: +dx.toFixed(1), dyMax: +dy.toFixed(1), dwMax: +dw.toFixed(1), dhMax: +dh.toFixed(1) };
    };

    /* Les tuiles d'une mosaïque doivent être IDENTIQUES (§11). On sort l'écart
       max entre la plus grande et la plus petite, en px. */
    const homogeneite = (snap) => {
      const t = snap.tuiles.filter(x => x.felt);
      if (t.length < 2) return null;
      const w = t.map(x => x.box.w), h = t.map(x => x.box.h);
      const fw = t.map(x => x.felt.w), fh = t.map(x => x.felt.h);
      return {
        tuileEcartW: +(Math.max(...w) - Math.min(...w)).toFixed(1),
        tuileEcartH: +(Math.max(...h) - Math.min(...h)).toFixed(1),
        feutreEcartW: +(Math.max(...fw) - Math.min(...fw)).toFixed(1),
        feutreEcartH: +(Math.max(...fh) - Math.min(...fh)).toFixed(1),
      };
    };

    rapport.modes[`${m}T`] = {
      bandes: ferme.bandes,
      margeInexpliquee: ferme.margeInexpliquee,
      partWorkspacePct: ferme.partWorkspacePct,
      remplissagePct: ferme.remplissagePct,
      nbTuiles: ferme.nbTuiles,
      feutres: ferme.tuiles.map(t => t.felt && { w: t.felt.w, h: t.felt.h, ar: t.ratioFeutre }),
      homogeneite: homogeneite(ferme),
      tuilesHorsWorkspace: ferme.tuiles.filter(t => +t.horsWorkspace > 1).length,
      scrollH: ferme.scrollH,
      boutonParametres: ferme.boutonParametres,
      stabiliteDrawer: ouvert ? { ouverture: ecart(ferme, ouvert), fermeture: ecart(ferme, refeme) } : null,
    };

    /* Retour à l'écran de configuration pour le mode suivant. */
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Arr[eê]ter/i.test(x.textContent || '')); if (b) b.click(); });
    await sleep(900);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Quitter|Nouvelle session|Retour/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(700);
    for (let i = 0; i < 30; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')))) break;
      await sleep(300);
    }
  }

  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(path.resolve(OUT), JSON.stringify(rapport, null, 1)); }
  console.log(JSON.stringify(rapport, null, 1));
} finally {
  await browser.close();
}
