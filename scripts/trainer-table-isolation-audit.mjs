#!/usr/bin/env node
/**
 * trainer-table-isolation-audit — le panneau parle-t-il de la BONNE table ?
 *
 * §22 : « Aucune information de Table 1 ne doit contaminer Table 2, Table 3,
 * Table 4. » En mosaïque, le panneau de droite (Street, Stack Hero, Pot, Pot
 * Odds, SPR, profil du vilain, historique, ranges GTO) décrit UNE table. Les
 * tables, elles, avancent de façon asynchrone : l'IA d'une table réfléchit
 * pendant qu'une autre attend une décision.
 *
 * La question mesurée est donc : la table décrite par le panneau est-elle celle
 * qui attend une décision ? Si non, le joueur lit un pot, des cotes et un SPR
 * qui appartiennent à une AUTRE main pendant qu'il décide — la même classe de
 * préjudice qu'un pot faux.
 *
 * Méthode : on relève le pot peint de chaque table, celui du panneau, et on
 * regarde quelle(s) table(s) attend(ent) une décision (boutons d'action actifs).
 * On ne conclut QUE sur les relevés où une seule table est en attente : sinon
 * l'ambiguïté vient de la situation, pas du produit.
 *
 * Prérequis : serveur de dev lancé (.claude/launch.json, port 7788).
 *
 *   node scripts/trainer-table-isolation-audit.mjs --tables=4T --n=12
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const URL = arg('url', 'http://localhost:7788');
const TABLES = arg('tables', '4T');
const STRUCT = arg('struct', '6J');
const W = +arg('w', 1600);
const H = +arg('h', 950);
const N = +arg('n', 12);
const OUT = arg('out', '');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = () => {
  const lire = t => { const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*bb/i); return m ? parseFloat(m[1].replace(',', '.')) : null; };
  const painted = el => { if (!el) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const b = el.getBoundingClientRect(); return b.width > 1 && b.height > 1; };

  // Panneau de droite : les lignes k/v d'INFORMATIONS.
  const panel = {};
  document.querySelectorAll('.pf-p2-irow').forEach(r => {
    const k = r.querySelector('.k'), v = r.querySelector('.v');
    if (k && v) panel[k.textContent.trim()] = v.textContent.trim();
  });

  const tuiles = [...document.querySelectorAll('.mt-slot')];
  const tables = tuiles.map((tile, i) => {
    const zone = tile.querySelector('.training-table-zone');
    const potEl = zone && zone.querySelector('.pf-pot-readout');
    const hero = zone && [...zone.querySelectorAll('.pf-player-seat')].find(s => s.querySelector('.pf-seat-hero-chip'));
    const plaque = hero && hero.querySelector('.pf-mt-nameplate');
    // Une table ATTEND une décision si elle porte des boutons d'action actifs.
    const boutons = [...tile.querySelectorAll('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"]')]
      .filter(b => b.getBoundingClientRect().width > 0 && !b.disabled);
    return {
      i,
      focus: tile.classList.contains('mt-slot-focus'),
      pot: potEl && painted(potEl) ? lire(potEl.textContent) : null,
      heroPlaque: plaque ? plaque.textContent.trim().replace(/\s+/g, ' ') : null,
      board: zone ? zone.querySelectorAll('.mt-board-zone .card').length : 0,
      enAttente: boutons.length > 0,
      nbBoutons: boutons.length,
    };
  });
  return { panel, tables };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: 'networkidle2' });
  const click = (t, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')].find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; } return false;
  }, t, exact);

  await click('Entraineur GTO'); await sleep(900);
  await click(TABLES); await sleep(200);
  await click(STRUCT); await sleep(300);
  await click('Lancer la session', false);
  for (let i = 0; i < 60; i++) { if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break; await sleep(400); }
  await sleep(1400);

  /* Provoquer la DESYNCHRONISATION, sinon il n y a rien a mesurer : au
     depart les quatre tables attendent ensemble, et le panneau a forcement
     raison. On repond donc a toutes les tables SAUF une, puis on releve.

     Les clics sont de VRAIS clics souris :  reagit au mousedown
     qui remonte de la tuile, et un  synthetique ne le declenche pas.
     Mesurer avec des clics synthetiques donnerait un produit plus fautif qu il
     ne l est. */
  const boutonsEnAttente = () => page.evaluate(() => [...document.querySelectorAll('.mt-slot')].map((tile, i) => {
    const b = [...tile.querySelectorAll('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"]')]
      .filter(x => x.getBoundingClientRect().width > 0 && !x.disabled && !/Fold/i.test(x.textContent));
    if (!b.length) return null;
    const r = b[Math.min(1, b.length - 1)].getBoundingClientRect();
    return { i, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }).filter(Boolean));

  const releves = [];
  for (let d = 0; d < N; d++) {
    /* On releve A CHAQUE tour : un etat ou UNE SEULE table attend est deja
       concluant, et attendre de pouvoir fabriquer la situation faisait tourner
       le pilote a vide (mesure : 0 releve sur 18 tours). */
    const snap = await page.evaluate(PROBE);
    if (snap.tables.length) releves.push(snap);
    const att = await boutonsEnAttente();
    if (att.length >= 2) {
      // On repond a toutes sauf une : le tour SUIVANT sera concluant.
      for (const t of att.slice(0, -1)) { await page.mouse.click(t.x, t.y); await sleep(650); }
    } else if (att.length === 1) {
      await page.mouse.click(att[0].x, att[0].y);
    } else {
      await page.evaluate(() => { const n = [...document.querySelectorAll(".gto-next-btn,button.btng")].find(x => x.getBoundingClientRect().width > 0 && !x.disabled); if (n) n.click(); });
    }
    await sleep(1700);
  }

  /* Un relevé ne CONCLUT que si exactement une table attend une décision : avec
     zéro ou plusieurs, l'ambiguïté vient de la situation, pas du produit. */
  const concluants = releves.filter(r => r.tables.filter(t => t.enAttente).length === 1);
  const analyse = concluants.map(r => {
    const attente = r.tables.find(t => t.enAttente);
    const potPanneau = (() => { const m = String(r.panel.Pot || '').match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : null; })();
    const correspond = r.tables.filter(t => t.pot != null && potPanneau != null && Math.abs(t.pot - potPanneau) < 0.011).map(t => t.i);
    return {
      tableEnAttente: attente.i,
      tableAuFocus: (r.tables.find(t => t.focus) || {}).i ?? null,
      potPanneau, potsTables: r.tables.map(t => t.pot),
      panneauCorrespondA: correspond,
      // Contamination : le panneau décrit une table qui n'est PAS celle qui
      // attend, alors qu'il existe une correspondance non ambiguë.
      contamine: correspond.length === 1 && correspond[0] !== attente.i,
      focusDesaligne: ((r.tables.find(t => t.focus) || {}).i ?? null) !== attente.i,
    };
  });

  const summary = {
    mode: TABLES, viewport: `${W}x${H}`,
    releves: releves.length, relevesConcluants: concluants.length,
    focusDesaligne: `${analyse.filter(a => a.focusDesaligne).length}/${analyse.length}`,
    panneauContamine: `${analyse.filter(a => a.contamine).length}/${analyse.filter(a => a.panneauCorrespondA.length === 1).length}`,
    exemples: analyse.filter(a => a.focusDesaligne).slice(0, 6),
    erreursPage: pageErrors,
  };
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(path.resolve(OUT), JSON.stringify({ summary, analyse, releves }, null, 1)); }
  console.log(JSON.stringify(summary, null, 1));
  if (!releves.length) { console.error('AUCUN RELEVE.' + (pageErrors.length ? '\n' + pageErrors.join('\n') : '')); process.exitCode = 3; }
} finally { await browser.close(); }
