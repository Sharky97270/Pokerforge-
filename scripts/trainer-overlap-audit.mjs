#!/usr/bin/env node
/**
 * trainer-overlap-audit — mesure APPARIÉE des chevauchements du Trainer 1T.
 *
 * Pourquoi apparié : les spots sont tirés au hasard. À n=30 l'intervalle de
 * confiance sur un taux global fait encore ±17 points — assez pour prendre du
 * bruit pour un progrès. On ne compare donc pas deux échantillons : pour CHAQUE
 * spot tiré on mesure la mise en page actuelle, on injecte la candidate à chaud,
 * on re-mesure le MÊME spot, puis on retire l'injection. Le tirage se simplifie
 * dans la différence ; il reste un test des signes sur les paires.
 *
 * Boîtes mesurées : les FEUILLES peintes (plaque, cartes, avatar, badge de mise,
 * blinde, bouton D, board, pot) — pas le conteneur de siège, qui englobe les
 * cartes (hautes et étroites) et croise un tas voisin sans qu'un pixel affiché
 * ne se recouvre.
 *
 * Deux pièges qui ont chacun invalidé une campagne de mesure, et que le script
 * traite désormais lui-même :
 *   1. Une session a un nombre FINI de mains. Passé la dernière, la table
 *      disparaît et les tirages suivants mesurent une page vide. On relance.
 *   2. Un tirage sans tas de MISE ne dit rien des chevauchements. On ne compte
 *      que les tirages qualifiés — sinon n gonfle sans porter d'information.
 * Le résumé affiche `tirages`, `ecartesSansMise` et `sessionsRelancees` : si ces
 * chiffres n'ont pas l'air sains, le n annoncé ne vaut rien.
 *
 * Prérequis : le serveur de dev tourne (voir .claude/launch.json, port 7788).
 *
 *   node scripts/trainer-overlap-audit.mjs --n=60            # mesure seule
 *   node scripts/trainer-overlap-audit.mjs --n=60 --candidate=essai.css
 *   node scripts/trainer-overlap-audit.mjs --n=60 --w=1366 --h=768
 *
 * Sans --candidate, « avant » et « après » sont identiques : le script se
 * contente d'inventorier les chevauchements de la mise en page en place.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const URL = arg('url', 'http://localhost:7788');
const N = +arg('n', 40);
const W = +arg('w', 1600);
const H = +arg('h', 950);
const OUT = path.resolve(arg('out', 'audit-result.json'));
const MIN_AREA = +arg('minArea', 16);   // px² : sous 4x4 c'est de l'antialiasing

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }

// La candidate à éprouver : un fichier CSS injecté à chaud sur chaque spot, puis
// retiré. Vide par défaut — le script mesure alors simplement l'existant.
const CANDIDATE_PATH = arg('candidate', '');
const CANDIDATE_CSS = CANDIDATE_PATH ? fs.readFileSync(path.resolve(CANDIDATE_PATH), 'utf8') : '';

/* Certaines candidates ne sont pas exprimables en CSS : les ancres de l'anneau
   sont calculées en JS et posées en left/top. Un fichier --candidateJs contient
   alors le corps d'une fonction `apply()` exécutée dans la page après la mesure
   « avant » ; elle doit renvoyer une fonction de restauration, appelée après la
   mesure « après ». L'appariement reste donc intact : même spot, même DOM. */
const CANDIDATE_JS_PATH = arg('candidateJs', '');
const CANDIDATE_JS = CANDIDATE_JS_PATH ? fs.readFileSync(path.resolve(CANDIDATE_JS_PATH), 'utf8') : '';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath, headless: 'new',
  args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H },
});

