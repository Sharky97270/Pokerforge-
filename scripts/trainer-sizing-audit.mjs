#!/usr/bin/env node
/**
 * trainer-sizing-audit — EXPÉRIENCE DIRIGÉE SUR LE SÉLECTEUR DE TAILLES (C4/C5)
 *
 * POURQUOI CE SCRIPT EXISTE
 * L'audit du 21 août avait fait l'expérience à la main, trois fois, et conclu :
 * « le pot ne bouge jamais de la valeur annoncée par le sélecteur, ni du tapis
 * demandé par ALL-IN : il bouge exactement de ce que dit le libellé du bouton ».
 * Le sélecteur changeait un nombre affiché, pas l'action jouée.
 *
 * Ce script rejoue l'expérience pour CHAQUE préréglage, et sur le pas à pas,
 * en confrontant quatre grandeurs qui doivent coïncider :
 *
 *     montant du LIBELLÉ  ==  montant du SÉLECTEUR
 *                         ==  variation du POT
 *                         ==  débit du TAPIS d'Hero
 *
 * Trois invariants :
 *   S1 pilotage   changer de préréglage change le montant annoncé par le bouton
 *   S2 exécution  le pot varie exactement du complément annoncé
 *   S3 bornes     MIN est le minimum légal, ALL-IN le tapis, le pas reste dedans
 *
 *   node scripts/trainer-sizing-audit.mjs --url=http://localhost:7799
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL = arg('url', 'http://localhost:7799');
const SCENARIOS = +arg('scenarios', 10);
const W = +arg('w', 1920), H = +arg('h', 1080);
const OUT = path.resolve(arg('out', 'design-qa-evidence/trainer-sizing.json'));

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouve.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HELPERS = () => {
  const bb = t => { const m = String(t || '').replace(',', '.').match(/(-?\d+(?:\.\d+)?)\s*bb/i); return m ? parseFloat(m[1]) : null; };
  window.__sz = {
    setSmode(n) { const el = [...document.querySelectorAll('.smpill')].find(e => (e.querySelector('.smnum') || {}).textContent === String(n)); if (el) { el.click(); return true; } return false; },
    launch() { const b = [...document.querySelectorAll('button')].find(x => /Lancer la session/i.test(x.textContent)); if (b) { b.click(); return true; } return false; },
    ledger() { const e = document.querySelector('[data-pf-ledger]'); if (!e) return null; try { return JSON.parse(e.getAttribute('data-pf-ledger')); } catch { return null; } },
    pot() { const e = document.querySelector('.pf-pot-value'); return e ? bb(e.textContent) : null; },
    presets() { return [...document.querySelectorAll('.sizing-btn')].map(b => ({ l: b.textContent.trim(), unite: b.getAttribute('title') || '' })); },
    clickPreset(l) { const b = [...document.querySelectorAll('.sizing-btn')].find(x => x.textContent.trim() === l); if (b) { b.click(); return true; } return false; },
    stepper() { const e = document.querySelector('.sizing-custom'); return e ? bb(e.textContent) : null; },
    step(dir) {
      const bs = [...document.querySelectorAll('.sizing-step-btn')];
      const b = dir < 0 ? bs[0] : bs[bs.length - 1];
      if (b && !b.disabled) { b.click(); return true; }
      return false;
    },
    bornes() {
      const e = [...document.querySelectorAll('div')].find(x => x.children.length === 0 && /^min .*max /i.test(x.textContent.trim()));
      if (!e) return null;
      const m = e.textContent.match(/min\s*([\d.]+)bb\s*·\s*max\s*([\d.]+)bb/i);
      return m ? { min: parseFloat(m[1]), max: parseFloat(m[2]) } : null;
    },
    /* Le bouton de relance : son libellé ET sa ligne de sizing. */
    raiseBtn() {
      const b = [...document.querySelectorAll('button.gto-btn')]
        .filter(x => x.getBoundingClientRect().width > 0)
        .find(x => /gto-btn-(RAISE|3BET|4BET|5BET)/.test(x.className));
      if (!b) return null;
      return {
        label: (b.querySelector('.gto-btn-label') || {}).textContent || '',
        sizing: (b.querySelector('.gto-btn-sizing') || {}).textContent || '',
        hint: (b.querySelector('.gto-btn-hint') || {}).textContent || '',
      };
    },
    clickRaise() {
      const b = [...document.querySelectorAll('button.gto-btn')]
        .filter(x => x.getBoundingClientRect().width > 0)
        .find(x => /gto-btn-(RAISE|3BET|4BET|5BET)/.test(x.className));
      if (b) { b.click(); return true; }
      return false;
    },
    heroAct() {
      const b = [...document.querySelectorAll('button.gto-btn')].filter(x => x.getBoundingClientRect().width > 0);
      const pick = b.find(x => /Fold/i.test(x.textContent)) || b[0];
      if (pick) { pick.click(); return true; }
      return false;
    },
    next() {
      const b = [...document.querySelectorAll('button')].find(x => /suivante/i.test(x.textContent) && !x.disabled && x.getBoundingClientRect().width > 0);
      if (b) { b.click(); return true; }
      return false;
    },
  };
};

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--hide-scrollbars'], defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text().slice(0, 180)); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 180)));

