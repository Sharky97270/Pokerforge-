/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : PACKAGE SOLVEUR (§7/§8/§19)

   « LE SOLVEUR CALCULE. L'IA EXPLIQUE. »

   Ce module rassemble TOUT ce que PokerForge sait mathématiquement d'une
   main AVANT le moindre appel à l'IA :
     1. bibliothèque pré-solvée / SharkSolver (push-fold HU exact)
     2. moteur heuristique de scénario (injecté)
     3. moteur d'équité (énumération exacte ou Monte-Carlo)
   Chaque valeur transportée porte SA PROVENANCE (§8) et n'est jamais
   « aplatie » : l'UI comme le backend peuvent distinguer un calcul d'une
   estimation.

   Le niveau de confiance global (§19) découle des provenances réunies :
     NIVEAU 1 lookup exact · NIVEAU 2 solve · NIVEAU 3 équité+heuristiques
     NIVEAU 4 aucune référence → analyse pédagogique uniquement.

   Module PUR (aucune dépendance React/DOM) → testable en Node.
═══════════════════════════════════════════════════════════════ */
import { analyzeDecision, analyzeHand } from "./decisionAnalysis.js";
import { computeEquity } from "../solver/api.js";
import { buildSolverFreqs } from "../solver/preflopRanges.js";
import { rangeComboList, EQ_RANKVAL, EQ_SUITIDX } from "../solver/core/combos.js";

const rb = v => Math.round(v * 100) / 100;

/* Version du package solveur — entre dans la clé de cache (§20/§26). */
export const SOLVER_PACKAGE_VERSION = "solver-pkg-1.0.0";

/* ── Vocabulaire de provenance exposé à l'UI et au backend (§8) ── */
export const PROV = {
  SOLVER: "SOLVER",
  LOOKUP_DB: "LOOKUP_DB",
  EQUITY_EXACT: "EQUITY_EXACT",
  EQUITY_MONTE_CARLO: "EQUITY_MONTE_CARLO",
  ICM: "ICM",
  CHIPEV: "CHIPEV",
  HEURISTIC: "HEURISTIC",
  AI_INTERPRETATION: "AI_INTERPRETATION",
  UNAVAILABLE: "UNAVAILABLE",
};

/* Métadonnées d'affichage des badges (§16) — couleurs DISTINCTES entre une
   donnée calculée (froides/vertes) et une interprétation IA (grise/violette). */
export const PROV_META = {
  SOLVER:             { label: "SOLVER",    color: "#34D8FF", computed: true,  desc: "Stratégie résolue par SharkSolver." },
  LOOKUP_DB:          { label: "LOOKUP",    color: "#9B5CFF", computed: true,  desc: "Solution pré-solvée chargée depuis la bibliothèque." },
  EQUITY_EXACT:       { label: "EQUITY",    color: "#10D87A", computed: true,  desc: "Équité par énumération exhaustive." },
  EQUITY_MONTE_CARLO: { label: "EQUITY~",   color: "#FFB020", computed: true,  desc: "Équité estimée par Monte-Carlo (marge d'erreur)." },
  ICM:                { label: "ICM",       color: "#C77DFF", computed: true,  desc: "Équité ICM (Malmuth-Harville)." },
  CHIPEV:             { label: "CHIPEV",    color: "#3ED598", computed: true,  desc: "EV en jetons." },
  HEURISTIC:          { label: "HEURISTIQUE", color: "#FF5D6C", computed: false, desc: "Estimation heuristique — pas une solution GTO." },
  AI_INTERPRETATION:  { label: "IA",        color: "#8AA0C0", computed: false, desc: "Interprétation PokerForge AI — n'invente aucun chiffre." },
  UNAVAILABLE:        { label: "INDISPO",   color: "#6A7690", computed: false, desc: "Aucune donnée disponible pour ce spot." },
};

