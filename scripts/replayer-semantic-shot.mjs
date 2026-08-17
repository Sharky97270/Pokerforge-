#!/usr/bin/env node
/**
 * replayer-semantic-shot — VALIDATION VISUELLE ET FONCTIONNELLE (§12).
 *
 * Les tests unitaires prouvent que le moteur nomme correctement les actions.
 * Ils ne prouvent PAS que l'écran affiche ce que le moteur a calculé. Ce script
 * ferme la boucle : il rejoue de vraies mains dans le vrai Replayer, lit le
 * texte réellement rendu, et le confronte au déroulement de la main.
 *
 * Trois choses vérifiées, main par main :
 *   ① le panneau nomme l'action de Hero et celle qu'il affronte comme la hand
 *     history les décrit (« fold face à l'open de HJ », pas « fold ») ;
 *   ② aucun vocabulaire d'ouverture n'apparaît sur un nœud déjà ouvert ;
 *   ③ une réponse IA qui invente un sizing est REFUSÉE par le client et
 *     n'atteint jamais l'écran.
 *
 * L'appel IA est intercepté dans le navigateur : aucune clé, aucun appel réel,
 * aucun coût. Le code applicatif n'est pas modifié.
 *
 * Usage :
 *   node scripts/replayer-semantic-shot.mjs
 *   node scripts/replayer-semantic-shot.mjs --spot=bb-vs-open --ai=clean
 *   node scripts/replayer-semantic-shot.mjs --spot=bb-vs-open --ai=fabricated
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7788');
const W = +arg('w', 1600), H = +arg('h', 950);
const ONLY = arg('spot', null);
const AI = arg('ai', 'none');                 // none | clean | fabricated
const OUTDIR = path.resolve(arg('outdir', 'design-qa-evidence'));

const seats = (heroPos, stacks = {}) => {
  const S = [['UTGp', 'UTG', 1], ['HJp', 'HJ', 2], ['COp', 'CO', 3], ['BTNp', 'BTN', 4], ['SBp', 'SB', 5], ['BBp', 'BB', 6]];
  return {
    lines: S.map(([n, p, s]) => `Seat ${s}: ${p === heroPos ? 'Hero' : n} (${stacks[p] ?? 100} in chips)`),
    name: p => (p === heroPos ? 'Hero' : S.find(x => x[1] === p)[0]),
  };
};
function hh(heroPos, actions, { cards = 'Kh 8s', stacks = {} } = {}) {
  const s = seats(heroPos, stacks);
  return [
    `PokerStars Hand #7700${Math.floor(Math.random() * 9999)}: Hold'em No Limit ($0.50/$1) - 2026/01/01 12:00:00`,
    "Table 'Semantic' 6-max Seat #4 is the button", ...s.lines,
    `${s.name('SB')}: posts small blind 0.5`, `${s.name('BB')}: posts big blind 1`,
    '*** HOLE CARDS ***', `Dealt to Hero [${cards}]`, ...actions,
  ].join('\n');
}

/* Chaque cas décrit le DÉROULEMENT RÉEL de la main, et ce que l'écran doit en
   dire. `interdits` = vocabulaire qui serait un contresens sur ce nœud. */
