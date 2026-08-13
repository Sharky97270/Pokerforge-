#!/usr/bin/env node
/**
 * replayer-ai-shot — capture le PANNEAU D'ANALYSE IA du Replayer (§34/§35).
 *
 * Le rendu de l'analyse dépend d'un endpoint authentifié et payant : pour le
 * vérifier visuellement sans appeler quoi que ce soit, ce script installe deux
 * doublures CÔTÉ NAVIGATEUR uniquement :
 *   • une session Supabase factice dans localStorage (l'app croit l'utilisateur
 *     connecté) ;
 *   • un `fetch` qui intercepte l'appel à /functions/v1/analyze-hand et renvoie
 *     une réponse conforme au schéma — ou l'erreur demandée.
 * Aucune clé, aucun appel réseau réel, aucune modification du code applicatif.
 *
 * Usage :
 *   node scripts/replayer-ai-shot.mjs --state=ready|error|loading|anon
 *   node scripts/replayer-ai-shot.mjs --state=error --http=429
 *   node scripts/replayer-ai-shot.mjs --mode=full_hand
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };

const URL = arg('url', 'http://localhost:7799');
const STATE = arg('state', 'ready');          // ready | error | loading | anon
const HTTP = +arg('http', 503);               // statut simulé en mode error
const MODE = arg('mode', 'decision');         // decision | full_hand
const W = +arg('w', 1440), H = +arg('h', 900);
const OUT = path.resolve(arg('out', `replayer-ai-${STATE}.png`));

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
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 200)));

  // Doublures installées AVANT le chargement de l'app.
  await page.evaluateOnNewDocument(({ state, http, mode }) => {
    if (state !== 'anon') {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      // JWT factice de rôle "authenticated" (jamais envoyé nulle part : le fetch
      // vers l'endpoint est intercepté juste en dessous).
      const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, '');
      const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'qa-user', role: 'authenticated', exp })}.sig`;
      localStorage.setItem('pf_auth', JSON.stringify({
        access_token: jwt, token_type: 'bearer', expires_at: exp, expires_in: 3600,
        refresh_token: 'qa-refresh',
        user: { id: 'qa-user', email: 'qa@pokerforge.local', role: 'authenticated', aud: 'authenticated' },
      }));
    }
    const ANALYSIS = {
      summary: "Le call flop est défendable, mais le call turn face au double barrel est la fuite d'EV principale : ta main n'a plus de valeur de showdown crédible face à cette range de mise, et tu n'as ni tirage ni blocker utile.",
      verdict: { rating: 'mistake', heroAction: 'call', preferredAction: 'fold',
        rationale: "Face à un double barrel sur un board As-Roi, ton bluff-catch est dominé par la range de value et ne bat presque aucun bluff." },
      streets: {
        preflop: { status: 'good', analysis: "Le call en SB face à l'open du bouton reste correct à cette profondeur." },
        flop: { status: 'neutral', analysis: 'Check-call standard : tu conserves une équité de tirage et des outs propres.' },
        turn: { status: 'mistake', analysis: "Le call turn est la décision la plus coûteuse de la main : plus d'équité réelle contre la range qui mise deux fois." },
        river: { status: 'not_played', analysis: '' },
      },
      keyConcepts: ['bluff catching', 'range advantage', 'blockers', 'double barrel'],
      detectedLeaks: [{ type: 'overcall', severity: 'medium', street: 'turn',
        description: 'Call turn avec une main sans équité résiduelle face à une range polarisée.' }],
      coachAdvice: "Sur ce type de board, décide au flop de ton plan pour le turn : si tu ne comptes pas payer deux barrels, fold dès le flop plutôt que de payer une street de plus.",
      dataGaps: ["Aucune solution GTO exacte pour ce spot : les fréquences affichées sont des estimations PokerForge."],
    };
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      const u = String(url && url.url ? url.url : url);
      if (u.includes('/functions/v1/analyze-hand')) {
        if (state === 'loading') return new Promise(() => {});          // ne se résout jamais
        if (state === 'error') {
          return new Response(JSON.stringify({ ok: false, code: http === 429 ? 'RATE_LIMIT' : 'NO_KEY', retryAfter: 12 }),
            { status: http, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: true, analysis: ANALYSIS,
          meta: { model: 'gpt-4.1-mini', promptVersion: 'pokerforge-hand-analysis-v1', cache: 'MISS', durationMs: 2100 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(url, init);
    };
    window.__PF_QA_MODE = mode;
  }, { state: STATE, http: HTTP, mode: MODE });

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.setItem('pf_active_tab', 'replayer'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);

  // Charge la main
  await page.evaluate((hh) => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, hh); ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => /Charger les mains|Charger la main/.test(b.textContent))?.click();
  }, HH);
  await page.waitForSelector('.pf-player-seat', { timeout: 5000 });
  await sleep(400);

  // Positionne le curseur : saut de street puis N pas (pour tomber sur une
  // décision Hero et non sur l'événement de distribution).
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Turn')?.click());
  await sleep(300);
  const ADVANCE = +arg('advance', 0);
  if (ADVANCE > 0) {
    await page.evaluate((n) => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '▶▶');
      for (let i = 0; i < n; i++) btn?.click();
    }, ADVANCE);
    await sleep(300);
  }

  // Mode d'analyse + lancement
  await page.evaluate((mode) => {
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'full_hand'));
    if (sel && sel.value !== mode) {
      const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      set.call(sel, mode); sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    [...document.querySelectorAll('button')].find(b => /Analyser avec l'IA/.test(b.textContent))?.click();
  }, MODE);
  await sleep(STATE === 'loading' ? 3200 : 1400);

  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await sleep(200);

  const info = await page.evaluate(() => {
    const txt = document.body.innerText;
    const doc = document.documentElement;
    return {
      hasKeyPrompt: /Clé API requise|CLÉ API/.test(txt),
      hasPasswordInput: !!document.querySelector('input[type="password"]'),
      keysInStorage: Object.keys(localStorage).filter(k => /ak$|apikey|openai|anthropic/i.test(k)),
      skInStorage: Object.values(localStorage).some(v => /sk-(ant|proj|[A-Za-z0-9]{10})/.test(String(v))),
      windowLeak: Object.keys(window).filter(k => /apikey|openai|anthropic/i.test(k)),
      horizontalScroll: doc.scrollWidth > doc.clientWidth,
      panelText: (document.body.innerText.match(/(VERDICT|Verdict|Analyse de la main|NIVEAU \d|Stratégie|Source)[\s\S]{0,80}/g) || []).slice(0, 6),
    };
  });

  await page.screenshot({ path: OUT, fullPage: false });
  console.log(JSON.stringify({ out: OUT, state: STATE, mode: MODE, http: STATE === 'error' ? HTTP : null,
    consoleErrors: consoleErrors.length ? consoleErrors : 'aucune', ...info }, null, 1));
} finally {
  await browser.close();
}
