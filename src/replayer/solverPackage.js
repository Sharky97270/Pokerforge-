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
import { semFr } from "./pokerState.js";
import { computeEquity } from "../solver/api.js";
import { buildSolverFreqs } from "../solver/preflopRanges.js";
import { rangeComboList, EQ_RANKVAL, EQ_SUITIDX } from "../solver/core/combos.js";

const rb = v => Math.round(v * 100) / 100;

/* Version du package solveur — entre dans la clé de cache (§20/§26). */
export const SOLVER_PACKAGE_VERSION = "solver-pkg-1.0.0";

/* ── Vocabulaire de provenance exposé à l'UI et au backend (§8) ── */
export const PROV = {
  SOLVER: "SOLVER",
  SOLVER_CFR: "SOLVER_CFR",
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
  SOLVER:             { label: "SOLVER",    color: "#10D87A", computed: true,  desc: "Stratégie résolue exactement par SharkSolver." },
  /* Le CFR est un vrai calcul, mais ses RANGES D'ENTRÉE restent heuristiques —
     et la composition de range pilote l'essentiel de la stratégie postflop.
     Couleur et libellé distincts du solveur exact : jamais présenté comme un
     solve GTO complet (§8/§16). */
  SOLVER_CFR:         { label: "CFR",       color: "#34D8FF", computed: true,  desc: "Solution CFR postflop — calcul exact sur des ranges heuristiques (expérimental)." },
  LOOKUP_DB:          { label: "LOOKUP",    color: "#9B5CFF", computed: true,  desc: "Solution pré-solvée chargée depuis la bibliothèque." },
  EQUITY_EXACT:       { label: "EQUITY",    color: "#10D87A", computed: true,  desc: "Équité par énumération exhaustive." },
  EQUITY_MONTE_CARLO: { label: "EQUITY~",   color: "#FFB020", computed: true,  desc: "Équité estimée par Monte-Carlo (marge d'erreur)." },
  ICM:                { label: "ICM",       color: "#C77DFF", computed: true,  desc: "Équité ICM (Malmuth-Harville)." },
  CHIPEV:             { label: "CHIPEV",    color: "#3ED598", computed: true,  desc: "EV en jetons." },
  HEURISTIC:          { label: "HEURISTIQUE", color: "#FF5D6C", computed: false, desc: "Estimation heuristique — pas une solution GTO." },
  AI_INTERPRETATION:  { label: "IA",        color: "#8AA0C0", computed: false, desc: "Interprétation PokerForge AI — n'invente aucun chiffre." },
  UNAVAILABLE:        { label: "INDISPO",   color: "#6A7690", computed: false, desc: "Aucune donnée disponible pour ce spot." },
};

/* ── §6 : PROVENANCE explicite, et vocabulaire imposé au coach ──
   Le ton d'une phrase doit dépendre de la solidité de la donnée. Une
   heuristique annoncée comme « la solution calculée » est un mensonge, même si
   le conseil est bon. On transporte donc, avec chaque valeur, la formule que
   le coach a le DROIT d'employer. */
export const ORIGIN = {
  SOLVER_EXACT:         "SOLVER_EXACT",
  SOLVER_LOOKUP:        "SOLVER_LOOKUP",
  SOLVER_APPROXIMATION: "SOLVER_APPROXIMATION",
  POKERFORGE_HEURISTIC: "POKERFORGE_HEURISTIC",
  AI_INTERPRETATION:    "AI_INTERPRETATION",
  UNAVAILABLE:          "UNAVAILABLE",
};
export const ORIGIN_META = {
  SOLVER_EXACT:         { label: "Solveur exact",       phrase: "La solution calculée indique", trust: "high" },
  SOLVER_LOOKUP:        { label: "Bibliothèque solvée", phrase: "La solution pré-calculée indique", trust: "high" },
  SOLVER_APPROXIMATION: { label: "Solveur approché",    phrase: "Le calcul CFR (ranges d'entrée estimées) indique", trust: "medium" },
  POKERFORGE_HEURISTIC: { label: "Estimation PokerForge", phrase: "Selon l'estimation PokerForge disponible pour ce spot", trust: "low" },
  AI_INTERPRETATION:    { label: "Interprétation IA",   phrase: "Interprétation pédagogique", trust: "none" },
  UNAVAILABLE:          { label: "Indisponible",        phrase: "Les données disponibles ne permettent pas d'établir cette conclusion avec suffisamment de fiabilité", trust: "none" },
};

/* Provenance §8 (badge d'affichage) → provenance §6 (vocabulaire du coach). */
export function originOf(prov) {
  switch (prov) {
    case PROV.LOOKUP_DB: return ORIGIN.SOLVER_LOOKUP;
    case PROV.SOLVER: return ORIGIN.SOLVER_EXACT;
    case PROV.SOLVER_CFR: return ORIGIN.SOLVER_APPROXIMATION;
    case PROV.HEURISTIC: return ORIGIN.POKERFORGE_HEURISTIC;
    case PROV.UNAVAILABLE: return ORIGIN.UNAVAILABLE;
    default: return ORIGIN.POKERFORGE_HEURISTIC;
  }
}

