#!/usr/bin/env node
/**
 * trainer-felt-aspect-bench — QUE COÛTERAIT UN AUTRE RATIO DE FEUTRE ?
 *
 * `TRAINER_FELT_ASPECT` (1.70) fige la FORME de la table sur les quatre modes.
 * La mission « cinématique des mises » l'a choisie après avoir mesuré que
 * l'ABAISSER coûte cher (1.55 → −39 % de surface en 4T). La direction inverse
 * — une table plus plate — n'avait pas été mesurée.
 *
 * Ce banc la mesure, pour chaque mode et chaque candidat :
 *
 *   ① TAILLE DU FEUTRE, et surtout QUELLE CONTRAINTE MORD. Une cellule haute
 *      et étroite sature en LARGEUR (le ratio ne peut plus rien lui donner) ;
 *      une cellule large et courte sature en HAUTEUR (là, aplatir la table
 *      l'élargit à hauteur constante). Le ratio agit donc en sens INVERSE
 *      selon le mode — c'est le cœur de l'arbitrage.
 *
 *   ② ELLIPSE DES SIÈGES — dispersion du rayon normalisé. Changer la forme
 *      change les angles : on vérifie que les six sièges restent sur une même
 *      ellipse.
 *
 *   ③ ÉCARTEMENT DES SIÈGES VOISINS, en px. C'est ce qui casse en premier
 *      quand la table se déforme : les blocs de siège, eux, ne rétrécissent
 *      pas avec le feutre.
 *
 *   ④ COLLISIONS — mises, blindes, bouton D, cartes et board, comptées sur
 *      plusieurs mains. Une forme qui gagne 10 % de surface mais rapproche
 *      les mises du board n'est pas un gain.
 *
 * Le script MODIFIE temporairement la constante puis la restaure, y compris
 * en cas d'erreur. Il ne décide rien : il produit le tableau de coûts.
 *
 * Prérequis : serveur de dev sur --url (défaut 7799).
 * Usage :
 *   node scripts/trainer-felt-aspect-bench.mjs
 *   node scripts/trainer-felt-aspect-bench.mjs --ratios=1.55,1.70,1.85,2.0 --modes=2,3,4
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const W = +arg('w', 1600), H = +arg('h', 950);
const MODES = String(arg('modes', '1,2,3,4')).split(',').map(Number).filter(Boolean);
const RATIOS = String(arg('ratios', '1.55,1.70,1.85,2.00')).split(',').map(Number).filter(Boolean);
const HANDS = +arg('hands', 3);
const OUT = arg('out', 'design-qa-evidence/trainer-felt-aspect-bench.json');

const SRC = 'src/trainerTableGeometry.js';
const RE = /export const TRAINER_FELT_ASPECT = ([0-9.]+);/;

const original = fs.readFileSync(SRC, 'utf8');
const baseline = original.match(RE);
if (!baseline) { console.error(`Constante introuvable dans ${SRC}`); process.exit(2); }
console.log(`Ratio actuel : ${baseline[1]}\n`);

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function mesurer(ratio) {
  const browser = await puppeteer.launch({
    executablePath, headless: 'new', args: ['--hide-scrollbars'],
    defaultViewport: { width: W, height: H },
  });
  const res = [];
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => localStorage.setItem('pf_active_tab', 'trainer'));
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await sleep(900);
    await page.evaluate(() => {
      const n = [...document.querySelectorAll('*')]
        .filter(e => e.children.length === 0 && /^Entraîneur$/.test(e.textContent.trim()));
      n[0]?.closest('div,button,a')?.click();
    });
    await sleep(1800);

    for (const mode of MODES) {
      res.push(await page.evaluate(async (mode, hands) => {
        const w = ms => new Promise(r => setTimeout(r, ms));
        const vis = e => e.offsetParent && e.getBoundingClientRect().width > 0;
        const B = re => [...document.querySelectorAll('button')].find(b => vis(b) && re.test(b.textContent));
        const setT = n => [...document.querySelectorAll('.mtbtn')]
          .find(e => vis(e) && e.textContent.trim() === n + 'T')?.click();

        B(/Arrêter/)?.click();            await w(900);
        B(/Nouvelle session/)?.click();   await w(1100);
        setT(mode);                       await w(500);
        B(/Lancer la session/)?.click();  await w(4200);

        const o = { mode: mode + 'T' };
        const table = document.querySelector('.tw') || document.querySelector('.t1-left');
        const felt = table?.querySelector('.felt-oval');
        const fit = table?.querySelector('.mt-zone-fit') || table?.querySelector('.t1-zone-fit');
        const zone = table?.querySelector('.training-table-zone') || table?.querySelector('.t1-table-area');
        if (!table || !felt || !fit || !zone) { o.err = 'structure introuvable'; return o; }
        const F = felt.getBoundingClientRect();
        const F2 = fit.getBoundingClientRect(), Z = zone.getBoundingClientRect();

        /* ① Quelle contrainte mord ? La zone remplit-elle la largeur ou la
           hauteur de son conteneur de proportion ? */
        const satLargeur = Z.width >= F2.width - 1.5;
        const satHauteur = Z.height >= F2.height - 1.5;
        o.feutre = { w: +F.width.toFixed(1), h: +F.height.toFixed(1),
                     aire: Math.round(F.width * F.height),
                     ratio: +(F.width / F.height).toFixed(3) };
        o.contrainte = satLargeur && !satHauteur ? 'LARGEUR'
                     : satHauteur && !satLargeur ? 'HAUTEUR'
                     : satLargeur && satHauteur ? 'les deux' : 'aucune';
        o.reserve = { conteneur: { w: Math.round(F2.width), h: Math.round(F2.height) },
                      zone: { w: Math.round(Z.width), h: Math.round(Z.height) },
                      hauteurPerdue: Math.round(F2.height - Z.height) };

        /* ② + ③ Ellipse et écartement des voisins. */
        const slots = [...table.querySelectorAll('.pf-seat-avatar-slot')].filter(vis);
        if (slots.length) {
          const fx = F.x + F.width / 2, fy = F.y + F.height / 2;
          const pts = slots.map(e => { const r = e.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
          const rhos = pts.map(p => Math.hypot((p.x - fx) / (F.width / 2), (p.y - fy) / (F.height / 2)));
          const moy = rhos.reduce((a, b) => a + b, 0) / rhos.length;
          o.ellipse = { sieges: rhos.length, moyenne: +moy.toFixed(3),
            ecartType: +Math.sqrt(rhos.reduce((a, b) => a + (b - moy) ** 2, 0) / rhos.length).toFixed(3) };
          /* Écartement : plus courte distance entre deux BLOCS de siège. */
          const blocs = [...table.querySelectorAll('.pf-mt-seat')].filter(vis).map(s => {
            const parts = [s, ...s.querySelectorAll('.pf-seat-above,.pf-seat-below,.pf-mt-nameplate')]
              .filter(vis).map(e => e.getBoundingClientRect());
            return { l: Math.min(...parts.map(r => r.left)), r: Math.max(...parts.map(r => r.right)),
                     t: Math.min(...parts.map(r => r.top)), b: Math.max(...parts.map(r => r.bottom)) };
          });
          let ecart = Infinity;
          for (let i = 0; i < blocs.length; i++) for (let j = i + 1; j < blocs.length; j++) {
            const a = blocs[i], b = blocs[j];
            const dx = Math.max(b.l - a.r, a.l - b.r, 0), dy = Math.max(b.t - a.b, a.t - b.b, 0);
            ecart = Math.min(ecart, Math.hypot(dx, dy));
          }
          o.ecartementVoisins = Math.round(ecart);
        }

        /* ④ Collisions sur plusieurs mains, toutes tables. */
        const croise = (r, s) => !(r.right < s.left || r.left > s.right || r.bottom < s.top || r.top > s.bottom);
        let collisions = 0, entreVoisins = 0, echantillons = 0;
        for (let k = 0; k < hands; k++) {
          for (const t of document.querySelectorAll('.tw')) {
            if (!vis(t)) continue;
            const coeur = [...t.querySelectorAll('.mt-board-zone,.pf-board-zone,[class*="pot-readout"]')]
              .filter(vis).map(e => e.getBoundingClientRect());
            /* Un objet porte l identite de SON siege : deux elements du meme
               bloc se touchent par construction, ce n est pas une collision. */
            const mobiles = [...t.querySelectorAll('.pf-action-chip-badge,.pf-blind-stack,.dealer-btn,.pf-seat-above,.pf-mt-nameplate,.pf-seat-below')]
              .filter(vis).map(e => ({ r: e.getBoundingClientRect(), siege: e.closest('.pf-mt-seat,.pf-player-seat') }));
            for (const m of mobiles) { echantillons++; if (coeur.some(c => croise(m.r, c))) collisions++; }
            for (let i = 0; i < mobiles.length; i++) for (let j = i + 1; j < mobiles.length; j++) {
              if (mobiles[i].siege && mobiles[i].siege === mobiles[j].siege) continue;
              if (croise(mobiles[i].r, mobiles[j].r)) entreVoisins++;
            }
          }
          const act = [...document.querySelectorAll('.gto-btn')].filter(vis);
          if (act.length) { act[k % act.length].click(); await w(750); }
          const cta = document.querySelector('.pf-p2-next');
          if (cta && !cta.disabled) { cta.click(); await w(850); }
        }
        o.surLeCoeur = collisions; o.entreVoisins = entreVoisins; o.echantillons = echantillons;
        return o;
      }, mode, HANDS));
    }
  } finally { await browser.close(); }
  return res;
}

