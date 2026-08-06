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

/* Classe les acts d'un spot où le Héros FAIT FACE à une mise : Fold / Call / Raise. */
export function classifyFacingActs(acts) {
  const out = { foldIdx: -1, callIdx: -1, raiseIdx: -1 };
  (acts || []).forEach((a, i) => {
    const id = String(a?.id || "").toUpperCase();
    const l = String(a?.l || a?.label || "").toLowerCase();
    if (id === "FOLD" || /fold|abandon/.test(l)) { if (out.foldIdx < 0) out.foldIdx = i; return; }
    if (id === "CALL" || /\bcall\b|suivre|payer/.test(l)) { if (out.callIdx < 0) out.callIdx = i; return; }
    if (/RAISE|3BET|4BET|5BET|ALLIN|SHOVE|JAM/.test(id) || /raise|relanc|check-?raise|jam|shove|tapis|all-?in/.test(l)) { if (out.raiseIdx < 0) out.raiseIdx = i; return; }
  });
  return out;
}

function parseStackBb(stack) {
  const n = Number(String(stack ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* Ré-pondère une range 169 : `pick(freqs)` donne le % de CONTINUATION de chaque main.
   `rangeComboList` pondère par (r+c)/100 → on place tout le poids dans `c`. */
export function weightedRange(raw, pick) {
  const out = {};
  for (const k in raw) {
    const w = Math.min(100, Math.max(0, pick(raw[k] || {}) || 0));
    out[k] = { r: 0, c: w, f: 100 - w };
  }
  return out;
}

/* Type de pot postflop : "3bp" (pot 3-bet) ou "srp" (pot simple-relancé).
   Deux signaux, du plus fiable au repli :
     1. HISTORIQUE d'actions — une relance de relance (3BET/4BET) avant le flop est
        une preuve directe.
     2. TAILLE DU POT rapportée à la grosse blinde — un SRP fait ~5-8bb (open ~2,5-3bb
        + call), un pot 3-bet ~18-24bb. Seuil à 12bb : au-dessus, seule une relance de
        relance explique le pot. (Blindes du Trainer : 0,5/1.)
   Volontairement conservateur : dans le doute on reste sur "srp", le cas dominant. */
export function potKind(spot) {
  const hist = Array.isArray(spot?.actionHistory) ? spot.actionHistory
    : Array.isArray(spot?.preActions) ? spot.preActions : [];
  for (const a of hist) {
    const t = String(a?.actionType || a?.action || a?.type || a?.id || "").toUpperCase();
    if (/3BET|4BET|5BET/.test(t)) return "3bp";
    const l = String(a?.label || a?.displayLabel || "").toLowerCase();
    if (/3-?bet|4-?bet|squeeze/.test(l)) return "3bp";
  }
  const bb = Number(spot?.bb) || 1;
  const pot = Number(spot?.pot) || 0;
  return pot / bb >= 12 ? "3bp" : "srp";
}

/* Mode postflop d'un spot : "leads" (Héros ouvre : Check/Bet), "facing" (Héros face à
   une mise : Call/Fold), ou null. */
export function postflopMode(spot) {
  const cls = classifyFlopActs(spot?.acts);
  if (!cls.hasCall && cls.checkIdx >= 0 && cls.bets.length >= 1) return "leads";
  const fb = classifyFacingActs(spot?.acts);
  if (fb.callIdx >= 0 && fb.foldIdx >= 0 && Number(spot?.toCall) > 0) return "facing";
  return null;
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
  if (parseStackBb(spot.stack) <= 0) return false;
  return postflopMode(spot) !== null;   // "leads" (Check/Bet) OU "facing" (Call/Fold)
}
/* Alias rétro-compat. */
export const isSolvableFlop = isSolvablePostflop;

/* Spot → requête plain-data pour le worker + carte de mapping des acts. */
export function buildPostflopSolveRequest(spot) {
  if (!isSolvablePostflop(spot)) return null;
  const heroPos = spot.hpos, vsPos = spot.vpos;
  const stack = parseStackBb(spot.stack) || 100;
  const startPot = Math.max(1, Math.round((Number(spot.pot) || 6) * 10) / 10);
  const mode = postflopMode(spot);

  // ── RANGES D'ENTRÉE = f(type de pot, rôle) ──
  // Rôle : leads → le Héros a l'initiative (agresseur préflop) ; facing → il est suiveur.
  // Type de pot : SRP (pot simple-relancé) ou 3BP (pot 3-bet) — cf. potKind().
  const pot3 = potKind(spot) === "3bp";
  // Range de l'AGRESSEUR : open (SRP) ou portion 3-bet de vs_open (3BP).
  const aggressorRange = (pos, opp) => pot3
    ? weightedRange(buildSolverFreqs(pos, "vs_open", stack, opp), f => f.r || 0)   // il a 3-bet
    : buildSolverFreqs(pos, "rfi", stack, opp);                                    // il a ouvert
  // Range du SUIVEUR : on prend la portion de continuation et on y REVERSE la portion
  // relance. Pourquoi : ce pot EST un pot suivi, donc conditionner sur « a payé » inclut
  // les mains fortes qui, dans CETTE branche, ont choisi de call plutôt que de relancer.
  // Sans ça, les mains à relance pure (AA/KK) sortent de la range avec un poids 0 et leur
  // stratégie postflop devient illisible (bug observé : « hand-not-in-range » sur AA).
  const callerRange = (pos, opp) => weightedRange(
    buildSolverFreqs(pos, pot3 ? "vs_3bet" : "vs_open", stack, opp),
    f => (f.c || 0) + (f.r || 0));
  const heroFreqs = mode === "facing" ? callerRange(heroPos, vsPos) : aggressorRange(heroPos, vsPos);
  const villFreqs = mode === "facing" ? aggressorRange(vsPos, heroPos) : callerRange(vsPos, heroPos);

  const board = spot.board.map(cardToInt);
  const heroClassKey = handClassKey(spot.hand[0], spot.hand[1]);
  const street = board.length === 5 ? "river" : board.length === 4 ? "turn" : "flop";
  const maxCombos = street === "river" ? 200 : 140;

  let solveStartPot, betSizes, nodePath, entries;
  if (mode === "facing") {
    // Héros FACE à une mise. On modélise « hero check → villain bet → hero F/C/R » :
    // le pot AVANT la mise villain = pot - toCall ; la taille de mise villain (fraction
    // de ce pot) = toCall/(pot-toCall). On lit le nœud ["X","B"] (F/C/R).
    const toCall = Math.max(0.5, Number(spot.toCall) || 0);
    solveStartPot = Math.max(1, Math.round((startPot - toCall) * 10) / 10);
    const frac = Math.max(0.15, Math.min(2.5, toCall / solveStartPot));
    betSizes = [frac];
    nodePath = ["X", "B"];
    const fb = classifyFacingActs(spot.acts);
    entries = [
      { label: "F", idx: fb.foldIdx },
      { label: "C", idx: fb.callIdx },
      { label: "R", idx: fb.raiseIdx },
    ].filter(e => e.idx >= 0);
  } else {
    // Hero-leads : Check/Bet. Sizings RÉELS du spot (≤2 pour borner l'arbre).
    const cls = classifyFlopActs(spot.acts);
    const bets = cls.bets.slice(0, 2);
    betSizes = bets.map(b => b.frac || 0.66);
    solveStartPot = startPot;
    nodePath = null;
    const betLabels = betSizes.map((_, k) => (betSizes.length === 1 ? "B" : "B" + k));
    entries = [{ label: "X", idx: cls.checkIdx }, ...bets.map((b, k) => ({ label: betLabels[k], idx: b.i }))]
      .filter(e => e.idx >= 0);
  }
  const effStack = Math.max(1, Math.round(stack - solveStartPot / 2));   // tapis restant derrière

  const request = {
    heroFreqs, villFreqs, board, heroClassKey,
    opts: { startPot: solveStartPot, betSizes, effStack, iters: 100, maxCombos, nodePath },
  };
  return { request, actsMap: { entries }, meta: { heroPos, vsPos, stack, startPot: solveStartPot, heroClassKey, street, mode, potKind: pot3 ? "3bp" : "srp" } };
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

  // Mappe chaque label solveur (X/B0/B1 ou F/C/R) sur l'act du spot correspondant.
  for (const e of (actsMap.entries || [])) {
    if (e.idx == null || e.idx < 0 || !acts[e.idx]?.id) continue;
    freq[acts[e.idx].id] = Math.round((dist[e.label] || 0) * 10) / 10;
  }

  // Action majoritaire = ok.
  let okIdx = -1, best = -1;
  acts.forEach((a, i) => { const v = a?.id ? (freq[a.id] || 0) : 0; if (v > best) { best = v; okIdx = i; } });

  const nc = workerRes.nashConv;
  const modeLbl = meta.mode === "facing" ? " face-à-mise" : "";
  const streetLbl = ({ flop: "flop", turn: "turn", river: "river (board complet)" }[meta.street] || "postflop") + modeLbl;
  const exact = meta.street === "river" && nc != null;
  const ncTxt = nc == null ? (workerRes.convNote || "runouts échantillonnés") : `NashConv ${Math.round(nc * 1000) / 1000}bb${exact ? " (exact)" : ""}`;
  return {
    solved: true,
    ok: okIdx,
    freq,
    source: "solver",
    provenance: "cfr-experimental",
    note: `CFR ${streetLbl} HU (expérimental) — ${meta.heroClassKey || ""} en ${meta.potKind === "3bp" ? "pot 3-bet" : "pot simple-relancé"} sur ranges heuristiques · ${ncTxt}.`,
    meta: {
      engine: "cfr", experimental: true, rangeSource: "heuristic",
      nashConv: nc ?? null, abstraction: workerRes.abstraction || null,
      heroClassKey: meta.heroClassKey, dist,
    },
  };
}
