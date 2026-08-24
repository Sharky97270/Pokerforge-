#!/usr/bin/env node
/**
 * trainer-responsive-audit — DÉBORDEMENTS ET CHEVAUCHEMENTS DU TRAINER (C14/C15)
 *
 * POURQUOI CE SCRIPT EXISTE
 * L'audit du 21 août 2026 a relevé deux défauts visuels avec leurs pixels :
 *   V1  à 1366×768, le bloc « INFORMATIONS » dépasse le bas de la fenêtre de
 *       7 px et croise la TIMELINE en 3 endroits — « SPR 4.8 » est coupé ;
 *   V2  à 390×844, la pile de jetons du pot recouvre le libellé « POT 1.5bb »
 *       sur 17×17 px, et un jeton de fold sur 34×6 px.
 * Ces mesures avaient été prises à la main. Sans instrument, elles ne se
 * rejouent pas — et un correctif visuel qu'on ne peut pas remesurer n'est pas
 * un correctif, c'est une opinion.
 *
 * CE QU'IL MESURE, à chaque résolution demandée :
 *   ① débordement  : une boîte peinte dépasse-t-elle la fenêtre (bas/droite) ?
 *   ② scroll       : la page a-t-elle un scroll horizontal ?
 *   ③ recouvrement : deux FEUILLES peintes se recouvrent-elles, et de combien ?
 *   ④ rognage      : les lignes du panneau (Stack Hero, Pot, Pot Odds, SPR)
 *                    sont-elles entièrement visibles ?
 *
 * On ne mesure que les FEUILLES (éléments sans enfant peint) : un conteneur
 * englobe ses enfants par construction, le compter produirait du bruit.
 *
 *   node scripts/trainer-responsive-audit.mjs --url=http://localhost:7799
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const OUT = path.resolve(arg('out', 'design-qa-evidence/trainer-responsive.json'));
const SHOTS = arg('shots', 'design-qa-evidence/probe');
const HANDS = +arg('hands', 3);

/* Les configurations imposées par la mission. Le mobile ne connaît que le 1T. */
const CONFIGS = [
  { nom: '1920x1080-1T', w: 1920, h: 1080, tables: 1 },
  { nom: '1920x1080-2T', w: 1920, h: 1080, tables: 2 },
  { nom: '1920x1080-3T', w: 1920, h: 1080, tables: 3 },
  { nom: '1920x1080-4T', w: 1920, h: 1080, tables: 4 },
  { nom: '1366x768-1T', w: 1366, h: 768, tables: 1 },
  { nom: '1366x768-2T', w: 1366, h: 768, tables: 2 },
  { nom: '390x844-mobile-1T', w: 390, h: 844, tables: 1 },
];

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

