/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — ÉQUITÉ, DIFFÉRENTIEL EXACT ↔ MONTE-CARLO (§8, §14.8)

   Balayage large : sur chaque spot on calcule l'équité DEUX FOIS — énumération
   exhaustive et échantillonnage — puis on juge l'écart à l'aune de l'erreur standard
   du nombre d'échantillons utilisé.

   Cette suite produit le chiffre attendu par le livrable §14.8 (« écarts par rapport
   aux références ») : l'écart maximal observé et sa position en nombre d'erreurs
   standard, plutôt qu'une tolérance forfaitaire.
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { computeEquity } from "./src/solver/core/equity.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const C = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
const card = str => C(str[0], str[1]);
const combo = (a, b) => [{ cards: [card(a), card(b)], w: 1 }];
const board = (...cs) => cs.map(card);

const standardErrorPct = (equityPct, samples) => {
  const p = Math.min(0.99, Math.max(0.01, equityPct / 100));
  return 100 * Math.sqrt(p * (1 - p) / Math.max(1, samples));
};

/* Spots choisis pour couvrir des régimes d'équité variés : dominations nettes,
   affrontements serrés, tirages, et boards de textures différentes. Une tolérance
   ne vaut que si elle tient sur tout le domaine, pas seulement autour de 50 %. */
const SPOTS = [
  { h: ["Ah", "Ad"], v: ["Ks", "Kd"], b: ["2c", "7h", "9s"], label: "AA vs KK · flop sec" },
  { h: ["Ah", "Ad"], v: ["Ks", "Kd"], b: ["2c", "7h", "9s", "Jd"], label: "AA vs KK · turn" },
  { h: ["As", "Ks"], v: ["Qh", "Qd"], b: ["2s", "7s", "9d"], label: "tirage couleur vs paire" },
  { h: ["As", "Ks"], v: ["Qh", "Qd"], b: ["2s", "7s", "9d", "Jc"], label: "tirage couleur · turn" },
  { h: ["Ts", "9s"], v: ["Ah", "Kd"], b: ["8s", "7d", "2c"], label: "quinte faite vs surcartes" },
  { h: ["Jh", "Th"], v: ["Ac", "Ad"], b: ["9h", "8c", "2d"], label: "tirage combiné vs AA" },
  { h: ["7c", "2d"], v: ["Ac", "Ad"], b: ["Ks", "Qh", "Jd"], label: "domination extrême" },
  { h: ["Kh", "Kd"], v: ["7c", "7d"], b: ["Ks", "7h", "2c"], label: "brelan vs brelan (cooler)" },
  { h: ["Ah", "Kh"], v: ["Ad", "Kd"], b: ["2c", "7h", "9s", "Jd"], label: "mains jumelles (≈50 %)" },
  { h: ["Qs", "Js"], v: ["Ah", "9d"], b: ["Ts", "8h", "3c"], label: "tirage quinte double ventre" },
];

const SAMPLES = [2000, 20000];
console.log("[1] Différentiel exhaustif ↔ Monte-Carlo — écart jugé en erreurs standard");
console.log("    spot                                exact      n=2000            n=20000");

let worstSigma = 0, worstLabel = "", worstDelta = 0;
for (const s of SPOTS) {
  const h = combo(s.h[0], s.h[1]), v = combo(s.v[0], s.v[1]), b = board(...s.b);
  const exact = computeEquity(h, v, b, { budget: 1e9 });
  ok(exact.exact === true, `${s.label} : référence exhaustive disponible`);

  const cells = [];
  for (const N of SAMPLES) {
    const mc = computeEquity(h, v, b, { budget: 1, iters: N, seed: 20260806 });
    const delta = Math.abs(mc.equity - exact.equity);
    const se = standardErrorPct(exact.equity, N);
    const sigma = delta / se;
    cells.push(`${delta.toFixed(3)}pt (${sigma.toFixed(1)}σ)`);
    // 4 SE ≈ 99,99 % : au-delà, ce n'est plus du bruit d'échantillonnage.
    ok(delta <= 4 * se,
      `${s.label} · n=${N} : écart ${delta.toFixed(3)} pt ≤ 4 SE (${(4 * se).toFixed(3)} pt)`);
    if (sigma > worstSigma) { worstSigma = sigma; worstLabel = `${s.label} (n=${N})`; worstDelta = delta; }
  }
  console.log(`    ${s.label.padEnd(34)} ${exact.equity.toFixed(2).padStart(6)}%  ${cells[0].padEnd(17)} ${cells[1]}`);
}

console.log(`\n    ÉCART MAXIMAL : ${worstDelta.toFixed(3)} pt = ${worstSigma.toFixed(2)} erreurs standard — ${worstLabel}`);
ok(worstSigma <= 4, `écart maximal sur l'ensemble du balayage ≤ 4 SE (${worstSigma.toFixed(2)}σ)`);

/* ══ 2. La tolérance forfaitaire est-elle adaptée ? — démonstration chiffrée ══
   Montre POURQUOI un seuil global est inadapté : à n=120 000, ±1,7 pt représente
   près de 12 erreurs standard — un tel seuil accepterait des erreurs massives. */
console.log("\n[2] Pourquoi une tolérance forfaitaire ne convient pas");
{
  const flat = 1.7;
  const rows = [200, 2500, 20000, 120000].map(N => {
    const se = standardErrorPct(50, N);
    return { N, se, sigmas: flat / se };
  });
  for (const r of rows) {
    console.log(`    n=${String(r.N).padStart(6)} · 1 SE = ±${r.se.toFixed(3)} pt · un seuil fixe de ±1,7 pt vaut ${r.sigmas.toFixed(1)} SE`);
  }
  ok(rows[rows.length - 1].sigmas > 10,
    `à n=120 000, un seuil fixe de ±1,7 pt représente ${rows[rows.length - 1].sigmas.toFixed(1)} SE — beaucoup trop permissif`);
  ok(rows[0].sigmas < 1,
    `à n=200, le même seuil vaut ${rows[0].sigmas.toFixed(2)} SE — trop strict, il signalerait du bruit normal`);
}

console.log(`\n✅ équité (différentiel) — ${n} assertions OK`);
