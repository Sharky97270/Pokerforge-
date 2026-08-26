#!/usr/bin/env node
/**
 * solver-cancel-probe — VALIDATION NAVIGATEUR de l'annulation et du rejet des
 * résultats périmés (P0, phase 6).
 *
 * Le scénario que la mission impose de couvrir, joué pour de vrai :
 *   1. on lance un solve sur un board ;
 *   2. on change une carte pendant qu'il tourne ;
 *   3. le calcul du PREMIER board ne doit ni continuer indéfiniment, ni écraser
 *      plus tard l'écran du SECOND ;
 *   4. et un résultat DÉJÀ AFFICHÉ doit se marquer PÉRIMÉ dès que le spot change,
 *      au lieu de rester lisible comme s'il décrivait le board courant.
 *
 * Un test unitaire ne prouverait rien ici : le défaut vivait dans l'ordre réel
 * des événements (message du Worker qui arrive après un rendu). Il faut un
 * navigateur, un vrai Worker, et de vraies frappes.
 *
 *   node scripts/solver-cancel-probe.mjs --url=http://localhost:7802
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? decodeURIComponent(h.split('=').slice(1).join('=')) : d; };
const URL = arg('url', 'http://localhost:7788');
const OUT = path.resolve(arg('out', 'design-qa-evidence/solver-cancel.json'));
const SHOT = path.resolve(arg('shot', 'design-qa-evidence/solver-cancel.png'));
const SOLVE_TIMEOUT = +arg('solveTimeout', 300000);
const STALE_WATCH = +arg('staleWatch', 90000);

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

const browser = await puppeteer.launch({
  protocolTimeout: 900000, executablePath, headless: 'new',
  args: ['--hide-scrollbars'], defaultViewport: { width: 1600, height: 1100 },
});
const out = { url: URL, when: new Date().toISOString(), steps: [], errors: [] };
const note = (step, ok, extra = {}) => {
  out.steps.push({ step, ok, ...extra });
  console.error(`  ${ok ? 'OK ' : 'KO '} ${step}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
};

try {
  const page = await browser.newPage();
  page.on('pageerror', e => out.errors.push(String(e).slice(0, 200)));
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
  note('onglet SharkSolver ouvert', navOk);
  await sleep(1200);

  const setBoard = (b) => page.evaluate((v) => {
    const el = [...document.querySelectorAll('input')]
      .find(i => /river/i.test(i.placeholder || '') || /board/i.test(i.placeholder || ''));
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, b);
  const clickText = (t) => page.evaluate((txt) => {
    const el = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === txt);
    if (el && !el.disabled) { el.click(); return true; } return false;
  }, t);
  const etat = () => page.evaluate(() => {
    const p = document.querySelector('[data-pfase="panel"]');
    const st = document.querySelector('[data-pfase="stale"]');
    return {
      calcul: !!(p && /Calcul…/.test(p.innerText)),
      annule: !!(p && /Annulé/.test(p.innerText)),
      solution: !!document.querySelector('[data-pfase="solution"]'),
      stale: !!st,
      staleRaison: st ? st.getAttribute('data-pfase-stale-reason') : null,
      perime: !!(p && /PÉRIMÉ/.test(p.innerText)),
      spotModifie: !!(p && /Spot modifié/.test(p.innerText)),
    };
  });

  /* ── 1. Solve lancé, puis carte changée pendant le calcul ───────────────── */
  await setBoard('As7d2c9hKs');
  await sleep(700);
  note('board river saisi (As7d2c9hKs)', await page.evaluate(() => document.body.innerText.includes('Betting Structure')));
  await clickText('Single Size'); await sleep(200);
  note('solve lancé', await clickText('Optimiser les sizings'));
  await sleep(2500);
  const enCours = await etat();
  note('le solve tourne (indicateur « Calcul… »)', enCours.calcul, enCours);

  await setBoard('As7d2c9hKd');            // la river Ks devient Kd
  await sleep(3000);
  const apresChangement = await etat();
  note('le calcul du board précédent est ANNULÉ', !apresChangement.calcul && apresChangement.annule, apresChangement);

  /* Le point qui compte : même en attendant longtemps, l'ancien résultat ne doit
     JAMAIS s'afficher. On surveille au lieu de conclure après une seconde. */
  const t0 = Date.now();
  let fuite = false;
  while (Date.now() - t0 < STALE_WATCH && !fuite) {
    fuite = (await etat()).solution;
    if (!fuite) await sleep(2000);
  }
  note(`aucun résultat périmé n'apparaît en ${Math.round(STALE_WATCH / 1000)} s`, !fuite,
    { surveillanceMs: Date.now() - t0 });

  /* ── 2. Solve mené à son terme, puis spot changé ────────────────────────── */
  note('2e solve lancé sur le board courant', await clickText('Optimiser les sizings'));
  const t1 = Date.now();
  let fini = false;
  while (Date.now() - t1 < SOLVE_TIMEOUT && !fini) {
    fini = (await etat()).solution;
    if (!fini) await sleep(1500);
  }
  out.solveMs = Date.now() - t1;
  note('solution affichée', fini, { ms: out.solveMs });

  const avantChangement = await etat();
  note('la solution n\'est PAS marquée périmée tant que le spot ne bouge pas',
    fini && !avantChangement.stale && !avantChangement.perime, avantChangement);

  await setBoard('As7d2c9hKh');            // encore une autre river
  await sleep(1200);
  const apres = await etat();
  note('changer le board marque la solution PÉRIMÉE, avec le bon motif',
    apres.stale && apres.staleRaison === 'spot' && apres.perime && apres.spotModifie, apres);

  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await page.evaluate(() => document.querySelector('[data-pfase="panel"]')?.scrollIntoView({ block: 'start' }));
  await sleep(400);
  const rect = await page.evaluate(() => {
    const el = document.querySelector('[data-pfase="panel"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, window.innerWidth), height: Math.min(r.height, window.innerHeight) };
  });
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  if (rect && rect.width > 20 && rect.height > 20) await page.screenshot({ path: SHOT, clip: rect, captureBeyondViewport: false });
  else await page.screenshot({ path: SHOT });
  out.screenshot = SHOT;

  out.ok = out.steps.every(s => s.ok) && out.errors.length === 0;
} catch (e) {
  out.errors.push(String((e && e.message) || e));
  out.ok = false;
} finally {
  await browser.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.ok, steps: out.steps, errors: out.errors, solveMs: out.solveMs }, null, 2));
  process.exit(out.ok ? 0 : 1);
}
