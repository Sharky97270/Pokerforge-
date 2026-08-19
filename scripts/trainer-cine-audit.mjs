#!/usr/bin/env node
/**
 * trainer-cine-audit — la table RACONTE-T-ELLE l'action, ou l'annonce-t-elle ?
 *
 * L'audit de géométrie (`trainer-bet-anchor-audit`) répond à « où sont les
 * objets ». Celui-ci répond à « dans quel ORDRE et à quelle VITESSE ils
 * bougent » — c'est la question du §12 : le pot ne doit jamais prendre sa
 * valeur finale avant que le joueur ait pu comprendre l'action.
 *
 * Méthode : un échantillonneur est injecté dans la page et relève, à chaque
 * frame, l'état complet de la table (street, texte du pot, tas de mise avec
 * leur position, éléments en vol). On déclenche ensuite une action, puis on
 * relit la bande. Un seul relevé ne dirait rien : c'est la CHRONOLOGIE qui
 * porte le défaut.
 *
 * Ce qu'on cherche, et pourquoi :
 *
 *   potAvantJetons   Le pot change-t-il de valeur AVANT qu'un jeton ait bougé ?
 *                    Si oui, l'animation ne raconte plus rien : elle décore un
 *                    résultat déjà annoncé (§12).
 *   collecteVisible  À la fin d'un tour d'enchères, les tas partent-ils vers le
 *                    pot, ou disparaissent-ils sur place ? (§27)
 *   ghostChips       Un tas d'une street précédente survit-il au changement de
 *                    street ? (§28)
 *   volDepuisSiege   Les jetons en vol partent-ils du siège de CELUI qui a misé,
 *                    ou d'un point fixe ? Un vol qui part toujours du même
 *                    endroit ne dit pas qui a payé (§9).
 *
 * Prérequis : serveur de dev lancé (.claude/launch.json, port 7788).
 *
 *   node scripts/trainer-cine-audit.mjs --tables=1T --n=6
 *   npm run audit:cine:trainer -- --tables=4T --n=4 --out=x.json
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const flag = n => process.argv.includes(`--${n}`);

const URL = arg('url', 'http://localhost:7788');
const TABLES = arg('tables', '1T');
const STRUCT = arg('struct', '6J');
const W = +arg('w', 1600);
const H = +arg('h', 950);
const N = +arg('n', 6);
const OUT = arg('out', '');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge introuvable.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Échantillonneur posé dans la page. Il tourne à chaque frame et garde une
   bande de relevés horodatés. Volontairement bavard : c'est le script node qui
   trie, la page ne doit surtout pas décider ce qui est intéressant. */
