/* Matrice d'équité préflop all-in 169×169 — calcul UNIQUE, mis en cache sur disque.
   Symétrie exploitée : eq(B,A) = 100 - eq(A,B), donc seul le triangle supérieur
   est calculé (14 365 matchups au lieu de 28 561). */
import { computeEquity } from "file:///D:/Projet%202026/APP%20Poker/src/solver/core/equity.js";
import { singleHandList } from "file:///D:/Projet%202026/APP%20Poker/src/solver/core/combos.js";
import fs from "node:fs";

const R = "AKQJT98765432".split("");
const KEYS = [];
for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
  if (i === j) KEYS.push(R[i] + R[i]);
  else if (i < j) KEYS.push(R[i] + R[j] + "s");
  else KEYS.push(R[j] + R[i] + "o");
}
const HANDS = [...new Set(KEYS)];
const N = HANDS.length;
const ITERS = Number(process.argv[2] || 1500);
const OUT = process.argv[3] || "matrix.json";

const lists = HANDS.map(h => singleHandList(h));
const E = Array.from({ length: N }, () => new Float64Array(N));
const t0 = Date.now();
let done = 0;
for (let i = 0; i < N; i++) {
  for (let j = i; j < N; j++) {
    // seed déterministe par paire → matrice reproductible (§15)
    const eq = computeEquity(lists[i], lists[j], [], { iters: ITERS, seed: i * 1000 + j + 1 }).equity;
    E[i][j] = eq;
    E[j][i] = 100 - eq;
    done++;
  }
  if (i % 10 === 0) {
    const pct = (done / (N * (N + 1) / 2) * 100).toFixed(1);
    const el = (Date.now() - t0) / 1000;
    process.stderr.write(`  ${pct}% · ${el.toFixed(0)}s écoulées · ETA ${(el / (done || 1) * (N * (N + 1) / 2 - done)).toFixed(0)}s\n`);
  }
}
fs.writeFileSync(OUT, JSON.stringify({
  hands: HANDS, iters: ITERS,
  equity: E.map(r => Array.from(r, x => Math.round(x * 1000) / 1000)),
}));
console.error(`matrice écrite dans ${OUT} — ${((Date.now() - t0) / 1000).toFixed(0)}s, ${ITERS} itérations/matchup`);
