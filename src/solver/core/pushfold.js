/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · ÉQUILIBRE PUSH/FOLD PRÉFLOP (§11 — préflop solvé, 1re tranche)

   POURQUOI CE SEGMENT EST EXACTEMENT SOLVABLE, ET PAS LE PRÉFLOP PROFOND :
   toute main all-in va à l'abattage. Il n'y a donc AUCUNE EV postflop à estimer —
   il ne reste qu'une matrice d'équité et un jeu matriciel à somme nulle. C'est la
   raison structurelle pour laquelle les tapis courts se résolvent ici en quelques
   secondes, alors qu'un solve préflop profond (RFI/3bet avec jeu postflop) exige un
   solve postflop à CHAQUE nœud terminal — d'où les heures de serveur ailleurs.

   Ces ranges ne sont donc PAS heuristiques : elles sont calculées, et leur
   provenance est EXACT_CALCULATION (à la précision de la matrice d'équité près,
   cf. `matrixNoise`). C'est la première zone de l'écran à quitter le rouge
   « Heuristique » (cf. docs/sharksolver/12_HEURISTIC_SURFACE_AUDIT.md).

   MODÈLE — heads-up, tapis effectif S (bb), blindes 0.5 / 1 :
     SB couche            → SB net = -0.5
     SB jam, BB couche    → SB net = +1
     SB jam, BB paie      → pot 2S, SB net = S·(2·eq − 1)
   BB face au jam : coucher = −1 ; payer = S·(2·eq − 1).

   CARD REMOVAL exact au niveau des classes : le poids de la classe j sachant que
   l'adversaire tient la classe i vient de l'énumération des paires de combos
   DISJOINTES. Un simple comptage de combos surestimerait lourdement les cas de
   recouvrement (AA contre AA en est le cas extrême).

   LIMITES ASSUMÉES (§2) :
     · HEADS-UP uniquement. Le short stack de tournoi est souvent multiway.
     · chip-EV pur : aucune contrainte ICM. L'utilité ICM (§21) existe et pourrait
       s'y brancher, mais ce n'est PAS fait ici — ne pas présenter ces ranges comme
       des ranges de bulle.
     · précision bornée par la matrice d'équité (bruit ≈ ±0.26 pt, cf. §24).
════════════════════════════════════════════════════════════════════════════ */
import { comboCardsInt } from "./combos.js";
import MATRIX from "../data/preflopEquity.js";

const N = MATRIX.n;
export const PF_HANDS = MATRIX.hands;

/* Le triangle supérieur est stocké en centièmes entiers ; l'antisymétrie
   eq(j,i) = 100 − eq(i,j) reconstruit le reste (matrice divisée par 2.5 en taille). */
const triIndex = (i, j) => i * N - (i * (i - 1)) / 2 + (j - i);
export function pfEquity(i, j) {
  return i <= j ? MATRIX.tri[triIndex(i, j)] / 100 : 100 - MATRIX.tri[triIndex(j, i)] / 100;
}

/* Poids de card removal : W[i][j] = nombre de paires (combo de i, combo de j) sans
   carte commune. Calculé une fois au premier usage (169² × ≤144, négligeable). */
let _W = null, _nCombos = null;
function weights() {
  if (_W) return _W;
  const combos = PF_HANDS.map(comboCardsInt);
  _nCombos = combos.map(c => c.length);
  _W = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
    let n = 0;
    for (const a of combos[i]) for (const b of combos[j]) {
      if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) n++;
    }
    _W[i][j] = n; _W[j][i] = n;
  }
  return _W;
}
export function pfComboCounts() { weights(); return _nCombos; }

/* EV de BB s'il paie le jam avec la main j, face à la range de jam `sbJam`. */
function bbCallEV(j, sbJam, S) {
  const W = weights();
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) {
    const w = sbJam[i] * W[j][i];
    if (w <= 0) continue;
    num += w * (S * (2 * ((100 - pfEquity(i, j)) / 100) - 1));
    den += w;
  }
  return den ? num / den : 0;
}
/* EV de SB s'il jam la main i, face à la range de call `bbCall`. */
function sbJamEV(i, bbCall, S) {
  const W = weights();
  let callW = 0, foldW = 0, callEV = 0;
  for (let j = 0; j < N; j++) {
    const w = W[i][j];
    if (w <= 0) continue;
    const c = bbCall[j];
    callW += w * c; foldW += w * (1 - c);
    if (c > 0) callEV += w * c * (S * (2 * (pfEquity(i, j) / 100) - 1));
  }
  const tot = callW + foldW;
  return tot ? (foldW * 1 + callEV) / tot : 1;
}

