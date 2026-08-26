/* ══════════════════════════════════════════════════════════════════════════
   ÉQUITÉ — NON-RÉGRESSION NUMÉRIQUE ET GARDE-FOU DE PERFORMANCE (P0)

   Le chemin EXACT de `computeEquity` a été réécrit : au lieu d'évaluer deux
   mains de sept cartes par PAIRE et par runout, il évalue chaque main une fois
   par runout puis compare des entiers. Ce test répond à deux questions, et à
   elles seules :

     1. LE NOMBRE EST-IL LE MÊME ? Oui, au bit près, partout où aucune main ne
        partage de carte avec le board. L'implémentation D'ORIGINE est embarquée
        ici comme ORACLE : on ne compare pas à une constante recopiée, on compare
        à l'ancien algorithme qui tourne à côté.

     2. LÀ OÙ IL CHANGE, POURQUOI ? Uniquement quand une main partage une carte
        avec le board. L'ancien chemin exact évaluait alors une main de SEPT
        cartes contenant un DOUBLON — le test l'exhibe. Ces combos sont désormais
        écartés, comme le faisaient déjà le Monte-Carlo du même fichier et
        `multistreet.js`.

   Le garde-fou de performance ne mesure pas des millisecondes fines : il détecte
   le RETOUR DE LA CATASTROPHE — une interaction légère qui repart à des dizaines
   de secondes de CPU synchrone. Le seuil est donc large exprès.
════════════════════════════════════════════════════════════════════════════ */
import { computeEquity } from "./src/solver/core/equity.js";
import { rangeComboList, singleHandList } from "./src/solver/core/combos.js";
import { eval7i } from "./src/solver/core/evaluator.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
};

/* ── ORACLE : le chemin exact tel qu'il était AVANT la réécriture ─────────── */
function enumRunouts_o(dead, k, cb) {
  const avail = [];
  for (let c = 0; c < 52; c++) if (!dead.includes(c)) avail.push(c);
  if (k === 0) { cb([]); return; }
  const idx = new Array(k);
  (function rec(start, depth) {
    if (depth === k) { cb(idx.map(i => avail[i])); return; }
    for (let i = start; i <= avail.length - (k - depth); i++) { idx[depth] = i; rec(i + 1, depth + 1); }
  })(0, 0);
}
function exactMatchup_o(h, v, fixed) {
  const dead = [h[0], h[1], v[0], v[1], ...fixed];
  const need = 5 - fixed.length;
  let win = 0, half = 0, tot = 0;
  enumRunouts_o(dead, need, (nc) => {
    const b = need ? [...fixed, ...nc] : fixed;
    const hv = eval7i([h[0], h[1], b[0], b[1], b[2], b[3], b[4]]);
    const vv = eval7i([v[0], v[1], b[0], b[1], b[2], b[3], b[4]]);
    if (hv > vv) win++; else if (hv === vv) half++; tot++;
  });
  return tot ? (win + half * 0.5) / tot : 0.5;
}
function exactEquity_original(heroList, villList, fixed) {
  let num = 0, den = 0;
  for (const h of heroList) for (const v of villList) {
    const hc = h.cards, vc = v.cards, w = (h.w || 1) * (v.w || 1);
    if (hc[0] === vc[0] || hc[0] === vc[1] || hc[1] === vc[0] || hc[1] === vc[1]) continue;
    num += w * exactMatchup_o(hc, vc, fixed); den += w;
  }
  return den ? num / den * 100 : 50;
}

/* ── Fabrique de ranges déterministes ─────────────────────────────────────── */
const mul = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = "23456789TJQKA".split("");
const KEYS = [];
for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
  const a = R[Math.max(i, j)], b = R[Math.min(i, j)];
  KEYS.push(i === j ? a + a : (i > j ? a + b + "s" : a + b + "o"));
}
const UNIQ = [...new Set(KEYS)];
function mkRange(seed, n) {
  const rng = mul(seed), f = {};
  for (const k of [...UNIQ].sort(() => rng() - 0.5).slice(0, n)) f[k] = { r: Math.round(rng() * 100), c: Math.round(rng() * 40), f: 0 };
  return rangeComboList(f);
}
/* Retire d'une liste les combos qui touchent le board — sert à construire des
   corpus SANS collision, où l'égalité avec l'oracle doit être stricte. */
const sansCollision = (list, board) => list.filter(e => !board.includes(e.cards[0]) && !board.includes(e.cards[1]));

console.log("── ÉQUITÉ : non-régression numérique du chemin exact ──\n");

/* ── 1. ÉGALITÉ STRICTE avec l'algorithme d'origine, sans collision ───────── */
{
  const cas = [
    ["river 50x74", mkRange(1, 8), mkRange(2, 10), [47, 22, 6, 35, 18]],
    ["river 258x278", mkRange(3, 30), mkRange(4, 35), [51, 30, 11, 44, 3]],
    ["river main vs range", singleHandList("AKs"), mkRange(5, 40), [47, 22, 6, 35, 18]],
    ["turn 16x24", mkRange(6, 4), mkRange(7, 4), [47, 22, 6, 35]],
    ["flop 2 combos", singleHandList("AA").slice(0, 2), singleHandList("KK").slice(0, 2), [20, 33, 6]],
    ["river main vs main", singleHandList("AKs").slice(0, 1), singleHandList("QQ").slice(0, 1), [47, 22, 6, 35, 18]],
  ];
  for (const [nom, h0, v0, board] of cas) {
    const h = sansCollision(h0, board), v = sansCollision(v0, board);
    const attendu = exactEquity_original(h, v, board);
    const r = computeEquity(h, v, board, { iters: 2500 });
    ok("chemin exact " + nom + " : provenance EXACTE", r.exact === true);
    ok("chemin exact " + nom + " : valeur IDENTIQUE a l'algorithme d'origine",
      r.equity === attendu, r.equity + " != " + attendu);
  }
}

