/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — ÉQUITÉ, MONTE-CARLO (§8)

   TOLÉRANCE : dérivée de l'ERREUR STANDARD, pas d'un chiffre global.
   Pour une proportion p estimée sur n tirages, SE = √(p(1−p)/n). Un écart doit être
   jugé à cette aune : ±2 pt est laxiste à n=120 000 et sévère à n=200.

   Le ±1,7 pt qui traînait dans le rapport de benchmark venait d'un scénario d'équité
   préflop précis — il n'a aucune raison de servir de tolérance universelle, et
   l'utiliser ainsi reviendrait à valider des erreurs réelles sur les gros
   échantillons tout en signalant à tort du bruit normal sur les petits.
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { computeEquity, monteCarloEquity, mulberry32 } from "./src/solver/core/equity.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

const C = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
const card = str => C(str[0], str[1]);
const combo = (a, b) => [{ cards: [card(a), card(b)], w: 1 }];
const board = (...cs) => cs.map(card);

/* Erreur standard d'une proportion, exprimée en points de pourcentage.
   Plancher sur p(1−p) pour éviter une tolérance nulle quand p frôle 0 ou 1. */
export function standardErrorPct(equityPct, samples) {
  const p = Math.min(0.99, Math.max(0.01, equityPct / 100));
  return 100 * Math.sqrt(p * (1 - p) / Math.max(1, samples));
}
/* Tolérance = k erreurs standard. k=4 ≈ 99,99 % sous hypothèse normale : un test qui
   échoue à ce seuil signale un vrai biais, pas de la malchance. */
const tolerance = (equityPct, samples, k = 4) => k * standardErrorPct(equityPct, samples);

/* ══ 1. REPRODUCTIBILITÉ — même seed ⇒ même résultat, au bit près ══
   Sans cela, aucune preuve n'est rejouable et un rapport de certification ne vaut rien. */
console.log("[1] Reproductibilité (seed fixe)");
{
  const h = combo("As", "Ks"), v = combo("Qh", "Qd"), b = board("2s", "7s", "9d");
  const a1 = computeEquity(h, v, b, { budget: 1, iters: 5000, seed: 12345 });
  const a2 = computeEquity(h, v, b, { budget: 1, iters: 5000, seed: 12345 });
  eq(a1.exact, false, "budget contraint → voie Monte-Carlo empruntée");
  eq(a1.equity, a2.equity, "même seed → équité identique au bit près");
  const a3 = computeEquity(h, v, b, { budget: 1, iters: 5000, seed: 999 });
  ok(a3.equity !== a1.equity, "seed différente → tirage différent (le seed est bien utilisé)");
  eq(a1.samples, 5000, "le nombre d'échantillons est rapporté");
  eq(a1.seed, 12345, "la seed est rapportée (rejouabilité)");
}

/* ══ 2. CONVERGENCE — l'erreur décroît quand n augmente ══
   Propriété fondamentale de l'échantillonnage. On la vérifie contre la valeur
   exhaustive du même spot. */
console.log("[2] Convergence vers la valeur exhaustive");
{
  const h = combo("As", "Ks"), v = combo("Qh", "Qd"), b = board("2s", "7s", "9d", "Jc");
  const exact = computeEquity(h, v, b, { budget: 1e9 });
  eq(exact.exact, true, "référence : voie exhaustive");

  const sizes = [200, 2000, 20000, 100000];
  const errs = sizes.map(s => {
    const r = computeEquity(h, v, b, { budget: 1, iters: s, seed: 777 });
    return { s, err: Math.abs(r.equity - exact.equity), eqv: r.equity };
  });
  for (const e of errs) {
    const tol = tolerance(exact.equity, e.s);
    ok(e.err <= tol, `n=${e.s} : écart ${e.err.toFixed(3)} pt ≤ tolérance ${tol.toFixed(3)} pt (4 SE)`);
  }
  // Tendance : le plus grand échantillon doit faire nettement mieux que le plus petit.
  ok(errs[errs.length - 1].err < errs[0].err,
    `l'erreur décroît avec n (${errs[0].err.toFixed(3)} → ${errs[errs.length - 1].err.toFixed(3)} pt)`);
  console.log(`    exhaustif ${exact.equity.toFixed(3)} % · ` +
    errs.map(e => `n=${e.s}:${e.err.toFixed(3)}`).join(" · "));
}