/* Niveaux de fallback (§19). */
export const CONF_LEVEL = {
  1: { key: "LOOKUP_EXACT", label: "Lookup exact", badge: "SOLVER" },
  2: { key: "SOLVER_LIVE", label: "SharkSolver", badge: "SOLVER" },
  3: { key: "EQUITY_HEURISTIC", label: "Équité + heuristiques PokerForge", badge: "HEURISTIQUE" },
  4: { key: "AI_ONLY", label: "Analyse pédagogique uniquement", badge: "IA" },
};

/* Valeur tracée : { value, source, engine, confidence } (§8). */
export function traced(value, source, engine = "PokerForge", confidence = "medium") {
  return { value, source, engine, confidence };
}

/* "Ah" → entier 0..51 (rang*4 + couleur), conforme au Card Engine du solveur. */
export function cardToInt(str) {
  const s = String(str || "");
  const r = EQ_RANKVAL.indexOf(s[0] === "1" ? "T" : s[0].toUpperCase());
  const su = EQ_SUITIDX[s[s.length - 1]];
  if (r < 0 || su == null) return null;
  return r * 4 + su;
}

/**
 * Équité Hero sur la street courante face à la range estimée du vilain.
 * Retourne null si les cartes Hero sont inconnues (aucune invention §9).
 */
export function heroEquity(handState, opts = {}) {
  const cards = handState?.hero?.cards || [];
  if (cards.length !== 2) return null;
  const hi = cards.map(cardToInt);
  if (hi.some(c => c == null)) return null;
  const board = [...(handState.board?.flop || []), handState.board?.turn, handState.board?.river]
    .filter(Boolean).map(cardToInt).filter(c => c != null);
  if (board.length && board.length < 3) return null;

  const heroList = [{ cards: hi, w: 1 }];
  // Range du vilain : range d'ouverture estimée à sa position (provenance HEURISTIC
  // pour la RANGE — l'équité, elle, est bien calculée sur cette range).
  const vilPos = (handState.players || []).find(p => !p.isHero)?.position || "BB";
  const heroPos = handState.hero.position || "BTN";
  const eff = Math.round(handState.hero.stackBB || 100);
  let villList = [];
  try {
    villList = rangeComboList(buildSolverFreqs(vilPos, "rfi", eff, heroPos) || {});
  } catch { villList = []; }
  if (!villList.length) return null;

  try {
    const r = computeEquity(heroList, villList, board, { iters: opts.iters || 3000 });
    return {
      value: rb(r.equity),
      source: r.exact ? PROV.EQUITY_EXACT : PROV.EQUITY_MONTE_CARLO,
      engine: "SharkSolver/Equity",
      confidence: r.exact ? "high" : "medium",
      rangeSource: PROV.HEURISTIC,
      rangeNote: `Équité de ${cards.join("")} face à la range estimée de ${vilPos} (range heuristique, calcul d'équité réel).`,
      samples: r.samples ?? null,
      board: board.length,
    };
  } catch { return null; }
}

/* decisionAnalysis.source ("solver"|"heuristic"|"none") → provenance §8. */
function provFromDecision(d) {
  if (!d) return PROV.UNAVAILABLE;
  if (d.source === "solver") return d.provenance === "solver-library" ? PROV.LOOKUP_DB : PROV.SOLVER;
  if (d.source === "heuristic") return PROV.HEURISTIC;
  return PROV.UNAVAILABLE;
}

