#!/usr/bin/env node
/**
 * standalone-assets-check — vérifie que le fichier unique `index-standalone.html`
 * rend bien ses images, et qu'aucune référence d'asset n'y est restée pendante.
 *
 * POURQUOI CE SCRIPT EXISTE
 * `build-standalone.mjs` remplace les chemins d'images par des constantes JS.
 * La substitution ne distinguait pas une chaîne JS d'un `url('…')` de feuille de
 * style — or `src/styles.js` est du CSS écrit dans un littéral gabarit JS.
 * Le build sortait donc `background-image:url(__pfAsset4)`, que le navigateur
 * résout comme une URL relative : 404 silencieux, image absente, et RIEN dans
 * l'interface pour le signaler. Un simple « ça se charge » ne l'aurait pas vu.
 *
 * Le contrôle porte sur la valeur CALCULÉE par le navigateur (`getComputedStyle`),
 * pas sur le texte du fichier : c'est la seule façon de prouver que la chaîne
 * data: arrive bien jusqu'à la propriété CSS.
 *
 * Prérequis : `node serve-standalone.js` (ou npm run preview du fichier unique).
 *   node scripts/standalone-assets-check.mjs --url=http://localhost:7790
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7790');
const OUT = path.resolve(arg('out', 'design-qa-evidence/standalone-assets.json'));

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

/* Ressources dont l'absence est ATTENDUE dans le fichier unique, avec la raison.
   Les lister explicitement évite deux travers : crier au loup à chaque exécution,
   et masquer une vraie régression derrière un filtre trop large. */
const ABSENCES_ATTENDUES = [
  { motif: /\/favicon\.ico(\?|$)/, raison: 'serve-standalone.js ne sert pas de favicon' },
  { motif: /cfrPostflop\.worker.*\.js(\?|$)/, raison: 'worker CFR non inlinable en fichier unique — repli heuristique prévu par cfrPostflopClient.js' },
];

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const echecs = [], attendues = [];
page.on('response', r => {
  if (r.status() < 400) return;
  const u = r.url();
  const connue = ABSENCES_ATTENDUES.find(a => a.motif.test(u));
  (connue ? attendues : echecs).push(`${r.status()} ${u.slice(0, 120)}${connue ? ' — ' + connue.raison : ''}`);
});
const erreursJs = [];
page.on('pageerror', e => erreursJs.push(String(e).slice(0, 200)));

await page.goto(URL, { waitUntil: 'networkidle2' });
for (let i = 0; i < 90; i++) {
  const ok = await page.evaluate(() => { const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent)); if (e) { e.click(); return true; } return false; });
  if (ok) break;
  await sleep(120);
}
await sleep(1600);

const mesure = await page.evaluate(() => {
  /* Toute propriété d'image calculée qui ne soit ni `none` ni une data URL est
     une référence pendante : chemin relatif, identifiant JS ayant fui, variable
     CSS non résolue. */
  const suspectes = [];
  const varsCss = {};
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    for (const prop of ['background-image', 'mask-image', '-webkit-mask-image', 'border-image-source', 'list-style-image']) {
      const v = cs.getPropertyValue(prop);
      if (!v || v === 'none') continue;
      if (/url\(\s*["']?data:/.test(v)) continue;                 // inlinée : conforme
      if (/gradient\(/.test(v) && !/url\(/.test(v)) continue;     // dégradé pur
      if (/url\(/.test(v)) suspectes.push({ cls: (el.className || '').toString().slice(0, 50), prop, valeur: v.slice(0, 90) });
    }
  }
  // État des variables CSS d'asset posées par le prélude.
  for (const nom of [...document.documentElement.style].filter(n => n.startsWith('--pf-asset-'))) {
    const v = document.documentElement.style.getPropertyValue(nom);
    varsCss[nom] = /^url\(\s*["']?data:/.test(v) ? `OK (data:, ${Math.round(v.length / 1024)} Ko)` : `SUSPECT : ${v.slice(0, 60)}`;
  }
  // Images <img> réellement décodées.
  const imgs = [...document.querySelectorAll('img')].map(i => ({
    src: (i.currentSrc || i.src || '').slice(0, 40), chargee: i.complete && i.naturalWidth > 0,
  }));
  return { suspectes, varsCss, imgsCassees: imgs.filter(i => !i.chargee).length, imgsTotal: imgs.length };
});

const problemes = [];
if (echecs.length) problemes.push(`${echecs.length} ressource(s) en échec non prévue(s)`);
if (mesure.suspectes.length) problemes.push(`${mesure.suspectes.length} propriété(s) CSS pointant vers une référence non inlinée`);
if (Object.values(mesure.varsCss).some(v => v.startsWith('SUSPECT'))) problemes.push('une variable CSS d\'asset ne contient pas de data URL');
if (mesure.imgsCassees) problemes.push(`${mesure.imgsCassees}/${mesure.imgsTotal} <img> non chargée(s)`);
if (erreursJs.length) problemes.push(`${erreursJs.length} erreur(s) JS`);

const rapport = {
  ts: new Date().toISOString(), url: URL,
  fichier: 'index-standalone.html',
  tailleKo: fs.existsSync('index-standalone.html') ? Math.round(fs.statSync('index-standalone.html').size / 1024) : null,
  ressourcesEnEchec: echecs, absencesAttendues: attendues, erreursJs,
  ...mesure, problemes,
  verdict: problemes.length === 0 ? 'OK — toutes les images du fichier unique sont inlinées et rendues' : `ÉCHEC — ${problemes.join(' · ')}`,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rapport, null, 2), 'utf8');

console.log(`Fichier : ${rapport.tailleKo} Ko`);
console.log('Variables CSS d\'asset :', JSON.stringify(mesure.varsCss, null, 1));
console.log(`<img> chargées : ${mesure.imgsTotal - mesure.imgsCassees}/${mesure.imgsTotal}`);
if (attendues.length) console.log('Absences attendues :\n  ' + attendues.join('\n  '));
if (echecs.length) console.log('Ressources en échec :\n  ' + echecs.join('\n  '));
if (mesure.suspectes.length) console.log('Références pendantes :', JSON.stringify(mesure.suspectes, null, 1));
console.log('\n' + rapport.verdict);
console.log('→ ' + OUT);
await browser.close();
process.exit(problemes.length === 0 ? 0 : 1);
