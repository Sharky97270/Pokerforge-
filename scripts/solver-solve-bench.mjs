#!/usr/bin/env node
/**
 * solver-solve-bench — COMBIEN COÛTE UN VRAI SOLVE, séparément du temps
 * d'interaction.
 *
 * La mission P0 distingue deux choses que la sonde de QA confondait :
 *   · le temps d'INTERACTION (saisir un board) — mesuré par solver-perf-probe ;
 *   · le temps de RÉSOLUTION (un solve demandé explicitement) — mesuré ici.
 * Le premier devait tomber à quelques dizaines de millisecondes ; le second est
 * un calcul légitime, et l'objectif n'est pas de le supprimer mais de savoir ce
 * qu'il coûte et de ne pas bloquer l'interface pendant qu'il tourne.
 *
 * Trois solves représentatifs, déterministes, sans navigateur :
 *   · CFR sous-jeu river (le chemin de « Résoudre (CFR) ») ;
 *   · CFR multi-rue flop (le chemin de « Solve multi-rue ») ;
 *   · PFASE SINGLE sur river (le chemin d'« Optimiser les sizings »).
 *
 *   node scripts/solver-solve-bench.mjs --out=design-qa-evidence/solve-bench.json
 */
import fs from "node:fs";
import path from "node:path";
import { solveSubgame, solveMultiStreet } from "../src/solver/api.js";
import { solveOptimizedTree } from "../src/sizing/pfase.js";
import { potSizing, jamSizing } from "../src/sizing/sizingSpec.js";

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : d; };
const OUT = path.resolve(arg("out", "design-qa-evidence/solve-bench.json"));
const LABEL = arg("label", "mesure");

/* Ranges de taille réaliste : 30 classes par camp, soit ~250 combos — l'ordre
   de grandeur d'un spot postflop réel, pas un jouet. */
const R = "23456789TJQKA".split("");
const KEYS = [];
for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
  const a = R[Math.max(i, j)], b = R[Math.min(i, j)];
  KEYS.push(i === j ? a + a : (i > j ? a + b + "s" : a + b + "o"));
}
const UNIQ = [...new Set(KEYS)];
const mkFreqs = (n) => {
  const f = {};
  for (const k of UNIQ.slice(0, n)) f[k] = { r: 40, c: 60, f: 0 };
  return f;
};
const HERO = mkFreqs(30), VILL = mkFreqs(30);
const FLOP = [47, 22, 6], RIVER = [47, 22, 6, 35, 18];

const etat = (board) => ({
  gameType: "CASH",
  street: board.length === 5 ? "RIVER" : board.length === 4 ? "TURN" : "FLOP",
  board,
  blinds: { sb: 0.5, bb: 1 }, ante: 0, minBet: 1,
  players: [
    { id: "hero", position: "OOP", stack: 60, committedStreet: 0, committedTotal: 6, isHero: true },
    { id: "vill", position: "IP", stack: 60, committedStreet: 0, committedTotal: 6 },
  ],
  actorId: "hero", deadPot: 12, evaluationModel: "CHIP_EV",
});

const cas = [
  ["CFR sous-jeu · river", () => solveSubgame(HERO, VILL, RIVER, 12, 0.66, { maxCombos: 200, iters: 400, runouts: 0 })],
  ["CFR sous-jeu · flop", () => solveSubgame(HERO, VILL, FLOP, 12, 0.66, { maxCombos: 200, iters: 400, runouts: 60 })],
  ["CFR multi-rue · river", () => solveMultiStreet(HERO, VILL, RIVER, { iters: 400, betSizes: [0.33, 0.75], startPot: 12, maxCombos: 200, maxRaisesPerStreet: 1, effStack: 60 })],
  ["CFR multi-rue · flop (3 rues)", () => solveMultiStreet(HERO, VILL, FLOP, { iters: 180, betSizes: [0.33, 0.75], startPot: 12, maxCombos: 200, maxRaisesPerStreet: 1, effStack: 60 })],
  ["PFASE SINGLE · river", () => solveOptimizedTree({
    stateInput: etat(RIVER), heroRange: HERO, villainRange: VILL,
    mode: "SINGLE", complexity: "SINGLE", candidateProfile: "standard",
    userBetSpecs: [potSizing(0.33), potSizing(0.75), jamSizing()], userRaiseSpecs: [],
  })],
];

/* `--only=` restreint la mesure à quelques cas : indispensable pour comparer
   deux versions en ALTERNANCE sur une machine bruyante, sans attendre la suite
   complète entre chaque point. */
const ONLY = arg("only", null);
const REPS = +arg("reps", 1);

const out = { label: LABEL, when: new Date().toISOString(), reps: REPS, cas: [] };
for (const [nom, fn] of cas.filter(([n]) => !ONLY || n.toLowerCase().includes(ONLY.toLowerCase()))) {
  for (let rep = 0; rep < REPS; rep++) {
  const t = Date.now();
  let ok = true, note = "";
  try { const r = fn(); note = (r && (r.source || r.status)) || ""; }
  catch (e) { ok = false; note = String((e && e.message) || e).slice(0, 120); }
  const ms = Date.now() - t;
  out.cas.push({ nom, rep: rep + 1, ms, ok, note });
  console.log(`  ${nom.padEnd(32)} ${String(ms).padStart(8)} ms   ${ok ? "" : "ÉCHEC "}${note}`);
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("→ " + OUT);
