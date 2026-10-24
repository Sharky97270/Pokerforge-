#!/usr/bin/env node
/**
 * trainer-1t-stabilite-audit — LA TABLE 1T NE BOUGE PAS, ET LES JETONS NE
 * S'INSTALLENT PAS SUR LES CARTES
 *
 * Deux défauts mesurés à l'écran que rien ne surveillait :
 *
 *  1. LA ZONE DE TABLE CHANGE DE HAUTEUR EN PLEINE MAIN.
 *     Le bandeau d'actions réclame ~219 px tant qu'Hero doit parler, puis
 *     retombe sur son plancher dès qu'il a répondu. La zone de table, élastique,
 *     récupère la place et TOUS les sièges descendent de ~9 px — après le clic,
 *     sous les yeux du joueur. Mesuré avant correction : 7 mains sur 20 en
 *     6-max, 8 sur 16 en 9-max, 9 sur 14 à 1920×1080.
 *     `trainer-layout-shift-audit` ne le voyait pas : il surveille le CADRE des
 *     tuiles, qui lui ne bouge pas. C'est le contenu du cadre qui se déplaçait.
 *
 *  2. UN JETON D'ACTION S'INSTALLE SUR LES CARTES DE SON PROPRE JOUEUR.
 *     Le placement admet de « mordre le bord » d'une main quand la place manque.
 *     Mesuré, il en couvrait 38 à 64 % — Hero comme vilains.
 *
 * L'audit joue des mains, relève avant et après la réponse d'Hero, et échoue si
 * la zone de table bouge ou si un jeton recouvre trop de cartes.
 *
 * Prérequis : serveur de dev lancé (port 7788).
 *   node scripts/trainer-1t-stabilite-audit.mjs
 *   node scripts/trainer-1t-stabilite-audit.mjs --w=1366 --h=768 --struct=9J --mains=20
 *   node scripts/trainer-1t-stabilite-audit.mjs --detail      (relevés main par main)
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const URL_CIBLE = arg('url', 'http://localhost:7788');
const W = +arg('w', 1600), H = +arg('h', 950);
const MAINS = +arg('mains', 20);
const STRUCT = arg('struct', '6J');
const OUT = arg('out', `design-qa-evidence/trainer-1t-stabilite-${W}x${H}-${STRUCT}.json`);
/* Le relevé main par main pèse ~900 lignes par configuration : il sert à
   enquêter, pas à prouver. Par défaut le rapport ne garde que la synthèse, les
   défauts et les compromis ; `--detail` y ajoute les relevés complets. */
const DETAIL = process.argv.includes('--detail');

/* Une main qui bouge en cours de route, c'est un défaut : tolérance de 1 px
   pour le seul bruit d'arrondi du navigateur. */
const TOL_PX = 1;
/* ── CONTRAT DES JETONS : DÉFAUTS ET COMPROMIS CONNUS ─────────────────────
   Un jeton qui recouvre des cartes ou un portrait n'est pas toujours une erreur.
   Le placement a des règles qui ne se lâchent pas — le board et le pot, l'attri-
   bution d'une mise à son joueur (§43), et aucune mise à plus de 35° de son axe
   (contrat de l'audit de géométrie). Quand elles ne laissent aucune place propre,
   il mord le bloc de SON joueur, et le dit : `data-marker-mode="surSesCartes"`.

   L'audit sépare donc deux choses.

   DÉFAUTS — échec, quel que soit le mode :
     • un jeton sur les cartes ou le portrait d'un AUTRE joueur ;
     • un contact sur son propre joueur alors que le placement se croyait propre
       (axial, avance, recule, poche) : le modèle et l'écran divergent.

   COMPROMIS CONNUS — le placement a déclaré mordre, faute de place. Ils sont
   relevés, comptés et affichés, et bornés par des PLAFONDS DE NON-RÉGRESSION.
   Ce ne sont pas des objectifs de qualité : ils sont calés sur l'état mesuré
   après correction (septembre 2026, 7 configurations × 2 balayages de 20
   mains), avec une marge de 4 à 9 points, et l'état d'avant les dépasse :
                       après correction    avant correction
     cartes visibles       max 51.1 %          max 67.3 %
     dos de cartes         max 80.7 %          max 99.5 %
     portrait              max 57.3 %          max 57.3 %  (vilain haut-centre
                                                            à 1366, inchangé)
   Ce qui les borne vraiment, mesuré : le Hero bas-centre, dont la main dépasse
   40 % dès qu'on refuse une poche au-delà de 35° ; les dos de vilains sur un
   siège de flanc 9-max, où l'attribution interdit toute place qui dégage la
   paire. Relever ces plafonds de qualité suppose de rouvrir l'un de ces deux
   arbitrages — pas de régler l'audit. */