/* ── 2. CARD REMOVAL — l'ancien chemin évaluait des mains impossibles ─────── */
{
  const board = [47, 22, 6, 35, 18];                 // K♣ 5♦ 3♦ 8♣ 4♦
  const hero = singleHandList("AKs");                // contient A♣K♣ → K♣ est sur le board
  const fautif = hero.find(e => board.includes(e.cards[0]) || board.includes(e.cards[1]));
  ok("le corpus contient bien un combo qui touche le board", !!fautif);
  const sept = [fautif.cards[0], fautif.cards[1], ...board];
  const doublons = sept.length - new Set(sept).size;
  ok("l'ancien chemin evaluait une main de 7 cartes AVEC DOUBLON", doublons === 1,
    "doublons=" + doublons);

  const vil = mkRange(5, 40);
  const avecFautif = computeEquity(hero, vil, board, { iters: 2500 }).equity;
  const sansFautif = computeEquity(sansCollision(hero, board), vil, board, { iters: 2500 }).equity;
  ok("le combo impossible est ECARTE (meme resultat qu'en le retirant a la main)",
    avecFautif === sansFautif, avecFautif + " != " + sansFautif);
  const ancien = exactEquity_original(hero, vil, board);
  ok("et l'ancien resultat en differait bien (ecart documente, non silencieux)",
    Math.abs(ancien - avecFautif) > 1,
    "ancien=" + ancien.toFixed(4) + " nouveau=" + avecFautif.toFixed(4));
  console.log("    -> ecart du au card removal : " +
    (avecFautif - ancien).toFixed(4) + " pt (ancien " + ancien.toFixed(2) + " % -> nouveau " + avecFautif.toFixed(2) + " %)");
}
{
  /* Cas dégénéré : toutes les mains du Vilain sont sur le board. Aucune paire
     n'est jouable — on renvoie le neutre 50, on n'invente pas un gagnant. */
  const board = [47, 46, 45, 35, 18];                // K♣ K♦ K♥ 8♣ 4♦
  const r = computeEquity(singleHandList("AA"), singleHandList("KK"), board, {});
  ok("aucune paire possible -> 50 % neutre, pas un resultat invente", r.equity === 50, String(r.equity));
}

/* ── 3. LE MONTE-CARLO EST INCHANGÉ ──────────────────────────────────────── */
{
  /* Même graine, même échantillonnage : le passage à l'évaluateur rapide ne
     doit RIEN changer à la voie approchée. Valeurs figées avant la réécriture. */
  const cas = [
    ["turn-gros", mkRange(8, 60), mkRange(9, 60), [47, 22, 6, 35], 56.58],
    ["flop-petit", mkRange(10, 2), mkRange(11, 2), [47, 22, 6], 59.440000000000005],
    ["flop-gros", mkRange(12, 80), mkRange(13, 80), [47, 22, 6], 50.88],
    ["preflop", mkRange(14, 50), mkRange(15, 50), [], 48.64],
  ];
  for (const [nom, h, v, b, attendu] of cas) {
    const r = computeEquity(h, v, b, { iters: 2500 });
    ok("Monte-Carlo " + nom + " : provenance APPROCHEE", r.exact === false);
    ok("Monte-Carlo " + nom + " : valeur inchangee (" + attendu + ")",
      r.equity === attendu, String(r.equity));
  }
}

/* ── 4. GARDE-FOU DE PERFORMANCE — le retour de la catastrophe ───────────── */
{
  /* Le pire cas atteignable depuis l'interface : range PLEINE contre range
     PLEINE sur une river. C'est exactement ce qui bloquait le thread principal
     166 s. Seuil volontairement large (3 s) : on ne veut pas d'un test fragile
     au dixième de milliseconde, on veut interdire les dizaines de secondes. */
  const pleine = {};
  for (const k of UNIQ) pleine[k] = { r: 60, c: 40, f: 0 };
  const list = rangeComboList(pleine);
  ok("range pleine = 1 326 combos", list.length === 1326, String(list.length));
  const t = Date.now();
  const r = computeEquity(list, list, [47, 22, 6, 35, 18], { iters: 2500 });
  const ms = Date.now() - t;
  console.log("    -> river 1326x1326, chemin EXACT : " + ms + " ms");
  ok("river range pleine x range pleine < 3 000 ms (etait ~211 000 ms)", ms < 3000, ms + " ms");
  ok("river range pleine : toujours resolue en EXACT (aucune bascule d'aiguillage)", r.exact === true);
  ok("river range pleine : symetrique -> 50 %", Math.abs(r.equity - 50) < 1e-9, String(r.equity));

  /* Le turn et le flop restent sur la voie Monte-Carlo — l'aiguillage n'a pas
     bougé, et une frappe de clavier doit rester imperceptible. */
  for (const [nom, board, seuil] of [["turn", [47, 22, 6, 35], 400], ["flop", [47, 22, 6], 400]]) {
    const t2 = Date.now();
    const r2 = computeEquity(list, list, board, { iters: 2500 });
    const ms2 = Date.now() - t2;
    console.log("    -> " + nom + " 1326x1326, Monte-Carlo : " + ms2 + " ms");
    ok(nom + " range pleine : reste APPROCHE (aiguillage inchange)", r2.exact === false);
    ok(nom + " range pleine < " + seuil + " ms", ms2 < seuil, ms2 + " ms");
  }
}

console.log("\n" + (fail === 0 ? "OK" : "ECHEC") + "  " + pass + " assertion(s) OK, " + fail + " echec(s)");
process.exit(fail === 0 ? 0 : 1);
