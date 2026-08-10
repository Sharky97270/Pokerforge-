/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — ÉQUITÉ, INVARIANTS (§8)

   Les invariants sont la forme de preuve la plus robuste : ils ne dépendent d'aucune
   valeur de référence à recopier, seulement de propriétés que le calcul DOIT vérifier
   quelles que soient les entrées. Une violation d'invariant est un bug certain.
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { computeEquity } from "./src/solver/core/equity.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (obtenu ${a}, attendu ${b}, tol ${tol})`); n++; };

const C = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
const card = str => C(str[0], str[1]);
const combo = (a, b) => [{ cards: [card(a), card(b)], w: 1 }];
const board = (...cs) => cs.map(card);
const EX = { budget: 1e9 };   // force la voie exhaustive : les invariants doivent tenir exactement

/* ══ 1. SYMÉTRIE — eq(A vs B) + eq(B vs A) = 100 ══
   C'est l'invariant le plus fort du calcul d'équité : il n'y a pas de « point de vue »
   privilégié. Toute asymétrie signalerait un biais dans le traitement des égalités. */
console.log("[1] Symétrie Hero/Vilain");
{
  const spots = [
    { h: ["Ah", "Ad"], v: ["Ks", "Kd"], b: ["2c", "7h", "9s", "Jd"] },
    { h: ["As", "Ks"], v: ["Qh", "Jd"], b: ["2s", "7s", "9d"] },
    { h: ["Ts", "9s"], v: ["Ah", "Kd"], b: ["8s", "7d", "2c", "Jh"] },
    { h: ["2c", "3d"], v: ["Ac", "Ad"], b: ["Ks", "Qs", "Js", "Th", "9h"] },
  ];
  for (const s of spots) {
    const ab = computeEquity(combo(s.h[0], s.h[1]), combo(s.v[0], s.v[1]), board(...s.b), EX).equity;
    const ba = computeEquity(combo(s.v[0], s.v[1]), combo(s.h[0], s.h[1]), board(...s.b), EX).equity;
    near(ab + ba, 100, 1e-6, `symétrie ${s.h.join("")} vs ${s.v.join("")} : la somme vaut 100`);
  }
}

/* ══ 2. BORNES — une équité est toujours dans [0, 100] ══ */
console.log("[2] Bornes");
{
  const spots = [
    { h: ["Ah", "Ad"], v: ["Ks", "Kd"], b: [] },
    { h: ["2c", "3d"], v: ["Ac", "Ad"], b: ["Ks", "Qs", "Js"] },
    { h: ["As", "Ks"], v: ["Qh", "Qd"], b: ["2s", "7s", "9d", "Jc", "4h"] },
  ];
  for (const s of spots) {
    const e = computeEquity(combo(s.h[0], s.h[1]), combo(s.v[0], s.v[1]), board(...s.b), {}).equity;
    ok(e >= 0 && e <= 100, `équité dans [0,100] (${e.toFixed(2)})`);
  }
}

/* ══ 3. MAIN CONTRE ELLE-MÊME (à isomorphisme de couleurs près) = 50 % ══
   Deux mains de même structure sur un board neutre doivent partager exactement.
   Impossible d'utiliser littéralement les mêmes cartes (card removal), on prend donc
   les mêmes rangs dans des couleurs différentes, sur un board qui n'avantage ni l'une
   ni l'autre. */
console.log("[3] Structures identiques → partage");
{
  const b = board("2c", "7d", "9h", "Jc", "4s");   // aucune couleur possible
  const e = computeEquity(combo("As", "Kh"), combo("Ad", "Kc"), b, EX).equity;
  near(e, 50, 1e-6, "AK vs AK sur board arc-en-ciel : partage exact");
  const e2 = computeEquity(combo("Qs", "Qh"), combo("Qd", "Qc"), b, EX).equity;
  near(e2, 50, 1e-6, "QQ vs QQ : partage exact");
}