/* Décision → bloc `strategy` normalisé { fold, call, raise… } en fractions 0..1. */
function strategyOf(d) {
  if (!d || !d.alternatives?.length) return null;
  const out = {};
  for (const a of d.alternatives) {
    if (a.freq == null) continue;
    const k = String(a.action || "").toLowerCase();
    out[k] = rb((a.freq || 0) / 100);
  }
  return Object.keys(out).length ? out : null;
}
function evOf(d) {
  if (!d || !d.alternatives?.length) return null;
  const out = {};
  for (const a of d.alternatives) {
    if (typeof a.evBb !== "number") continue;
    out[String(a.action || "").toLowerCase()] = rb(a.evBb);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Bloc « décision ciblée » (mode "decision") pour l'étape `step`.
 * Isolé du package complet pour que le curseur du Replayer puisse bouger sans
 * relancer l'analyse de toute la main ni le calcul d'équité.
 * @returns null si l'étape n'est pas une décision Hero.
 */
export function buildTarget(hand, snaps, ctx = {}, step = null) {
  if (step == null || !snaps?.[step]) return null;
  let d = null;
  try { d = analyzeDecision(hand, step, snaps[step], ctx); } catch { d = null; }
  if (!d) return null;
  return {
    step: d.step,
    street: d.street,
    played: d.played,
    playedLabel: d.playedLabel,
    recommended: d.recommended?.action || d.bestAction || null,
    recommendedLabel: d.recommended?.label || null,
    strategy: strategyOf(d),
    ev: evOf(d),
    evLossBB: d.evLoss,
    grade: d.grade,
    verdict: d.verdict,
    classification: d.cls,
    source: provFromDecision(d),
    note: d.note || null,
    comments: (d.alternatives || []).map(a => a.comment).filter(Boolean).slice(0, 4),
    coach: d.coach?.explanation || null,
  };
}

/**
 * Package solveur complet d'une main (§7).
 *
 * @param hand  main normalisée hydratée
 * @param snaps snapshots (computeAllSnapshots)
 * @param handState HandState normalisé (buildHandState)
 * @param ctx   { buildScenario, solve } — moteur heuristique injecté
 * @param opts  { step } décision ciblée pour le mode "decision"
 */
export function buildSolverPackage(hand, snaps, handState, ctx = {}, opts = {}) {
  const decisions = [];
  let full = null;
  try { full = analyzeHand(hand, snaps, ctx); } catch { full = null; }
  if (full) {
    for (const d of full.decisions) {
      decisions.push({
        step: d.step,
        street: d.street,
        played: d.played,
        playedLabel: d.playedLabel,
        recommended: d.recommended?.action || d.bestAction || null,
        recommendedLabel: d.recommended?.label || null,
        strategy: strategyOf(d),
        ev: evOf(d),
        evLossBB: d.evLoss,
        grade: d.grade,
        classification: d.cls,
        source: provFromDecision(d),
        note: d.note || null,
        comments: (d.alternatives || []).map(a => a.comment).filter(Boolean).slice(0, 4),
        coach: d.coach?.explanation || null,
      });
    }
  }

  const targetBlock = opts.step != null ? buildTarget(hand, snaps, ctx, opts.step) : null;
  const eq = heroEquity(handState, opts);

  // Niveau de confiance global (§19)
  const sources = new Set(decisions.map(d => d.source));
  if (targetBlock) sources.add(targetBlock.source);
  let level = 4;
  if (sources.has(PROV.LOOKUP_DB)) level = 1;
  else if (sources.has(PROV.SOLVER)) level = 2;
  else if (sources.has(PROV.HEURISTIC) || eq) level = 3;

  const streets = {};
  for (const d of decisions) {
    (streets[d.street] = streets[d.street] || []).push(d);
  }

  return {
    solverVersion: SOLVER_PACKAGE_VERSION,
    status: level <= 2 ? "solved" : level === 3 ? "estimated" : "unavailable",
    level,
    levelLabel: CONF_LEVEL[level].label,
    decisions,
    streets: Object.keys(streets),
    target: targetBlock,
    totalEvLossBB: full ? full.totalEvLoss : null,
    errorCount: full ? full.errors.length : null,
    decisionCount: decisions.length,
    worst: full?.worst
      ? { step: full.worst.step, street: full.worst.street, played: full.worst.playedLabel, evLossBB: full.worst.evLoss }
      : null,
    equity: eq,
    sources: [...sources],
    disclaimer:
      level >= 3
        ? "Résultat solveur exact indisponible sur ce spot : les valeurs affichées sont des estimations PokerForge, pas des fréquences GTO."
        : null,
  };
}