/* Niveaux de fallback (§19). */
export const CONF_LEVEL = {
  1: { key: "LOOKUP_EXACT", label: "Lookup exact", badge: "SOLVER" },
  2: { key: "SOLVER_LIVE", label: "SharkSolver (calcul)", badge: "SOLVER" },
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

/* Cartes visibles à une street donnée. Le HandState porte le board COMPLET de
   la main ; une décision préflop, elle, se prend sans board. */
export const STREETS = ["preflop", "flop", "turn", "river"];
export function boardUpTo(handState, street) {
  const b = handState?.board || {};
  const i = STREETS.indexOf(street);
  if (i <= 0) return [];                                    // préflop (ou street inconnue)
  const out = [...(b.flop || [])];
  if (i >= 2 && b.turn) out.push(b.turn);
  if (i >= 3 && b.river) out.push(b.river);
  return out;
}

/**
 * Équité Hero à une STREET donnée, face à la range estimée du vilain.
 * Retourne null si les cartes Hero sont inconnues (aucune invention §9).
 *
 * `opts.street` est déterminant : sans lui, on calculait l'équité sur le board
 * COMPLET de la main et on l'affichait à côté de CHAQUE décision — y compris la
 * décision préflop. Le panneau annonçait alors une équité qui suppose de
 * connaître l'avenir (K8o « à 76 % » en préflop parce que la river donne deux
 * paires). Une équité n'a de sens qu'attachée à un board précis.
 */
export function heroEquity(handState, opts = {}) {
  const cards = handState?.hero?.cards || [];
  if (cards.length !== 2) return null;
  const hi = cards.map(cardToInt);
  if (hi.some(c => c == null)) return null;
  const boardCards = opts.board
    || (opts.street ? boardUpTo(handState, opts.street)
      : [...(handState.board?.flop || []), handState.board?.turn, handState.board?.river].filter(Boolean));
  const board = boardCards.map(cardToInt).filter(c => c != null);
  if (board.length && board.length < 3) return null;

  const heroList = [{ cards: hi, w: 1 }];
  /* Range du vilain : range d'ouverture estimée à SA position (provenance
     HEURISTIC pour la RANGE — l'équité, elle, est bien calculée dessus).

     Le vilain de référence est l'AGRESSEUR, pas le premier siège de la table.
     L'ancienne version prenait `players.find(p => !p.isHero)` : sur une main
     « HJ ouvre, Hero BB », elle opposait donc Hero à la range d'UTG pendant que
     le reste du panneau parlait du hijack. Deux chiffres, deux adversaires, une
     seule main : l'incohérence était garantie. */
  const aggressor = (handState.actions || [])
    .filter(a => !a.isHero && ["bet", "raise", "allin"].includes(a.action))
    .pop();
  const vilPos = opts.villainPosition
    || aggressor?.position
    || (handState.players || []).find(p => !p.isHero)?.position
    || "BB";
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
      villainPosition: vilPos,
      /* La street est transportée AVEC la valeur : l'UI et le prompt doivent
         pouvoir dire de quel board on parle, sinon le chiffre redevient
         ambigu dès qu'il change d'écran. */
      street: opts.street || (board.length === 0 ? "preflop" : board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river"),
      boardCards,
      rangeNote: `Équité de ${cards.join("")} ${board.length ? `sur ${boardCards.join(" ")}` : "préflop"} face à la range estimée de ${vilPos} (range heuristique, calcul d'équité réel).`,
      samples: r.samples ?? null,
      board: board.length,
    };
  } catch { return null; }
}

