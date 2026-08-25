#!/usr/bin/env node
/**
 * sizing-bench — banc d'essai PFASE (mission §83).
 *
 * « Créer une suite de spots représentatifs : SRP IP, SRP OOP, 3BP IP, 3BP OOP,
 *   4BP, BvB, low/medium/high SPR, flop/turn/river. Comparer FULL vs ADVANCED
 *   vs SIMPLE vs SINGLE. Enregistrer EV, EV loss, solve time, memory. »
 *
 * Les ranges sont volontairement RÉDUITES (huit classes par camp) : l'objectif
 * est de mesurer le COMPORTEMENT du moteur (temps, mémoire, monotonie de la
 * perte d'EV) sur un large éventail de spots, pas de produire des solutions de
 * production. Les chiffres d'EV ne doivent donc pas être lus comme des vérités
 * stratégiques — le banc le rappelle dans sa sortie.
 *
 *   node scripts/sizing-bench.mjs
 *   node scripts/sizing-bench.mjs --only=river --out=design-qa-evidence/bench.json
 */
import fs from "node:fs";
import path from "node:path";
import { solveSolutionFamily } from "../src/sizing/pfase.js";
import { clearStore } from "../src/sizing/solutionStore.js";
import { potSizing, previousBetSizing, jamSizing, geometricSizing } from "../src/sizing/sizingSpec.js";

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : d; };
const ONLY = arg("only", null);
const OUT = path.resolve(arg("out", "design-qa-evidence/sizing-bench.json"));

/* Ranges réduites — énumération exacte, aucune abstraction. */
const HERO = { AA: { r: 0, c: 100, f: 0 }, KK: { r: 0, c: 100, f: 0 }, AKs: { r: 0, c: 100, f: 0 }, AQo: { r: 0, c: 100, f: 0 }, "76s": { r: 0, c: 100, f: 0 }, T9s: { r: 0, c: 100, f: 0 }, "55": { r: 0, c: 100, f: 0 }, "32o": { r: 0, c: 100, f: 0 } };
const VILL = { QQ: { r: 0, c: 100, f: 0 }, JJ: { r: 0, c: 100, f: 0 }, AQs: { r: 0, c: 100, f: 0 }, KJo: { r: 0, c: 100, f: 0 }, "98s": { r: 0, c: 100, f: 0 }, "54s": { r: 0, c: 100, f: 0 }, "77": { r: 0, c: 100, f: 0 }, "72o": { r: 0, c: 100, f: 0 } };

const B = {
  flopDry: [12, 25, 3],            // 5♠ 8♥ 2♣
  flopWet: [30, 26, 22],           // 9♥ 8♥ 7♥ (monotone connecté)
  turn: [12, 25, 3, 40],
  river: [12, 25, 3, 40, 7],
  riverPaired: [12, 13, 3, 40, 7],
};

/* §83 — spots représentatifs. `spr` est OBTENU (pot/tapis), pas décrété. */
const SPOTS = [
  { id: "SRP OOP · river · SPR moyen", street: "RIVER", board: B.river, pot: 12, stack: 40, hero: "BB", vill: "BTN", potType: "SRP" },
  { id: "SRP OOP · river · SPR bas", street: "RIVER", board: B.river, pot: 24, stack: 12, hero: "BB", vill: "BTN", potType: "SRP" },
  { id: "SRP OOP · river · SPR haut", street: "RIVER", board: B.river, pot: 8, stack: 90, hero: "BB", vill: "BTN", potType: "SRP" },
  { id: "3BP OOP · river", street: "RIVER", board: B.river, pot: 22, stack: 45, hero: "BB", vill: "CO", potType: "3BP" },
  { id: "4BP OOP · river · SPR très bas", street: "RIVER", board: B.river, pot: 48, stack: 20, hero: "BB", vill: "BTN", potType: "4BP" },
  { id: "BvB · river apparié", street: "RIVER", board: B.riverPaired, pot: 10, stack: 45, hero: "SB", vill: "BB", potType: "SRP" },
  { id: "SRP OOP · turn", street: "TURN", board: B.turn, pot: 12, stack: 40, hero: "BB", vill: "BTN", potType: "SRP" },
  { id: "3BP OOP · turn", street: "TURN", board: B.turn, pot: 22, stack: 45, hero: "BB", vill: "CO", potType: "3BP" },
  { id: "SRP OOP · flop sec", street: "FLOP", board: B.flopDry, pot: 12, stack: 40, hero: "BB", vill: "BTN", potType: "SRP" },
  { id: "SRP OOP · flop humide monotone", street: "FLOP", board: B.flopWet, pot: 12, stack: 40, hero: "BB", vill: "BTN", potType: "SRP" },
];