const HELPERS = () => {
  window.__rp = {
    leaf(t) { return [...document.querySelectorAll('div,span,button')].find(e => e.children.length === 0 && e.textContent.trim() === t); },
    clickNT(n) { const e = [...document.querySelectorAll('.mtbtn')].find(x => x.textContent.trim() === n + 'T'); if (e) { e.click(); return true; } return false; },
    setSmode(n) { const el = [...document.querySelectorAll('.smpill')].find(e => (e.querySelector('.smnum') || {}).textContent === String(n)); if (el) { el.click(); return true; } return false; },
    launch() { const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent)); if (b) { b.click(); return true; } return false; },
    actAll() {
      let n = 0;
      const slots = [...document.querySelectorAll('.mt-slot')];
      (slots.length ? slots : [document.body]).forEach(s => {
        const b = [...s.querySelectorAll('button.gto-btn')].filter(x => x.getBoundingClientRect().width > 0);
        const pick = b.find(x => /Fold/i.test(x.textContent)) || b[0];
        if (pick) { pick.click(); n++; }
      });
      return n;
    },
    nextAll() {
      let n = 0;
      [...document.querySelectorAll('button')]
        .filter(b => /suivante/i.test(b.textContent) && !b.disabled && b.getBoundingClientRect().width > 0)
        .forEach(b => { b.click(); n++; });
      return n;
    },
    /* ── LE PANNEAU REPLIÉ N'EST PAS UN PANNEAU ROGNÉ ────────────────────────
       En fenêtre étroite ET multi-table, le Trainer replie volontairement la
       colonne d'analyse pour laisser leur place aux tables (auto-fold
       documenté, réversible par le chevron). Compter ses lignes comme
       « rognées » mesurerait une décision produit, pas un défaut.
       Mais on ne s'en contente pas : on DÉPLIE et on vérifie que, une fois
       ouvert, le panneau est entièrement lisible à cette résolution. */
    panneauReplie() {
      const c = document.querySelector('.pf-mt-sharedcol');
      return !!c && (c.classList.contains('hidden') || c.getBoundingClientRect().width < 8);
    },
    deplierPanneau() {
      if (!window.__rp.panneauReplie()) return false;
      const t = document.querySelector('.pf-mt-panel-toggle');
      if (!t) return false;
      t.click();
      return true;
    },

    /* Relevé géométrique. `cible` limite le contrôle de recouvrement aux
       familles qui nous intéressent : le panneau droit et la zone du pot. */
    mesure() {
      const W = window.innerWidth, H = window.innerHeight;
      const nom = e => {
        const c = String(e.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        const t = (e.textContent || '').trim().slice(0, 22);
        return `${e.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? `[${t}]` : ''}`;
      };
      /* ── CE QUI COMPTE COMME « PEINT » ────────────────────────────────────
         Trois pièges, chacun ayant produit des dizaines de faux positifs :
         ① un tiroir de réglages fermé est positionné hors écran ; ses éléments
            ont un style visible mais ne sont pas à l'écran ;
         ② un élément clippé par un ancêtre qui défile ne « déborde » pas la
            page : c'est son conteneur qui gère ;
         ③ un ancêtre contient sa descendance : les compter comme un
            chevauchement mesure la construction du DOM, pas un défaut. */
      const estVisible = e => {
        const st = getComputedStyle(e);
        if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.visibility === 'hidden' || ps.display === 'none' || +ps.opacity === 0) return false;
        }
        return true;
      };
      const clippeParUnAncetre = e => {
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(ps.overflowY + ' ' + ps.overflowX)) return true;
        }
        return false;
      };
      const dansLaFenetre = r => r.right > 0 && r.left < W && r.bottom > 0 && r.top < H;
      const estAncetre = (a, b) => a !== b && a.contains(b);

      const feuilles = [...document.querySelectorAll('body *')].filter(e => {
        if (e.children.length) return false;
        if (!estVisible(e)) return false;
        const r = e.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      }).map(e => ({ e, r: e.getBoundingClientRect(), n: nom(e), cls: String(e.className || '') }));

      /* Débordement : une boîte PARTIELLEMENT visible qui sort de la fenêtre,
         sans conteneur défilant pour l'absorber. Une boîte entièrement hors
         écran n'est pas un débordement — elle n'est pas affichée. */
      const debordements = feuilles
        .filter(f => dansLaFenetre(f.r) && !clippeParUnAncetre(f.e))
        .map(f => ({
          element: f.n,
          bas: Math.round(f.r.bottom - H), droite: Math.round(f.r.right - W),
          gauche: Math.round(-f.r.left), haut: Math.round(-f.r.top),
        }))
        .filter(d => d.bas > 1 || d.droite > 1 || d.gauche > 1 || d.haut > 1);

      /* Recouvrements : entre familles qui ne doivent JAMAIS se croiser. Les
         familles sont DISJOINTES (un même nœud ne peut appartenir aux deux) et
         on ignore les paires ancêtre/descendant. */
      const familles = [
        { id: 'panneau', sel: '.pf-p2-irow, .pf-p2-h' },
        { id: 'timeline', sel: '.pf-p2-tl-track, .pf-p2-tl-lbl, .pf-p2-tl-step' },
        { id: 'lecture-pot', sel: '.pf-pot-label, .pf-pot-value' },
        { id: 'jetons', sel: '.pf-pot-chip-cluster, .pf-fold-chip, .pf-chip-stack' },
      ];
      const boites = [];
      const vus = new Set();
      for (const f of familles) {
        for (const e of document.querySelectorAll(f.sel)) {
          if (vus.has(e) || !estVisible(e)) continue;
          const r = e.getBoundingClientRect();
          if (r.width > 1 && r.height > 1 && dansLaFenetre(r)) { vus.add(e); boites.push({ famille: f.id, n: nom(e), r, e }); }
        }
      }
      const chevauchements = [];
      for (let i = 0; i < boites.length; i++) {
        for (let j = i + 1; j < boites.length; j++) {
          const a = boites[i], b = boites[j];
          if (a.famille === b.famille) continue;
          if (estAncetre(a.e, b.e) || estAncetre(b.e, a.e)) continue;
          const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (ox > 1 && oy > 1) {
            chevauchements.push({ a: a.n, b: b.n, familles: `${a.famille}/${b.famille}`, largeur: Math.round(ox), hauteur: Math.round(oy) });
          }
        }
      }

      /* Lignes du panneau entièrement visibles ? */
      const lignes = [...document.querySelectorAll('.pf-p2-irow')].map(r => {
        const k = (r.querySelector('.k') || {}).textContent || '?';
        const b = r.getBoundingClientRect();
        const raisons = [];
        if (b.bottom > H + 1) raisons.push(`dépasse le bas de ${Math.round(b.bottom - H)}px`);
        if (b.top < -1) raisons.push(`au-dessus du haut de ${Math.round(-b.top)}px`);
        if (b.right > W + 1) raisons.push(`dépasse la droite de ${Math.round(b.right - W)}px`);
        if (b.left > W) raisons.push('hors écran à droite');
        if (b.width < 1 || b.height < 1) raisons.push('boîte nulle');
        return {
          cle: k.trim(), visible: raisons.length === 0, raisons,
          boite: { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) },
        };
      });

      /* Colonnes de la rangee de jeu : sans elles, un panneau « invisible » ne
         dit pas QUI l a pousse dehors. */
      const colonnes = (() => {
        const row = document.querySelector('.pf-mt-playrow');
        if (!row) return null;
        return [...row.children].map(c => {
          const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
          return { cls: String(c.className).slice(0, 30), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), flex: cs.flex, minWidth: cs.minWidth, position: cs.position };
        });
      })();

      return {
        viewport: { w: W, h: H }, colonnes,
        scrollHorizontal: document.documentElement.scrollWidth > W + 1,
        scrollWidth: document.documentElement.scrollWidth,
        debordements, chevauchements, lignesPanneau: lignes,
        feuillesMesurees: feuilles.length,
      };
    },
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'] });
const resultats = [];
const consoleErrors = [];

