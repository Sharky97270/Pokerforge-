#!/usr/bin/env node
/**
 * png-crop — découpe et agrandit une région d'un PNG, pour l'inspection visuelle.
 *
 * Les captures de table font 1600x950 : à cette échelle un badge de mise fait
 * 40px et on ne peut PAS juger de sa lisibilité à l'œil. Ce script rend la
 * région intéressante à la taille où le défaut se voit.
 *
 *   node scripts/png-crop.mjs --in=shot.png --crop=420,120,430,400 --zoom=2.5 --out=zoom.png
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const IN = path.resolve(arg('in', ''));
const OUT = path.resolve(arg('out', 'crop.png'));
const CROP = arg('crop', '');
const ZOOM = +arg('zoom', 2);
if (!IN || !fs.existsSync(IN)) { console.error('--in= manquant ou introuvable'); process.exit(2); }

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
const b64 = fs.readFileSync(IN).toString('base64');
const browser = await puppeteer.launch({ executablePath, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  const url = await page.evaluate(async (b64, crop, zoom) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const [sx, sy, sw, sh] = crop ? crop.split(',').map(Number) : [0, 0, img.width, img.height];
    const c = document.createElement('canvas');
    c.width = Math.round(sw * zoom); c.height = Math.round(sh * zoom);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, b64, CROP, ZOOM);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', OUT);
} finally { await browser.close(); }
