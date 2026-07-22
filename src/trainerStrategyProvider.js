/* ══════════════════════════════════════════════════════════════════════════
   trainerStrategyProvider.js — STRATEGY PROVIDER (Mission Master §28)

   Branche le SOLVEUR au Trainer pour la SOLUTION des spots. Principe directeur
   (§2/§6) : « LE SOLVEUR CALCULE. L'IA EXPLIQUE. » — la vérité stratégique d'un
   spot n'est jamais inventée.

   Aujourd'hui la solution VALIDÉE disponible en interne est le push/fold préflop
   heads-up (solvePreflopPushFold, exploitabilité ≈ 0). Pour ces spots, la bonne
   action / les fréquences viennent du solveur (provenance EXACT_CALCULATION).
   Pour les autres spots, on retourne la solution existante du template avec une
   provenance HONNÊTE (`heuristic`) — aucune fabrication.

   `resolveSpotStrategy(spot)` → {
     solved, source: "solver"|"heuristic", ok, freq, provenance, note, meta
   }

   Module PUR. Dépend de la Solver API (pushfold).
   ══════════════════════════════════════════════════════════════════════════ */

import { solvePreflopPushFold } from "./solver/api.js";

const RANKS = "23456789TJQKA";
const rIdx = (r) => RANKS.indexOf(r);

/* Deux cartes {r,s} → notation de range ("AA", "AKs", "72o"). */
export function handNotation(cards) {
  if (!Array.isArray(cards) || cards.length < 2 || !cards[0] || !cards[1]) return null;
  let a = cards[0], b = cards[1];
  if (rIdx(a.r) < rIdx(b.r)) { const t = a; a = b; b = t; } // rang haut en premier
  if (a.r === b.r) return a.r + b.r;                        // paire
  return a.r + b.r + (a.s === b.s ? "s" : "o");
}

const AGG_IDS = new Set(["ALLIN", "PUSH", "SHOVE", "JAM"]);
function isAggAct(act) {
  const id = String(act?.id || "").toUpperCase();
  if (AGG_IDS.has(id)) return true;
  return /all-?in|push|jam|shove|tapis/i.test(`${act?.l || ""} ${act?.label || ""}`);
}
function isFoldAct(act) { return String(act?.id || "").toUpperCase() === "FOLD"; }
function isCallAct(act) { return String(act?.id || "").toUpperCase() === "CALL"; }

function parseStackBb(stack) {
  const n = Number(String(stack ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* Un spot est-il un push/fold préflop résoluble par le solveur HU ?
   Conditions : préflop · décision jam OU call-d'un-jam · tapis entier ≤ 30bb
   (couvert par la table pré-solvée / solve rapide). */
export function isSolvablePushFold(spot) {
  if (!spot) return false;
  if (!/^pre/i.test(spot.street || "Preflop")) return false;
  const acts = Array.isArray(spot.acts) ? spot.acts : [];
  const stack = parseStackBb(spot.stack);
  if (!(stack > 0) || stack > 30) return false;               // hors zone push/fold fiable
  if (Math.abs(stack - Math.round(stack)) > 1e-9) return false; // tapis entier (lookup instantané)
  const hasFold = acts.some(isFoldAct);
  const toCall = Math.max(0, Number(spot.toCall) || 0);
  if (toCall > 0) return hasFold && acts.some(isCallAct);      // Héro paie un jam (BB call)
  return hasFold && acts.some(isAggAct);                       // Héro jam (SB jam)
}

/* ──────────────────────────────────────────────────────────────────────────
   resolveSpotStrategy — solution du spot. Solveur si résoluble, sinon heuristique.
   ────────────────────────────────────────────────────────────────────────── */
export function resolveSpotStrategy(spot, opts = {}) {
  const acts = Array.isArray(spot?.acts) ? spot.acts : [];
  if (!isSolvablePushFold(spot)) {
    return { solved: false, source: "heuristic", provenance: "template",
      ok: spot?.ok, freq: spot?.freq, note: "Solution du template (non solvée en interne).", meta: null };
  }
  const hand = handNotation(spot.hand);
  const stack = parseStackBb(spot.stack);
  const facing = Math.max(0, Number(spot.toCall) || 0) > 0;
  const sol = (opts.solve || solvePreflopPushFold)(stack);
  const freqMap = facing ? sol?.bbCall : sol?.sbJam;
  const hf = hand && freqMap ? freqMap[hand] : null;
  if (!hf) {
    return { solved: false, source: "heuristic", provenance: "template",
      ok: spot?.ok, freq: spot?.freq, note: "Main introuvable dans la solution solveur — repli template.", meta: null };
  }

  // Indices des actions : agressive (jam ou call) vs fold.
  const aggIdx = facing ? acts.findIndex(isCallAct) : acts.findIndex(isAggAct);
  const foldIdx = acts.findIndex(isFoldAct);
  if (aggIdx < 0 || foldIdx < 0) {
    return { solved: false, source: "heuristic", provenance: "template", ok: spot?.ok, freq: spot?.freq,
      note: "Actions jam/fold non identifiables — repli template.", meta: null };
  }

  const aggPct = hf.r;                       // % jam (ou % call) GTO
  const ok = aggPct >= 50 ? aggIdx : foldIdx; // action majoritaire
  const aggId = acts[aggIdx].id, foldId = acts[foldIdx].id;
  const freq = { [aggId]: Math.round(aggPct * 10) / 10, [foldId]: Math.round((100 - aggPct) * 10) / 10 };

  return {
    solved: true,
    source: "solver",
    provenance: sol.precompiled ? "solver-library" : "solver-live",
    ok, freq,
    note: facing
      ? `Solveur push/fold HU (${stack}bb) : call ${aggPct}% avec ${hand}.`
      : `Solveur push/fold HU (${stack}bb) : jam ${aggPct}% avec ${hand}.`,
    meta: { stack, hand, facing, aggPct, exploitability: sol.exploitability, rangeSource: sol.rangeSource },
  };
}

/* Applique la solution solveur À UN SPOT (mutation additive) quand elle existe.
   Écrit `ok`/`freq` calculés + `strategySource`/`strategyNote` pour l'affichage
   honnête (§2). Ne touche PAS aux spots non résolubles. Retourne le spot. */
export function applySolverStrategy(spot, opts = {}) {
  if (!spot) return spot;
  const r = resolveSpotStrategy(spot, opts);
  spot.strategySource = r.source;        // "solver" | "heuristic"
  spot.strategyProvenance = r.provenance;
  spot.strategyNote = r.note;
  if (r.solved) {
    spot.ok = r.ok;
    spot.freq = { ...(spot.freq || {}), ...r.freq };
    spot.best = spot.acts?.[r.ok]?.l ?? spot.best;
    spot.solverMeta = r.meta;
  }
  return spot;
}
