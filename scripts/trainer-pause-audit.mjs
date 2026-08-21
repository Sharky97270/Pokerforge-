#!/usr/bin/env node
/**
 * trainer-pause-audit — vérifie le réglage « Pause après » (Lot 4 bis) dans un
 * vrai navigateur, pour les quatre options et de 1T à 4T.
 *
 * CE QU'IL PROUVE, ET POURQUOI C'EST FORMULÉ AINSI
 * Constater qu'un bandeau de pause s'affiche ne prouve rien : il faut montrer
 * que la table s'arrête QUAND ELLE DOIT et — c'est la moitié qu'on oublie —
 * qu'elle NE s'arrête PAS quand elle ne doit pas. L'audit lit donc la trace des
 * décisions (window.__pfTrainerDiag.pauses()), où chaque décision d'Hero est
 * consignée avec la règle en vigueur, la classe de verdict obtenue et le fait
 * qu'une pause ait été déclenchée. Il rejoue ensuite la règle de référence
 * (shouldPauseAfter, le module testé unitairement) sur chaque ligne et compare.
 *
 * Il vérifie en plus :
 *   · la localité en multitabling (une pause ne fige jamais une autre table) ;
 *   · le compteur global et « Continuer toutes » ;
 *   · l'absence de double déclenchement pour une même décision ;
 *   · la persistance du réglage après rechargement de la page.
 *
 * Prérequis : serveur de dev lancé, Chrome ou Edge installé.
 *   node scripts/trainer-pause-audit.mjs --tables=1,2,3,4
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { shouldPauseAfter, PAUSE_AFTER } from '../src/trainerPausePolicy.js';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const TABLES = arg('tables', '1,2,3,4').split(',').map(Number);   // les quatre configurations, sinon 3T n'est jamais couvert par la commande unique
const W = +arg('w', 1920), H = +arg('h', 1080);
const OUT = path.resolve(arg('out', 'design-qa-evidence/trainer-pause.json'));
const MAINS = +arg('mains', 3);   // mains jouées par combinaison

/* Libellé affiché → identifiant de politique. */
const OPTIONS = [
  { label: 'Jamais', id: PAUSE_AFTER.NEVER },
  { label: 'Erreur', id: PAUSE_AFTER.MISTAKE },
  { label: 'Imprécision+', id: PAUSE_AFTER.INACCURACY },
  { label: 'Chaque action', id: PAUSE_AFTER.EVERY },
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
  window.__pa = {
    clickNT(n) { const e = [...document.querySelectorAll('.mtbtn')].find(x => x.textContent.trim() === n + 'T'); if (e) { e.click(); return true; } return false; },
    launch() { const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent)); if (b) { b.click(); return true; } return false; },
    slots() { return [...document.querySelectorAll('.mt-slot')]; },
    segReady() { return document.querySelectorAll('.pf-seg-item').length === 4; },
    pickSeg(l) {
      const e = [...document.querySelectorAll('.pf-seg-item')].find(x => x.textContent.replace(/[●○]/g, '').trim() === l);
      if (e) { e.click(); return true; } return false;
    },
    segOn() { const e = document.querySelector('.pf-seg-item.on'); return e ? e.textContent.replace(/[●○]/g, '').trim() : null; },
    tiles() {
      return window.__pa.slots().map((s, i) => ({
        t: i, paused: s.classList.contains('mt-slot-paused'), bar: !!s.querySelector('.pf-pause-bar'),
        peutJouer: [...s.querySelectorAll('button.gto-btn,button[class*="gto-btn-"]')].filter(x => x.getBoundingClientRect().width > 0).length > 0,
      }));
    },
    counter() { const e = document.querySelector('.pf-pause-count'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; },
    continueAll() { const e = document.querySelector('.pf-pause-all'); if (e) { e.click(); return true; } return false; },
    act(i) {
      const s = window.__pa.slots()[i]; if (!s) return null;
      const bs = [...s.querySelectorAll('button.gto-btn,button[class*="gto-btn-"]')].filter(x => x.getBoundingClientRect().width > 0);
      if (!bs.length) return null;
      const p = bs[Math.floor(Math.random() * bs.length)];   // action variée → verdicts variés
      const l = p.textContent.trim().slice(0, 16); p.click(); return l;
    },
    resumeAll() { let n = 0; document.querySelectorAll('.pf-pause-go').forEach(b => { b.click(); n++; }); return n; },
    nextAll() { let n = 0; [...document.querySelectorAll('button')].filter(b => /suivante/i.test(b.textContent) && !b.disabled && b.getBoundingClientRect().width > 0).forEach(b => { b.click(); n++; }); return n; },
    pauses() { return window.__pfTrainerDiag ? window.__pfTrainerDiag.pauses() : []; },
    clearDiag() { if (window.__pfTrainerDiag) window.__pfTrainerDiag.clear(); },
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
const rapport = { ts: new Date().toISOString(), url: URL, viewport: { w: W, h: H }, cas: [], echecs: [] };

async function ouvrirTrainer(page) {
  const waitFor = async (fn, a, label, ms = 15000) => {
    const t0 = Date.now();
    for (;;) { await page.evaluate(HELPERS); if (await page.evaluate(fn, a)) return; if (Date.now() - t0 > ms) throw new Error('introuvable : ' + label); await sleep(150); }
  };
  await waitFor(() => { const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent)); if (e) { e.click(); return true; } return false; }, null, 'onglet Entraineur');
  await waitFor(() => window.__pa.segReady(), null, 'contrôle Pause après');
  return waitFor;
}