try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });

  const click = (txt, exact = true) => page.evaluate((t, e) => {
    const el = [...document.querySelectorAll('button, .ntab')]
      .find(x => (e ? x.textContent.trim() === t : x.textContent.includes(t)));
    if (el) { el.click(); return true; } return false;
  }, txt, exact);

  const startSession = async () => {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await click('Entraineur GTO'); await sleep(900);
    await click('1T'); await sleep(150);
    await click('6J'); await sleep(250);
    await click('Lancer la session', false); await sleep(1400);
    // Fige les animations : une frame instable fausse les rects.
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
  };
  await startSession();

  /* Une session du Trainer a un nombre FINI de mains : passé la dernière, le
     bouton « Main suivante » devient « Resultats » et la table disparaît. Sans
     cette reprise, l'audit continuait de « tirer » dans le vide — mesuré :
     900 tirages dont 888 sur une page sans table, pour 12 spots utiles. Un n
     affiché de 900 valait alors un n réel de quelques dizaines. */
  const tableAlive = () => page.evaluate(() => document.querySelectorAll('.t1-left .pf-player-seat').length > 0);
  let sessionsStarted = 1;
  const ensureSession = async () => {
    if (await tableAlive()) return;
    sessionsStarted++;
    await startSession();
  };

  // ── Le mesureur, exécuté dans la page ──
  const MEASURE = () => {
    const kindOf = el => {
      if (el.matches('.pf-seat-nameplate')) return 'plaque';
      if (el.matches('.pf-hole-cards, .pf-villain-backs')) return 'cartes';
      if (el.matches('.pf-avatar-premium, .seat-avatar-ring')) return 'avatar';
      if (el.matches('.pf-fold-chip, .pf-multiway-chip, .pf-seat-hero-chip, .seat-action-badge')) return 'pastille';
      return null;
    };
    const boxes = [];
    const push = (kind, owner, el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity < 0.05) return;
      boxes.push({ kind, owner, x: r.x, y: r.y, w: r.width, h: r.height });
    };

    document.querySelectorAll('.t1-left .pf-player-seat').forEach(seat => {
      const pos = seat.getAttribute('data-seat') || '?';
      seat.querySelectorAll('.pf-seat-nameplate,.pf-hole-cards,.pf-villain-backs,.pf-avatar-premium,.pf-fold-chip,.pf-multiway-chip,.pf-seat-hero-chip,.seat-action-badge')
        .forEach(el => { const k = kindOf(el); if (k) push(k, pos, el); });
    });
    document.querySelectorAll('.t1-left .pf-seat-action-zone').forEach(z => {
      const el = z.querySelector('.pf-action-chip-badge') || z.firstElementChild;
      if (el) push('mise', z.getAttribute('data-seat') || '?', el);
    });
    document.querySelectorAll('.t1-left .pf-blind-anchor').forEach(a => {
      const el = a.querySelector('.pf-blind-stack') || a.firstElementChild;
      // Pas de \b : le texte est « 0.5bbSB », il n'y a donc pas de frontière de mot
      // avant SB. Avec \b tous les tas de blinde recevaient le même propriétaire et
      // une paire SB↔BB était écartée à tort comme « même siège ».
      const lbl = (a.textContent.match(/(SB|BB)/) || [, 'blinde'])[1];
      if (el) push('blinde', lbl, el);
    });
    const one = (sel, kind) => { const el = document.querySelector(sel); if (el) push(kind, '-', el); };
    one('.t1-left .dealer-btn', 'boutonD');
    one('.t1-left .pf-board-zone', 'board');
    one('.t1-left .pf-pot-readout', 'pot');

    // ── Chevauchements entre feuilles n'appartenant PAS au même siège ──
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.owner !== '-' && a.owner === b.owner) continue;      // même siège : normal
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        const area = ox * oy;
        const cause = [a.kind, b.kind].sort().join('↔');
        overlaps.push({ cause, area: Math.round(area), ox: Math.round(ox), oy: Math.round(oy),
                        a: `${a.kind}:${a.owner}`, b: `${b.kind}:${b.owner}` });
      }
    }
    // Hauteur des blocs de siège (feuilles empilées) — le budget vertical.
    const blocks = {};
    document.querySelectorAll('.t1-left .pf-player-seat').forEach(seat => {
      const pos = seat.getAttribute('data-seat') || '?';
      const plate = seat.querySelector('.pf-seat-nameplate');
      blocks[pos] = {
        blockH: Math.round(seat.getBoundingClientRect().height),
        plateH: plate ? Math.round(plate.getBoundingClientRect().height) : null,
        plateW: plate ? Math.round(plate.getBoundingClientRect().width) : null,
      };
    });
    return { boxes: boxes.length, overlaps, blocks };
  };

  const filt = res => ({ ...res, overlaps: res.overlaps.filter(o => o.area >= MIN_AREA) });

  // Spot suivant : on répond (n'importe quelle action), puis on passe.
  const nextSpot = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button.gto-btn,button[class*="gto-btn-"]')]
        .filter(x => x.getBoundingClientRect().width > 0);
      b[0]?.click();
    });
    await sleep(700);
    await page.evaluate(() => {
      const nx = document.querySelector('.gto-next-btn')
        || [...document.querySelectorAll('button')].find(x => /suivant|next|nouvelle main/i.test(x.textContent) && x.getBoundingClientRect().width > 0);
      nx?.click();
    });
    await sleep(900);
    await ensureSession();
  };

  // ── Un tirage ne COMPTE que s'il charge l'anneau ──
  // Mesuré : sur 40 tirages preflop, 6 seulement affichaient un tas de MISE ; les
  // 34 autres n'avaient que les deux blindes et ne pouvaient donc rien prouver sur
  // les chevauchements. Compter ces tirages-là gonfle n sans ajouter d'information
  // — c'est précisément la façon dont un taux global se met à mesurer du bruit.
  // On tire donc jusqu'à obtenir N spots QUALIFIÉS (≥1 tas de mise).
  // NB : le critère ne retient PAS les blindes. Elles sont sur l'anneau à chaque
  // tirage, donc les inclure re-qualifierait tout et annulerait le filtre.
  const chipsOnRing = () => page.evaluate(() =>
    document.querySelectorAll('.t1-left .pf-seat-action-zone').length);

  const spots = [];
  let draws = 0, skipped = 0;
  const MAX_DRAWS = N * 30;
  while (spots.length < N && draws < MAX_DRAWS) {
    draws++;
    const k = spots.length;
    if (await chipsOnRing() === 0) {
      skipped++;
      await nextSpot();
      continue;
    }
    // Identité du spot, pour vérifier que l'appariement porte bien sur le même tirage.
    const id = await page.evaluate(() => {
      const seats = [...document.querySelectorAll('.t1-left .pf-player-seat')];
      return seats.map(s => s.getAttribute('data-seat')).join(',') + '|' +
        (document.querySelector('.pf-hole-cards')?.textContent || '') + '|' +
        [...document.querySelectorAll('.t1-left .pf-seat-action-zone')].map(z => z.getAttribute('data-seat') + ':' + z.textContent.trim()).join(';');
    });

    const before = filt(await page.evaluate(MEASURE));
    // Sans candidate, addStyleTag refuse un contenu vide : on injecte un commentaire,
    // ce qui laisse « après » identique à « avant » — la mesure seule.
    const handle = await page.addStyleTag({ content: CANDIDATE_CSS || '/* aucune candidate */' });
    if (CANDIDATE_JS) await page.evaluate(src => { window.__undoCandidate = new Function(src)(); }, CANDIDATE_JS);
    await sleep(60);
    const after = filt(await page.evaluate(MEASURE));
    if (CANDIDATE_JS) await page.evaluate(() => { window.__undoCandidate?.(); window.__undoCandidate = null; });
    const idAfter = await page.evaluate(() => {
      const seats = [...document.querySelectorAll('.t1-left .pf-player-seat')];
      return seats.map(s => s.getAttribute('data-seat')).join(',') + '|' +
        (document.querySelector('.pf-hole-cards')?.textContent || '') + '|' +
        [...document.querySelectorAll('.t1-left .pf-seat-action-zone')].map(z => z.getAttribute('data-seat') + ':' + z.textContent.trim()).join(';');
    });
    await handle.evaluate(el => el.remove());
    await sleep(40);

    spots.push({ k, id, paired: id === idAfter, before, after });
    await nextSpot();
  }

  // ── Synthèse appariée ──
  const tally = key => {
    const m = {};
    spots.forEach(s => s[key].overlaps.forEach(o => { m[o.cause] = (m[o.cause] || 0) + 1; }));
    return m;
  };
  const causesBefore = tally('before'), causesAfter = tally('after');
  const allCauses = [...new Set([...Object.keys(causesBefore), ...Object.keys(causesAfter)])].sort();

  let better = 0, worse = 0, same = 0;
  const perSpot = spots.map(s => {
    const d = s.after.overlaps.length - s.before.overlaps.length;
    if (d < 0) better++; else if (d > 0) worse++; else same++;
    return { k: s.k, paired: s.paired, before: s.before.overlaps.length, after: s.after.overlaps.length };
  });
  const cleanBefore = spots.filter(s => s.before.overlaps.length === 0).length;
  const cleanAfter = spots.filter(s => s.after.overlaps.length === 0).length;

  const plate = k => {
    const vals = [];
    spots.forEach(s => Object.entries(s[k].blocks).forEach(([pos, b]) => { if (b.plateH) vals.push(b.plateH); }));
    return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
  };

  // Test des signes bilatéral sur les paires discordantes (binomiale p=0.5).
  const nd = better + worse;
  const logC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; };
  let pval = null;
  if (nd > 0) {
    const x = Math.min(better, worse);
    let tail = 0;
    for (let i = 0; i <= x; i++) tail += Math.exp(logC(nd, i) + nd * Math.log(0.5));
    pval = Math.min(1, 2 * tail);
  }

  const summary = {
    n: spots.length,
    viewport: `${W}x${H}`,
    candidate: CANDIDATE_PATH || null,
    candidateJs: CANDIDATE_JS_PATH || null,
    tirages: draws,
    ecartesSansMise: skipped,
    sessionsRelancees: sessionsStarted,
    tousApparies: spots.every(s => s.paired),
    spotsSansChevauchement: { avant: cleanBefore, apres: cleanAfter },
    paires: { mieux: better, pire: worse, identique: same, discordantes: nd, pValeurTestDesSignes: pval === null ? null : +pval.toFixed(5) },
    totalChevauchements: {
      avant: spots.reduce((a, s) => a + s.before.overlaps.length, 0),
      apres: spots.reduce((a, s) => a + s.after.overlaps.length, 0),
    },
    parCause: Object.fromEntries(allCauses.map(c => [c, { avant: causesBefore[c] || 0, apres: causesAfter[c] || 0 }])),
    hauteurPlaqueMoyenne: { avant: plate('before'), apres: plate('after') },
  };

  fs.writeFileSync(OUT, JSON.stringify({ summary, perSpot, spots }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  console.log(`\ndétail -> ${OUT}`);
} finally {
  await browser.close();
}
