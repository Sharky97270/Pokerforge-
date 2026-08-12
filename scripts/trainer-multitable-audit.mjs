#!/usr/bin/env node
/**
 * trainer-multitable-audit — pilote le Trainer dans un vrai navigateur et vérifie
 * que le bandeau gauche est bien un CONTRAT : ce qui est sélectionné est ce qui
 * est joué.
 *
 * Pourquoi ce script : un bouton actif ne prouve rien. La seule preuve qu'une
 * combinaison (mode × type de session × nombre de tables) fonctionne, c'est de la
 * sélectionner, lancer, jouer une décision sur chaque table et constater l'état
 * obtenu. Ce script fait exactement ça, combinaison par combinaison, et écrit un
 * rapport JSON + des PNG.
 *
 * Prérequis : le serveur de dev tourne (voir --url), Chrome ou Edge installé.
 *
 * Exemples :
 *   node scripts/trainer-multitable-audit.mjs --url=http://localhost:7799
 *   node scripts/trainer-multitable-audit.mjs --types=full,session --tables=2,4 --modes=gto
 *   node scripts/trainer-multitable-audit.mjs --shots            # + captures PNG
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7799');
const MODES = arg('modes', 'gto,exploit').split(',');
const TYPES = arg('types', 'spot,street,full,session,mix').split(',');
const TABLES = arg('tables', '1,2,3,4').split(',').map(Number);
const W = +arg('w', 1600);
const H = +arg('h', 900);
const OUTDIR = path.resolve(arg('outdir', 'design-qa-evidence/multitable'));
const SHOTS = flag('shots');
/* Hauteur minimale acceptable de l'ovale de jeu dans une tuile de mosaïque.
   Repère mesuré : en 4T à 1600×900 l'ovale fait ~229px hors coup complet ; sous
   ~170px les grappes de sièges se recouvrent et le board passe sous les cartes. */
const MIN_ZONE_H = +arg('minzone', 170);

const TYPE_LABEL = {
  spot: '🎯 Spot', street: '🎚 Street', full: '🃏 Full Hand',
  session: '🎬 Session', mix: '🔀 Mix',
};
const MODE_LABEL = { gto: '🎯 GTO', exploit: '🦈 Exploit' };

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
fs.mkdirSync(OUTDIR, { recursive: true });

/* ── Helpers injectés dans la page ─────────────────────────────────────────── */
const PAGE_HELPERS = () => {
  window.__pf = {
    leaf(txt) {
      return [...document.querySelectorAll('div,span,button')]
        .find(e => e.children.length === 0 && e.textContent.trim() === txt);
    },
    clickLeaf(txt) { const e = window.__pf.leaf(txt); if (e) { e.click(); return true; } return false; },
    clickNT(n) {
      const els = [...document.querySelectorAll('.mtbtn')].filter(e => e.textContent.trim() === n + 'T');
      if (!els.length) return false; els[0].click(); return true;
    },
    ntState() {
      return [...document.querySelectorAll('.mtbtn')].slice(0, 4)
        .map(e => ({ t: e.textContent.trim(), on: e.className.includes('on'), locked: e.style.cursor === 'not-allowed' }));
    },
    launch() {
      const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent));
      if (b) { b.click(); return true; } return false;
    },
    slots() { return [...document.querySelectorAll('.mt-slot')]; },
    /* Décrit l'état observable d'une table : street affichée, cartes, pot, boutons. */
    describe() {
      return window.__pf.slots().map((s, i) => {
        const vis = el => el.getBoundingClientRect().width > 0;
        const fh = [...s.querySelectorAll('button.ab,button[class*="ab-"]')].filter(vis).map(b => b.textContent.trim().slice(0, 12));
        const hero = [...s.querySelectorAll('button.gto-btn,button[class*="gto-btn-"]')].filter(vis).map(b => b.textContent.trim().slice(0, 20));
        const hdr = [...s.querySelectorAll('.mtr-actions')].map(e => e.firstElementChild && e.firstElementChild.textContent.trim())[0] || null;
        const r = s.getBoundingClientRect();
        // `.training-table-zone` = ovale de la mosaïque · `.t1-table-area` = rendu 1T.
        const z = s.querySelector('.training-table-zone') || s.querySelector('.t1-table-area');
        const zr = z && z.getBoundingClientRect();
        return {
          table: i + 1, header: hdr, fhButtons: fh, heroButtons: hero,
          cards: s.querySelectorAll('.card').length,
          seats: s.querySelectorAll('.pf-player-seat').length,
          unavailable: /SPOT INDISPONIBLE/.test(s.textContent),
          box: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
          // Ovale de jeu : c'est LUI qui doit rester lisible. Un bandeau ajouté
          // sous la table (actions Full Hand, verdicts…) le rabote silencieusement.
          zone: zr ? { w: Math.round(zr.width), h: Math.round(zr.height) } : null,
        };
      });
    },
    /* Joue une décision non-terminale sur chaque table (évite Fold et All-in qui
       clôturent le coup et empêcheraient d'observer le déroulé postflop). */
    actAll() {
      const out = [];
      window.__pf.slots().forEach(s => {
        const b = [...s.querySelectorAll('button.gto-btn,button[class*="gto-btn-"]')]
          .filter(x => x.getBoundingClientRect().width > 0)
          .filter(x => !/Fold/i.test(x.textContent));
        const pick = b.find(x => !/Push|Tapis|All-?in/i.test(x.textContent)) || b[0];
        if (pick) { out.push(pick.textContent.trim().slice(0, 18)); pick.click(); } else out.push(null);
      });
      return out;
    },
    fhAct(idx, re) {
      const s = window.__pf.slots()[idx]; if (!s) return null;
      const rx = new RegExp(re);
      const b = [...s.querySelectorAll('button.ab,button[class*="ab-"]')]
        .filter(x => x.getBoundingClientRect().width > 0).find(x => rx.test(x.textContent.trim()));
      if (b) { b.click(); return b.textContent.trim().slice(0, 12); } return null;
    },
  };
};