const rapport = [];
try {
  for (const ratio of RATIOS) {
    fs.writeFileSync(SRC, original.replace(RE, `export const TRAINER_FELT_ASPECT = ${ratio.toFixed(2)};`));
    await sleep(1400);                       // laisse le serveur de dev recharger
    const mesures = await mesurer(ratio);
    rapport.push({ ratio, mesures });
    console.log(`── ratio ${ratio.toFixed(2)} ${ratio === +baseline[1] ? '(actuel)' : ''}`);
    for (const m of mesures) {
      if (m.err) { console.log(`   ${m.mode} — ${m.err}`); continue; }
      console.log(`   ${m.mode}  feutre ${m.feutre.w}×${m.feutre.h} (aire ${m.feutre.aire}) · sature en ${m.contrainte}`
        + ` · ellipse σ ${m.ellipse?.ecartType ?? '?'} · écart voisins ${m.ecartementVoisins ?? '?'}px`
        + ` · sur le coeur ${m.surLeCoeur} · entre voisins ${m.entreVoisins} (sur ${m.echantillons} objets)`);
    }
    console.log('');
  }
} finally {
  fs.writeFileSync(SRC, original);
  console.log(`Constante restaurée à ${baseline[1]}.`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ viewport: [W, H], ratioActuel: +baseline[1], rapport }, null, 1));
console.log(`\nRelevés écrits dans ${OUT}`);
