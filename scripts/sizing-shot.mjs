#!/usr/bin/env node
/**
 * sizing-shot — pilote le panneau Adaptive Sizing dans un vrai navigateur et
 * capture le résultat.
 *
 * Pourquoi ce script existe : §69 de la mission interdit de « valider uniquement
 * en lisant le JSX/CSS ». Or le panneau PFASE ne s'anime pas seul — il faut
 * saisir un board, lancer un solve qui dure plusieurs secondes dans un Worker,
 * puis lire ce qui s'affiche. Un simple screenshot ne suffirait pas : le script
 * VÉRIFIE aussi le DOM (sizings retenus, perte d'EV, plancher, badge) et sort un
 * JSON, pour que l'échec soit lisible sans ouvrir l'image.
 *
 * Prérequis : `npm run dev` sur le port 7788, Chrome ou Edge installé.
 *
 * Exemples :
 *   node scripts/sizing-shot.mjs
 *   node scripts/sizing-shot.mjs --board=As7d2c9hKs --mode=Single%20Size --w=1600
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? decodeURIComponent(h.split('=').slice(1).join('=')) : d; };
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const BOARD = arg('board', 'As7d2c');
const MODE = arg('mode', 'Single Size');
const W = +arg('w', 1600), H = +arg('h', 1000);
const OUT = path.resolve(arg('out', 'design-qa-evidence/sizing-panel.png'));
const JSONOUT = path.resolve(arg('json', 'design-qa-evidence/sizing-panel.json'));
const TIMEOUT = +arg('timeout', 180000);

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
  /* Délai de PROTOCOLE, distinct du délai métier. Sur une machine chargée, la
     saisie d'un board coûte ~160 s de travail synchrone dans l'onglet — un coût
     qui préexiste au moteur de sizing (mesuré identique avec et sans lui). Au
     délai par défaut de 180 s, un `page.evaluate` parfaitement normal échouait
     donc en « Runtime.callFunctionOn timed out », et l'échec ressemblait à un
     blocage applicatif. On laisse le temps de finir ; ce qui est lent doit être
     rapporté comme lent, pas comme cassé. */
  protocolTimeout: 600000, executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
const out = { ok: false, steps: [], errors: [], console: [] };