/* ── Un cas de la matrice ──────────────────────────────────────────────────── */
async function runCase(browser, mode, type, tables) {
  const id = `${mode}-${type}-${tables}T`;
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));
  const res = { id, mode, type, tables, ok: false, steps: [], consoleErrors };
  try {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    /* L'UI se monte en plusieurs passes (React + chargement des spots) : on
       ATTEND chaque cible au lieu de parier sur un délai fixe, sinon l'audit
       échoue pour une raison qui n'a rien à voir avec ce qu'il mesure. */
    const waitFor = async (fn, argv, label, ms = 8000) => {
      const t0 = Date.now();
      for (;;) {
        await page.evaluate(PAGE_HELPERS);
        if (await page.evaluate(fn, argv)) return;
        if (Date.now() - t0 > ms) throw new Error(`introuvable : ${label}`);
        await sleep(150);
      }
    };
    await waitFor(() => {
      const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent));
      if (e) { e.click(); return true; } return false;
    }, null, 'onglet Entraineur');
    await waitFor(() => !!document.querySelector('.mtbtn'), null, 'bandeau Multitabling');

    // Ordre de clic VOLONTAIREMENT « type puis tables » : c'est l'ordre qui
    // remettait silencieusement 1T avant la correction (§14).
    await waitFor(l => window.__pf.clickLeaf(l), MODE_LABEL[mode], `mode ${mode}`); await sleep(200);
    await waitFor(l => window.__pf.clickLeaf(l), TYPE_LABEL[type], `type ${type}`); await sleep(250);
    await waitFor(n => window.__pf.clickNT(n), tables, `${tables}T`); await sleep(300);

    const ntState = await page.evaluate(() => window.__pf.ntState());
    res.steps.push({ step: 'config', ntState });
    const selected = ntState.find(x => x.on);
    res.tableCountSelected = selected ? +selected.t.replace('T', '') : null;
    if (res.tableCountSelected !== tables) throw new Error(`UI a retenu ${res.tableCountSelected}T au lieu de ${tables}T`);

    await waitFor(() => window.__pf.launch(), null, 'bouton Lancer la session');
    await waitFor(() => window.__pf.slots().length > 0, null, 'mosaïque de tables');
    await sleep(900);
    await page.evaluate(PAGE_HELPERS);

    let d = await page.evaluate(() => window.__pf.describe());
    res.slotsMounted = d.length;
    if (d.length !== tables) throw new Error(`${d.length} table(s) montée(s) au lieu de ${tables}`);
    if (d.some(x => x.unavailable)) throw new Error('au moins une table sans spot (tuile SPOT INDISPONIBLE)');
    if (d.some(x => x.seats === 0)) throw new Error('au moins une table sans sièges rendus');
    res.steps.push({ step: 'launched', tables: d.map(x => ({ t: x.table, seats: x.seats, cards: x.cards, box: x.box })) });

    // Géométrie : toutes les tuiles doivent avoir la même taille (mosaïque saine).
    const widths = [...new Set(d.map(x => x.box.w))], heights = [...new Set(d.map(x => x.box.h))];
    res.uniformTiles = widths.length === 1 && heights.length === 1;

    // Décision Hero sur chaque table.
    const acted = await page.evaluate(() => window.__pf.actAll());
    res.steps.push({ step: 'heroActed', acted });
    /* Le Villain « réfléchit » puis anime ses jetons, table par table et à des
       rythmes différents. On attend donc un état STABLE (deux relevés consécutifs
       identiques) et non « la première table qui bascule » : sinon on photographie
       un instant où d'autres tables sont encore en transition — et on leur
       attribuerait ensuite à tort le mouvement causé par notre propre clic. */
    const snap = async () => {
      await page.evaluate(PAGE_HELPERS);
      return (await page.evaluate(() => window.__pf.describe())).map(x => `${x.header}|${x.cards}`);
    };
    /* `settle` rend la main quand l'écran est CALME (3 relevés identiques ≈ 2s) —
       une simple égalité sur deux relevés suffirait à sortir pendant le temps de
       réflexion du Villain, où rien ne bouge encore. En Full Hand on exige en plus
       qu'au moins une table soit arrivée au postflop, sauf si le délai plafond est
       atteint (cas légitime : toutes les tables se sont terminées au préflop). */
    const settle = async (maxMs, needFh = false) => {
      const t0 = Date.now(); let prev = await snap(); let same = 0;
      while (Date.now() - t0 < maxMs) {
        await sleep(700);
        const cur = await snap();
        same = cur.join('¦') === prev.join('¦') ? same + 1 : 0;
        prev = cur;
        if (same < 3) continue;
        if (!needFh) return;
        const dd = await page.evaluate(() => window.__pf.describe());
        if (dd.some(x => x.fhButtons.length > 0)) return;
      }
    };
    if (type === 'full' || type === 'session') {
      await settle(22000, true);
      await page.evaluate(PAGE_HELPERS);
      d = await page.evaluate(() => window.__pf.describe());
    } else {
      await sleep(4200);
      await page.evaluate(PAGE_HELPERS);
      d = await page.evaluate(() => window.__pf.describe());
    }
    res.afterAct = d.map(x => ({ t: x.table, header: x.header, fh: x.fhButtons.length, cards: x.cards }));

    // Full Hand / Session : au moins une table doit avoir atteint le postflop avec
    // ses contrôles de coup complet. (Les spots de push/fold se terminent au
    // préflop par nature : all-in = plus de décision.)
    if (type === 'full' || type === 'session') {
      const withFh = d.filter(x => x.fhButtons.length > 0);
      res.tablesInFullHand = withFh.length;
      if (withFh.length === 0) throw new Error('aucune table n\'a atteint le postflop en coup complet');

      // Indépendance : agir sur UNE table ne doit pas bouger les autres.
      const idx = d.findIndex(x => x.fhButtons.length > 0);
      const before = await snap();
      await page.evaluate(i => window.__pf.fhAct(i, '^(Bet ½|Check)'), idx);
      let after = before;
      const t1 = Date.now();
      for (;;) {                       // attend que la table jouée bouge (ou timeout)
        await sleep(500);
        after = await snap();
        if (after[idx] !== before[idx] || Date.now() - t1 > 12000) break;
      }
      const moved = before.map((b, i) => b !== after[i]);
      res.independence = { actedOn: idx + 1, movedTables: moved.map((m, i) => m ? i + 1 : null).filter(Boolean) };
      if (moved.filter(Boolean).length > 1) throw new Error(`une action sur la table ${idx + 1} a modifié les tables ${res.independence.movedTables.join(',')}`);

      /* §12 — le feutre ne doit pas être écrasé par le bandeau d'actions ajouté.
         On ne compare PAS les ovales entre eux : deux tables dans des états
         différents (l'une au préflop avec sa zone d'actions haute, l'autre au
         flop avec ses contrôles compacts) ont légitimement des ovales de tailles
         différentes. L'invariant de mise en page, lui, est la tuile — déjà
         vérifié à l'ouverture (uniformTiles). */
      const inHand = await page.evaluate(() => window.__pf.describe());
      res.zonesInHand = inHand.map(x => x.zone);
      const zh = inHand.map(x => (x.zone ? x.zone.h : 0));
      if (zh.some(h => h < MIN_ZONE_H)) throw new Error(`feutre écrasé pendant le coup complet (hauteurs ${zh.join('/')}px, minimum ${MIN_ZONE_H})`);
    }

    if (SHOTS) {
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
      await sleep(250);
      const out = path.join(OUTDIR, `${id}.png`);
      await page.screenshot({ path: out });
      res.shot = out;
    }
    res.ok = true;
  } catch (err) {
    res.error = String(err.message || err);
    if (SHOTS) {
      try {
        const out = path.join(OUTDIR, `FAIL-${id}.png`);
        await page.screenshot({ path: out }); res.shot = out;
      } catch { /* noop */ }
    }
  } finally {
    await page.close();
  }
  return res;
}

/* ── Boucle principale ─────────────────────────────────────────────────────── */
const browser = await puppeteer.launch({
  executablePath, headless: 'new',
  args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});
const all = [];
try {
  for (const mode of MODES) for (const type of TYPES) for (const tables of TABLES) {
    const r = await runCase(browser, mode, type, tables);
    all.push(r);
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id}` +
      (r.error ? `  — ${r.error}` : '') +
      (r.tablesInFullHand != null ? `  (coup complet sur ${r.tablesInFullHand}/${r.tables})` : '') +
      (r.consoleErrors.length ? `  [${r.consoleErrors.length} erreurs console]` : ''));
  }
} finally { await browser.close(); }

const report = path.join(OUTDIR, 'report.json');
fs.writeFileSync(report, JSON.stringify({ url: URL, viewport: `${W}x${H}`, at: new Date().toISOString(), cases: all }, null, 1));
const failed = all.filter(r => !r.ok);
console.log(`\n${all.length - failed.length}/${all.length} combinaisons OK — rapport : ${report}`);
process.exit(failed.length ? 1 : 0);
