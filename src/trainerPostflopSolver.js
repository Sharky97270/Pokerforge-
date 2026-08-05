/* ════════════════════════════════════════════════════════════════════════════
   PROVIDER POSTFLOP CFR (pur, testable) — miroir de trainerStrategyProvider pour
   les spots FLOP heads-up où le Héros AGIT EN PREMIER (C-bet : Check / Bet / Fold).

   Rôle : traduire un spot Trainer en REQUÊTE de solve (ranges heuristiques + board +
   classe de main + opts), puis mapper la distribution renvoyée par le worker CFR sur
   les actions du spot. NE fait PAS le solve (c'est le worker) → reste synchrone/pur.

   Honnêteté (§2) : le CFR est EXACT sur des RANGES HEURISTIQUES → strategySource
   "solver" mais provenance "cfr-experimental" + rangeSource "heuristic". La position
   exacte (IP/OOP) et la texture de couleur (abstraction de classe) sont approximées
   → « expérimental » assumé.
   ════════════════════════════════════════════════════════════════════════════ */
import { buildSolverFreqs } from "./solver/preflopRanges.js";
import { EQ_RANKVAL, EQ_SUITIDX } from "./solver/core/combos.js";

export function cardToInt(c) {
  if (!c) return null;
  const r = EQ_RANKVAL.indexOf(c.r);
  const s = EQ_SUITIDX[c.s];
  return (r < 0 || s == null) ? null : r * 4 + s;
}

/* Deux cartes {r,s} → classe de main format range ("AKs" / "AKo" / "QQ"), rang haut
   en premier (même convention que buildSolverFreqs / heroList.key). */
export function handClassKey(c1, c2) {
  if (!c1 || !c2) return null;
  const i1 = EQ_RANKVAL.indexOf(c1.r), i2 = EQ_RANKVAL.indexOf(c2.r);
  if (i1 < 0 || i2 < 0) return null;
  if (i1 === i2) return c1.r + c1.r;                     // paire
  const hi = i1 > i2 ? c1 : c2, lo = i1 > i2 ? c2 : c1;  // rang le plus fort d'abord
  return hi.r + lo.r + (c1.s === c2.s ? "s" : "o");
}

/* Classe les acts du spot flop : check / fold / bets (ascendants). Rejette si le Héros
   FAIT FACE à une mise (présence d'un Call → arbre différent, non modélisé ici). */
export function classifyFlopActs(acts) {
  const out = { checkIdx: -1, foldIdx: -1, bets: [], hasCall: false };
  (acts || []).forEach((a, i) => {
    const id = String(a?.id || "").toUpperCase();
    const l = String(a?.l || a?.label || "").toLowerCase();
    if (id === "CALL" || /\bcall\b/.test(l)) { out.hasCall = true; return; }
    if (id === "CHECK" || id === "CHECK_BACK" || /check/.test(l)) { out.checkIdx = i; return; }
    if (id === "FOLD" || /fold|abandon/.test(l)) { out.foldIdx = i; return; }
    out.bets.push({ i, l, id, frac: betFracFromLabel(l) });   // mise (Bet ½, Cbet 33%, PSB…)
  });
  return out;
}

/* Fraction de pot déduite du libellé d'un bouton de mise. Défaut 0.66 si illisible. */
function betFracFromLabel(l) {
  const s = String(l || "").toLowerCase();
  const pct = s.match(/(\d{2,3})\s*%/);
  if (pct) return Math.max(0.1, Math.min(2.5, parseInt(pct[1], 10) / 100));
  if (/overbet|125|150/.test(s)) return 1.25;
  if (/psb|pot|100/.test(s)) return 1.0;
  if (/¾|3\/4|75/.test(s)) return 0.75;
  if (/½|1\/2|50|half/.test(s)) return 0.5;
  if (/⅓|1\/3|33|third/.test(s)) return 0.33;
  if (/¼|1\/4|25/.test(s)) return 0.25;
  return 0.66;
}