for (const cfg of CONFIGS) {
  const page = await browser.newPage();
  await page.setViewport({ width: cfg.w, height: cfg.h, isMobile: cfg.w < 700, hasTouch: cfg.w < 700 });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(`${cfg.nom} : ${m.text().slice(0, 160)}`); });
  page.on('pageerror', e => consoleErrors.push(`${cfg.nom} : pageerror ${String(e).slice(0, 160)}`));

  const waitFor = async (fn, a, label, ms = 20000) => {
    const t0 = Date.now();
    for (;;) {
      await page.evaluate(HELPERS);
      if (await page.evaluate(fn, a)) return true;
      if (Date.now() - t0 > ms) return false;
      await sleep(150);
    }
  };

  try {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await waitFor(() => { const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent)); if (e) { e.click(); return true; } return false; }, null, 'onglet');
    await waitFor(() => !!document.querySelector('.mtbtn') || !!document.querySelector('button'), null, 'bandeau');
    await waitFor(n => window.__rp.setSmode(n), 100, 'longueur');
    await sleep(150);
    if (cfg.tables > 1) { await waitFor(n => window.__rp.clickNT(n), cfg.tables, cfg.tables + 'T'); await sleep(250); }
    await waitFor(() => window.__rp.launch(), null, 'lancer');
    await sleep(1100);

    /* Plusieurs mains : un défaut de mise en page peut n'apparaître qu'avec un
       board complet ou un long historique. */
    /* Le Trainer replie la colonne d'analyse en fenêtre étroite + multi-table.
       On l'ouvre AVANT de mesurer : le contrôle porte sur ce que le joueur voit
       quand il demande le panneau, pas sur une colonne à zéro pixel. */
    await page.evaluate(HELPERS);
    const etaitReplie = await page.evaluate(() => window.__rp.deplierPanneau());
    if (etaitReplie) await sleep(500);

    const releves = [];
    for (let k = 0; k < HANDS; k++) {
      await page.evaluate(HELPERS);
      releves.push(await page.evaluate(() => window.__rp.mesure()));
      await page.evaluate(() => window.__rp.actAll());
      await sleep(400);
      await page.evaluate(HELPERS);
      await page.evaluate(() => window.__rp.nextAll());
      await sleep(520);
    }
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `responsive-${cfg.nom}.png`) });

    /* Agrégation : on garde le pire relevé de chaque type. */
    const debordements = [];
    const chevauchements = [];
    const rognees = [];
    for (const r of releves) {
      for (const d of r.debordements) if (!debordements.some(x => x.element === d.element)) debordements.push(d);
      for (const c of r.chevauchements) if (!chevauchements.some(x => x.a === c.a && x.b === c.b)) chevauchements.push(c);
      for (const l of r.lignesPanneau) if (!l.visible && !rognees.some(x => x.cle === l.cle)) rognees.push(l);
    }
    resultats.push({
      config: cfg.nom, viewport: { w: cfg.w, h: cfg.h }, tables: cfg.tables,
      relevés: releves.length,
      scrollHorizontal: releves.some(r => r.scrollHorizontal),
      feuillesMesurees: Math.max(...releves.map(r => r.feuillesMesurees)),
      colonnes: releves[0] && releves[0].colonnes,
      panneauAutoReplie: etaitReplie,
      debordements, chevauchements, lignesRognees: rognees,
      conforme: !debordements.length && !chevauchements.length && !rognees.length && !releves.some(r => r.scrollHorizontal),
    });
  } catch (e) {
    resultats.push({ config: cfg.nom, erreur: String(e).slice(0, 200), conforme: false });
  }
  await page.close();
}
await browser.close();

