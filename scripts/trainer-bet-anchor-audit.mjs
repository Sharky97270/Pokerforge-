#!/usr/bin/env node
/**
 * trainer-bet-anchor-audit — la table du Trainer se lit-elle en deux secondes ?
 *
 * Mesure, pour CHAQUE table montée (1T comme mosaïque), les invariants dont
 * dépend la « grammaire visuelle » du poker (mission cinématique des mises) :
 *
 *   1. RATIO — le feutre garde-t-il la proportion de la table 1T ?
 *      Un ovale qui devient rond en 2T déplace tout : sièges, angles, distances
 *      vers le pot. On sort `ar = largeur/hauteur` par table.
 *
 *   2. RADIALITÉ — chaque tas de mise est-il entre SON joueur et le pot ?
 *      Écart angulaire entre le vecteur siège→pot et le vecteur siège→mise.
 *      Au-delà de ~35° la mise n'est plus « devant » le joueur.
 *
 *   3. PROGRESSION — la mise est-elle strictement entre les deux ?
 *      `t` = projection normalisée sur le segment siège→pot. On veut 0 < t < 1,
 *      et surtout un t COMPARABLE d'un siège à l'autre : c'est la dispersion,
 *      pas la valeur, qui rend une table illisible.
 *
 *   4. ATTRIBUTION — peut-on rattacher un tas à son joueur sans hésiter ?
 *      Distance du tas à SON siège vs au siège le plus proche AUTRE.
 *      Ratio < 1 ⇒ ambigu (§43).
 *
 *   5. LISIBILITÉ — taille en px du montant, des cartes du Hero et du board.
 *      §36 : le MONTANT prime sur le dessin du jeton. §21 : les décorations se
 *      réduisent avant les informations poker.
 *
 *   6. ZONES INTERDITES — un tas, un bouton D ou une blinde dans le board.
 *
 * Prérequis : serveur de dev lancé (.claude/launch.json, port 7788).
 *
 *   node scripts/trainer-bet-anchor-audit.mjs --tables=4T --n=6
 *   node scripts/trainer-bet-anchor-audit.mjs --tables=1T --fh --n=8 --out=x.json
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const TABLES = arg('tables', '4T');
const STRUCT = arg('struct', '6J');
const W = +arg('w', 1600);
const H = +arg('h', 950);
const N = +arg('n', 6);
const OUT = arg('out', '');
const SHOT = arg('shot', '');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Relevé d'UNE table. Volontairement tout en une seule fonction évaluée dans la
   page : les rectangles doivent être lus dans le même frame, sinon une
   transition en cours mélange deux états. */
