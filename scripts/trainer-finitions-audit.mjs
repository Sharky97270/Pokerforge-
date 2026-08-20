#!/usr/bin/env node
/**
 * trainer-finitions-audit — QUATRE MESURES DE FINITION.
 *
 * ① ELLIPSE DES SIÈGES (§7). Tous les avatars doivent se poser sur UNE MÊME
 *    ellipse dérivée de l'anneau doré. On mesure le rayon normalisé ρ du
 *    CENTRE de chaque médaillon : ρ=1 signifie « pile sur l'anneau ». Ce qui
 *    compte n'est pas la valeur absolue de ρ mais sa DISPERSION : si un siège
 *    est à 0.64 et un autre à 0.95, ils ne sont pas sur la même ellipse et
 *    l'œil le voit.
 *
 * ② ZONE HERO (§5). Le bloc Hero (cartes ▸ avatar ▸ plaque) doit garder de
 *    l'air avant les boutons de décision et le panneau de résultat. On mesure
 *    la distance verticale libre sous le Hero.
 *
 * ③ SURFACE UTILISÉE (§6). Part de la cellule de grille réellement occupée
 *    par le feutre. Une valeur basse signale de l'espace perdu — surtout
 *    attendu en 3T.
 *
 * ④ LABELS DE SIEGE (§8). « En dessous de l avatar » ne veut pas dire la meme
 *    chose selon l endroit de l anneau : pour un siege HAUT, en dessous, c est
 *    le board. On verifie la CONSEQUENCE — un label qui touche le board ou le
 *    pot — plutot que la valeur des decalages.
 *
 * Usage :
 *   node scripts/trainer-finitions-audit.mjs
 *   node scripts/trainer-finitions-audit.mjs --modes=3 --rhoMax=0.06
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const W = +arg('w', 1600), H = +arg('h', 950);
const MODES = String(arg('modes', '1,2,3,4')).split(',').map(Number).filter(Boolean);
const RHO_MAX = +arg('rhoMax', 0.06);   // écart-type toléré sur ρ
const HERO_MIN = +arg('heroMin', 6);    // px d'air minimum sous le bloc Hero
const OUT = arg('out', 'design-qa-evidence/trainer-finitions.json');

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
    const res = await page.evaluate(async (mode) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const vis = e => e.offsetParent && e.getBoundingClientRect().width > 0;
      const B = re => [...document.querySelectorAll('button')].find(b => vis(b) && re.test(b.textContent));
      const setT = n => [...document.querySelectorAll('.mtbtn')]
        .find(e => vis(e) && e.textContent.trim() === n + 'T')?.click();

      B(/Arrêter/)?.click();            await w(900);
      B(/Nouvelle session/)?.click();   await w(1100);
      setT(mode);                       await w(500);
      B(/Lancer la session/)?.click();  await w(4200);
      /* JOUER UNE ACTION AVANT DE MESURER. Au préflop il n'y a ni board, ni
         pot conséquent, ni pastille « Fold » : la mesure ④ ne pouvait alors
         RIEN chevaucher et passait au vert même sur le code non corrigé.
         Un audit qui n'atteint pas l'état qu'il prétend contrôler ne prouve
         pas plus qu'un audit incapable d'échouer. */
      const actions = [...document.querySelectorAll('.gto-btn')].filter(vis);
      if (actions.length) { actions[0].click(); await w(1500); }

      const o = { mode: mode + 'T' };
      /* Les sièges ne sont PAS dans `.felt-oval` : ils en sont les frères dans
         `.training-table-zone`. Les chercher sous le feutre renvoyait zéro — et
         un audit qui ne trouve rien passait au vert sans rien avoir mesuré.
         Une table = `.tw` en mosaïque, `.t1-left` en 1T : le 1T a sa propre
         structure (t1-zone-fit / t1-table-area) et n'utilise pas les mêmes
         classes de siège. Chercher `.tw` partout faisait échouer le 1T pour une
         raison de sélecteur, pas de produit. */
      const table = document.querySelector('.tw') || document.querySelector('.t1-left');
      const felt = table?.querySelector('.felt-oval');
      if (!table || !felt) { o.err = 'table ou feutre absent'; return o; }
      const F = felt.getBoundingClientRect();
      const fx = F.x + F.width / 2, fy = F.y + F.height / 2;

      /* ① ρ par siège — centre du MÉDAILLON, pas du bloc.
         `.pf-seat-avatar-slot` n'existe qu'en mosaïque (ancrage par le centre
         de l'avatar, §7). En 1T on le DIT plutôt que de faire semblant. */
      const slots = [...table.querySelectorAll('.pf-seat-avatar-slot')].filter(vis);
      if (!slots.length) o.ellipseNonApplicable = 'ancrage 1T : pas de .pf-seat-avatar-slot';
      const rhos = slots.map(e => {
        const r = e.getBoundingClientRect();
        const dx = (r.x + r.width / 2 - fx) / (F.width / 2);
        const dy = (r.y + r.height / 2 - fy) / (F.height / 2);
        return Math.round(Math.hypot(dx, dy) * 1000) / 1000;
      });
      const moy = rhos.reduce((a, b) => a + b, 0) / (rhos.length || 1);
      const et = Math.sqrt(rhos.reduce((a, b) => a + (b - moy) ** 2, 0) / (rhos.length || 1));
      o.ellipse = {
        sieges: rhos.length, rho: rhos,
        min: Math.min(...rhos), max: Math.max(...rhos),
        moyenne: Math.round(moy * 1000) / 1000, ecartType: Math.round(et * 1000) / 1000,
      };

      /* ② Air sous le bloc Hero — cartes, médaillon ET plaque comprises. */
      const heroSeat = table.querySelector('.pf-mt-seat-bottom')
        || [...table.querySelectorAll('.pf-player-seat')].filter(vis)
             .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (heroSeat) {
        const parts = [heroSeat, ...heroSeat.querySelectorAll('.pf-seat-above,.pf-seat-below,.pf-mt-nameplate')]
          .filter(vis).map(e => e.getBoundingClientRect());
        const bas = Math.max(...parts.map(r => r.bottom));
        const sous = [...document.querySelectorAll('.mtr-actions,.gto-btn,.gto-panel,.mt-table-title')]
          .filter(e => vis(e) && e.getBoundingClientRect().top >= bas - 1)
          .map(e => ({ px: Math.round(e.getBoundingClientRect().top - bas),
                       quoi: (e.className || '').toString().split(' ')[0] }))
          .sort((a, b) => a.px - b.px);
        /* Aucun element sous Hero = rien a mesurer (le bandeau de decision
           disparait en 1T une fois la main jouee). On le DIT. */
        if (!sous.length) o.heroNonApplicable = 'aucun element rendu sous le bloc Hero';
        o.hero = { basBlocHero: Math.round(bas),
                   airSousHero: sous.length ? sous[0].px : null,
                   premierElement: sous.length ? sous[0].quoi : null };
      }

      /* ④ §8 — AUCUN LABEL DE SIÈGE SUR LE CŒUR DE LA TABLE.
         « En dessous de l'avatar » ne veut pas dire la même chose selon
         l'endroit de l'anneau : pour un siège HAUT, en dessous, c'est le
         board. Mesuré avant correction : la pastille du siège haut-centre le
         CHEVAUCHAIT (distance 0px). On vérifie la conséquence — un label qui
         touche le board ou le pot — et non la valeur des décalages. */
      const croise = (r, s) => !(r.right < s.left || r.left > s.right || r.bottom < s.top || r.top > s.bottom);
      /* Balayage sur TOUTES les tables et sur PLUSIEURS mains. Ne regarder
         qu'une table à un instant rendait le contrôle dépendant du tirage :
         le défaut n'apparaît que si un siège HAUT a jeté (la pastille existe)
         et que le board est sorti. Une seule observation passait au vert sur
         du code pourtant fautif. */
      let mesures = 0, chevauchements = 0, coeurVus = 0, avecPastille = 0;
      for (let tour = 0; tour < 4; tour++) {
        const tables = document.querySelectorAll('.tw').length ? document.querySelectorAll('.tw') : document.querySelectorAll('.t1-left');
        for (const t of tables) {
          if (!vis(t)) continue;
          const coeur = [...t.querySelectorAll('.mt-board-zone,.pf-board-zone,[class*="pot-readout"]')]
            .filter(vis).map(e => e.getBoundingClientRect());
          coeurVus += coeur.length;
          for (const s of [...t.querySelectorAll('.pf-mt-seat,.pf-player-seat')].filter(vis)) {
            for (const sel of ['.pf-mt-nameplate', '.pf-seat-nameplate', '.pf-seat-above', '.pf-seat-below', '.pf-fold-chip']) {
              const e = s.querySelector(sel); if (!e || !vis(e)) continue;
              if (sel === '.pf-seat-below' || sel === '.pf-fold-chip') avecPastille++;
              mesures++;
              const r = e.getBoundingClientRect();
              if (coeur.some(c => croise(r, c))) chevauchements++;
            }
          }
        }
        const act = [...document.querySelectorAll('.gto-btn')].filter(vis);
        if (act.length) { act[tour % act.length].click(); await w(800); }
        const cta = document.querySelector('.pf-p2-next');
        if (cta && !cta.disabled) { cta.click(); await w(900); }
      }
      o.labels = { coeurDetecte: coeurVus, mesures, chevauchements, pastilles: avecPastille };

      /* ③ Surface de cellule réellement occupée par le feutre. */
      const slot = table.closest('.mt-slot') || table;
      if (slot) {
        const S = slot.getBoundingClientRect();
        o.surface = {
          cellule: { w: Math.round(S.width), h: Math.round(S.height) },
          feutre: { w: Math.round(F.width), h: Math.round(F.height) },
          tauxLargeur: Math.round((F.width / S.width) * 100),
          tauxHauteur: Math.round((F.height / S.height) * 100),
          tauxSurface: Math.round(((F.width * F.height) / (S.width * S.height)) * 100),
        };
      }
      return o;
    }, mode);

    rapport.push(res);
    const el = res.ellipse || {};
    /* Rien de mesuré = ÉCHEC, jamais un vert muet — sauf quand le mode ne
       PEUT pas porter la mesure : on le dit alors explicitement. */
    const okEllipse = !res.err && (res.ellipseNonApplicable
      || (el.sieges > 0 && el.ecartType != null && el.ecartType <= RHO_MAX));
    const okHero = !res.err && (res.heroNonApplicable
      || (res.hero?.airSousHero != null && res.hero.airSousHero >= HERO_MIN));
    /* §8 : un label sur le board est un defaut, et zero label mesure aussi. */
    const okLabels = !res.err && res.labels?.mesures > 0 && res.labels.chevauchements === 0;
    if (!okEllipse || !okHero || !okLabels) failed++;
    if (res.err) { console.log(`❌ ${res.mode} — ${res.err}`); continue; }
    console.log(`${okEllipse && okHero && okLabels ? '✅' : '❌'} ${res.mode}`);
    console.log(res.ellipseNonApplicable
      ? `   ① ellipse : non mesurable ici — ${res.ellipseNonApplicable}`
      : `   ① ellipse : ${el.sieges} sièges · ρ ${el.min}→${el.max} · écart-type ${el.ecartType} (seuil ${RHO_MAX})`);
    console.log(res.heroNonApplicable
      ? `   ② Hero    : non mesurable ici — ${res.heroNonApplicable}`
      : `   ② Hero    : ${res.hero?.airSousHero ?? '—'}px d'air, puis « ${res.hero?.premierElement ?? '?'} » (seuil ${HERO_MIN})`);
    console.log(`   ④ labels  : ${res.labels?.mesures ?? 0} mesures dont ${res.labels?.pastilles ?? 0} pastilles · ${res.labels?.chevauchements ?? '?'} sur le board/pot (attendu 0)`);
    console.log(`   ③ surface : feutre ${res.surface?.tauxLargeur ?? '?'}% de la largeur · ${res.surface?.tauxHauteur ?? '?'}% de la hauteur`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ viewport: [W, H], rhoMax: RHO_MAX, heroMin: HERO_MIN, rapport }, null, 1));
  console.log(`\nRelevés écrits dans ${OUT}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