const rapport = {
  ts: new Date().toISOString(), url: URL, mainsParConfig: HANDS,
  configurations: resultats,
  consoleErrors,
  verdict: resultats.every(r => r.conforme) && !consoleErrors.length
    ? 'OK — aucun debordement, aucun chevauchement, aucune ligne rognee'
    : resultats.filter(r => !r.conforme).map(r => r.config).join(', ') + ' non conforme(s)',
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rapport, null, 2), 'utf8');

for (const r of resultats) {
  console.log(`${r.conforme ? 'OK  ' : 'KO  '} ${r.config.padEnd(20)} debordements=${(r.debordements || []).length} chevauchements=${(r.chevauchements || []).length} rognees=${(r.lignesRognees || []).length}${r.scrollHorizontal ? ' SCROLL-H' : ''}`);
}
console.log('Erreurs console :', consoleErrors.length);
console.log('Rapport :', OUT);

const ko = resultats.filter(r => !r.conforme);
if (ko.length || consoleErrors.length) {
  console.error(`\nECHEC audit:responsive — ${ko.length} configuration(s) non conforme(s)${consoleErrors.length ? ` · ${consoleErrors.length} erreur(s) console` : ''}`);
  process.exit(1);
}
console.log(`\nOK audit:responsive — les ${resultats.length} configurations sont conformes`);