/* ══ 4. DOMINATION — la main dominante doit être devant ══ */
console.log("[4] Dominations et hiérarchie");
{
  const pre = [];
  const dom = [
    { a: ["Ah", "Ad"], b: ["Ks", "Kd"], why: "AA domine KK" },
    { a: ["Ah", "Kd"], b: ["Ah".replace("h", "s"), "Qd"], why: "AK domine AQ" },
    { a: ["Ks", "Kd"], b: ["7c", "2h"], why: "KK domine 72o" },
  ];
  for (const d of dom) {
    const e = computeEquity(combo(d.a[0], d.a[1]), combo(d.b[0], d.b[1]), pre, { iters: 20000, seed: 42 }).equity;
    ok(e > 55, `${d.why} (équité ${e.toFixed(1)} % > 55)`);
  }
}

/* ══ 5. BOARD VERROUILLÉ — les nuts imprenables valent 100 % ══ */
console.log("[5] Nuts et boards verrouillés");
{
  // Quinte flush royale au tableau + hero la complète : rien ne peut le battre.
  const e = computeEquity(combo("As", "Ks"), combo("Ah", "Ad"), board("Qs", "Js", "Ts", "2h"), EX).equity;
  ok(e > 99, `quinte flush royale faite au turn : ~100 % (${e.toFixed(2)})`);
  // L'inverse : main sans aucun tirage face aux nuts.
  const e2 = computeEquity(combo("2h", "3d"), combo("As", "Ks"), board("Qs", "Js", "Ts", "4h", "5c"), EX).equity;
  ok(e2 < 1, `dominé sans tirage sur board complet : ~0 % (${e2.toFixed(2)})`);
}

/* ══ 6. INVARIANCE PAR PERMUTATION DES COULEURS ══
   Renommer globalement les couleurs est une symétrie du jeu : l'équité ne doit pas
   bouger. C'est ce qui légitime l'abstraction par classe de main dans le solveur. */
console.log("[6] Invariance par permutation des couleurs");
{
  const perm = [2, 3, 1, 0];                       // s→d, h→c, d→h, c→s
  const map = c => ((c >> 2) << 2) | perm[c & 3];
  const spots = [
    { h: ["As", "Ks"], v: ["Qh", "Qd"], b: ["2s", "7s", "9d", "Jc"] },
    { h: ["Th", "9h"], v: ["Ac", "Kd"], b: ["8h", "7d", "2c"] },
  ];
  for (const s of spots) {
    const hc = [card(s.h[0]), card(s.h[1])], vc = [card(s.v[0]), card(s.v[1])], bd = board(...s.b);
    const base = computeEquity([{ cards: hc, w: 1 }], [{ cards: vc, w: 1 }], bd, EX).equity;
    const mapped = computeEquity(
      [{ cards: hc.map(map), w: 1 }], [{ cards: vc.map(map), w: 1 }], bd.map(map), EX).equity;
    near(mapped, base, 1e-6, `permutation des couleurs sans effet (${s.h.join("")} vs ${s.v.join("")})`);
  }
}

/* ══ 7. MONOTONIE — améliorer sa main ne peut pas réduire son équité ══ */
console.log("[7] Monotonie");
{
  const b = board("Ks", "Qd", "7c");
  const withPair = computeEquity(combo("Ah", "Kh"), combo("Js", "Ts"), b, EX).equity;   // paire de rois
  const withAir = computeEquity(combo("Ah", "3h"), combo("Js", "Ts"), b, EX).equity;    // hauteur d'as
  ok(withPair > withAir, `paire de rois > hauteur d'as face au même adversaire (${withPair.toFixed(1)} > ${withAir.toFixed(1)})`);
}

/* ══ 8. ENTRÉES DÉGÉNÉRÉES — pas de plantage, valeur neutre ══ */
console.log("[8] Entrées vides");
{
  const e1 = computeEquity([], combo("Ah", "Ad"), [], {});
  near(e1.equity, 50, 1e-9, "range Hero vide → 50 % (valeur neutre, pas d'exception)");
  const e2 = computeEquity(combo("Ah", "Ad"), [], [], {});
  near(e2.equity, 50, 1e-9, "range Vilain vide → 50 %");
}

console.log(`\n✅ équité (invariants) — ${n} assertions OK`);