/* ══ 3. L'INTERVALLE SE RESSERRE EN 1/√n ══
   Vérifie la loi elle-même : multiplier n par 100 doit diviser l'erreur standard
   par 10. C'est la base sur laquelle reposera l'intervalle de confiance (§4). */
console.log("[3] Décroissance de l'erreur standard en 1/√n");
{
  const se1 = standardErrorPct(50, 1000);
  const se2 = standardErrorPct(50, 100000);
  const ratio = se1 / se2;
  ok(Math.abs(ratio - 10) < 0.01, `×100 échantillons ⇒ erreur standard ÷10 (ratio mesuré ${ratio.toFixed(3)})`);
  ok(standardErrorPct(50, 2500) > standardErrorPct(50, 25000), "SE décroît strictement avec n");
  // Ordres de grandeur, utiles pour fixer les seuils de la matrice de certification.
  console.log(`    SE à p=50 % : n=2 500 → ±${standardErrorPct(50, 2500).toFixed(3)} pt · ` +
    `n=120 000 → ±${standardErrorPct(50, 120000).toFixed(3)} pt (1 SE)`);
}

/* ══ 4. STABILITÉ ENTRE SEEDS — la dispersion doit rester compatible avec la théorie ══
   Test le plus révélateur d'un biais : si l'estimateur était faussé, la dispersion
   observée entre seeds ne collerait pas à l'erreur standard théorique. */
console.log("[4] Dispersion inter-seeds vs théorie");
{
  const h = combo("Ah", "Ad"), v = combo("Ks", "Kd"), b = board("2c", "7h", "9s");
  const exact = computeEquity(h, v, b, { budget: 1e9 }).equity;
  const N = 4000, seeds = 24;
  const vals = [];
  for (let i = 0; i < seeds; i++) {
    vals.push(computeEquity(h, v, b, { budget: 1, iters: N, seed: 1000 + i * 37 }).equity);
  }
  const mean = vals.reduce((a, b2) => a + b2, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b2) => a + (b2 - mean) ** 2, 0) / (vals.length - 1));
  const theo = standardErrorPct(exact, N);
  ok(Math.abs(mean - exact) <= tolerance(exact, N * seeds, 5),
    `moyenne de ${seeds} seeds ≈ valeur exhaustive (${mean.toFixed(3)} vs ${exact.toFixed(3)})`);
  // La dispersion observée doit être du même ordre que la théorie (facteur 3 large,
  // car l'échantillonnage porte aussi sur le choix des combos, pas seulement les runouts).
  ok(sd < theo * 3, `dispersion observée ${sd.toFixed(3)} pt < 3× théorie ${theo.toFixed(3)} pt`);
  console.log(`    ${seeds} seeds à n=${N} · moyenne ${mean.toFixed(3)} % · écart-type ${sd.toFixed(3)} pt (théorie ${theo.toFixed(3)})`);
}

/* ══ 5. monteCarloEquity — API directe, mêmes garanties ══ */
console.log("[5] API directe monteCarloEquity");
{
  const h = combo("As", "Ks"), v = combo("Qh", "Qd"), b = board("2s", "7s", "9d");
  const r1 = monteCarloEquity(h, v, 3000, b, 555);
  const r2 = monteCarloEquity(h, v, 3000, b, 555);
  eq(r1, r2, "même seed → même valeur");
  ok(r1 >= 0 && r1 <= 100, "valeur dans [0,100]");
  eq(monteCarloEquity([], v, 100, b, 1), 50, "range vide → 50 % (neutre)");
}

/* ══ 6. mulberry32 — le générateur lui-même ══ */
console.log("[6] Générateur pseudo-aléatoire");
{
  const g1 = mulberry32(42), g2 = mulberry32(42);
  let same = true, inRange = true;
  for (let i = 0; i < 1000; i++) {
    const a = g1(), b = g2();
    if (a !== b) same = false;
    if (!(a >= 0 && a < 1)) inRange = false;
  }
  ok(same, "mulberry32 : deux instances de même seed produisent la même suite");
  ok(inRange, "toutes les valeurs dans [0,1)");
  // Uniformité grossière : la moyenne de 100 000 tirages doit approcher 0,5.
  const g3 = mulberry32(7);
  let s = 0; const M = 100000;
  for (let i = 0; i < M; i++) s += g3();
  ok(Math.abs(s / M - 0.5) < 0.01, `moyenne ${(s / M).toFixed(4)} ≈ 0,5 (uniformité)`);
}

console.log(`\n✅ équité (Monte-Carlo) — ${n} assertions OK`);