/* Meilleures réponses alternées amorties (fictitious play). L'équilibre push/fold
   est génériquement en stratégies pures ; l'amortissement en 1/(t+2) évite les
   cycles. 20000 itérations ≈ 7 s et donnent une exploitabilité < 0.0003 bb.
   ATTENTION : monter les itérations AVANT d'assouplir un seuil d'exploitabilité —
   à 500 itérations l'exploitabilité résiduelle à 25bb (0.010) ressemblait à une
   limite du modèle, ce n'était que de la convergence inachevée. */
export function solvePushFold(S, opts = {}) {
  /* 4000 par défaut : exploitabilité mesurée < 0.001 bb, pour ~6 s en navigateur —
     du même ordre que le solve flop 3 rues déjà livré. 20000 itérations descendent
     à 0.0003 bb mais coûtent 23 s, ce qui gèlerait l'UI.
     Le pré-calcul hors ligne (scripts/build-pushfold-ranges.mjs) permettra de
     livrer le niveau 20000 en réponse instantanée — pas encore branché. */
  const iters = opts.iters || 4000;
  const sbJam = new Float64Array(N).fill(0.5);
  const bbCall = new Float64Array(N).fill(0.5);
  const brBB = new Float64Array(N), brSB = new Float64Array(N);
  for (let t = 0; t < iters; t++) {
    const lr = 1 / (t + 2);
    for (let j = 0; j < N; j++) brBB[j] = bbCallEV(j, sbJam, S) > -1 ? 1 : 0;
    for (let j = 0; j < N; j++) bbCall[j] += lr * (brBB[j] - bbCall[j]);
    for (let i = 0; i < N; i++) brSB[i] = sbJamEV(i, bbCall, S) > -0.5 ? 1 : 0;
    for (let i = 0; i < N; i++) sbJam[i] += lr * (brSB[i] - sbJam[i]);
  }
  return { sbJam, bbCall, stack: S, iters };
}

/* Exploitabilité : gain qu'obtiendrait chaque camp en déviant vers sa meilleure
   réponse. ≈0 des deux côtés ⟺ équilibre. Même rôle que NashConv (§26). */
export function pfExploitability(sbJam, bbCall, S) {
  const nc = pfComboCounts();
  let cur = 0, best = 0, wtot = 0;
  for (let i = 0; i < N; i++) {
    const w = nc[i], ev = sbJamEV(i, bbCall, S);
    cur += w * (sbJam[i] * ev + (1 - sbJam[i]) * -0.5);
    best += w * Math.max(ev, -0.5);
    wtot += w;
  }
  let curB = 0, bestB = 0, wB = 0;
  for (let j = 0; j < N; j++) {
    const w = nc[j], ev = bbCallEV(j, sbJam, S);
    curB += w * (bbCall[j] * ev + (1 - bbCall[j]) * -1);
    bestB += w * Math.max(ev, -1);
    wB += w;
  }
  return { sbGain: (best - cur) / wtot, bbGain: (bestB - curB) / wB };
}

/* Part de combos couverte par une distribution de fréquences (0..100). */
export function pfRangePct(freqs) {
  const nc = pfComboCounts();
  let n = 0, d = 0;
  for (let i = 0; i < N; i++) { n += nc[i] * freqs[i]; d += nc[i]; }
  return d ? 100 * n / d : 0;
}

/* Conversion vers le format de range du reste du solveur : {AA:{r,c,f}, …}.
   `r` porte la fréquence de jam (ou de call) : c'est l'action agressive du spot. */
export function pfToFreqs(dist) {
  const out = {};
  for (let i = 0; i < N; i++) {
    const p = Math.round(dist[i] * 1000) / 10;
    out[PF_HANDS[i]] = { r: p, c: 0, f: Math.round((100 - p) * 10) / 10 };
  }
  return out;
}

/* Métadonnées de l'artefact — l'UI doit pouvoir dire d'où viennent ces chiffres. */
export const PF_MATRIX_META = {
  iters: MATRIX.iters,
  hands: N,
  matchups: MATRIX.tri.length,
  // Bruit mesuré sur la diagonale, dont la valeur vraie est connue (50% par
  // symétrie) : c'est le témoin gratuit du bruit de toute la matrice.
  matrixNoise: { mean: 0.26, median: 0.20, max: 1.30 },
  generator: "scripts/build-preflop-equity.mjs",
};