const SAMPLER = () => {
  const box = el => { const b = el.getBoundingClientRect(); return { x: +(b.x + b.width / 2).toFixed(1), y: +(b.y + b.height / 2).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const painted = el => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
    const b = el.getBoundingClientRect();
    return b.width > 1 && b.height > 1;
  };
  const zone = () => document.querySelector('.training-table-zone, .t1-table-area');
  const snap = () => {
    const z = zone();
    if (!z) return null;
    const potEl = z.querySelector('.pf-pot-readout');
    const bets = [...z.querySelectorAll('.pf-seat-action-zone')].filter(painted).map(e => ({
      pos: e.getAttribute('data-seat'),
      txt: (e.textContent || '').trim().replace(/\s+/g, ' '),
      ...box(e),
    }));
    const blinds = [...z.querySelectorAll('.pf-blind-anchor')].filter(painted).map(e => ({ txt: (e.textContent || '').trim(), ...box(e) }));
    // Tout ce qui « vole » aujourd'hui, quelle que soit la classe utilisée.
    const flying = [...z.querySelectorAll('.chip-fly,.chip-hero-fly,.chip-vil-fly,.chip-animation,.pf-chip-collect')]
      .filter(painted).map(e => ({ cls: e.className, txt: (e.textContent || '').trim().slice(0, 18), ...box(e) }));
    const streetEl = (z.closest('.tw,.t1-left,body') || document).querySelector('.mtr-street.cur');
    return {
      t: +performance.now().toFixed(1),
      street: streetEl ? streetEl.textContent.trim() : null,
      pot: potEl && painted(potEl) ? (potEl.textContent || '').trim().replace(/\s+/g, ' ') : null,
      bets, blinds, flying,
      board: z.querySelectorAll('.mt-board-zone .card, .pf-board-zone .card').length,
    };
  };
  window.__cine = { tape: [], on: false };
  const loop = () => {
    if (window.__cine.on) {
      const s = snap();
      if (s) {
        const last = window.__cine.tape[window.__cine.tape.length - 1];
        // On ne garde qu'un relevé quand quelque chose CHANGE : une bande de
        // 600 frames identiques ne porte aucune information et masque le reste.
        const key = JSON.stringify([s.street, s.pot, s.board, s.bets, s.flying.length]);
        if (!last || last.__key !== key) { s.__key = key; window.__cine.tape.push(s); }
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
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
  // Coup complet : c'est la seule façon d'atteindre un changement de street,
  // donc la seule où la COLLECTE peut être observée.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,span')].find(e => e.children.length === 0 && /^..?\s*Full Hand$/i.test(e.textContent.trim()));
    let n = el; for (let i = 0; i < 4 && n; i++) { n.click && n.click(); n = n.parentElement; }
  });
  await sleep(300);
  await click('Lancer la session', false);
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.querySelectorAll('.felt-oval').length > 0)) break;
    await sleep(400);
  }
  await sleep(1200);
  await page.evaluate(SAMPLER);

  /* Une décision : on enregistre AVANT de cliquer, on laisse la séquence se
     dérouler, on coupe. La fenêtre est généreuse — mieux vaut de la bande vide
     qu'une collecte tronquée. */
  /* Attendre qu un bouton d action soit REELLEMENT cliquable avant d ouvrir la
     bande : sinon on enregistre le temps de reflexion du vilain, on ne clique
     rien, et le releve ne porte aucune transition (mesure : 2 decisions
     exploitables sur 16 tentatives). */
  const waitForAction = async (ms = 9000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const ready = await page.evaluate(() => {
        const vis = s => [...document.querySelectorAll(s)].filter(x => x.getBoundingClientRect().width > 0);
        return vis('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"],.gto-next-btn,button.btng')
          .some(x => !x.disabled);
      });
      if (ready) return true;
      await sleep(250);
    }
    return false;
  };

  const decisions = [];
  for (let d = 0; d < N; d++) {
    if (!await waitForAction()) break;
    await page.evaluate(() => { window.__cine.tape = []; window.__cine.on = true; });
    const clicked = await page.evaluate(() => {
      const vis = s => [...document.querySelectorAll(s)].filter(x => x.getBoundingClientRect().width > 0);
      const b = vis('button.gto-btn,button[class*="gto-btn-"],button.ab,button[class*="ab-"]').filter(x => !/Fold/i.test(x.textContent));
      const t = b.length ? b[Math.min(1, b.length - 1)] : vis('.gto-next-btn,button.btng')[0];
      if (!t) return null;
      const label = t.textContent.trim().slice(0, 24);
      t.click();
      return label;
    });
    await sleep(3200);
    const tape = await page.evaluate(() => { window.__cine.on = false; return window.__cine.tape; });
    if (clicked && tape.length) decisions.push({ action: clicked, tape });
    await sleep(600);
  }

  /* ── Lecture de la bande ────────────────────────────────────────────────
     Chaque question du §12/§27/§28 devient un prédicat sur la chronologie. */
  const analyse = ({ action, tape }) => {
    const t0 = tape[0].t;
    const rel = s => +(s.t - t0).toFixed(0);
    const potChanges = [];
    const betCounts = [];
    let firstFly = null, firstBetAppear = null, streetChangeAt = null, boardChangeAt = null;
    for (let i = 0; i < tape.length; i++) {
      const s = tape[i], p = tape[i - 1];
      if (p && s.pot !== p.pot) potChanges.push({ at: rel(s), de: p.pot, vers: s.pot });
      if (p && s.street !== p.street && streetChangeAt == null) streetChangeAt = rel(s);
      if (p && s.board !== p.board && boardChangeAt == null) boardChangeAt = rel(s);
      if (firstFly == null && s.flying.length) firstFly = rel(s);
      if (firstBetAppear == null && p && s.bets.length > p.bets.length) firstBetAppear = rel(s);
      betCounts.push({ at: rel(s), n: s.bets.length });
    }
    const firstPot = potChanges.length ? potChanges[0].at : null;
    // Le pot bouge-t-il avant qu'un seul jeton ait bougé ?
    const potAvantJetons = firstPot != null && (firstFly == null || firstPot <= firstFly);
    /* Le libelle de street n est pas toujours monte ; le NOMBRE DE CARTES du
       board, lui, change forcement a chaque street. C est le repere le plus sur. */
    const transitionAt = streetChangeAt != null ? streetChangeAt : boardChangeAt;
    // Y a-t-il eu, autour du changement de street, un vol partant d un tas ?
    const collecteVisible = transitionAt != null && tape.some(s =>
      Math.abs(rel(s) - transitionAt) < 700 && s.flying.length > 0);
    // Un tas survit-il au changement de street ?
    const apresStreet = transitionAt == null ? [] : tape.filter(s => rel(s) > transitionAt + 250);
    const ghostChips = apresStreet.length ? apresStreet[0].bets.map(b => `${b.pos}:${b.txt}`) : [];
    // Les vols partent-ils tous du même point ?
    const departs = tape.flatMap(s => s.flying.map(f => `${Math.round(f.x / 10)},${Math.round(f.y / 10)}`));
    return {
      action,
      relevés: tape.length,
      potChanges, firstFly, firstBetAppear, streetChangeAt, boardChangeAt,
      potAvantJetons, collecteVisible, ghostChips, transitionAt,
      pointsDeDepartDistincts: [...new Set(departs)].length,
      maxTasSimultanes: Math.max(0, ...betCounts.map(b => b.n)),
    };
  };

  const res = decisions.map(analyse);
  const streetOnes = res.filter(r => r.transitionAt != null);
  const summary = {
    mode: TABLES, viewport: `${W}x${H}`, décisions: res.length,
    potChangeSansJetonEnMouvement: `${res.filter(r => r.potAvantJetons).length}/${res.filter(r => r.potChanges.length).length}`,
    changementsDeStreetObservés: streetOnes.length,
    collecteVisible: `${streetOnes.filter(r => r.collecteVisible).length}/${streetOnes.length}`,
    ghostChipsAprèsStreet: streetOnes.filter(r => r.ghostChips.length).map(r => r.ghostChips),
    pointsDeDépartDeVolDistincts: Math.max(0, ...res.map(r => r.pointsDeDepartDistincts)),
    erreursPage: pageErrors,
  };
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUT), JSON.stringify({ summary, decisions: res }, null, 1));
  }
  console.log(JSON.stringify(summary, null, 1));
  if (!res.length) { console.error('AUCUNE DECISION OBSERVEE.' + (pageErrors.length ? '\n' + pageErrors.join('\n') : '')); process.exitCode = 3; }
} finally {
  await browser.close();
}