const SPOTS = [
  {
    id: 'bb-vs-open',
    recit: 'HJ ouvre à 2bb, BTN suit, SB jette. Hero (BB) jette K8o.',
    hh: hh('BB', ['UTGp: folds', 'HJp: raises 1 to 2', 'COp: folds', 'BTNp: calls 2', 'SBp: folds', 'Hero: folds'],
      { stacks: { BB: 28, HJ: 92, BTN: 40, SB: 38, UTG: 25, CO: 16 } }),
    /* 10bb = 4× l'open (Hero est OOP) + 1× l'open pour le caller du BTN. */
    attendus: ["fold face à l'open", 'open (ouverture)', 'HJ · 2bb', '3-bet', '10bb', 'repère usuel'],
    interdits: ['ouvrir', 'Open RFI', 'limp', '2.1bb'],
  },
  {
    id: 'co-vs-3bet',
    recit: 'Hero (CO) ouvre à 2.5bb, BTN 3-bet à 8bb, les blindes jettent. Hero jette.',
    hh: hh('CO', ['UTGp: folds', 'HJp: folds', 'Hero: raises 1.5 to 2.5', 'BTNp: raises 5.5 to 8', 'SBp: folds', 'BBp: folds', 'Hero: folds']),

    attendus: ['fold face au 3-bet', '3-bet', 'BTN · 8bb'],
    interdits: ['ouvrir', 'face à l\'open', 'open (ouverture)'],
  },
  {
    id: 'flop-check-raise',
    recit: 'BTN ouvre, Hero (BB) suit. Flop A72 : Hero check, BTN mise 2.5bb, Hero check-raise à 8.5bb.',
    hh: hh('BB', ['UTGp: folds', 'HJp: folds', 'COp: folds', 'BTNp: raises 1.5 to 2.5', 'SBp: folds', 'Hero: calls 1.5',
      '*** FLOP *** [Ah 7d 2c]', 'Hero: checks', 'BTNp: bets 2.5', 'Hero: raises 6 to 8.5']),

    attendus: ['check-raise', 'bet', 'BTN · 2.5bb'],
    interdits: ['ouvrir', '3-bet', 'open (ouverture)'],
  },
  {
    id: 'btn-open-unopened',
    recit: 'Tout le monde jette, Hero (BTN) ouvre à 2.5bb : là, « ouvrir » est le bon mot.',
    hh: hh('BTN', ['UTGp: folds', 'HJp: folds', 'COp: folds', 'Hero: raises 1.5 to 2.5', 'SBp: folds', 'BBp: folds']),

    attendus: ['open (ouverture)'],
    interdits: ['3-bet', 'face à l\'open'],
  },
];

/* Réponses IA simulées : l'une propre, l'autre qui invente un sizing (le bug
   exact de production). La seconde DOIT être refusée par le client. */
