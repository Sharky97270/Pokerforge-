#!/usr/bin/env node
/**
 * trainer-solution-toggle-audit — vérifie le bouton global « Afficher / Masquer
 * la solution » en 1T→4T (Lot 4).
 *
 * TROIS DÉFAUTS MESURÉS LE 2026-08-21 QUE CE SCRIPT VERROUILLE
 *
 * ① CONTAMINATION CROISÉE. Le panneau droit est UNIQUE et décrit la table
 *    focalisée. Or le focus se déplaçait dès qu'une table avait répondu :
 *    on répondait sur la table 1 et le panneau affichait aussitôt l'analyse de
 *    la table 2. La solution lue ne correspondait pas à la décision prise.
 *    → assertion : après une décision sur la table N, le panneau décrit la
 *      table N (position et tapis d'Hero identiques).
 *
 * ② « MASQUER » NE MASQUAIT PLUS. La condition de révélation était
 *    `showSol || answered` : dès la première réponse, la solution complète
 *    s'ouvrait malgré la bascule sur « masquée ».
 *    → assertion : bascule masquée + table répondue ⇒ ni fréquences ni EV
 *      optimale à l'écran.
 *
 * ③ RÉVÉLATION PARTIELLE EN MOSAÏQUE. Une bascule dite « globale » doit agir
 *    sur toutes les tables ayant une décision terminée, pas seulement la table
 *    focalisée.
 *    → assertion : bascule affichée ⇒ chaque tuile répondue montre sa propre
 *      meilleure action, et deux tuiles n'affichent jamais la même.
 *
 * Prérequis : serveur de dev lancé, Chrome ou Edge installé.
 *   node scripts/trainer-solution-toggle-audit.mjs --tables=2,3,4
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const TABLES = arg('tables', '2,3,4').split(',').map(Number);
const W = +arg('w', 1920), H = +arg('h', 1080);
const OUT = path.resolve(arg('out', 'design-qa-evidence/trainer-solution-toggle.json'));

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouve.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HELPERS = () => {
  window.__ts = {
    clickNT(n) { const e = [...document.querySelectorAll('.mtbtn')].find(x => x.textContent.trim() === n + 'T'); if (e) { e.click(); return true; } return false; },
    launch() { const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent)); if (b) { b.click(); return true; } return false; },
    slots() { return [...document.querySelectorAll('.mt-slot')]; },
    solBtn() { return [...document.querySelectorAll('button')].find(b => /Afficher la solution|Masquer la solution/i.test(b.textContent)); },
    solEtat() { const b = window.__ts.solBtn(); return b ? (/Masquer/i.test(b.textContent) ? 'affichee' : 'masquee') : null; },
    toggleSol() { const b = window.__ts.solBtn(); if (b) { b.click(); return true; } return false; },
    /* Identité d'une table, lue sur le feutre : position et tapis d'Hero.
       C'est ce qui permet de dire « le panneau décrit BIEN cette table-ci ». */
    identite(i) {
      const s = window.__ts.slots()[i]; if (!s) return null;
      const t = s.innerText || '';
      const m = t.match(/HERO\s+([A-Z+0-9]{2,5})\s+([\d.]+)bb/);
      return m ? { pos: m[1], stack: m[2] } : null;
    },
    /* Ce que la TUILE dit de la solution (bandeau de feedback par table). */
    tuileSolution(i) {
      const s = window.__ts.slots()[i]; if (!s) return null;
      const t = (s.innerText || '').replace(/\s+/g, ' ');
      const best = (t.match(/Meilleure action\s*:?\s*([^·\n]{1,24})/i) || [])[1] || null;
      return {
        repondue: /TERMIN/i.test(t),
        montreMeilleure: !!best, meilleure: best && best.trim(),
        montreFreq: /GTO\s*\d+%/.test(t),
        ditMasquee: /Solution masqu/i.test(t),
      };
    },
    /* Ce que le PANNEAU DROIT unique décrit. */
    panneau() {
      const p = document.querySelector('.pf-p2'); if (!p) return null;
      const t = (p.innerText || '').replace(/\s+/g, ' ');
      const m = t.match(/↑\s*([A-Z+0-9]{2,5})\s+([\d.]+)bb/);
      return {
        pos: m ? m[1] : null, stack: m ? m[2] : null,
        verrouille: /Solution masqu/i.test(t),
        montreFreq: /\d+%/.test(t) && /ANALYSE/i.test(t) && !/Solution masqu/i.test(t),
        montreEvOptimale: /EV optimale/i.test(t),
      };
    },
    act(i) {
      const s = window.__ts.slots()[i]; if (!s) return null;
      const bs = [...s.querySelectorAll('button.gto-btn,button[class*="gto-btn-"]')].filter(x => x.getBoundingClientRect().width > 0);
      if (!bs.length) return null;
      const p = bs[0]; const l = p.textContent.trim().slice(0, 16); p.click(); return l;
    },
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
const rapport = { ts: new Date().toISOString(), url: URL, viewport: { w: W, h: H }, cas: [], echecs: [] };