const waitFor = async (fn, a, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    await page.evaluate(HELPERS);
    if (await page.evaluate(fn, a)) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(150);
  }
};

await page.goto(URL, { waitUntil: 'networkidle2' });
await waitFor(() => { const e = [...document.querySelectorAll('.ntab')].find(x => /Entraineur/i.test(x.textContent)); if (e) { e.click(); return true; } return false; });
await waitFor(() => !!document.querySelector('.mtbtn'));
await waitFor(n => window.__sz.setSmode(n), 100);
await sleep(200);
await waitFor(() => window.__sz.launch());
await sleep(1200);

const R2 = v => Math.round(v * 100) / 100;
const nombre = t => { const m = String(t || '').match(/(-?\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; };
const scenarios = [];
const findings = [];
const note = (code, s, detail) => findings.push({ code, scenario: s, ...detail });

let garde = 0;
while (scenarios.length < SCENARIOS && garde++ < SCENARIOS * 12) {
  await page.evaluate(HELPERS);
  const dispo = await page.evaluate(() => !!window.__sz.raiseBtn() && window.__sz.presets().length > 0);
  if (!dispo) {
    await page.evaluate(() => window.__sz.heroAct());
    await sleep(320);
    await page.evaluate(HELPERS);
    await page.evaluate(() => window.__sz.next());
    await sleep(560);
    continue;
  }

  const presets = await page.evaluate(() => window.__sz.presets().map(p => p.l));
  /* Un préréglage différent à chaque scénario : les six sont couverts. */
  const cible = presets[scenarios.length % presets.length];
  const utiliserLePas = scenarios.length % 3 === 2;   // un scénario sur trois exerce − / +

  const avant = await page.evaluate(l => {
    window.__sz.clickPreset(l);
    return null;
  }, cible);
  void avant;
  await sleep(320);
  await page.evaluate(HELPERS);

  if (utiliserLePas) {
    await page.evaluate(() => window.__sz.step(+1));
    await sleep(220);
    await page.evaluate(HELPERS);
  }

  const etat = await page.evaluate(() => ({
    btn: window.__sz.raiseBtn(), stepper: window.__sz.stepper(), bornes: window.__sz.bornes(),
    pot: window.__sz.pot(), ledger: window.__sz.ledger(), presets: window.__sz.presets(),
  }));
  const L = etat.ledger;
  if (!L || !L.hero || !etat.btn) { await page.evaluate(() => window.__sz.next()); await sleep(500); continue; }

  const hero = L.sieges[L.hero];
  const sc = {
    i: scenarios.length + 1, preset: cible, pasUtilise: utiliserLePas,
    libelle: etat.btn.label, sizing: etat.btn.sizing, indice: etat.btn.hint,
    stepper: etat.stepper, bornes: etat.bornes,
    potAvant: etat.pot, heroRueAvant: hero.rue, heroRestantAvant: hero.restant,
    unite: (etat.presets.find(p => p.l === cible) || {}).unite || null,
  };

  const montantLibelle = nombre((etat.btn.label.match(/([\d.]+)\s*bb/) || [])[1]);
  const montantSizing = nombre((etat.btn.sizing.match(/([\d.]+)\s*bb/) || [])[1]);

  /* ── S1 — le libellé et le sélecteur portent LE MÊME nombre ─────────────── */
  if (montantLibelle == null || montantSizing == null) {
    note('S1-montant-illisible', sc.i, { libelle: etat.btn.label, sizing: etat.btn.sizing });
  } else if (Math.abs(montantLibelle - montantSizing) > 0.051) {
    note('S1-bouton-deux-montants', sc.i, { montantLibelle, montantSizing, preset: cible });
  }
  /* Le pas à pas montre la même valeur que le bouton qu'il pilote. */
  if (etat.stepper != null && montantSizing != null && Math.abs(etat.stepper - montantSizing) > 0.051) {
    note('S1-stepper-desaccorde', sc.i, { stepper: etat.stepper, bouton: montantSizing, preset: cible });
  }
  /* ── S3 — bornes ────────────────────────────────────────────────────────── */
  if (etat.bornes) {
    if (montantSizing != null && (montantSizing < etat.bornes.min - 0.051 || montantSizing > etat.bornes.max + 0.051)) {
      note('S3-hors-bornes', sc.i, { montant: montantSizing, ...etat.bornes, preset: cible });
    }
    if (cible === 'ALL-IN' && montantSizing != null && Math.abs(montantSizing - etat.bornes.max) > 0.051) {
      note('S3-allin-nest-pas-le-tapis', sc.i, { montant: montantSizing, max: etat.bornes.max });
    }
    if (cible === 'MIN' && !utiliserLePas && montantSizing != null && Math.abs(montantSizing - etat.bornes.min) > 0.051) {
      note('S3-min-nest-pas-le-minimum', sc.i, { montant: montantSizing, min: etat.bornes.min });
    }
    if (montantSizing != null && montantSizing > hero.capacite + 0.051) {
      note('S3-au-dessus-du-tapis', sc.i, { montant: montantSizing, capaciteHero: hero.capacite });
    }
  }

  /* ── S2 — on JOUE, et le pot doit varier du complément annoncé ──────────── */
  await page.evaluate(() => window.__sz.clickRaise());
  await sleep(900);
  await page.evaluate(HELPERS);
  const apres = await page.evaluate(() => ({ pot: window.__sz.pot(), ledger: window.__sz.ledger() }));
  /* ── CE QUE LE POT DOIT AU COUP D'HERO, ET RIEN D'AUTRE ──────────────────
     Le Vilain répond pendant le délai de réflexion : entre la lecture d'avant
     et celle d'après, le pot a pu encaisser SA mise aussi. Comparer les deux
     pots bruts attribuerait à Hero des jetons qui ne sont pas les siens (relevé
     à l'instrument : complément 7bb, pot +15bb parce que le Vilain avait suivi
     puis relancé). On retranche donc ce que le Vilain a ajouté, lu sur le même
     ledger — trois grandeurs, toutes issues de la même source. */
  const complementAttendu = montantSizing != null ? R2(montantSizing - hero.rue) : null;
  const heroApres = apres.ledger && apres.ledger.sieges && apres.ledger.sieges[L.hero];
  const vilAvant = L.vilain ? L.sieges[L.vilain] : null;
  const vilApres = apres.ledger && L.vilain ? apres.ledger.sieges[L.vilain] : null;
  const deltaVilain = (vilAvant && vilApres) ? R2(vilApres.total - vilAvant.total) : 0;
  const deltaPotBrut = (apres.pot != null && etat.pot != null) ? R2(apres.pot - etat.pot) : null;
  const deltaPotHero = deltaPotBrut != null ? R2(deltaPotBrut - deltaVilain) : null;
  sc.complementAttendu = complementAttendu;
  sc.deltaPotBrut = deltaPotBrut;
  sc.deltaVilain = deltaVilain;
  sc.deltaPotHero = deltaPotHero;

  /* Si la street a changé entre les deux lectures (le Vilain a suivi, le tour
     d'enchères s'est fermé et les engagements ont été collectés au centre), les
     deux pots ne décrivent plus le même tour : les comparer mesurerait la
     collecte, pas le coup d'Hero. On ne prétend pas mesurer ce qu'on ne peut
     pas — le contrôle est alors porté par les deux grandeurs côté Hero, qui,
     elles, restent exactes. */
  const memeStreet = apres.ledger && String(apres.ledger.street || '') === String(L.street || '');
  sc.potComparable = !!memeStreet;
  if (memeStreet && complementAttendu != null && deltaPotHero != null && Math.abs(deltaPotHero - complementAttendu) > 0.051) {
    note('S2-pot-ne-suit-pas', sc.i, { preset: cible, montantAnnonce: montantSizing, complementAttendu, deltaPotHero, deltaPotBrut, deltaVilain });
  }
  if (heroApres && complementAttendu != null) {
    const debit = R2(hero.restant - heroApres.restant);
    const monteeRue = R2(heroApres.rue - hero.rue);
    sc.debitTapis = debit;
    sc.monteeEngagement = monteeRue;
    if (Math.abs(debit - complementAttendu) > 0.051) {
      note('S2-tapis-ne-suit-pas', sc.i, { preset: cible, complementAttendu, debitTapis: debit });
    }
    if (Math.abs(monteeRue - complementAttendu) > 0.051) {
      note('S2-engagement-ne-suit-pas', sc.i, { preset: cible, complementAttendu, monteeEngagement: monteeRue });
    }
  }
  scenarios.push(sc);

  await page.evaluate(HELPERS);
  await page.evaluate(() => window.__sz.next());
  await sleep(700);
}

await browser.close();

const byCode = {};
for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
const presetsExerces = [...new Set(scenarios.map(s => s.preset))];
const rapport = {
  ts: new Date().toISOString(), url: URL, viewport: { w: W, h: H },
  scenarios, presetsExerces,
  pasExerce: scenarios.some(s => s.pasUtilise),
  potComparables: scenarios.filter(s => s.potComparable).length,
  ecartsParInvariant: byCode, ecarts: findings,
  consoleErrors,
  verdict: findings.length === 0 ? 'OK — montant affiche = envoye = debite' : `${findings.length} ecart(s)`,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rapport, null, 2), 'utf8');

console.log(`\nScenarios diriges : ${scenarios.length}`);
console.log('Prereglages exerces :', presetsExerces.join(' · '));
for (const s of scenarios) {
  console.log(`  ${String(s.i).padStart(2)} ${String(s.preset).padEnd(7)} libelle=${s.libelle.padEnd(20)} selecteur=${String(s.sizing).padEnd(8)} complement=${s.complementAttendu} potHero=${s.deltaPotHero} debitTapis=${s.debitTapis}`);
}
console.log('Ecarts par invariant :', JSON.stringify(byCode, null, 1));
console.log('Erreurs console :', consoleErrors.length);
console.log('Rapport :', OUT);

const echecs = [];
if (findings.length) echecs.push(`${findings.length} ecart(s)`);
if (consoleErrors.length) echecs.push(`${consoleErrors.length} erreur(s) console`);
if (scenarios.length < SCENARIOS) echecs.push(`${scenarios.length} scenario(s) sur ${SCENARIOS}`);
if (presetsExerces.length < 6) echecs.push(`${presetsExerces.length} prereglage(s) exerce(s) sur 6`);
if (echecs.length) { console.error('\nECHEC audit:sizing — ' + echecs.join(' · ')); process.exit(1); }
console.log('\nOK audit:sizing —', scenarios.length, 'scenarios, montant affiche = envoye = debite');
