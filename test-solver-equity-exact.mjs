/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — ÉQUITÉ, VOIE EXACTE (§8)

   `computeEquity` bascule automatiquement entre énumération exhaustive et
   Monte-Carlo selon le coût estimé. Cette suite ne teste QUE la voie exhaustive :
   quand elle est empruntée, le résultat doit être exact au flottant près.

   MÉTHODE : plutôt que des valeurs calculées à la main (source d'erreurs difficiles
   à détecter), on compare à une ÉNUMÉRATION INDÉPENDANTE écrite ici, qui parcourt
   les runouts restants et tranche avec eval7i. Même principe que pour l'évaluateur :
   la référence est écrite séparément, pas dérivée du code testé.
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { computeEquity } from "./src/solver/core/equity.js";
import { eval7i } from "./src/solver/core/evaluator.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (obtenu ${a}, attendu ${b}, tol ${tol})`); n++; };

const C = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
const card = str => C(str[0], str[1]);
const combo = (a, b) => [{ cards: [card(a), card(b)], w: 1 }];
const board = (...cs) => cs.map(card);

/* ── RÉFÉRENCE INDÉPENDANTE : énumération complète des runouts ────────────── */
function refEquity(heroCards, villCards, fixed) {
  const dead = new Set([...heroCards, ...villCards, ...fixed]);
  const avail = [];
  for (let c = 0; c < 52; c++) if (!dead.has(c)) avail.push(c);
  const need = 5 - fixed.length;
  let win = 0, tie = 0, tot = 0;
  const pick = [];
  (function rec(start, depth) {
    if (depth === need) {
      const b = [...fixed, ...pick];
      const h = eval7i([...heroCards, ...b]);
      const v = eval7i([...villCards, ...b]);
      if (h > v) win++; else if (h === v) tie++;
      tot++;
      return;
    }
    for (let i = start; i <= avail.length - (need - depth); i++) {
      pick[depth] = avail[i];
      rec(i + 1, depth + 1);
    }
  })(0, 0);
  return tot ? (win + tie * 0.5) / tot * 100 : 50;
}

/* ══ 1. BOARD COMPLET — le résultat est déterministe (0 / 50 / 100) ══ */
console.log("[1] Board complet — issue déterministe");
{
  // Hero a la quinte flush, villain deux paires : hero gagne toujours.
  const b = board("Ts", "Js", "Qs", "2h", "3d");
  const r1 = computeEquity(combo("Ks", "9s"), combo("Ah", "Ad"), b, {});
  ok(r1.exact === true, "board complet → voie exhaustive empruntée");
  near(r1.equity, 100, 1e-9, "quinte flush contre deux paires : 100 %");

  // Les deux jouent le board (aucune amélioration possible) → partage exact.
  const b2 = board("As", "Ks", "Qs", "Js", "Ts");   // quinte flush royale au tableau
  const r2 = computeEquity(combo("2h", "3d"), combo("4c", "5h"), b2, {});
  near(r2.equity, 50, 1e-9, "les deux jouent le tableau : partage à 50 %");

  // Perte certaine.
  const r3 = computeEquity(combo("2h", "3d"), combo("Ks", "9s"), board("Ts", "Js", "Qs", "2s", "7d"), {});
  ok(r3.equity < 1, "main dominée sans tirage sur board complet : ~0 %");
}

/* ══ 2. TURN (44 runouts) et FLOP (1081 runouts) — différentiel exhaustif ══ */
console.log("[2] Turn et flop — différentiel contre énumération indépendante");
{
  const cases = [
    { h: ["As", "Ks"], v: ["Qh", "Qd"], b: ["2s", "7s", "9d", "Jc"], label: "turn · tirage couleur + surcartes" },
    { h: ["Ah", "Ad"], v: ["Ks", "Kd"], b: ["2c", "7h", "9s", "Jd"], label: "turn · AA vs KK" },
    { h: ["Ts", "9s"], v: ["Ah", "Kd"], b: ["8s", "7d", "2c", "Jh"], label: "turn · quinte faite vs surcartes" },
    { h: ["As", "Ks"], v: ["Qh", "Qd"], b: ["2s", "7s", "9d"], label: "flop · tirage couleur" },
    { h: ["Ah", "Ad"], v: ["7c", "7d"], b: ["2c", "7h", "Ks"], label: "flop · AA vs brelan" },
    { h: ["Jh", "Th"], v: ["Ac", "Ad"], b: ["9h", "8c", "2d"], label: "flop · tirage quinte+couleur vs AA" },
  ];
  for (const c of cases) {
    const hc = c.h.map(card), vc = c.v.map(card), bd = c.b.map(card);
    const got = computeEquity(combo(c.h[0], c.h[1]), combo(c.v[0], c.v[1]), bd, {});
    const ref = refEquity(hc, vc, bd);
    ok(got.exact === true, `${c.label} : voie exhaustive empruntée`);
    near(got.equity, ref, 1e-6, `${c.label} : équité identique à l'énumération indépendante`);
  }
  console.log(`    ${cases.length} spots · écart max avec la référence < 1e-6 pt`);
}

/* ══ 3. RANGES PONDÉRÉES — la pondération doit être respectée exactement ══ */
console.log("[3] Ranges pondérées");
{
  const bd = board("2c", "7h", "9s", "Jd");
  const heroC = combo("Ah", "Ad");
  // Villain : 50 % KK, 50 % 72o (main très faible ici).
  const vKK = [card("Ks"), card("Kd")], v72 = [card("7c"), card("2s")];
  const mixed = [{ cards: vKK, w: 1 }, { cards: v72, w: 1 }];
  const got = computeEquity(heroC, mixed, bd, {});
  const eKK = refEquity([card("Ah"), card("Ad")], vKK, bd);
  const e72 = refEquity([card("Ah"), card("Ad")], v72, bd);
  ok(got.exact === true, "range pondérée : voie exhaustive");
  near(got.equity, (eKK + e72) / 2, 1e-6, "poids égaux → moyenne exacte des deux affrontements");

  // Poids 3:1 → moyenne pondérée correspondante.
  const skewed = [{ cards: vKK, w: 3 }, { cards: v72, w: 1 }];
  const got2 = computeEquity(heroC, skewed, bd, {});
  near(got2.equity, (3 * eKK + e72) / 4, 1e-6, "poids 3:1 → moyenne pondérée exacte");
}

/* ══ 4. CARD REMOVAL — les combos impossibles sont ignorés ══ */
console.log("[4] Card removal");
{
  const bd = board("As", "Kd", "7c", "2h");
  // Villain « AA » : l'As de pique est au tableau, ce combo précis est impossible.
  const heroC = combo("Qh", "Qd");
  const impossible = [{ cards: [card("As"), card("Ah")], w: 1 }];   // utilise As du board
  const possible = [{ cards: [card("Ah"), card("Ac")], w: 1 }];
  const rImp = computeEquity(heroC, impossible, bd, {});
  const rPos = computeEquity(heroC, possible, bd, {});
  ok(Number.isFinite(rImp.equity), "combo impossible : pas de plantage, valeur finie");
  ok(Number.isFinite(rPos.equity) && rPos.equity < 50,
    "QQ contre AA (combo valide) sur board A-high : équité nettement sous 50 %");
}

console.log(`\n✅ équité (exacte) — ${n} assertions OK`);