const PROBE = (minArea) => {
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
  const deg = r => r * 180 / Math.PI;

  const zones = [...document.querySelectorAll('.training-table-zone, .t1-table-area')];
  const tables = [];

  zones.forEach((zone, i) => {
    const felt = zone.querySelector('.felt-oval');
    if (!felt) return;
    const fb = R(felt);
    // Centre du POT : c'est LUI la cible visuelle, pas le centre géométrique.
    const potEl = zone.querySelector('.pf-pot-readout');
    const pot = potEl && painted(potEl) ? R(potEl) : { cx: fb.cx, cy: fb.cy, w: 0, h: 0, x: fb.cx, y: fb.cy };
    const board = [...zone.querySelectorAll('.mt-board-zone .card, .pf-board-zone .card')].filter(painted).map(R);
    const boardBox = board.length ? {
      x: Math.min(...board.map(b => b.x)), y: Math.min(...board.map(b => b.y)),
      w: Math.max(...board.map(b => b.x + b.w)) - Math.min(...board.map(b => b.x)),
      h: Math.max(...board.map(b => b.y + b.h)) - Math.min(...board.map(b => b.y)),
    } : null;

    // Sièges : centre de l'AVATAR (le seul point stable du bloc).
    const seats = {};
    zone.querySelectorAll('.pf-player-seat').forEach(s => {
      const pos = s.getAttribute('data-seat');
      const av = s.querySelector('.pf-avatar-premium,.player-avatar-premium,.pf-avatar');
      if (!pos) return;
      seats[pos] = { box: R(av || s), hero: !!s.querySelector('.pf-seat-hero-chip') };
    });

    // Tas de mise : chaque .pf-seat-action-zone porte data-seat.
    const bets = [];
    zone.querySelectorAll('.pf-seat-action-zone').forEach(e => {
      if (!painted(e)) return;
      const pos = e.getAttribute('data-seat');
      const seat = seats[pos];
      if (!seat) { bets.push({ pos, orphan: true }); return; }
      const b = R(e);
      const vp = { x: pot.cx - seat.box.cx, y: pot.cy - seat.box.cy };
      const vb = { x: b.cx - seat.box.cx, y: b.cy - seat.box.cy };
      const lp = Math.hypot(vp.x, vp.y) || 1;
      const lb = Math.hypot(vb.x, vb.y) || 1;
      const cos = Math.max(-1, Math.min(1, (vp.x * vb.x + vp.y * vb.y) / (lp * lb)));
      const t = (vp.x * vb.x + vp.y * vb.y) / (lp * lp);
      const dOwn = Math.hypot(b.cx - seat.box.cx, b.cy - seat.box.cy);
      let dOther = Infinity, nearest = null;
      Object.entries(seats).forEach(([p, s]) => {
        if (p === pos) return;
        const d = Math.hypot(b.cx - s.box.cx, b.cy - s.box.cy);
        if (d < dOther) { dOther = d; nearest = p; }
      });
      const amountEl = e.querySelector('[class*="amount"],[class*="value"]');
      const fsz = amountEl ? +getComputedStyle(amountEl).fontSize.replace('px', '') : null;
      bets.push({
        pos, hero: seat.hero,
        box: { w: +b.w.toFixed(1), h: +b.h.toFixed(1) },
        text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
        ecartAngleDeg: +deg(Math.acos(cos)).toFixed(1),
        t: +t.toFixed(3),
        dOwn: +dOwn.toFixed(1),
        dAutre: +dOther.toFixed(1),
        plusProcheAutre: nearest,
        ratioAttribution: +(dOther / (dOwn || 1)).toFixed(2),
        surBoard: boardBox ? inter(b, boardBox) > minArea : false,
        montantPx: fsz,
      });
    });

    const blinds = [...zone.querySelectorAll('.pf-blind-anchor')].filter(painted).map(e => {
      const b = R(e);
      return { box: { w: +b.w.toFixed(1), h: +b.h.toFixed(1) }, surBoard: boardBox ? inter(b, boardBox) > minArea : false, text: (e.textContent || '').trim().slice(0, 14) };
    });
    const dealerEl = zone.querySelector('.dealer-btn');
    let dealer = null;
    if (dealerEl && painted(dealerEl)) {
      const b = R(dealerEl);
      let best = null, bd = Infinity;
      Object.entries(seats).forEach(([p, s]) => { const d = Math.hypot(b.cx - s.box.cx, b.cy - s.box.cy); if (d < bd) { bd = d; best = p; } });
      // Le bouton APPARTIENT au BTN (à la SB en heads-up) : la question n'est pas
      // « de quel siège est-il le plus proche » mais « est-il sans ambiguïté chez
      // le sien ». Même test d'attribution que pour les mises.
      const owner = seats.BTN ? 'BTN' : 'SB';
      const oS = seats[owner];
      const dOwn = oS ? Math.hypot(b.cx - oS.box.cx, b.cy - oS.box.cy) : null;
      let dOther = Infinity;
      Object.entries(seats).forEach(([p, s]) => { if (p === owner) return; const d = Math.hypot(b.cx - s.box.cx, b.cy - s.box.cy); if (d < dOther) dOther = d; });
      dealer = {
        box: { w: +b.w.toFixed(1), h: +b.h.toFixed(1) },
        proprietaire: owner, siegeLePlusProche: best,
        distanceProprietaire: dOwn == null ? null : +dOwn.toFixed(1),
        ratioAttribution: dOwn ? +(dOther / dOwn).toFixed(2) : null,
        rho: +Math.hypot((b.cx - fb.cx) / (fb.w / 2), (b.cy - fb.cy) / (fb.h / 2)).toFixed(3),
        surBoard: boardBox ? inter(b, boardBox) > minArea : false,
      };
    }

    const sz = sel => { const e = zone.querySelector(sel); if (!e || !painted(e)) return null; const b = R(e); return { w: +b.w.toFixed(1), h: +b.h.toFixed(1) }; };
    const heroSeat = [...zone.querySelectorAll('.pf-player-seat')].find(s => s.querySelector('.pf-seat-hero-chip'));
    const heroCard = heroSeat ? [...heroSeat.querySelectorAll('.card')].filter(painted)[0] : null;

    // Boîtes exprimées en % de la ZONE : c'est le repère dans lequel le code
    // place ses ancres. Sans ça, impossible de confronter la zone d'exclusion
    // calculée à l'encombrement réellement peint.
    const zb = R(zone);
    const pct = b => b ? {
      xMin: +((b.x - zb.x) / zb.w * 100).toFixed(1), xMax: +((b.x + b.w - zb.x) / zb.w * 100).toFixed(1),
      yMin: +((b.y - zb.y) / zb.h * 100).toFixed(1), yMax: +((b.y + b.h - zb.y) / zb.h * 100).toFixed(1),
    } : null;

    tables.push({
      i,
      felt: { w: +fb.w.toFixed(1), h: +fb.h.toFixed(1), ar: +(fb.w / fb.h).toFixed(3) },
      zone: { w: +zb.w.toFixed(1), h: +zb.h.toFixed(1) },
      boardPct: pct(boardBox),
      potPct: potEl && painted(potEl) ? pct({ x: pot.x, y: pot.y, w: pot.w, h: pot.h }) : null,
      betsPct: [...zone.querySelectorAll('.pf-seat-action-zone')].filter(painted).map(e => ({ pos: e.getAttribute('data-seat'), ...pct(R(e)) })),
      seatsPct: Object.fromEntries(Object.entries(seats).map(([p, s]) => [p, { x: +((s.box.cx - zb.x) / zb.w * 100).toFixed(1), y: +((s.box.cy - zb.y) / zb.h * 100).toFixed(1) }])),
      potTexte: potEl ? (potEl.textContent || '').trim().replace(/\s+/g, ' ') : null,
      potDecentre: { dx: +(pot.cx - fb.cx).toFixed(1), dy: +(pot.cy - fb.cy).toFixed(1) },
      /* ── §3/§37 — LE POT EST-IL RECONSTRUCTIBLE DEPUIS LA TABLE ? ────────
         C'est le critère d'acceptation que la mission se donne : « on doit
         pouvoir reconstruire 0.5 + 1 + 2.5 = 4bb simplement en regardant la
         table ». Au PRÉFLOP il est vérifiable sans rien savoir de l'historique :
         tout ce qui est dans le pot y a été mis sur cette street, donc

             pot peint == somme des montants peints (mises + blindes)

         Postflop la somme des streets précédentes est déjà au centre et n'est
         plus attribuable à personne : l'égalité ne tient plus, on ne la teste
         pas. Le défaut de la vidéo était justement préflop (« POT 12bb » sans
         l'open de Hero dessiné nulle part). */
      reconstruction: (() => {
        const lire = t => {
          const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*bb/i);
          return m ? parseFloat(m[1].replace(',', '.')) : null;
        };
        if (boardBox) return { applicable: false, raison: 'postflop' };
        const potVal = potEl && painted(potEl) ? lire(potEl.textContent) : null;
        if (potVal == null) return { applicable: false, raison: 'pot illisible' };
        const parts = [];
        zone.querySelectorAll('.pf-seat-action-zone').forEach(e => { if (painted(e)) parts.push({ q: 'mise', pos: e.getAttribute('data-seat'), v: lire(e.textContent) }); });
        zone.querySelectorAll('.pf-blind-anchor').forEach(e => { if (painted(e)) parts.push({ q: 'blinde', pos: null, v: lire(e.textContent) }); });
        const connus = parts.filter(p => p.v != null);
        const somme = Math.round(connus.reduce((a, p) => a + p.v, 0) * 100) / 100;
        return {
          applicable: true,
          pot: potVal, somme,
          ecart: Math.round((potVal - somme) * 100) / 100,
          parts: connus.map(p => `${p.q}${p.pos ? ':' + p.pos : ''}=${p.v}`),
          illisibles: parts.length - connus.length,
        };
      })(),
      /* Écarts VERTICAUX du couloir central. C'est là que se joue la lisibilité
         d'une table de poker : pot, board et main du Hero se disputent la même
         colonne, et un écart négatif veut dire « une carte en cache une autre ». */
      couloir: (() => {
        const heroCards = heroSeat ? [...heroSeat.querySelectorAll('.card')].filter(painted).map(R) : [];
        const heroTop = heroCards.length ? Math.min(...heroCards.map(c => c.y)) : null;
        const potB = potEl && painted(potEl) ? R(potEl) : null;
        return {
          potBoard: (potB && boardBox) ? +(boardBox.y - (potB.y + potB.h)).toFixed(1) : null,
          boardCartesHero: (boardBox && heroTop != null) ? +(heroTop - (boardBox.y + boardBox.h)).toFixed(1) : null,
          feutreBasBlocHero: heroSeat ? +(fb.y + fb.h - (R(heroSeat).y + R(heroSeat).h)).toFixed(1) : null,
        };
      })(),
      tailles: {
        carteHero: heroCard ? { w: +R(heroCard).w.toFixed(1), h: +R(heroCard).h.toFixed(1) } : null,
        carteBoard: sz('.mt-board-zone .card, .pf-board-zone .card'),
        carteVilain: sz('.pf-player-seat .card'),
        avatar: sz('.pf-avatar-premium,.player-avatar-premium'),
        boutonD: dealer ? dealer.box : null,
        potBloc: potEl ? { w: +pot.w.toFixed(1), h: +pot.h.toFixed(1) } : null,
      },
      bets, blinds, dealer,
    });
  });
  return { viewport: { w: innerWidth, h: innerHeight }, tables };
};