const AI_CLEAN = {
  summary: "En big blind face à l'open du hijack, jeter K8o reste défendable, mais la cote proposée autorise une défense plus large.",
  heroAction: 'FOLD_TO_OPEN', recommendedAction: 'THREE_BET',
  strategicReason: "Hors de position face à un ouvreur en position tardive, la construction d'une range de 3-bet compense l'absence de réalisation d'équité.",
  observation: "Aucune tendance ne se déduit d'une main isolée.",
  confidence: 'medium', warnings: ["Estimation PokerForge : aucun résultat solveur exact sur ce spot."],
  verdict: { rating: 'neutral', heroAction: 'FOLD_TO_OPEN', preferredAction: 'THREE_BET',
    rationale: "Le fold n'est pas une faute grave, mais la range de défense en BB gagnerait à inclure cette main." },
  streets: {
    preflop: { status: 'neutral', analysis: "Fold face à l'open du hijack." },
    flop: { status: 'not_played', analysis: '' }, turn: { status: 'not_played', analysis: '' }, river: { status: 'not_played', analysis: '' },
  },
  keyConcepts: ['défense de blinde', 'cote du pot', 'construction de range'],
  detectedLeaks: [], coachAdvice: "Le 3-bet est préféré selon les données disponibles ; le sizing exact n'est pas disponible pour ce spot.",
  dataGaps: ['Sizing de 3-bet non disponible pour ce spot.'],
};
const AI_FABRICATED = {
  ...AI_CLEAN,
  coachAdvice: "En big blind, ouvre plutôt à 2.1bb avec une fréquence de 62 % pour exploiter la range adverse.",
  strategicReason: "Cette main défend 73 % du temps et le 3-bet correct fait 7.5bb.",
};

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }
fs.mkdirSync(OUTDIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
let failures = 0;

try {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await page.evaluateOnNewDocument((ai, clean, fabricated) => {
    localStorage.setItem('pf_active_tab', 'replayer');
    if (ai !== 'none') {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, '');
      localStorage.setItem('pf_auth', JSON.stringify({
        access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'qa', role: 'authenticated', exp })}.sig`,
        token_type: 'bearer', expires_at: exp, expires_in: 3600, refresh_token: 'qa',
        user: { id: 'qa', email: 'qa@pokerforge.local', role: 'authenticated', aud: 'authenticated' },
      }));
      const real = window.fetch.bind(window);
      window.fetch = async (u, i) => {
        const s = String(u && u.url ? u.url : u);
        if (s.includes('/functions/v1/analyze-hand')) {
          return new Response(JSON.stringify({
            ok: true, analysis: ai === 'fabricated' ? fabricated : clean,
            meta: { model: 'qa-stub', promptVersion: 'pokerforge-hand-analysis-v3', cache: 'MISS' },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return real(u, i);
      };
    }
  }, AI, AI_CLEAN, AI_FABRICATED);

  for (const spot of SPOTS) {
    if (ONLY && spot.id !== ONLY) continue;
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await sleep(600);

    // Charge la main
    await page.evaluate(t => {
      const ta = document.querySelector('textarea');
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(ta, t); ta.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('button')].find(b => /Charger la main|Charger les mains/.test(b.textContent))?.click();
    }, spot.hh);
    await page.waitForSelector('.pf-player-seat', { timeout: 6000 });
    await sleep(400);

    /* Curseur sur la DERNIÈRE décision de Hero. On ne compte pas les pas à
       l'avance (le nombre d'événements varie d'une main à l'autre) : on recule
       jusqu'à ce que le panneau affiche un verdict, ce qui n'arrive que sur une
       décision de Hero. */
    await page.evaluate(async () => {
      const b = t => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t);
      const w = ms => new Promise(r => setTimeout(r, ms));
      const tabs = [...document.querySelectorAll('button')].filter(x => /Analyse IA/.test(x.textContent));
      tabs[tabs.length - 1]?.click(); await w(250);
      b('⏭')?.click(); await w(250);
      for (let i = 0; i < 12; i++) {
        if (/ACTION HERO/.test(document.body.innerText)) return;
        b('◀◀')?.click(); await w(180);
      }
    });
    await sleep(500);

    if (AI !== 'none') {
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Analyser avec l'IA/.test(b.textContent))?.click());
      await sleep(1400);
    }

    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
    const panel = await page.evaluate(() => {
      const txt = document.body.innerText;
      const i = txt.indexOf('VERDICT');
      return {
        verdict: i >= 0 ? txt.slice(i, i + 900) : null,
        /* Les titres de section passent par `text-transform: uppercase`, que
           `innerText` restitue en capitales : la détection doit ignorer la casse. */
        aiRejected: /Réponse rejetée|Analyse suspendue/i.test(txt),
        aiShown: /Appréciation|Pourquoi \?/i.test(txt),
        full: txt,
      };
    });

    const out = path.join(OUTDIR, `semantic-${spot.id}${AI !== 'none' ? '-' + AI : ''}.png`);
    await page.screenshot({ path: out });

    // ── Confrontation écran / déroulement réel ──
    const bloc = panel.verdict || panel.full;
    const manquants = spot.attendus.filter(a => !bloc.includes(a));
    const fautifs = spot.interdits.filter(a => new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(bloc));
    const okSpot = !manquants.length && !fautifs.length;
    if (!okSpot) failures++;

    console.log(`\n${okSpot ? '✅' : '❌'} [${spot.id}] ${spot.recit}`);
    if (manquants.length) console.log('   manquant à l\'écran :', manquants);
    if (fautifs.length) console.log('   VOCABULAIRE FAUTIF :', fautifs);
    console.log('   ' + (panel.verdict || '(pas de bloc verdict)').replace(/\n/g, ' | ').slice(0, 420));

    if (AI !== 'none') {
      const attendu = AI === 'fabricated' ? panel.aiRejected : panel.aiShown;
      if (!attendu) failures++;
      console.log(`   ${attendu ? '✅' : '❌'} réponse IA « ${AI} » → ${panel.aiRejected ? 'REFUSÉE' : panel.aiShown ? 'affichée' : 'absente'}`
        + (AI === 'fabricated' ? ' (attendu : REFUSÉE)' : ' (attendu : affichée)'));
    }
    console.log('   capture :', out);
  }

  if (errs.length) console.log('\n⚠ erreurs console :', [...new Set(errs)].slice(0, 5));
  console.log(`\n${failures ? '❌' : '✅'} Validation visuelle : ${failures} écart(s)`);
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
