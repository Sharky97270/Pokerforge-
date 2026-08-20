#!/usr/bin/env node
/**
 * trainer-lisibilite-audit — AUCUN TEXTE SOUS LE SEUIL DE LECTURE.
 *
 * En mosaïque, un « zoom » CSS est posé sur chaque grappe de siège pour faire
 * tenir six joueurs dans un cadre de 127px de large. Ce zoom réduit TOUT ce
 * qu'il contient — y compris des libellés déjà écrits en 7,5px. Mesuré avant
 * correction : « Fold » à 5,5px, « HERO » à 5px, la lettre de blinde à 5,9px.
 * En dessous de ~7px un texte cesse d'être lu : il devient une tache, et la
 * mission « vision périphérique » échoue par accumulation de taches.
 *
 * Ce script relève la taille RENDUE (getComputedStyle, donc après zoom) de
 * chaque nœud de texte d'une table, et signale ceux sous le plancher.
 *
 * Il mesure aussi les valeurs numériques affichées et refuse les formes
 * proscrites (« 1.0bb », « 4.00bb », « SPR 10.0 ») — finitions §12.
 *
 * Usage :
 *   node scripts/trainer-lisibilite-audit.mjs
 *   node scripts/trainer-lisibilite-audit.mjs --min=7 --modes=3,4
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL   = arg('url', 'http://localhost:7799');
const W = +arg('w', 1600), H = +arg('h', 950);
const MODES = String(arg('modes', '1,2,3,4')).split(',').map(Number).filter(Boolean);
const MIN   = +arg('min', 7);              // px rendus — plancher de lecture
const OUT   = arg('out', 'design-qa-evidence/trainer-lisibilite.json');

/* Libellés qui ne PORTENT PAS d'information à lire : purement décoratifs ou
   déjà redondants avec un visuel. Les exclure évite de gonfler des glyphes
   qui n'ont pas à l'être. */
const IGNORE = /^[·•→←▶◀⏭⏮⚙✓✗★≈‼◆○●⊡⛶↺↻⚠🔒🎯🧠🃏🦈💡🏆❌]+$/u;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }

const browser = await puppeteer.launch({
  executablePath, headless: 'new', args: ['--hide-scrollbars'],
  defaultViewport: { width: W, height: H },
});
let failed = 0;
const rapport = [];

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem('pf_active_tab', 'trainer'));
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => {
    const n = [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && /^Entraîneur$/.test(e.textContent.trim()));
    n[0]?.closest('div,button,a')?.click();
  });
  await new Promise(r => setTimeout(r, 1800));

  for (const mode of MODES) {
    const res = await page.evaluate(async (mode, min, ignoreSrc) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const vis = e => e.offsetParent && e.getBoundingClientRect().width > 0;
      const B = re => [...document.querySelectorAll('button')].find(b => vis(b) && re.test(b.textContent));
      const setT = n => [...document.querySelectorAll('.mtbtn')]
        .find(e => vis(e) && e.textContent.trim() === n + 'T')?.click();
      const IGNORE = new RegExp(ignoreSrc, 'u');

      B(/Arrêter/)?.click();            await w(900);
      B(/Nouvelle session/)?.click();   await w(1100);
      setT(mode);                       await w(500);
      B(/Lancer la session/)?.click();  await w(4000);

      const slot = document.querySelector('.mt-slot') || document.querySelector('.tw');
      const o = { mode: mode + 'T', trop_petit: [], arrondis: [], nbTextes: 0 };
      if (!slot) { o.trop_petit.push({ err: 'aucune table rendue' }); return o; }

      /* Taille RENDUE : getComputedStyle reflète déjà le zoom des ancêtres. */
      for (const e of slot.querySelectorAll('*')) {
        if (e.children.length) continue;
        const t = e.textContent.trim();
        if (!t || IGNORE.test(t)) continue;
        if (!vis(e)) continue;
        o.nbTextes++;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < min) o.trop_petit.push({
          texte: t.slice(0, 16), px: Math.round(fs * 10) / 10,
          cls: (e.className || '').toString().slice(0, 28) || (e.parentElement?.className || '').toString().slice(0, 28),
        });
      }

      /* §12 — formes numériques proscrites, sur TOUT l'écran. */
      const txt = document.body.innerText;
      [[/\b\d+\.0(?:bb|%)?\b/g, 'décimale nulle'], [/\b\d+\.\d0(?:bb|%)?\b/g, 'zéro final'],
       [/\bSPR\s*\d+\.0\b/g, 'SPR x.0']]
        .forEach(([re, lbl]) => { const m = txt.match(re); if (m) o.arrondis.push({ type: lbl, ex: [...new Set(m)].slice(0, 6) }); });

      o.ok = o.trop_petit.length === 0 && o.arrondis.length === 0;
      return o;
    }, mode, MIN, IGNORE.source);

    rapport.push(res);
    if (!res.ok) failed++;
    console.log(`${res.ok ? '✅' : '❌'} ${res.mode} — ${res.nbTextes} textes, ${res.trop_petit.length} sous ${MIN}px, ${res.arrondis.length} arrondi(s) proscrit(s)`);
    for (const p of res.trop_petit.slice(0, 8)) console.log(`   · « ${p.texte} » ${p.px}px (${p.cls})`);
    for (const a of res.arrondis) console.log(`   · ${a.type} : ${a.ex.join(', ')}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ viewport: [W, H], plancherPx: MIN, rapport }, null, 1));
  console.log(`\nRelevés écrits dans ${OUT}`);
} finally {
  await browser.close();
}

console.log(failed
  ? `\n❌ ${failed} mode(s) sous le seuil de lecture ou avec un arrondi proscrit.`
  : `\n✅ Tous les textes sont au-dessus de ${MIN}px et les arrondis respectent la convention.`);
process.exit(failed ? 1 : 0);