const browser = await puppeteer.launch({
  executablePath, headless: 'new',
  args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const click = (txt, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')].find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; } return false;
  }, txt, exact);

  await click('Entraineur GTO'); await sleep(900);
  await click(TABLES); await sleep(200);
  await click(STRUCT); await sleep(300);
  if (flag('fh')) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,span')].find(e => e.children.length === 0 && /^..?\s*Full Hand$/i.test(e.textContent.trim()));
      let n = el; for (let i = 0; i < 4 && n; i++) { n.click && n.click(); n = n.parentElement; }
    });
    await sleep(300);
  }
  await click('Lancer la session', false);
  for (let i = 0; i < 60; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.felt-oval').length);
    if (n > 0) break;
    await sleep(400);
  }
  await sleep(1200);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });

  const advance = () => page.evaluate(() => {
    const vis = s => [...document.querySelectorAll(s)].filter(x => x.getBoundingClientRect().width > 0);
    const b = vis('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"]').filter(x => !/Fold/i.test(x.textContent));
    const nx = vis('.gto-next-btn,button.btng');
    const t = b.length ? b[Math.floor(Math.random() * b.length)] : nx[0];
    if (t) { t.click(); return true; } return false;
  });

  const draws = [];
  for (let d = 0; d < N; d++) {
    const snap = await page.evaluate(PROBE, 16);
    if (snap.tables.length) draws.push(snap);
    await advance(); await sleep(1600);
  }

  if (SHOT) {
    const p = path.resolve(SHOT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p });
  }

  const allBets = draws.flatMap(d => d.tables.flatMap(t => t.bets)).filter(b => !b.orphan);
  const ars = draws.flatMap(d => d.tables.map(t => t.felt.ar));
  const num = a => a.filter(x => typeof x === 'number' && isFinite(x));
  const stat = a => { const v = num(a); if (!v.length) return null; const m = v.reduce((x, y) => x + y, 0) / v.length; return { moy: +m.toFixed(3), min: +Math.min(...v).toFixed(3), max: +Math.max(...v).toFixed(3), et: +Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length).toFixed(3) }; };

  const summary = {
    mode: TABLES, struct: STRUCT, viewport: `${W}x${H}`, tirages: draws.length,
    misesMesurees: allBets.length,
    ratioFeutre: stat(ars),
    ecartAngleDeg: stat(allBets.map(b => b.ecartAngleDeg)),
    misesHorsAxe35: allBets.filter(b => b.ecartAngleDeg > 35).length,
    progressionT: stat(allBets.map(b => b.t)),
    misesHorsSegment: allBets.filter(b => b.t <= 0 || b.t >= 1).length,
    attribution: stat(allBets.map(b => b.ratioAttribution)),
    misesAmbigues: allBets.filter(b => b.ratioAttribution < 1).map(b => ({ pos: b.pos, vers: b.plusProcheAutre, ratio: b.ratioAttribution })),
    misesSurBoard: allBets.filter(b => b.surBoard).length,
    reconstruction: (() => {
      const rs = draws.flatMap(d => d.tables.map(t => t.reconstruction)).filter(r => r && r.applicable);
      const faux = rs.filter(r => Math.abs(r.ecart) > 0.011);
      return {
        tablesPreflopTestees: rs.length,
        potReconstructible: `${rs.length - faux.length}/${rs.length}`,
        // Un écart POSITIF = il manque des jetons sur la table pour expliquer le
        // pot ; c'est le défaut de la vidéo. Un écart négatif = on peint plus que
        // le pot ne contient, ce qui est pire encore.
        ecarts: faux.slice(0, 8).map(r => ({ pot: r.pot, somme: r.somme, ecart: r.ecart, parts: r.parts })),
      };
    })(),
    montantPx: stat(allBets.map(b => b.montantPx)),
    boutonDattribution: stat(draws.flatMap(d => d.tables.map(t => t.dealer && t.dealer.ratioAttribution)).filter(v => v != null)),
    boutonDambigu: draws.flatMap(d => d.tables.map(t => t.dealer)).filter(x => x && x.ratioAttribution != null && x.ratioAttribution < 1.2).length,
    tailles: draws.length ? draws[draws.length - 1].tables[0].tailles : null,
    couloir: {
      potBoard: stat(draws.flatMap(d => d.tables.map(t => t.couloir && t.couloir.potBoard))),
      boardCartesHero: stat(draws.flatMap(d => d.tables.map(t => t.couloir && t.couloir.boardCartesHero))),
      feutreBasBlocHero: stat(draws.flatMap(d => d.tables.map(t => t.couloir && t.couloir.feutreBasBlocHero))),
    },
    feutre: draws.length ? draws[draws.length - 1].tables.map(t => t.felt) : null,
    boutonD: draws.flatMap(d => d.tables.map(t => t.dealer)).filter(Boolean).slice(0, 4),
    erreursPage: pageErrors,
  };
  const report = { summary, draws };
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 1)); }
  console.log(JSON.stringify(summary, null, 1));
  if (!draws.length) { console.error('AUCUN RELEVE.' + (pageErrors.length ? '\n' + pageErrors.join('\n') : '')); process.exitCode = 3; }
} finally {
  await browser.close();
}