const CANDIDATES = [potSizing(0.33), potSizing(0.75), potSizing(1.5), geometricSizing(2), jamSizing()];
const RAISES = [previousBetSizing(2.5)];

const EVAL = { maxIterations: 200, maxCombos: 0, seed: 4242, convergenceTarget: 0.03, maxIterationsCeiling: 800, timeBudgetMs: 30000 };
const FINAL = { maxIterations: 400, maxCombos: 0, seed: 4242 };

const mb = (b) => Math.round(b / (1024 * 1024) * 10) / 10;
const heapUsed = () => (typeof process !== "undefined" && process.memoryUsage ? process.memoryUsage().heapUsed : 0);

const rows = [];
const t00 = Date.now();
for (const spot of SPOTS) {
  if (ONLY && !spot.id.toLowerCase().includes(ONLY.toLowerCase()) && !spot.street.toLowerCase().includes(ONLY.toLowerCase())) continue;
  clearStore();
  if (global.gc) global.gc();
  const memBefore = heapUsed();
  const t0 = Date.now();
  const f = solveSolutionFamily({
    stateInput: {
      gameType: "CASH", street: spot.street, board: spot.board,
      blinds: { sb: 0.5, bb: 1 }, minBet: 1,
      players: [
        { id: "h", position: spot.hero, stack: spot.stack, committedStreet: 0, committedTotal: spot.pot / 2, isHero: true },
        { id: "v", position: spot.vill, stack: spot.stack, committedStreet: 0, committedTotal: spot.pot / 2 },
      ],
      deadPot: spot.pot, actorId: "h",
      actionHistory: historyFor(spot.potType),
    },
    heroRange: HERO, villainRange: VILL,
    mode: "DYNAMIC", userBetSpecs: CANDIDATES, userRaiseSpecs: RAISES,
    evaluationConfig: EVAL, finalSolveConfig: FINAL,
  });
  const ms = Date.now() - t0;
  const memAfter = heapUsed();

  const byLevel = {};
  for (const r of f.results) {
    const s = r.solution;
    byLevel[r.complexity] = s ? {
      ok: r.ok, status: r.status,
      selected: (s.selectedSizes.bets || []).map(b => b.label),
      selectedRaises: (s.selectedSizes.raises || []).map(b => b.label),
      referenceEV: s.simplificationMetrics ? s.simplificationMetrics.referenceEV : null,
      ev: s.simplificationMetrics ? s.simplificationMetrics.simplifiedEV : null,
      evLossBb: s.simplificationMetrics ? s.simplificationMetrics.absoluteEVLoss : null,
      evLossPotPct: s.simplificationMetrics ? s.simplificationMetrics.evLossPotPct : null,
      measurementFloorBb: s.measurement ? s.measurement.floor : null,
      distinguishable: s.distinguishable !== false,
      nashConv: s.accuracy ? s.accuracy.value : null,
      iterations: s.convergence ? s.convergence.iterations : null,
      partialReasons: s.partialReasons || [],
      /* Le CLASSEMENT est-il, lui, mesurable ? C'est une question distincte de
         la perte face à la référence : deux sizings peuvent être clairement
         départagés alors que le meilleur d'entre eux ne se distingue pas de
         l'arbre complet. */
      rankingGaps: s.actionRanking ? s.actionRanking.actions.map(a => a.delta) : null,
      rankingDistinguishable: s.actionRanking && s.measurement
        ? s.actionRanking.actions.some(a => Math.abs(a.delta) > s.measurement.floor)
        : null,
    } : { ok: false, status: r.status, reason: r.reason };
  }
  const any = f.results.find(r => r.solution);
  rows.push({
    spot: spot.id, street: spot.street, potType: spot.potType,
    pot: spot.pot, stack: spot.stack,
    spr: any && any.solution ? any.solution.spr : null,
    totalMs: ms,
    heapDeltaMb: mb(memAfter - memBefore),
    cacheHits: f.cacheStats.hits, cacheMisses: f.cacheStats.misses,
    levels: byLevel,
    /* Contrôle de MONOTONIE : la perte d'EV doit croître quand la complexité
       diminue — à la précision de mesure près. C'est la propriété que la
       définition asymétrique de la perte garantit (voir ALGORITHM.md). */
    monotone: checkMonotone(byLevel),
  });
  console.log(`${spot.id.padEnd(38)} ${String(ms).padStart(6)} ms · SPR ${String(rows[rows.length - 1].spr).padStart(7)} · ` +
    ["FULL", "ADVANCED", "SIMPLE", "SINGLE"].map(l => `${l[0]}:${byLevel[l] && byLevel[l].evLossBb != null ? byLevel[l].evLossBb.toFixed(3) : "—"}`).join(" "));
}