const MODES_PROPRES = new Set(['axial', 'avance', 'recule', 'poche']);
const TOL_CONTACT_PCT = 5;            // effleurement toléré (arrondis, ombres portées)
const NONREG_FACES_PCT = 60;
const NONREG_DOS_PCT = 85;
const NONREG_AVATAR_PCT = 60;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = () => {
  const vu = e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const R = e => { const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const inter = (a, c) => {
    const w = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
    const h = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
    return w > 0 && h > 0 ? +(w * h).toFixed(0) : 0;
  };
  const area = document.querySelector('.t1-table-area');
  const felt = document.querySelector('.felt-oval');
  const under = document.querySelector('.t1-actions-under');
  /* Boîte de cartes de chaque siège, Hero (faces) comme vilain (dos ou abattue). */
  const sieges = [...document.querySelectorAll('.pf-player-seat')].filter(vu).map(s => {
    const h = s.querySelector('.hero-card-wrap');
    const v = s.querySelector('.pf-villain-backs, .pf-showdown-hand');
    const w = h || v;
    const av = s.querySelector('.pf-avatar-premium');
    return { pos: s.getAttribute('data-seat') || '?', radial: s.getAttribute('data-radial'), hero: !!h, faces: !!h || !!(v && v.classList.contains('pf-showdown-hand')), cartes: w && vu(w) ? R(w) : null, avatar: av && vu(av) ? R(av) : null };
  });
  const zones = [...document.querySelectorAll('.pf-seat-action-zone')].filter(vu)
    .map(z => ({ box: R(z), txt: (z.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26), seat: z.getAttribute('data-seat'), mode: z.getAttribute('data-marker-mode'), deg: z.getAttribute('data-marker-deg') }));
  const chocs = [];
  for (const s of sieges) {
    if (!s.cartes) continue;
    for (const z of zones) {
      const px2 = inter(z.box, s.cartes);
      if (px2 > 0) chocs.push({ siege: s.pos, axe: s.radial, hero: s.hero, faces: s.faces, jeton: z.txt, jetonDe: z.seat, mode: z.mode, deg: z.deg, px2,
        pct: +(100 * px2 / (s.cartes.w * s.cartes.h)).toFixed(1) });
    }
  }
  /* Le portrait du joueur compte autant que ses cartes : un badge qui ne mord
     plus la main mais se pose sur l'avatar a seulement déplacé le défaut. */
  const chocsAvatar = [];
  for (const s of sieges) {
    if (!s.avatar) continue;
    for (const z of zones) {
      const px2 = inter(z.box, s.avatar);
      if (px2 > 0) chocsAvatar.push({ siege: s.pos, axe: s.radial, hero: s.hero, jeton: z.txt, jetonDe: z.seat, mode: z.mode, deg: z.deg, px2, pct: +(100 * px2 / (s.avatar.w * s.avatar.h)).toFixed(1) });
    }
  }
  /* Repère stable pour juger du déplacement : la première carte d'Hero. */
  const heroCarte = (() => {
    const w = document.querySelector('.hero-card-wrap');
    const c = w && [...w.querySelectorAll('.card')].filter(vu)[0];
    return c ? R(c) : null;
  })();
  return {
    area: area ? R(area) : null,
    felt: felt ? R(felt) : null,
    under: under ? +under.getBoundingClientRect().height.toFixed(1) : null,
    heroCarte, chocs, chocsAvatar,
    heroPos: (sieges.find(s => s.hero) || {}).pos || null,
  };
};

const browser = await puppeteer.launch({
  executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
const defauts = [];
const ajoute = (code, d) => defauts.push({ code, ...d });
const releves = [];
const compromis = [];

try {
  const page = await browser.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e).slice(0, 240)));
  await page.goto(URL_CIBLE, { waitUntil: 'networkidle2' });
  const click = (t, exact = true) => page.evaluate((x, e) => {
    const el = [...document.querySelectorAll('button, .ntab')].find(b => (e ? b.textContent.trim() === x : b.textContent.includes(x)));
    if (el) { el.click(); return true; } return false;
  }, t, exact);

  await click('Entraineur GTO');
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Lancer la session/i.test(b.textContent || '')))) break;
    await sleep(300);
  }
  await click('1T'); await sleep(250);
  await click(STRUCT); await sleep(250);
  await click('Lancer la session', false);
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break;
    await sleep(400);
  }
  await sleep(1500);
  /* On fige animations et transitions : on mesure un état stabilisé, pas une
     image prise au milieu d'une bascule. */
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });

  const agir = sel => page.evaluate(s => {
    const vu = e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const b = [...document.querySelectorAll(s)].find(x => vu(x) && !x.disabled);
    if (b) { b.click(); return (b.textContent || '').trim().slice(0, 18); } return null;
  }, sel);

  for (let m = 0; m < MAINS; m++) {
    const avant = await page.evaluate(PROBE);
    const action = await agir('button.gto-btn-FOLD') || await agir('button.gto-btn');
    if (!action) break;
    await sleep(950);
    const apres = await page.evaluate(PROBE);
    releves.push({ main: m, heroPos: avant.heroPos, action, avant, apres });

    /* 1 — la zone de table, le feutre et les cartes d'Hero ne bougent pas. */
    for (const [nom, a, b] of [['zone', avant.area, apres.area], ['feutre', avant.felt, apres.felt], ['carteHero', avant.heroCarte, apres.heroCarte]]) {
      if (!a || !b) continue;
      const d = ['x', 'y', 'w', 'h'].map(k => +(b[k] - a[k]).toFixed(1));
      if (Math.max(...d.map(Math.abs)) > TOL_PX)
        ajoute('la-table-bouge-pendant-la-main', { main: m, sur: nom, action, avant: a, apres: b, ecarts: d });
    }
    /* 2 — les jetons : défauts d'abord, compromis connus ensuite. */
    for (const [quand, snap] of [['avant', avant], ['apres', apres]]) {
      const contacts = [
        ...snap.chocs.map(c => ({ ...c, cible: c.faces ? 'cartes-visibles' : 'dos-de-cartes' })),
        ...(snap.chocsAvatar || []).map(c => ({ ...c, cible: 'portrait' })),
      ];
      for (const c of contacts) {
        if (c.pct <= TOL_CONTACT_PCT) continue;
        const d = { main: m, quand, ...c };
        if (c.jetonDe && c.jetonDe !== c.siege) { ajoute('jeton-sur-le-siege-d-un-autre-joueur', d); continue; }
        if (MODES_PROPRES.has(c.mode)) { ajoute('placement-se-croyait-propre', d); continue; }
        compromis.push(d);
        const plafond = c.cible === 'portrait' ? NONREG_AVATAR_PCT : c.cible === 'cartes-visibles' ? NONREG_FACES_PCT : NONREG_DOS_PCT;
        if (c.pct > plafond) ajoute('compromis-pire-qu-avant', { ...d, plafond });
      }
    }

    const suiv = await page.evaluate(() => {
      const vu = e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
      const b = [...document.querySelectorAll('button.gto-next-btn')].find(x => vu(x) && !x.disabled)
        || [...document.querySelectorAll('button')].find(x => vu(x) && !x.disabled && /suivante/i.test((x.textContent || '').trim()));
      if (b) { b.click(); return true; } return false;
    });
    if (!suiv) break;
    await sleep(900);
  }

  const tousChocs = releves.flatMap(r => [...r.avant.chocs, ...r.apres.chocs]);
  const pcts = tousChocs.map(c => c.pct).sort((a, b) => a - b);
  const stat = arr => { const t = arr.map(c => c.pct).sort((a, b) => a - b); return { n: t.length, median: t.length ? t[Math.floor(t.length / 2)] : 0, max: t.length ? t[t.length - 1] : 0 }; };
  const statFaces = stat(tousChocs.filter(c => c.faces)), statDos = stat(tousChocs.filter(c => !c.faces));
  const pctsAv = releves.flatMap(r => [...(r.avant.chocsAvatar || []), ...(r.apres.chocsAvatar || [])]).map(c => c.pct).sort((a, b) => a - b);
  const bougent = new Set(defauts.filter(d => d.code === 'la-table-bouge-pendant-la-main').map(d => d.main)).size;
  /* Un audit qui n'a RIEN mesuré n'est pas un audit vert : sans ce garde-fou,
     une erreur JS dans la page rendait « 0 défaut » en toute confiance. */
  if (!releves.length) ajoute('aucune-main-mesuree', { erreursPage: erreurs.slice(0, 3) });
  const rapport = {
    url: URL_CIBLE, viewport: `${W}x${H}`, struct: STRUCT, mains: releves.length,
    seuils: { tolerancePx: TOL_PX, toleranceContactPct: TOL_CONTACT_PCT, nonRegression: { cartesVisibles: NONREG_FACES_PCT, dosDeCartes: NONREG_DOS_PCT, portrait: NONREG_AVATAR_PCT } },
    mainsQuiBougent: bougent,
    recouvrement: { n: pcts.length, median: pcts.length ? pcts[Math.floor(pcts.length / 2)] : 0, max: pcts.length ? pcts[pcts.length - 1] : 0 },
    faces: statFaces, dos: statDos,
    compromisConnus: { n: compromis.length, parCible: Object.fromEntries(['cartes-visibles', 'dos-de-cartes', 'portrait'].map(k => [k, stat(compromis.filter(c => c.cible === k))])) },
    avatar: { n: pctsAv.length, median: pctsAv.length ? pctsAv[Math.floor(pctsAv.length / 2)] : 0, max: pctsAv.length ? pctsAv[pctsAv.length - 1] : 0 },
    erreursPage: erreurs, defauts, compromis, ...(DETAIL ? { releves } : {}),
  };
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), JSON.stringify(rapport, null, 2));

  console.log(`\n══ 1T ${W}×${H} ${STRUCT} — ${releves.length} mains ══`);
  console.log(`mains où la table bouge pendant le coup : ${bougent}/${releves.length}  (tolérance ${TOL_PX} px)`);
  console.log(`jeton × cartes visibles : ${statFaces.n} contacts — médiane ${statFaces.median} % — max ${statFaces.max} % (non-régression ${NONREG_FACES_PCT} %)`);
  console.log(`jeton × dos de cartes   : ${statDos.n} contacts — médiane ${statDos.median} % — max ${statDos.max} % (non-régression ${NONREG_DOS_PCT} %)`);
  console.log(`jeton × portrait        : ${rapport.avatar.n} contacts — médiane ${rapport.avatar.median} % — max ${rapport.avatar.max} % (non-régression ${NONREG_AVATAR_PCT} %)`);
  console.log(`compromis connus (placement sans place propre) : ${compromis.length}`);
  console.log(`\n${defauts.length ? '❌' : '✅'} ${defauts.length} défaut(s)`);
  defauts.slice(0, 12).forEach(d => console.log('  ✗ ' + JSON.stringify(d).slice(0, 190)));
  console.log(`\nRapport : ${OUT}`);
  process.exitCode = defauts.length ? 1 : 0;
} finally {
  await browser.close();
}
