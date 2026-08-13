#!/usr/bin/env node
/**
 * trainer-mt-geometry — mesure la GÉOMÉTRIE des tuiles multi-table du Trainer.
 *
 * Complète `trainer-overlap-audit.mjs` (qui ne parle qu'au 1T) sur les trois
 * questions posées par la mission 3T/4T :
 *
 *   1. « les avatars suivent-ils l'anneau doré ? »
 *      → pour chaque siège, ρ = rayon normalisé du CENTRE de l'avatar sur
 *        l'ellipse du feutre (`.felt-oval`). ρ=1.00 ⇒ pile sur l'anneau ;
 *        ρ<1 ⇒ le siège flotte à l'intérieur. On sort min/max/écart-type :
 *        c'est la DISPERSION qui trahit un siège mal ancré, pas la moyenne.
 *
 *   2. « les objets sont-ils proportionnés à la tuile ? »
 *      → tailles mesurées de l'avatar, du bouton D, des tas de blinde, du
 *        badge de mise, rapportées au petit rayon du feutre (ry).
 *
 *   3. « la zone de décision mange-t-elle la table ? »
 *      → hauteurs de `.training-table-zone` et de `.mtr-actions`, et leur part
 *        respective de la tuile.
 *
 * Enfin il inventorie les CHEVAUCHEMENTS entre feuilles peintes (même méthode
 * et même seuil que l'audit 1T : on mesure les feuilles, pas les conteneurs).
 *
 * Prérequis : serveur de dev lancé (.claude/launch.json, port 7788).
 *
 *   node scripts/trainer-mt-geometry.mjs --tables=3T
 *   node scripts/trainer-mt-geometry.mjs --tables=4T --w=1366 --h=768
 *   node scripts/trainer-mt-geometry.mjs --tables=3T --fh --shot=out.png
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const TABLES = arg('tables', '3T');
const STRUCT = arg('struct', '6J');
const W = +arg('w', 1680);
const H = +arg('h', 910);
const SHOT = arg('shot', '');
const MIN_AREA = +arg('minArea', 16);
const STREETS = +arg('streets', 0);   // nb de streets à avancer en Full Hand
const N = +arg('n', 1);               // >1 : balayage agrégé sur N décisions

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath, headless: 'new',
  args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});

try {
  const page = await browser.newPage();
  /* Une erreur de script rend la page VIDE, et la mesure sort alors un
     `tables: []` parfaitement silencieux — on croit mesurer, on ne mesure rien.
     (Vécu deux fois : un backtick dans un commentaire CSS termine le template
     literal de styles.js.) On échoue donc bruyamment. */
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const click = (txt, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')]
      .find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; }
    return false;
  }, txt, exact);

  await click('Entraineur GTO'); await sleep(800);
  await click(TABLES); await sleep(150);
  await click(STRUCT); await sleep(250);
  if (flag('fh')) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,span')]
        .find(e => e.children.length === 0 && /^🃏?\s*Full Hand$/i.test(e.textContent.trim()));
      let n = el; for (let i = 0; i < 4 && n; i++) { n.click && n.click(); n = n.parentElement; }
    });
    await sleep(250);
  }
  await click('Lancer la session', false);
  // Les tables se montent de façon asynchrone (file IA) : attendre le sélecteur,
  // pas un délai — sinon la mesure porte sur une page encore vide et le rapport
  // sort avec `tables: []` sans qu'aucune erreur ne le signale.
  for (let i = 0; i < 60; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.training-table-zone .felt-oval').length);
    if (n > 0) break;
    await sleep(400);
  }
  await sleep(1200);

  // Avance de `STREETS` décisions en jouant la première action non-fold visible.
  for (let s = 0; s < STREETS; s++) {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"]')]
        .filter(x => x.getBoundingClientRect().width > 0 && !/Fold/i.test(x.textContent));
      if (btns.length) btns[Math.min(1, btns.length - 1)].click();
    });
    await sleep(2200);
  }

  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  await sleep(300);

  const report = await page.evaluate((minArea) => {
    const R = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; };
    const painted = el => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
      const b = el.getBoundingClientRect();
      return b.width > 2 && b.height > 2;
    };
    const inter = (a, b) => {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? w * h : 0;
    };

    const tiles = [...document.querySelectorAll('.mt-tile,.training-table-tile,.mt-zone-fit')]
      .map(z => z.closest('.mt-zone-fit') ? z.closest('.mt-zone-fit').parentElement : z);
    const zones = [...document.querySelectorAll('.training-table-zone')];

    const out = { viewport: { w: innerWidth, h: innerHeight }, tables: [] };

    zones.forEach((zone, ti) => {
      const felt = zone.querySelector('.felt-oval');
      if (!felt) return;
      const fb = R(felt);
      const ell = { cx: fb.cx, cy: fb.cy, rx: fb.w / 2, ry: fb.h / 2 };
      const rho = p => Math.hypot((p.cx - ell.cx) / ell.rx, (p.cy - ell.cy) / ell.ry);

      // Sièges : on prend le CENTRE de l'avatar (le disque), pas le conteneur
      // de siège (qui englobe les cartes et déporte le centre vers le haut).
      const seats = [...zone.querySelectorAll('.pf-player-seat')].map(s => {
        const av = s.querySelector('.pf-avatar,.player-avatar-premium,[class*="avatar"]') || s;
        const ab = R(av);
        return {
          pos: s.getAttribute('data-seat'),
          hero: !!s.querySelector('.pf-seat-hero-chip'),
          avatar: { w: +ab.w.toFixed(1), h: +ab.h.toFixed(1) },
          rho: +rho(ab).toFixed(3),
          seatRho: +rho(R(s)).toFixed(3),
        };
      });

      const sizeOf = sel => {
        const e = zone.querySelector(sel);
        if (!e) return null;
        const b = R(e);
        return { w: +b.w.toFixed(1), h: +b.h.toFixed(1) };
      };

      // Feuilles peintes → chevauchements
      const leaves = [];
      const push = (sel, kind) => zone.querySelectorAll(sel).forEach(e => {
        if (!painted(e)) return;
        const seat = e.closest('.pf-player-seat');
        leaves.push({ kind, owner: seat?.getAttribute('data-seat') || e.getAttribute('data-seat') || null, box: R(e) });
      });
      push('.pf-mt-nameplate', 'plaque');
      push('.pf-player-seat .card', 'cartes');
      push('.pf-avatar,.player-avatar-premium', 'avatar');
      push('.dealer-btn', 'boutonD');
      push('.pf-blind-anchor', 'blinde');
      push('.pf-seat-action-zone,.seat-bet-badge,[class*="seat-action-zone"]', 'mise');
      push('.mt-board-zone .card', 'board');
      push('.pf-pot-readout', 'pot');
      push('.seat-action-badge', 'badge');

      const overlaps = [];
      for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j];
        if (a.kind === b.kind && a.owner && a.owner === b.owner) continue;    // deux cartes du même joueur
        const area = inter(a.box, b.box);
        if (area < minArea) continue;
        const own = a.owner && a.owner === b.owner;
        const markers = ['boutonD', 'blinde', 'mise', 'pot', 'board'];
        // Exemption « même propriétaire » SEULEMENT si aucun des deux n'est un marqueur
        if (own && !markers.includes(a.kind) && !markers.includes(b.kind)) continue;
        overlaps.push({ cause: [a.kind, b.kind].sort().join('↔') + (own ? ' (propre)' : ''), area: Math.round(area), a: a.owner, b: b.owner });
      }

      const tile = zone.closest('.mt-zone-fit')?.parentElement || zone.parentElement;
      const acts = tile ? [...tile.querySelectorAll('.mtr-actions')].filter(painted) : [];
      const tileB = tile ? R(tile) : null;
      const zoneB = R(zone);

      const rhos = seats.filter(s => !s.hero).map(s => s.rho);
      const mean = rhos.reduce((a, b) => a + b, 0) / (rhos.length || 1);
      const sd = Math.sqrt(rhos.reduce((a, b) => a + (b - mean) ** 2, 0) / (rhos.length || 1));

      out.tables.push({
        i: ti,
        felt: { w: +fb.w.toFixed(1), h: +fb.h.toFixed(1) },
        tileH: tileB ? +tileB.h.toFixed(1) : null,
        zoneH: +zoneB.h.toFixed(1),
        actionsH: +acts.reduce((a, e) => a + R(e).h, 0).toFixed(1),
        actionsPct: tileB ? +(acts.reduce((a, e) => a + R(e).h, 0) / tileB.h * 100).toFixed(1) : null,
        ring: { mean: +mean.toFixed(3), sd: +sd.toFixed(3), min: +Math.min(...rhos).toFixed(3), max: +Math.max(...rhos).toFixed(3) },
        seats,
        sizes: {
          avatar: sizeOf('.pf-avatar,.player-avatar-premium'),
          dealer: sizeOf('.dealer-btn'),
          blind: sizeOf('.pf-blind-anchor'),
          bet: sizeOf('.pf-seat-action-zone,[class*="seat-action-zone"]'),
          boardCard: sizeOf('.mt-board-zone .card'),
          pot: sizeOf('.pf-pot-readout'),
          actionBtn: (() => { const t = zone.closest('.mt-zone-fit')?.parentElement; const b = t?.querySelector('.gto-btn,.ab'); return b ? { w: +R(b).w.toFixed(1), h: +R(b).h.toFixed(1) } : null; })(),
          sizingBtn: (() => { const t = zone.closest('.mt-zone-fit')?.parentElement; const b = t?.querySelector('.sizing-btn'); return b ? { w: +R(b).w.toFixed(1), h: +R(b).h.toFixed(1) } : null; })(),
        },
        overlapCount: overlaps.length,
        overlaps: overlaps.sort((a, b) => b.area - a.area).slice(0, 14),
      });
    });
    return out;
  }, MIN_AREA);

  if (SHOT) {
    const p = path.resolve(SHOT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: false });
    report.shot = p;
  }
  /* ── BALAYAGE (--n) ───────────────────────────────────────────────────────
     Un relevé unique ne dit rien : les spots sont tirés au hasard, la position
     du Hero et la street changent à chaque main. On rejoue donc N décisions et
     on agrège — écart-type de l'anneau, uniformité des tuiles, causes de
     chevauchement — en notant la position du Hero à chaque tirage pour vérifier
     que la géométrie ne dépend pas d'elle (§12). */
  if (N > 1) {
    const agg = { draws: 0, heroPositions: {}, streets: {}, ringSd: [], ringMin: [], ringMax: [], tileSpread: [], causes: {}, worstArea: 0, cleanDraws: 0 };
    const snap = async () => await page.evaluate((minArea) => {
      const R = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; };
      const painted = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      const inter = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; };
      const out = { tables: [] };
      document.querySelectorAll('.training-table-zone').forEach(zone => {
        const felt = zone.querySelector('.felt-oval'); if (!felt) return;
        const fb = R(felt), ell = { cx: fb.cx, cy: fb.cy, rx: fb.w / 2, ry: fb.h / 2 };
        const rho = p => Math.hypot((p.cx - ell.cx) / ell.rx, (p.cy - ell.cy) / ell.ry);
        const rhos = [], seats = [];
        let hero = null;
        zone.querySelectorAll('.pf-player-seat').forEach(s => {
          const av = s.querySelector('.pf-avatar-premium'); if (!av) return;
          const r = +rho(R(av)).toFixed(3);
          rhos.push(r); seats.push(r);
          if (s.querySelector('.pf-seat-hero-chip')) hero = s.getAttribute('data-seat');
        });
        const leaves = [];
        const push = (sel, kind) => zone.querySelectorAll(sel).forEach(e => { if (!painted(e)) return; const st = e.closest('.pf-player-seat'); leaves.push({ kind, owner: st?.getAttribute('data-seat') || e.getAttribute('data-seat') || null, box: R(e) }); });
        push('.pf-mt-nameplate', 'plaque'); push('.pf-player-seat .card', 'cartes');
        push('.pf-avatar-premium', 'avatar'); push('.dealer-btn', 'boutonD');
        push('.pf-blind-anchor', 'blinde'); push('.pf-seat-action-zone', 'mise');
        push('.mt-board-zone .card', 'board'); push('.pf-pot-readout', 'pot');
        push('.seat-action-badge', 'badge');
        const ovl = [];
        for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
          const a = leaves[i], b = leaves[j];
          if (a.kind === b.kind && a.owner && a.owner === b.owner) continue;
          const area = inter(a.box, b.box); if (area < minArea) continue;
          const own = a.owner && a.owner === b.owner;
          const markers = ['boutonD', 'blinde', 'mise', 'pot', 'board'];
          if (own && !markers.includes(a.kind) && !markers.includes(b.kind)) continue;
          ovl.push({ cause: [a.kind, b.kind].sort().join('↔'), area: Math.round(area) });
        }
        const m = rhos.reduce((x, y) => x + y, 0) / (rhos.length || 1);
        out.tables.push({
          hero, zoneH: +R(zone).h.toFixed(1),
          sd: +Math.sqrt(rhos.reduce((x, y) => x + (y - m) ** 2, 0) / (rhos.length || 1)).toFixed(3),
          min: +Math.min(...rhos).toFixed(3), max: +Math.max(...rhos).toFixed(3),
          street: zone.closest('.tw')?.querySelector('.mtr-street.cur')?.textContent || null,
          ovl,
        });
      });
      return out;
    }, MIN_AREA);

    const advance = () => page.evaluate(() => {
      const vis = s => [...document.querySelectorAll(s)].filter(x => x.getBoundingClientRect().width > 0);
      const b = vis('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"]').filter(x => !/Fold/i.test(x.textContent));
      const nx = vis('.gto-next-btn,button.btng');
      const t = b.length ? b[Math.floor(Math.random() * b.length)] : nx[0];
      if (t) { t.click(); return true; } return false;
    });

    for (let d = 0; d < N; d++) {
      const s = await snap();
      if (!s.tables.length) { await advance(); await sleep(1800); continue; }
      agg.draws++;
      const zh = s.tables.map(t => t.zoneH);
      agg.tileSpread.push(+(Math.max(...zh) - Math.min(...zh)).toFixed(1));
      let clean = true;
      for (const t of s.tables) {
        agg.ringSd.push(t.sd); agg.ringMin.push(t.min); agg.ringMax.push(t.max);
        if (t.hero) agg.heroPositions[t.hero] = (agg.heroPositions[t.hero] || 0) + 1;
        if (t.street) agg.streets[t.street.trim()] = (agg.streets[t.street.trim()] || 0) + 1;
        for (const o of t.ovl) { agg.causes[o.cause] = (agg.causes[o.cause] || 0) + 1; agg.worstArea = Math.max(agg.worstArea, o.area); clean = false; }
      }
      if (clean) agg.cleanDraws++;
      await advance(); await sleep(1700);
    }
    const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null;
    report.sweep = {
      draws: agg.draws, tablesMeasured: agg.ringSd.length,
      ringSdMoyen: avg(agg.ringSd), ringSdMax: Math.max(...agg.ringSd),
      rhoMin: Math.min(...agg.ringMin), rhoMax: Math.max(...agg.ringMax),
      ecartHauteurTuilesMax: Math.max(...agg.tileSpread),
      tiragesSansChevauchement: `${agg.cleanDraws}/${agg.draws}`,
      pireAire: agg.worstArea,
      causes: Object.fromEntries(Object.entries(agg.causes).sort((a, b) => b[1] - a[1])),
      positionsHero: agg.heroPositions, streets: agg.streets,
    };
  }

  if (!report.tables.length) {
    console.error('AUCUNE TABLE MESUREE.' + (pageErrors.length ? '\nErreurs de page :\n  ' + pageErrors.join('\n  ') : '\n(pas d erreur JS — la session n a peut-etre pas demarre)'));
    process.exitCode = 3;
  }
  console.log(JSON.stringify(report, null, 1));
} finally {
  await browser.close();
}