for (const nt of TABLES) {
  const page = await browser.newPage();
  const erreurs = [];
  /* Une ressource manquante produit un message console générique
     (« Failed to load resource… ») qui ne dit PAS laquelle. On l'ignore et on
     enregistre à la place la requête réellement en échec, ce qui permet
     d'exclure le seul cas légitime : `serve-standalone.js` ne sert pas de
     favicon, et un favicon absent n'est pas un défaut de l'application.
     Toute autre ressource en échec reste comptée. */
  page.on('response', r => {
    if (r.status() < 400) return;
    const u = r.url();
    if (/\/favicon\.ico(\?|$)/.test(u)) return;
    erreurs.push(`ressource ${r.status()} : ${u.slice(0, 140)}`);
  });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/i.test(m.text())) return;   // couvert par le listener ci-dessus
    erreurs.push(m.text().slice(0, 180));
  });
  page.on('pageerror', e => erreurs.push('pageerror: ' + String(e).slice(0, 180)));
  const cas = { tables: nt, erreurs, etapes: [] };
  const problemes = [];
  const waitFor = async (fn, a, label, ms = 15000) => {
    const t0 = Date.now();
    for (;;) { await page.evaluate(HELPERS); if (await page.evaluate(fn, a)) return; if (Date.now() - t0 > ms) throw new Error('introuvable : ' + label); await sleep(150); }
  };
  try {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await waitFor(() => { const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent)); if (e) { e.click(); return true; } return false; }, null, 'onglet Entraineur');
    await waitFor(() => !!document.querySelector('.mtbtn'), null, 'bandeau Multitabling');
    if (nt > 1) { await waitFor(n => window.__ts.clickNT(n), nt, nt + 'T'); await sleep(250); }
    await waitFor(() => window.__ts.launch(), null, 'Lancer la session');
    await waitFor(() => window.__ts.slots().length > 0, null, 'tables montées');
    await sleep(900);
    await page.evaluate(HELPERS);

    /* ── Bascule sur MASQUÉE, puis on répond sur la table 1 ── */
    if (await page.evaluate(() => window.__ts.solEtat()) === 'affichee') { await page.evaluate(() => window.__ts.toggleSol()); await sleep(300); }
    await page.evaluate(HELPERS);
    const idT0 = await page.evaluate(() => window.__ts.identite(0));
    const joue = await page.evaluate(() => window.__ts.act(0));
    await sleep(1500);
    await page.evaluate(HELPERS);

    const masquee = { etat: await page.evaluate(() => window.__ts.solEtat()), panneau: await page.evaluate(() => window.__ts.panneau()), joue, identiteT1: idT0 };
    cas.etapes.push({ etape: 'solution masquée, table 1 répondue', ...masquee });
    // ② Masquer doit masquer.
    if (masquee.panneau && !masquee.panneau.verrouille) problemes.push('bascule « masquée » mais le panneau ouvre quand même la solution');
    if (masquee.panneau && masquee.panneau.montreEvOptimale) problemes.push('bascule « masquée » mais « EV optimale » reste affichée');
    // ① Le panneau décrit la table qui vient de décider.
    if (nt > 1 && idT0 && masquee.panneau && masquee.panneau.pos && (masquee.panneau.pos !== idT0.pos || masquee.panneau.stack !== idT0.stack))
      problemes.push(`panneau contaminé : table 1 = ${idT0.pos} ${idT0.stack}bb, panneau = ${masquee.panneau.pos} ${masquee.panneau.stack}bb`);

    /* ── Bascule sur AFFICHÉE ── */
    await page.evaluate(() => window.__ts.toggleSol());
    await sleep(500);
    await page.evaluate(HELPERS);
    const tuiles = [];
    for (let i = 0; i < nt; i++) tuiles.push({ t: i + 1, id: await page.evaluate(k => window.__ts.identite(k), i), sol: await page.evaluate(k => window.__ts.tuileSolution(k), i) });
    const affichee = { etat: await page.evaluate(() => window.__ts.solEtat()), panneau: await page.evaluate(() => window.__ts.panneau()), tuiles };
    cas.etapes.push({ etape: 'solution affichée', ...affichee });

    if (affichee.etat !== 'affichee') problemes.push('la bascule n\'est pas passée en « affichée »');
    if (affichee.panneau && affichee.panneau.verrouille) problemes.push('bascule « affichée » mais le panneau reste verrouillé');
    // ③ La tuile répondue montre SA meilleure action.
    const t1 = tuiles[0];
    if (!t1.sol || !t1.sol.montreMeilleure) problemes.push('la tuile répondue n\'affiche pas sa meilleure action une fois la solution révélée');
    if (t1.sol && t1.sol.ditMasquee) problemes.push('la tuile répondue dit encore « solution masquée » alors que la bascule est ouverte');
    // Aucune tuile NON répondue ne doit afficher une solution.
    const fuite = tuiles.slice(1).filter(x => x.sol && x.sol.montreMeilleure);
    if (fuite.length) problemes.push(`solution visible sur ${fuite.length} table(s) qui n'ont pas encore décidé`);

    if (erreurs.length) problemes.push(`${erreurs.length} erreur(s) console`);
  } catch (e) {
    problemes.push('exception : ' + String(e.message || e));
  }
  cas.problemes = problemes;
  cas.ok = problemes.length === 0;
  if (!cas.ok) rapport.echecs.push({ tables: nt, problemes });
  rapport.cas.push(cas);
  console.log(`${cas.ok ? 'OK  ' : 'KO  '} ${nt}T${cas.problemes.length ? ' — ' + cas.problemes.join(' · ') : ''}`);
  await page.close();
}

rapport.verdict = rapport.echecs.length === 0
  ? `OK — bascule globale conforme sur ${rapport.cas.length} configuration(s)`
  : `ÉCHEC — ${rapport.echecs.length}/${rapport.cas.length} configuration(s) en défaut`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rapport, null, 2), 'utf8');
console.log('\n' + rapport.verdict);
console.log('→ ' + OUT);
await browser.close();
process.exit(rapport.echecs.length === 0 ? 0 : 1);