function historyFor(potType) {
  const h = [{ street: "PREFLOP", position: "BTN", actionType: "RAISE", size: 3 }];
  if (potType === "3BP") h.push({ street: "PREFLOP", position: "BB", actionType: "RAISE", size: 11 }, { street: "PREFLOP", position: "BTN", actionType: "CALL", size: 11 });
  else if (potType === "4BP") h.push({ street: "PREFLOP", position: "BB", actionType: "RAISE", size: 11 }, { street: "PREFLOP", position: "BTN", actionType: "RAISE", size: 24 }, { street: "PREFLOP", position: "BB", actionType: "CALL", size: 24 });
  else h.push({ street: "PREFLOP", position: "BB", actionType: "CALL", size: 3 });
  return h;
}

function checkMonotone(byLevel) {
  const order = ["FULL", "ADVANCED", "SIMPLE", "SINGLE"];
  const vals = order.map(l => (byLevel[l] && typeof byLevel[l].evLossBb === "number" ? byLevel[l] : null));
  const problems = [];
  for (let i = 1; i < vals.length; i++) {
    const a = vals[i - 1], b = vals[i];
    if (!a || !b) continue;
    const floor = Math.max(a.measurementFloorBb || 0, b.measurementFloorBb || 0);
    if (b.evLossBb < a.evLossBb - floor) {
      problems.push(`${order[i]} (${b.evLossBb}) perd MOINS que ${order[i - 1]} (${a.evLossBb}) au-delà du plancher ${floor}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

const summary = {
  generatedAt: new Date().toISOString(),
  totalMs: Date.now() - t00,
  spots: rows.length,
  note: "Ranges réduites (8 classes par camp) : ce banc mesure le COMPORTEMENT du moteur (temps, mémoire, monotonie de la perte d'EV), pas des vérités stratégiques.",
  evaluationConfig: EVAL, finalSolveConfig: FINAL,
  candidates: CANDIDATES.map(c => c.type + (c.value != null ? ":" + c.value : "")),
  monotonyFailures: rows.filter(r => !r.monotone.ok).map(r => ({ spot: r.spot, problems: r.monotone.problems })),
  rows,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(`\n${rows.length} spots · ${Math.round(summary.totalMs / 1000)} s · monotonie respectée sur ${rows.length - summary.monotonyFailures.length}/${rows.length}`);
if (summary.monotonyFailures.length) {
  console.log("Écarts de monotonie (au-delà du plancher de mesure) :");
  for (const f of summary.monotonyFailures) console.log(`  · ${f.spot} — ${f.problems.join(" ; ")}`);
}
console.log(`→ ${OUT}`);