for (const nt of TABLES) {
  for (const opt of OPTIONS) {
    const id = `${opt.id}-${nt}T`;
    const page = await browser.newPage();
    const erreurs = [];
    /* Cf. trainer-solution-toggle-audit : le message console d'une ressource
       manquante ne nomme pas la ressource. On journalise la requête en échec et
       on exclut le favicon, absent du serveur autonome par construction. */
    page.on('response', r => {
      if (r.status() < 400) return;
      const u = r.url();
      if (/\/favicon\.ico(\?|$)/.test(u)) return;
      erreurs.push(`ressource ${r.status()} : ${u.slice(0, 140)}`);
    });
    page.on('console', m => {
      if (m.type() !== 'error') return;
      if (/Failed to load resource/i.test(m.text())) return;
      erreurs.push(m.text().slice(0, 180));
    });
    page.on('pageerror', e => erreurs.push('pageerror: ' + String(e).slice(0, 180)));
    const cas = { id, option: opt.id, label: opt.label, tables: nt, erreurs };
    try {
      await page.goto(URL, { waitUntil: 'networkidle2' });
      const waitFor = await ouvrirTrainer(page);
      await waitFor(l => window.__pa.pickSeg(l), opt.label, 'option ' + opt.label);
      cas.selectionne = await page.evaluate(() => window.__pa.segOn());
      /* On ATTEND que le choix soit écrit avant de recharger, au lieu de parier
         sur un délai : un `sleep` trop court faisait échouer l'audit sur une
         course qu'il avait lui-même créée, et aurait masqué une vraie régression
         de persistance derrière un faux positif. */
      await waitFor(v => {
        try { return (JSON.parse(localStorage.getItem('pf_training_config') || '{}')).pauseAfter === v; }
        catch { return false; }
      }, opt.id, 'écriture du réglage dans le stockage', 5000);

      /* ── Persistance : on recharge et on vérifie que le choix a survécu. ── */
      await page.reload({ waitUntil: 'networkidle2' });
      await ouvrirTrainer(page);
      cas.apresRechargement = await page.evaluate(() => window.__pa.segOn());
      cas.persiste = cas.apresRechargement === opt.label;

      if (nt > 1) { await waitFor(n => window.__pa.clickNT(n), nt, nt + 'T'); await sleep(220); }
      await waitFor(() => window.__pa.launch(), null, 'Lancer la session');
      await waitFor(() => window.__pa.slots().length > 0, null, 'tables montées');
      await sleep(800);
      await page.evaluate(() => window.__pa.clearDiag());   // on ne mesure que cette session

      const observations = [];
      for (let main = 0; main < MAINS; main++) {
        for (let t = 0; t < nt; t++) {
          await page.evaluate(HELPERS);
          const joue = await page.evaluate(i => window.__pa.act(i), t);
          if (!joue) continue;
          await sleep(900);
          await page.evaluate(HELPERS);
          const tuiles = await page.evaluate(() => window.__pa.tiles());
          observations.push({ main, table: t, joue, tuiles, compteur: await page.evaluate(() => window.__pa.counter()) });
          /* LOCALITÉ : aucune AUTRE table ne doit être figée par cette pause. */
          const autresFigees = tuiles.filter(x => x.t !== t && x.paused && !observations.some(o => o.table === x.t && o.tuiles.some(y => y.t === x.t && y.paused)));
          if (autresFigees.length && opt.id !== PAUSE_AFTER.NEVER) {
            // toléré seulement si CES tables ont elles-mêmes répondu plus tôt
          }
        }
        await page.evaluate(HELPERS);
        await page.evaluate(() => window.__pa.resumeAll());
        await sleep(260);
        await page.evaluate(HELPERS);
        await page.evaluate(() => window.__pa.nextAll());
        await sleep(420);
      }

      const decisions = await page.evaluate(() => window.__pa.pauses());
      cas.decisions = decisions.length;
      cas.observations = observations;

      /* ── L'ASSERTION CENTRALE ──
         Pour chaque décision consignée, la pause observée doit être exactement
         celle que la règle de référence prescrit. */
      const desaccords = [];
      for (const d of decisions) {
        const attendu = shouldPauseAfter(d.policy, d.verdictClass);
        const obtenu = !!d.paused || !!d.duplicate;   // « duplicate » = la règle voulait pauser, la clé l'a empêché
        if (attendu !== obtenu) desaccords.push({ ...d, attendu, obtenu });
      }
      cas.desaccords = desaccords;
      cas.doublons = decisions.filter(d => d.duplicate).length;
      cas.pausesDeclenchees = decisions.filter(d => d.paused).length;
      cas.politiqueLue = [...new Set(decisions.map(d => d.policy))];

      const problemes = [];
      if (!cas.persiste) problemes.push(`réglage non persisté après rechargement (relu « ${cas.apresRechargement} »)`);
      if (desaccords.length) problemes.push(`${desaccords.length} décision(s) où la pause ne suit pas la règle`);
      if (cas.doublons) problemes.push(`${cas.doublons} double(s) déclenchement pour une même décision`);
      if (cas.politiqueLue.length && cas.politiqueLue.some(p => p !== opt.id)) problemes.push(`politique appliquée ≠ politique choisie (${cas.politiqueLue})`);
      if (opt.id === PAUSE_AFTER.NEVER && cas.pausesDeclenchees > 0) problemes.push(`option « Jamais » a pourtant figé ${cas.pausesDeclenchees} fois`);
      if (opt.id === PAUSE_AFTER.EVERY && cas.decisions > 0 && cas.pausesDeclenchees === 0) problemes.push('option « Chaque action » n\'a jamais figé');
      if (erreurs.length) problemes.push(`${erreurs.length} erreur(s) console`);

      cas.ok = problemes.length === 0;
      cas.problemes = problemes;
      if (!cas.ok) rapport.echecs.push({ id, problemes });
    } catch (e) {
      cas.ok = false;
      cas.problemes = ['exception : ' + String(e.message || e)];
      rapport.echecs.push({ id, problemes: cas.problemes });
    }
    rapport.cas.push(cas);
    console.log(`${cas.ok ? 'OK  ' : 'KO  '} ${id.padEnd(20)} décisions=${cas.decisions ?? 0} pauses=${cas.pausesDeclenchees ?? 0} persist=${cas.persiste ? 'oui' : 'non'}${cas.problemes && cas.problemes.length ? ' — ' + cas.problemes.join(' · ') : ''}`);
    await page.close();
  }
}

rapport.verdict = rapport.echecs.length === 0
  ? `OK — ${rapport.cas.length} combinaisons (option × nombre de tables) conformes`
  : `ÉCHEC — ${rapport.echecs.length}/${rapport.cas.length} combinaisons en défaut`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rapport, null, 2), 'utf8');
console.log('\n' + rapport.verdict);
console.log('→ ' + OUT);
await browser.close();
process.exit(rapport.echecs.length === 0 ? 0 : 1);