try {
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') out.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => out.errors.push(String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const clickText = (txt, exact = false) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab, div, span')]
      .filter(x => x.children.length === 0 || x.tagName === 'BUTTON')
      .find(x => (e ? x.textContent.trim() === t : x.textContent.trim().includes(t)));
    if (el) { el.click(); return true; }
    return false;
  }, txt, exact);

  /* L'application monte ses onglets après un premier rendu ; un clic immédiat
     tombe parfois dans le vide. On réessaie jusqu'à ce que l'onglet réponde,
     plutôt que de conclure « panneau absent » sur un problème de timing. */
  let navOk = false;
  for (let i = 0; i < 12 && !navOk; i++) {
    navOk = await clickText('SharkSolver', true);
    if (!navOk) await sleep(500);
  }
  out.steps.push({ step: 'onglet SharkSolver', ok: navOk });
  await sleep(1500);

  /* Saisie du board — le champ porte un placeholder reconnaissable. */
  const boardSet = await page.evaluate((b) => {
    const inputs = [...document.querySelectorAll('input')];
    /* Le champ board du solveur porte le placeholder
       « flop/turn/river — ex. Ah Kd 7c (vide = préflop / équité all-in) ». */
    const el = inputs.find(i => /river/i.test(i.placeholder || '') || /board/i.test(i.placeholder || ''));
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, b);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, BOARD);
  out.steps.push({ step: 'board saisi', ok: boardSet, board: BOARD });
  await sleep(900);

  /* Le panneau doit être là. */
  const panelPresent = await page.evaluate(() => !!document.body.innerText.includes('Betting Structure'));
  out.steps.push({ step: 'panneau Betting Structure présent', ok: panelPresent });
  if (!panelPresent) throw new Error('panneau Adaptive Sizing absent de la page');

  /* Mode + lancement. */
  out.steps.push({ step: `mode ${MODE}`, ok: await clickText(MODE, true) });
  await sleep(300);
  const lance = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Optimiser les sizings|Résoudre les 4 niveaux/.test(x.textContent));
    if (!b || b.disabled) return { ok: false, disabled: !!(b && b.disabled) };
    b.click(); return { ok: true };
  });
  out.steps.push({ step: 'solve lancé', ...lance });
  if (!lance.ok) throw new Error('bouton de lancement indisponible' + (lance.disabled ? ' (désactivé)' : ''));

  /* Attente du résultat — on guette l'apparition d'un badge de provenance. */
  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < TIMEOUT) {
    done = await page.evaluate(() => {
      const t = document.body.innerText;
      return /PF SOLVED|PF VERIFIED DB|Aucune solution/.test(t);
    });
    if (done) break;
    await sleep(1000);
  }
  out.steps.push({ step: 'résultat affiché', ok: done, ms: Date.now() - t0 });

  /* Lecture du DOM par ANCRES — exact, insensible à la mise en page. */
  out.panel = await page.evaluate(() => {
    const panel = document.querySelector('[data-pfase="panel"]');
    const sol = document.querySelector('[data-pfase="solution"]');
    const err = document.querySelector('[data-pfase="error"]');
    const fam = document.querySelector('[data-pfase="family"]');
    const txt = panel ? panel.innerText : "";
    const d = (el, k) => (el ? el.getAttribute("data-pfase-" + k) : null);
    return {
      panelPresent: !!panel,
      badge: d(sol, "badge"),
      status: d(sol, "status"),
      complexity: d(sol, "complexity"),
      retenu: d(sol, "selected"),
      compares: d(sol, "reference"),
      perteEv: d(sol, "evloss"),
      plancher: d(sol, "floor"),
      distinguable: d(sol, "distinguishable"),
      famille: d(fam, "levels"),
      aucuneSolution: !!err,
      motifEchec: d(err, "reason"),
      partiel: /PARTIEL/.test(txt),
      avertissementBruit: /pas distinguable du bruit/i.test(txt),
      /* innerText reflète le text-transform CSS : le titre sort en majuscules. */
      ecartSizings: /écart d'ev entre sizings/i.test(txt),
      exploitabilite: (txt.match(/(Exploitabilité[^\n]*)/) || [])[1] || null,
      modes: ['Automatic', 'Dynamic', 'Single Size', 'Fixed'].filter(m => txt.includes(m)),
      niveaux: ['Single Size', 'Simple', 'Advanced', 'Full'].filter(m => txt.includes(m)),
      presets: ['PF Automatic', 'PF Single Size', 'PF Simple', 'PF Advanced', 'PF Full'].filter(m => txt.includes(m)),
    };
  });

  /* ── §7/§56/§77 — LE BANDEAU DE CAPACITÉS ──────────────────────────────
     Le moteur savait déclarer ce qu'il sait faire, capacité par capacité, mais
     aucun écran ne l'affichait : `capabilities.js` n'était même pas dans le
     bundle, éliminé par tree-shaking faute d'appelant côté interface. Une
     capacité livrée et testée mais invisible ne sert personne — ce contrôle
     échoue si elle redevient invisible. */
  out.capabilities = await page.evaluate(() => {
    const c = document.querySelector('[data-pfase="capabilities"]');
    if (!c) return { present: false };
    return {
      present: true,
      pot: c.getAttribute('data-pfase-cap-pot'),
      strategie: c.getAttribute('data-pfase-cap-strategy'),
      horizon: c.getAttribute('data-pfase-cap-valuation'),
      evaluation: c.getAttribute('data-pfase-cap-evaluation'),
      global: c.getAttribute('data-pfase-cap-overall'),
      /* Chaque niveau doit être accompagné d'un MOTIF : un badge sans raison
         n'apprend rien à qui le lit. */
      motifs: c.innerText.split('\n').filter(l => l.length > 25).length,
    };
  });
  {
    const c = out.capabilities;
    const niveaux = ['EXACT', 'SUPPORTED', 'PARTIAL', 'UNSUPPORTED'];
    const ok = !!(c.present && niveaux.includes(c.pot) && niveaux.includes(c.strategie)
      && niveaux.includes(c.horizon) && niveaux.includes(c.evaluation) && c.motifs >= 4);
    out.steps.push({ step: '§7/§77 — les capacités sont déclarées à l\'écran', ok, ...c });
    /* Sur un heads-up postflop ordinaire, deux réponses sont connues d'avance.
       Les vérifier évite qu'un bandeau s'affiche en disant n'importe quoi. */
    out.steps.push({
      step: '§7 — comptabilité du pot EXACTE, résolution stratégique SUPPORTED en heads-up',
      ok: c.pot === 'EXACT' && c.strategie === 'SUPPORTED',
      pot: c.pot, strategie: c.strategie,
    });
  }
  /* §26 — le Tree Editor : présent, navigable, et son édition invalide le résultat. */
  out.treeEditor = await page.evaluate(() => {
    const ed = document.querySelector('[data-pfase="tree-editor"]');
    if (!ed) return { present: false };
    const txt = ed.innerText;
    return {
      present: true,
      filAriane: /racine/.test(txt),
      actionsListees: (txt.match(/CHECK|BET|ALL_IN|FOLD|CALL|RAISE/g) || []).length,
      /* Le titre est mis en majuscules par CSS ; innerText le reflète. */
      definitionNoeud: /sizings de ce n/i.test(txt),
      etatHerite: /Dynamic — hérité/.test(txt),
      texte: txt.slice(0, 400),
    };
  });
  out.steps.push({ step: "§26 — Tree Editor présent et navigable", ok: !!(out.treeEditor.present && out.treeEditor.filAriane && out.treeEditor.definitionNoeud) });

  /* Éditer un sizing DOIT invalider les résultats affichés. */
  const edited = await page.evaluate(() => {
    const ed = document.querySelector('[data-pfase="tree-editor"]');
    if (!ed) return false;
    const b = [...ed.querySelectorAll('button')].find(x => x.textContent.trim() === '100%');
    if (!b) return false; b.click(); return true;
  });
  await sleep(500);
  out.invalidation = await page.evaluate(() => ({
    banniere: /Arbre modifié/.test(document.body.innerText),
    badgePerime: /PÉRIMÉ/.test(document.body.innerText),
    frequencesMasquees: (document.querySelector('[data-pfase="tree-editor"]') || { innerText: "" }).innerText.includes("—"),
    noeudFixe: /Fixed — défini ici/.test(document.body.innerText),
  }));
  out.steps.push({ step: "§26 — une modification invalide les résultats dépendants", ok: !!(edited && out.invalidation.banniere && out.invalidation.badgePerime && out.invalidation.noeudFixe), edited, ...out.invalidation });

  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await sleep(200);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  /* Le panneau vit dans une colonne défilante : `elementHandle.screenshot()` y
     capture une région tronquée par le viewport (constaté : l'image montrait la
     matrice de ranges au lieu du panneau). On amène donc le panneau à l'écran,
     puis on découpe explicitement son rectangle. */
  await page.evaluate(() => document.querySelector('[data-pfase="panel"]')?.scrollIntoView({ block: 'start' }));
  await sleep(400);
  const rect = await page.evaluate(() => {
    const el = document.querySelector('[data-pfase="panel"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, window.innerWidth), height: Math.min(r.height, window.innerHeight) };
  });
  out.rect = rect;
  /* `captureBeyondViewport` (défaut) relance une mise en page pour capturer
     au-delà du viewport — ce qui ANNULE le défilement du conteneur interne et
     capture donc un autre endroit de la page. Constaté : l'image montrait la
     matrice de ranges alors que le rectangle visé était bien celui du panneau. */
  if (rect && rect.width > 20 && rect.height > 20) await page.screenshot({ path: OUT, clip: rect, captureBeyondViewport: false });
  else await page.screenshot({ path: OUT });
  out.screenshot = OUT;
  out.ok = done && out.errors.length === 0
    && !!(out.treeEditor && out.treeEditor.present)
    /* Le bandeau de capacités fait partie du contrat : une capacité déclarée par
       le moteur mais absente de l écran ne sert personne. */
    && !!(out.capabilities && out.capabilities.present
      && out.capabilities.pot === "EXACT" && out.capabilities.strategie === "SUPPORTED")
    && !!(out.invalidation && out.invalidation.banniere && out.invalidation.badgePerime);
} catch (e) {
  out.errors.push(String((e && e.message) || e));
} finally {
  await browser.close();
  fs.mkdirSync(path.dirname(JSONOUT), { recursive: true });
  fs.writeFileSync(JSONOUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}