function parseStackBb(stack) {
  const n = Number(String(stack ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* Un spot postflop HU (FLOP/TURN/RIVER) où le Héros AGIT EN PREMIER (Check/Bet) est-il
   résoluble par le CFR ? Le nb de rues restantes est dérivé de la longueur du board par
   solveMultiStreet (flop=3→2 rues à venir, turn=4→1, RIVER=5→0 = EXACT, NashConv réel). */
export function isSolvablePostflop(spot) {
  if (!spot) return false;
  const street = String(spot.street || "").toLowerCase();
  if (!/flop|turn|river/.test(street)) return false;
  const bl = Array.isArray(spot.board) ? spot.board.length : 0;
  if (bl < 3 || bl > 5) return false;
  if (spot.board.some(c => cardToInt(c) == null)) return false;
  if (!Array.isArray(spot.hand) || spot.hand.length < 2) return false;
  if (handClassKey(spot.hand[0], spot.hand[1]) == null) return false;
  if (!spot.hpos || !spot.vpos || spot.hpos === spot.vpos) return false;
  // HU POSTFLOP uniquement : ce qui compte est le nb de joueurs DANS LE POT (héros + 1
  // villain), pas la taille de table. On rejette seulement un multiway explicite (3+).
  if (spot.multiway === true) return false;
  if (Array.isArray(spot.villains) && spot.villains.length > 1) return false;
  const cls = classifyFlopActs(spot.acts);
  if (cls.hasCall) return false;                 // Héro FACE à une mise → autre arbre (à venir)
  if (cls.checkIdx < 0 || cls.bets.length < 1) return false;   // hero-leads : Check + au moins 1 Bet
  if (parseStackBb(spot.stack) <= 0) return false;
  return true;
}
/* Alias rétro-compat. */
export const isSolvableFlop = isSolvablePostflop;

/* Spot → requête plain-data pour le worker + carte de mapping des acts. */
export function buildPostflopSolveRequest(spot) {
  if (!isSolvablePostflop(spot)) return null;
  const heroPos = spot.hpos, vsPos = spot.vpos;
  const stack = parseStackBb(spot.stack) || 100;
  const startPot = Math.max(1, Math.round((Number(spot.pot) || 6) * 10) / 10);

  // Héros = agresseur préflop (c-bet) → sa range flop = range d'OPEN.
  const heroFreqs = buildSolverFreqs(heroPos, "rfi", stack, vsPos);
  // Villain = suiveur → UNIQUEMENT la portion CALL de vs_open (les 3-bets sont partis
  // dans un pot 3-bet, pas sur ce flop en pot simple-relancé). On zéro-out le 3bet (r).
  const villRaw = buildSolverFreqs(vsPos, "vs_open", stack, heroPos);
  const villFreqs = {};
  for (const k in villRaw) {
    const c = villRaw[k]?.c || 0;
    villFreqs[k] = { r: 0, c, f: Math.max(0, 100 - c) };
  }

  const board = spot.board.map(cardToInt);
  const heroClassKey = handClassKey(spot.hand[0], spot.hand[1]);
  const effStack = Math.max(1, Math.round(stack - startPot / 2));   // tapis restant derrière

  const cls = classifyFlopActs(spot.acts);
  // Sizings RÉELS du spot (≤2 pour borner l'arbre) → le CFR solve exactement les tailles
  // proposées au joueur. Labels solveur : "B" si une seule taille, sinon "B0","B1".
  const bets = cls.bets.slice(0, 2);
  const betSizes = bets.map(b => b.frac || 0.66);
  const betLabels = betSizes.map((_, k) => (betSizes.length === 1 ? "B" : "B" + k));
  const actsMap = { checkLabel: "X", checkIdx: cls.checkIdx, foldIdx: cls.foldIdx, bets: [] };
  bets.forEach((b, k) => actsMap.bets.push({ label: betLabels[k], idx: b.i }));

  // River (board complet, 5 cartes) = solve EXACT (aucun runout à échantillonner) → on
  // peut se permettre plus de combos pour la précision. Turn/flop restent échantillonnés.
  const street = board.length === 5 ? "river" : board.length === 4 ? "turn" : "flop";
  const maxCombos = street === "river" ? 200 : 140;
  const request = {
    heroFreqs, villFreqs, board, heroClassKey,
    opts: { startPot, betSizes, effStack, iters: 100, maxCombos },
  };
  return { request, actsMap, meta: { heroPos, vsPos, stack, startPot, heroClassKey, street } };
}
/* Alias rétro-compat. */
export const buildFlopSolveRequest = buildPostflopSolveRequest;

/* Distribution worker {distByLabel} → objet stratégie pour le spot (ok/freq + provenance
   honnête). `actsMap` vient de buildFlopSolveRequest. Retourne null si inexploitable. */
export function mapWorkerResultToStrategy(workerRes, spot, actsMap, meta = {}) {
  if (!workerRes || !workerRes.ok || !workerRes.distByLabel) return null;
  const dist = workerRes.distByLabel;
  const acts = spot.acts || [];
  const freq = {};
  for (const a of acts) if (a?.id) freq[a.id] = 0;

  const setByIdx = (idx, pct) => {
    if (idx == null || idx < 0 || !acts[idx]) return;
    const id = acts[idx].id;
    if (id) freq[id] = Math.round((pct || 0) * 10) / 10;
  };
  setByIdx(actsMap.checkIdx, dist[actsMap.checkLabel] || 0);
  for (const b of actsMap.bets) setByIdx(b.idx, dist[b.label] || 0);
  // Fold au nœud racine = 0 (rien à fold quand on peut checker) — déjà 0.

  // Action majoritaire = ok.
  let okIdx = -1, best = -1;
  acts.forEach((a, i) => { const v = a?.id ? (freq[a.id] || 0) : 0; if (v > best) { best = v; okIdx = i; } });

  const nc = workerRes.nashConv;
  const streetLbl = { flop: "flop", turn: "turn", river: "river (board complet)" }[meta.street] || "postflop";
  const exact = meta.street === "river" && nc != null;
  const ncTxt = nc == null ? (workerRes.convNote || "runouts échantillonnés") : `NashConv ${Math.round(nc * 1000) / 1000}bb${exact ? " (exact)" : ""}`;
  return {
    solved: true,
    ok: okIdx,
    freq,
    source: "solver",
    provenance: "cfr-experimental",
    note: `CFR ${streetLbl} HU (expérimental) — ${meta.heroClassKey || ""} sur ranges heuristiques · ${ncTxt}.`,
    meta: {
      engine: "cfr", experimental: true, rangeSource: "heuristic",
      nashConv: nc ?? null, abstraction: workerRes.abstraction || null,
      heroClassKey: meta.heroClassKey, dist,
    },
  };
}
