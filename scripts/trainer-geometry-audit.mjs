#!/usr/bin/env node
/**
 * trainer-geometry-audit — la table du Trainer obéit-elle à sa propre géométrie ?
 *
 * L'audit « bet-anchor » mesure déjà le placement des TAS DE MISE. Celui-ci
 * mesure la GRAMMAIRE COMPLÈTE demandée par la mission de correction
 * géométrique : chaque objet posé sur le feutre appartient-il visiblement à son
 * joueur, et la ligne « joueur → cartes → mise → pot » est-elle lisible ?
 *
 * Ce qui est mesuré, et pourquoi ce critère-là :
 *
 *   §8/§9  ANNEAU     — ρ = rayon normalisé du centre d'avatar sur l'ellipse du
 *                       feutre. ρ ≈ 1 ⇒ l'avatar est SUR l'anneau doré. ρ < 1
 *                       ⇒ le joueur est « assis dans le tapis ».
 *   §4/§5  CARTES     — angle entre l'axe siège→pot et l'axe avatar→cartes. Un
 *                       joueur de flanc dont les cartes sont au-dessus de sa
 *                       tête rend 90° : c'est le défaut signalé sur le BB.
 *   §1/§2  MISES      — même angle pour le tas, plus la fraction parcourue vers
 *                       le pot et surtout le DÉGAGEMENT RÉEL au pot peint (pas
 *                       au pot nominal : c'est là que se cachait l'écart).
 *   §10    BOUTON D   — appartenance au BTN, et distance strictement inférieure
 *                       à celle de la mise du même joueur.
 *   §12    ROGNAGE    — tout élément dont la boîte sort d'un ancêtre qui coupe
 *                       (overflow hidden/clip). C'est la mesure du « jeton
 *                       coupé au préflop », impossible à voir sur une capture.
 *   §15    FANTÔMES   — nombre de jeux de cartes par siège. 0 ou 1, jamais 2.
 *   §18/19 RECOUVREMENTS — toutes les paires de feuilles peintes.
 *   §26/27 ZONES      — un tas sur le board ou sur le pot.
 *   §13    POT        — le nombre peint contre l'état du moteur publié au DOM.
 *   §14    SHOWDOWN   — cartes du Vilain visibles quand le coup est allé au bout.
 *
 * Prérequis : serveur de dev lancé (.claude/launch.json, port 7788).
 *
 *   node scripts/trainer-geometry-audit.mjs --tables=1T --struct=6J --n=10
 *   node scripts/trainer-geometry-audit.mjs --tables=4T --struct=9J --w=1366 --h=768
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const TABLES = arg('tables', '1T');
const STRUCT = arg('struct', '6J');
const W = +arg('w', 1366);
const H = +arg('h', 768);
const N = +arg('n', 10);
const OUT = arg('out', '');
const SHOT = arg('shot', '');
const MIN_AREA = +arg('minArea', 16);

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Relevé d'une page entière, dans UN seul frame : deux appels séparés
   mélangeraient deux états d'animation. */
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
  /* Angle entre deux vecteurs EN PIXELS. Le faire en pourcentages d'un
     conteneur non carré rendrait une direction qui n'existe pas à l'écran. */
  const angleBetween = (a, b) => {
    const la = Math.hypot(a.x, a.y) || 1, lb = Math.hypot(b.x, b.y) || 1;
    return deg(Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (la * lb)))));
  };
  /* §12 — un élément est ROGNÉ si un de ses ancêtres coupe et que sa boîte en
     dépasse. On remonte jusqu'au document : le clip peut venir de très haut. */
  const clippedBy = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return null;
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n);
      const coupe = /hidden|clip|scroll|auto/.test(s.overflow + s.overflowX + s.overflowY);
      if (coupe) {
        const p = n.getBoundingClientRect();
        const dehors = Math.max(0, p.x - b.x) + Math.max(0, b.x + b.width - (p.x + p.width))
                     + Math.max(0, p.y - b.y) + Math.max(0, b.y + b.height - (p.y + p.height));
        if (dehors > 1.5) {
          return {
            par: n.className && n.className.baseVal !== undefined ? String(n.className.baseVal) : String(n.className || n.tagName),
            overflow: s.overflow + '/' + s.overflowX + '/' + s.overflowY,
            debordePx: +dehors.toFixed(1),
            gauche: +Math.max(0, p.x - b.x).toFixed(1), droite: +Math.max(0, b.x + b.width - (p.x + p.width)).toFixed(1),
            haut: +Math.max(0, p.y - b.y).toFixed(1), bas: +Math.max(0, b.y + b.height - (p.y + p.height)).toFixed(1),
          };
        }
      }
      n = n.parentElement;
    }
    return null;
  };

  const zones = [...document.querySelectorAll('.training-table-zone, .t1-table-area')];
  const tables = [];

  zones.forEach((zone, i) => {
    const felt = zone.querySelector('.felt-oval');
    if (!felt) return;
    const fb = R(felt);
    const zb = R(zone);
    const potEl = zone.querySelector('.pf-pot-readout');
    const potBox = potEl && painted(potEl) ? R(potEl) : null;
    const pot = potBox || { cx: fb.cx, cy: fb.cy, w: 0, h: 0, x: fb.cx, y: fb.cy };
    const boardCards = [...zone.querySelectorAll('.mt-board-zone .card, .pf-board-zone .card')].filter(painted).map(R);
    const boardBox = boardCards.length ? {
      x: Math.min(...boardCards.map(b => b.x)), y: Math.min(...boardCards.map(b => b.y)),
      w: Math.max(...boardCards.map(b => b.x + b.w)) - Math.min(...boardCards.map(b => b.x)),
      h: Math.max(...boardCards.map(b => b.y + b.h)) - Math.min(...boardCards.map(b => b.y)),
    } : null;
    if (boardBox) { boardBox.cx = boardBox.x + boardBox.w / 2; boardBox.cy = boardBox.y + boardBox.h / 2; }

    /* ── SIÈGES ─────────────────────────────────────────────────────────── */
    const seats = {};
    const feuilles = [];   // boîtes peintes, pour le test de recouvrement
    zone.querySelectorAll('.pf-player-seat').forEach(s => {
      const pos = s.getAttribute('data-seat');
      if (!pos) return;
      const av = s.querySelector('.pf-avatar-premium,.player-avatar-premium,.pf-avatar');
      const holeWraps = [...s.querySelectorAll('.pf-hole-cards')].filter(painted);
      const cartes = [...s.querySelectorAll('.card')].filter(painted);
      const plaque = s.querySelector('.pf-seat-nameplate');
      const fold = s.querySelector('.pf-fold-chip,.pf-seat-fold-badge');
      seats[pos] = {
        box: R(av || s), seatBox: R(s),
        hero: !!s.querySelector('.pf-seat-hero-chip'),
        avatar: av && painted(av) ? R(av) : null,
        cartes: holeWraps.length ? R(holeWraps[0]) : null,
        /* §15 — un siège ne peut porter qu'UN jeu de cartes. On compte les
           conteneurs peints, pas les cartes : un jeu = un conteneur. */
        jeuxDeCartes: holeWraps.length,
        nbCartes: cartes.length,
        cartesFaceVisible: cartes.filter(c => !c.classList.contains('card-back')).length,
        plaque: plaque && painted(plaque) ? R(plaque) : null,
        foldBadge: fold && painted(fold) ? R(fold) : null,
        rogne: holeWraps.length ? clippedBy(holeWraps[0]) : null,
        rogneAvatar: av && painted(av) ? clippedBy(av) : null,
      };
      if (av && painted(av)) feuilles.push({ id: `${pos}:avatar`, ...R(av) });
      if (holeWraps.length) feuilles.push({ id: `${pos}:cartes`, ...R(holeWraps[0]) });
      if (plaque && painted(plaque)) feuilles.push({ id: `${pos}:plaque`, ...R(plaque) });
      if (fold && painted(fold)) feuilles.push({ id: `${pos}:fold`, ...R(fold) });
    });

    /* ── OBJETS DE TABLE ────────────────────────────────────────────────── */
    const mesureMarqueur = (el, type) => {
      const pos = el.getAttribute('data-seat');
      const seat = seats[pos];
      const b = R(el);
      const base = {
        type, pos, box: { w: +b.w.toFixed(1), h: +b.h.toFixed(1) },
        texte: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28),
        rogne: clippedBy(el),
      };
      if (!seat) return { ...base, orphelin: true };
      const vPot = { x: pot.cx - seat.box.cx, y: pot.cy - seat.box.cy };
      const vObj = { x: b.cx - seat.box.cx, y: b.cy - seat.box.cy };
      const D = Math.hypot(vPot.x, vPot.y) || 1;
      const d = Math.hypot(vObj.x, vObj.y);
      let dAutre = Infinity, voisin = null;
      Object.entries(seats).forEach(([p, s]) => {
        if (p === pos) return;
        const dd = Math.hypot(b.cx - s.box.cx, b.cy - s.box.cy);
        if (dd < dAutre) { dAutre = dd; voisin = p; }
      });
      /* §2 — DÉGAGEMENT AU POT PEINT. Le critère de la mission n'est pas « à
         quelle fraction du segment » mais « nettement plus près du joueur que
         du pot ». On mesure donc les deux bords : distance au CENTRE du pot et
         distance à sa BOÎTE (le pot n'est pas un point : en 1T il fait plus de
         200 px de large, et c'est ce bord-là que le tas vient toucher). */
      const dPotCentre = Math.hypot(pot.cx - b.cx, pot.cy - b.cy);
      const dxPot = Math.max(pot.x - (b.x + b.w), b.x - (pot.x + pot.w), 0);
      const dyPot = Math.max(pot.y - (b.y + b.h), b.y - (pot.y + pot.h), 0);
      const dPotBoite = Math.hypot(dxPot, dyPot);
      return {
        ...base,
        ecartAngleDeg: +angleBetween(vPot, vObj).toFixed(1),
        t: +((vPot.x * vObj.x + vPot.y * vObj.y) / (D * D)).toFixed(3),
        distanceJoueur: +d.toFixed(1), distanceAuPot: +D.toFixed(1),
        fractionVersPot: +(d / D).toFixed(3),
        dPotCentre: +dPotCentre.toFixed(1),
        /* 0 ⇒ le tas TOUCHE le bloc du pot : on ne distingue plus « ce que ce
           joueur a mis » de « ce qu'il y a au centre » (§27). */
        dPotBoite: +dPotBoite.toFixed(1),
        ratioAttribution: +(dAutre / (d || 1)).toFixed(2),
        voisinLePlusProche: voisin,
        surBoardPct: boardBox && b.w * b.h ? +(inter(b, boardBox) / (b.w * b.h) * 100).toFixed(1) : 0,
        surPotPct: potBox && b.w * b.h ? +(inter(b, potBox) / (b.w * b.h) * 100).toFixed(1) : 0,
      };
    };

    const bets = [...zone.querySelectorAll('.pf-seat-action-zone')].filter(painted).map(e => { feuilles.push({ id: `${e.getAttribute('data-seat')}:mise`, ...R(e) }); return mesureMarqueur(e, 'mise'); });
    const blinds = [...zone.querySelectorAll('.pf-blind-anchor')].filter(painted).map(e => { feuilles.push({ id: `${e.getAttribute('data-seat') || '?'}:blinde`, ...R(e) }); return mesureMarqueur(e, 'blinde'); });

    let dealer = null;
    const dealerEl = zone.querySelector('.dealer-btn');
    if (dealerEl && painted(dealerEl)) {
      const b = R(dealerEl);
      feuilles.push({ id: 'D:bouton', ...b });
      const owner = seats.BTN ? 'BTN' : (seats.SB ? 'SB' : Object.keys(seats)[0]);
      const oS = seats[owner];
      let dAutre = Infinity, plusProche = null;
      Object.entries(seats).forEach(([p, s]) => {
        const dd = Math.hypot(b.cx - s.box.cx, b.cy - s.box.cy);
        if (p !== owner && dd < dAutre) dAutre = dd;
        if (!plusProche || dd < plusProche.d) plusProche = { p, d: dd };
      });
      const dOwn = oS ? Math.hypot(b.cx - oS.box.cx, b.cy - oS.box.cy) : null;
      const miseOwner = bets.find(x => x.pos === owner);
      dealer = {
        proprietaire: owner, siegeLePlusProche: plusProche ? plusProche.p : null,
        distanceProprietaire: dOwn == null ? null : +dOwn.toFixed(1),
        ratioAttribution: dOwn ? +(dAutre / dOwn).toFixed(2) : null,
        /* §10 — le bouton doit rester PLUS PRÈS du joueur que sa mise, sinon il
           se lit comme un second marqueur d'action. */
        plusPresQueLaMise: miseOwner && dOwn != null ? dOwn < miseOwner.distanceJoueur : null,
        rogne: clippedBy(dealerEl),
        box: { w: +b.w.toFixed(1), h: +b.h.toFixed(1) },
      };
    }

    if (boardBox) feuilles.push({ id: 'board', ...boardBox });
    if (potBox) feuilles.push({ id: 'pot', ...potBox });

    /* ── SORTIE DE ZONE (§18/§19) ────────────────────────────────────────
       Un élément peut très bien n'être rogné par personne et se peindre quand
       même HORS de la table — sur le bandeau de street au-dessus, sur les
       boutons de décision en dessous. Le test de rognage ne le voit pas (aucun
       ancêtre ne coupe) ; celui-ci si. C'est la contrainte qui décide jusqu'où
       on peut repousser un siège vers l'anneau. */
    const horsZone = feuilles.map(f => {
      const d = {
        haut: +Math.max(0, zb.y - f.y).toFixed(1),
        bas: +Math.max(0, (f.y + f.h) - (zb.y + zb.h)).toFixed(1),
        gauche: +Math.max(0, zb.x - f.x).toFixed(1),
        droite: +Math.max(0, (f.x + f.w) - (zb.x + zb.w)).toFixed(1),
      };
      const total = d.haut + d.bas + d.gauche + d.droite;
      return total > 1.5 ? { quoi: f.id, ...d, total: +total.toFixed(1) } : null;
    }).filter(Boolean);

    /* §18/§19 — toutes les paires. On ignore les paires d'un MÊME siège
       (avatar/plaque/cartes se touchent par construction : c'est un bloc). */
    const recouvrements = [];
    for (let a = 0; a < feuilles.length; a++) for (let b = a + 1; b < feuilles.length; b++) {
      const A = feuilles[a], B = feuilles[b];
      const sa = A.id.split(':')[0], sb = B.id.split(':')[0];
      if (sa === sb) continue;
      const s = inter(A, B);
      if (s > minArea) recouvrements.push({ a: A.id, b: B.id, px2: Math.round(s) });
    }

    /* §8/§9 — position radiale des avatars sur l'ellipse du feutre. */
    const anneau = Object.fromEntries(Object.entries(seats).map(([p, s]) => [p, +Math.hypot(
      (s.box.cx - fb.cx) / (fb.w / 2), (s.box.cy - fb.cy) / (fb.h / 2)).toFixed(3)]));

    /* §4/§5 — radialité des CARTES. La référence est le CENTRE DU FEUTRE, pas
       le pot : le §5 l'écrit ainsi (« directionToCenter = tableCenter −
       seatCenter »), et pour une bonne raison. Le pot se déplace d'une street à
       l'autre ; mesurer contre lui rendrait une grappe « non radiale » au
       préflop et « radiale » au flop sans que rien n'ait bougé. Mesuré, la
       confusion coûtait jusqu'à 98.8° sur un siège pourtant correctement
       orienté. Le pot reste la référence des MISES (§1/§2), et lui seul.
       0° ⇒ les cartes sont entre le joueur et le centre. */
    const cartes = Object.entries(seats).filter(([, s]) => s.cartes).map(([p, s]) => {
      const vPot = { x: fb.cx - s.box.cx, y: fb.cy - s.box.cy };
      const vC = { x: s.cartes.cx - s.box.cx, y: s.cartes.cy - s.box.cy };
      return {
        pos: p, hero: s.hero,
        ecartAngleDeg: +angleBetween(vPot, vC).toFixed(1),
        distance: +Math.hypot(vC.x, vC.y).toFixed(1),
        /* Négatif ⇒ les cartes sont du côté OPPOSÉ au centre : le joueur est
           entre ses cartes et le board. */
        versLeCentre: +((vPot.x * vC.x + vPot.y * vC.y) / (Math.hypot(vPot.x, vPot.y) || 1)).toFixed(1),
        rogne: s.rogne,
      };
    });

    const tailles = {
      avatar: (() => { const s = Object.values(seats).find(x => x.avatar && !x.hero); return s ? { w: +s.avatar.w.toFixed(1), h: +s.avatar.h.toFixed(1) } : null; })(),
      avatarHero: (() => { const s = Object.values(seats).find(x => x.avatar && x.hero); return s ? { w: +s.avatar.w.toFixed(1), h: +s.avatar.h.toFixed(1) } : null; })(),
      pot: potBox ? { w: +potBox.w.toFixed(1), h: +potBox.h.toFixed(1) } : null,
      board: boardBox ? { w: +boardBox.w.toFixed(1), h: +boardBox.h.toFixed(1) } : null,
    };

    tables.push({
      i,
      felt: { w: +fb.w.toFixed(1), h: +fb.h.toFixed(1), ar: +(fb.w / fb.h).toFixed(3) },
      zone: { w: +zb.w.toFixed(1), h: +zb.h.toFixed(1) },
      /* §7/§23 — la taille des avatars doit être une FRACTION de la table, pas
         un nombre de pixels. On publie la fraction pour pouvoir la comparer
         d'un mode à l'autre. */
      avatarSurFeutre: tailles.avatar ? +(tailles.avatar.w / fb.w).toFixed(4) : null,
      potSurFeutre: tailles.pot ? +(tailles.pot.w / fb.w).toFixed(4) : null,
      anneau, cartes, bets, blinds, dealer, recouvrements, tailles, horsZone,
      potTexte: potEl ? (potEl.textContent || '').trim().replace(/\s+/g, ' ') : null,
      /* §13 — l'état du moteur, publié au DOM par la table elle-même. Sans lui
         on compare un nombre peint à… rien. */
      etatMoteur: (() => { try { return JSON.parse(zone.getAttribute('data-pf-live') || zone.getAttribute('data-pf-spot') || 'null'); } catch (e) { return null; } })(),
      /* §14 — le coup est-il allé au bout, et voit-on la main du Vilain ? */
      showdown: (() => {
        const bilan = zone.closest('.mt-slot, body') || document.body;
        const txt = (bilan.textContent || '');
        const alBout = /MAIN (GAGN|PERD)|Pot disput|showdown/i.test(txt);
        const vilains = Object.entries(seats).filter(([, s]) => !s.hero && s.jeuxDeCartes > 0);
        return {
          coupTermine: alBout,
          vilainsAvecCartes: vilains.length,
          vilainsFaceVisible: vilains.filter(([, s]) => s.cartesFaceVisible > 0).length,
        };
      })(),
      /* §15 — sièges portant plus d'un jeu de cartes. */
      cartesDupliquees: Object.entries(seats).filter(([, s]) => s.jeuxDeCartes > 1).map(([p, s]) => ({ pos: p, jeux: s.jeuxDeCartes, cartes: s.nbCartes })),
      rognages: [
        ...Object.entries(seats).filter(([, s]) => s.rogne).map(([p, s]) => ({ quoi: `${p}:cartes`, ...s.rogne })),
        ...Object.entries(seats).filter(([, s]) => s.rogneAvatar).map(([p, s]) => ({ quoi: `${p}:avatar`, ...s.rogneAvatar })),
        ...bets.filter(b => b.rogne).map(b => ({ quoi: `${b.pos}:mise`, ...b.rogne })),
        ...blinds.filter(b => b.rogne).map(b => ({ quoi: `${b.pos}:blinde`, ...b.rogne })),
        ...(dealer && dealer.rogne ? [{ quoi: 'D:bouton', ...dealer.rogne }] : []),
      ],
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

  /* L'application rouvre l'onglet où l'utilisateur l'avait laissée — souvent
     SharkSolver, dont le montage n'est pas instantané. Attendre une durée fixe
     après le clic faisait rater TOUTE la séquence en silence : les clics
     suivants ne trouvaient pas leur bouton, la session ne démarrait pas, et le
     script rendait « AUCUN RELEVE » sans dire pourquoi. On attend donc l'écran,
     pas le chronomètre. */
  await click('Entraineur GTO');
  let pret = false;
  for (let i = 0; i < 40; i++) {
    pret = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')));
    if (pret) break;
    await sleep(300);
  }
  if (!pret) { console.error("L'onglet Entraineur ne s'est pas monté (bouton « Lancer la session » absent)."); process.exit(4); }
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
    if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break;
    await sleep(400);
  }
  await sleep(1200);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });

  const advance = (preferNext) => page.evaluate((next) => {
    const vis = s => [...document.querySelectorAll(s)].filter(x => x.getBoundingClientRect().width > 0);
    const b = vis('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"]').filter(x => !/Fold/i.test(x.textContent));
    const nx = [...new Set([
      ...vis('.gto-next-btn,button.btng,.pf-p2-next'),
      ...vis('button').filter(x => /suivant|suivante|résultat|resultat|tables suivantes/i.test(x.textContent || '') && !x.disabled),
    ])];
    const t = next ? (nx[0] || b[Math.floor(Math.random() * b.length)])
                   : (b.length ? b[Math.floor(Math.random() * b.length)] : nx[0]);
    if (t) { t.click(); return true; } return false;
  }, !!preferNext);

  const draws = [];
  for (let d = 0; d < N; d++) {
    const snap = await page.evaluate(PROBE, MIN_AREA);
    if (snap.tables.length) draws.push(snap);
    await advance(d % 2 === 1); await sleep(1500);
  }
  if (SHOT) { const p = path.resolve(SHOT); fs.mkdirSync(path.dirname(p), { recursive: true }); await page.screenshot({ path: p }); }

  const T = draws.flatMap(d => d.tables);
  const num = a => a.filter(x => typeof x === 'number' && isFinite(x));
  const stat = a => { const v = num(a); if (!v.length) return null; const m = v.reduce((x, y) => x + y, 0) / v.length; return { moy: +m.toFixed(2), min: +Math.min(...v).toFixed(2), max: +Math.max(...v).toFixed(2), n: v.length }; };
  const allBets = T.flatMap(t => t.bets).filter(b => !b.orphelin);
  const allCartes = T.flatMap(t => t.cartes);

  const summary = {
    mode: TABLES, struct: STRUCT, viewport: `${W}x${H}`, tirages: draws.length, tables: T.length,

    /* §8/§9 */
    anneauRho: stat(T.flatMap(t => Object.values(t.anneau))),
    siegesHorsAnneau: (() => {
      const m = {};
      T.forEach(t => Object.entries(t.anneau).forEach(([p, r]) => { if (Math.abs(r - 1) > 0.18) (m[p] = m[p] || []).push(r); }));
      return Object.fromEntries(Object.entries(m).map(([p, v]) => [p, { n: v.length, rhoMoy: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) }]));
    })(),

    /* §7/§23 */
    avatarSurFeutre: stat(T.map(t => t.avatarSurFeutre)),
    potSurFeutre: stat(T.map(t => t.potSurFeutre)),
    tailles: T.length ? T[T.length - 1].tailles : null,

    /* §4/§5 */
    cartesEcartAngle: stat(allCartes.map(c => c.ecartAngleDeg)),
    cartesHorsAxe35: allCartes.filter(c => c.ecartAngleDeg > 35).length,
    cartesDuMauvaisCote: allCartes.filter(c => c.versLeCentre < 0).length,
    cartesParSiege: (() => {
      const m = {};
      allCartes.forEach(c => { (m[c.pos] = m[c.pos] || []).push(c.ecartAngleDeg); });
      return Object.fromEntries(Object.entries(m).map(([p, v]) => [p, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)]));
    })(),

    /* §1/§2/§26/§27 */
    misesMesurees: allBets.length,
    miseEcartAngle: stat(allBets.map(b => b.ecartAngleDeg)),
    misesHorsAxe35: allBets.filter(b => b.ecartAngleDeg > 35).length,
    miseFractionVersPot: stat(allBets.map(b => b.fractionVersPot)),
    miseDegagementPotPx: stat(allBets.map(b => b.dPotBoite)),
    misesCollesAuPot: allBets.filter(b => b.dPotBoite < 12).map(b => ({ pos: b.pos, d: b.dPotBoite, txt: b.texte })),
    misesSurBoard: allBets.filter(b => b.surBoardPct > 2).map(b => ({ pos: b.pos, pct: b.surBoardPct })),
    misesSurPot: allBets.filter(b => b.surPotPct > 2).map(b => ({ pos: b.pos, pct: b.surPotPct })),
    attribution: stat(allBets.map(b => b.ratioAttribution)),
    misesAmbigues: allBets.filter(b => b.ratioAttribution < 1.2).map(b => ({ pos: b.pos, vers: b.voisinLePlusProche, ratio: b.ratioAttribution })),

    /* §10 */
    boutonD: (() => {
      const ds = T.map(t => t.dealer).filter(Boolean);
      return {
        attribution: stat(ds.map(d => d.ratioAttribution)),
        malAttribue: ds.filter(d => d.siegeLePlusProche !== d.proprietaire).length,
        plusLoinQueLaMise: ds.filter(d => d.plusPresQueLaMise === false).length,
        distance: stat(ds.map(d => d.distanceProprietaire)),
      };
    })(),

    /* §11 */
    blindes: {
      n: T.flatMap(t => t.blinds).length,
      ecartAngle: stat(T.flatMap(t => t.blinds).map(b => b.ecartAngleDeg)),
      orphelines: T.flatMap(t => t.blinds).filter(b => b.orphelin).length,
    },

    /* §12 */
    rognages: (() => {
      const r = T.flatMap(t => t.rognages);
      const m = {};
      r.forEach(x => { const k = `${x.quoi} ⊂ ${x.par}`.slice(0, 90); m[k] = (m[k] || 0) + 1; });
      return { total: r.length, parCas: m, exemples: r.slice(0, 5) };
    })(),

    /* §15 */
    cartesDupliquees: T.flatMap(t => t.cartesDupliquees),

    /* §18/§19 — sortie de zone */
    horsZone: (() => {
      const h = T.flatMap(t => t.horsZone);
      const m = {};
      h.forEach(x => { m[x.quoi] = Math.max(m[x.quoi] || 0, x.total); });
      return { total: h.length, pireParElement: m };
    })(),

    /* §18/§19 */
    recouvrements: (() => {
      const r = T.flatMap(t => t.recouvrements);
      const m = {};
      r.forEach(x => { const k = `${x.a.split(':')[1] || x.a} ↔ ${x.b.split(':')[1] || x.b}`; m[k] = (m[k] || 0) + 1; });
      return { total: r.length, tablesTouchees: T.filter(t => t.recouvrements.length).length, parType: m, exemples: r.slice(0, 8) };
    })(),

    /* §13 */
    pot: (() => {
      const lus = T.map(t => {
        const m = String(t.potTexte || '').match(/(\d+(?:[.,]\d+)?)\s*bb/i);
        return { peint: m ? parseFloat(m[1].replace(',', '.')) : null, moteur: t.etatMoteur };
      });
      return {
        potsNuls: lus.filter(x => x.peint === 0).length,
        exemplesNuls: lus.filter(x => x.peint === 0).slice(0, 3).map(x => x.moteur),
      };
    })(),

    /* §14 */
    showdown: (() => {
      const s = T.map(t => t.showdown).filter(x => x.coupTermine);
      return { coupsTermines: s.length, sansCarteVilainVisible: s.filter(x => x.vilainsAvecCartes > 0 && x.vilainsFaceVisible === 0).length };
    })(),

    erreursPage: pageErrors,
  };

  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(path.resolve(OUT), JSON.stringify({ summary, draws }, null, 1)); }
  console.log(JSON.stringify(summary, null, 1));
  if (!draws.length) { console.error('AUCUN RELEVE.' + (pageErrors.length ? '\n' + pageErrors.join('\n') : '')); process.exitCode = 3; }
} finally {
  await browser.close();
}