/* decisionAnalysis.source ("solver"|"heuristic"|"none") → provenance §8. */
function provFromDecision(d) {
  if (!d) return PROV.UNAVAILABLE;
  if (d.source === "solver") {
    if (d.provenance === "solver-library") return PROV.LOOKUP_DB;
    if (d.provenance === "cfr-experimental") return PROV.SOLVER_CFR;
    return PROV.SOLVER;
  }
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
/* Fréquences indexées par ACTION SÉMANTIQUE — c'est cette forme que lit l'UI
   du verdict et le prompt : « THREE_BET 62 % », jamais « raise 62 % ». */
function strategyBySemantic(d) {
  if (!d || !d.alternatives?.length) return null;
  const out = {};
  for (const a of d.alternatives) {
    if (a.freq == null || !a.sem) continue;
    out[a.sem] = rb(a.freq);
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
  /* `snaps` alimente la reconstruction du contexte de mise : sans lui,
     l'action sémantique retomberait à null et le coach reparlerait en
     « raise / call » génériques. */
  try { d = analyzeDecision(hand, step, snaps[step], { ...ctx, snaps: ctx.snaps || snaps }); } catch { d = null; }
  if (!d) return null;
  const prov = provFromDecision(d);
  const origin = originOf(prov);
  return {
    step: d.step,
    street: d.street,
    played: d.played,
    playedLabel: d.playedLabel,
    recommended: d.recommended?.action || d.bestAction || null,
    recommendedLabel: d.recommended?.label || null,
    /* ── §3 : les DEUX actions, nommées en vocabulaire poker exact ── */
    heroSemantic: d.heroSemantic || null,
    heroSemanticFr: d.heroSemantic ? semFr(d.heroSemantic) : null,
    recommendedSemantic: d.recommendedSemantic || null,
    recommendedSemanticFr: d.recommendedSemantic ? semFr(d.recommendedSemantic) : null,
    /* ── §5 : sizing UNIQUEMENT s'il existe réellement ──
       Absent = absent : le coach doit dire qu'il n'est pas disponible, jamais
       en proposer un. Présent, il porte SA provenance : un sizing conventionnel
       calculé depuis la mise réelle de l'adversaire n'est pas une lecture de
       solveur, et le coach ne doit pas le présenter comme telle. */
    recommendedSizingBb: typeof d.recommended?.sizingBb === "number" ? d.recommended.sizingBb : null,
    recommendedSizingOrigin: typeof d.recommended?.sizingBb === "number" ? origin : null,
    /* ── §6 : provenance et formule autorisée ── */
    origin,
    originLabel: ORIGIN_META[origin].label,
    originPhrase: ORIGIN_META[origin].phrase,
    strategy: strategyOf(d),
    strategyBySemantic: strategyBySemantic(d),
    /* Portée des fréquences : "hand" = elles valent pour la main de Hero ;
       "range" = c'est le mix de la range entière à ce nœud. Le coach n'a pas
       le droit de confondre les deux. */
    strategyScope: d.strategyScope || null,
    ev: evOf(d),
    evLossBB: d.evLoss,
    /* Deux mesures coexistent et ne doivent JAMAIS être confondues :
       "ev" = perte d'EV en bb ; "frequency" = écart à la fréquence d'équilibre
       en points de %. Le CFR ne produit que la seconde. */
    metric: d.metric || "ev",
    freqGapPts: d.freqGap ?? null,
    playedFreq: d.playedFreq ?? null,
    grade: d.grade,
    verdict: d.verdict,
    classification: d.cls,
    source: prov,
    note: d.note || null,
    comments: (d.alternatives || []).map(a => a.comment).filter(Boolean).slice(0, 4),
    coach: d.coach?.explanation || null,
    /* Le PokerState complet accompagne la cible : c'est LUI que le backend
       transmet au modèle, pas une reconstruction textuelle du coup. */
    pokerState: d.pokerState || null,
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
  try { full = analyzeHand(hand, snaps, { ...ctx, snaps: ctx.snaps || snaps }); } catch { full = null; }
  if (full) {
    for (const d of full.decisions) {
      decisions.push({
        step: d.step,
        street: d.street,
        played: d.played,
        playedLabel: d.playedLabel,
        heroSemantic: d.heroSemantic || null,
        heroSemanticFr: d.heroSemantic ? semFr(d.heroSemantic) : null,
        recommendedSemantic: d.recommendedSemantic || null,
        recommendedSemanticFr: d.recommendedSemantic ? semFr(d.recommendedSemantic) : null,
        recommendedSizingBb: typeof d.recommended?.sizingBb === "number" ? d.recommended.sizingBb : null,
        facingAction: d.pokerState?.facingAction || null,
        facingActionFr: d.pokerState?.facingAction ? semFr(d.pokerState.facingAction) : null,
        aggressorPosition: d.pokerState?.lastAggressor?.position || null,
        aggressorToBb: d.pokerState?.lastAggressor?.toAmountBB ?? null,
        heroPosition: d.pokerState?.hero?.position || null,
        legalActions: d.pokerState?.legalActions || null,
        strategyScope: d.strategyScope || null,
        recommended: d.recommended?.action || d.bestAction || null,
        recommendedLabel: d.recommended?.label || null,
        strategy: strategyOf(d),
        ev: evOf(d),
        evLossBB: d.evLoss,
        metric: d.metric || "ev",
        freqGapPts: d.freqGap ?? null,
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
  /* L'équité est un Monte-Carlo : l'appelant peut la calculer et l'injecter
     pour que l'arrivée d'une solution CFR ne la relance pas. Elle doit
     correspondre à la STREET DE LA DÉCISION analysée — pas au board final de
     la main. Le vilain de référence est l'agresseur du spot. */
  const eqStreet = targetBlock?.street || null;
  const eq = opts.equity !== undefined
    ? opts.equity
    : heroEquity(handState, {
        ...opts,
        street: eqStreet,
        villainPosition: opts.villainPosition
          || targetBlock?.pokerState?.lastAggressor?.position || undefined,
      });

  // Niveau de confiance global (§19)
  const sources = new Set(decisions.map(d => d.source));
  if (targetBlock) sources.add(targetBlock.source);
  let level = 4;
  if (sources.has(PROV.LOOKUP_DB)) level = 1;
  else if (sources.has(PROV.SOLVER) || sources.has(PROV.SOLVER_CFR)) level = 2;
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
        : sources.has(PROV.SOLVER_CFR)
          ? "Fréquences réellement calculées par CFR, mais sur des ranges d'entrée heuristiques : c'est un calcul, pas un solve GTO complet."
          : null,
  };
}
