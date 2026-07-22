/* ══════════════════════════════════════════════════════════════════════════
   constraintEngine.js — CONSTRAINT ENGINE (Mission Master §25, Phase 3)

   Entrée  : TrainingConfig (source unique — cf. trainingConfig.js §3)
   Sortie  : ResolvedTrainingConstraints

   Rôle (§25) : détecter les incompatibilités de configuration —
     · positions impossibles (§20)
     · format incompatible (§16)
     · structure incompatible (§10)
     · street incompatible (§8)
     · phase incompatible (§14)
     · type de spot incompatible (§13)
     · stack impossible (§12)

   PHILOSOPHIE (§72) : ne JAMAIS bloquer. Toute incompatibilité « dure » est
   AUTO-RÉSOLUE (le config est corrigé vers une valeur jouable) et consignée
   dans `conflicts`. Les incompatibilités « douces » (préférences non idéales)
   sont signalées en `warning` sans modifier le config. Le SpotGenerator (§26)
   consomme `resolved` + `meta` en toute sécurité.

   Module PUR (aucune dépendance React/DOM). Seule dépendance : la table
   POSITIONS_BY_SIZE (données statiques).
   ══════════════════════════════════════════════════════════════════════════ */

import { POSITIONS_BY_SIZE } from "./data/content.js";
import { normalizeTrainingConfig } from "./trainingConfig.js";

/* Positions "blindes" (utile pour Blind vs Blind §13). */
const BLIND_POSITIONS = ["SB", "BB"];

/* Métadonnées par type de spot (§13) — miroir de SPOT_TYPES (TrainerTab).
   street   : street à laquelle le spot se décide
   minSeats : nombre minimal de joueurs pour que la situation existe
   flags    : contraintes spécifiques (blindsOnly, shortStack, multiway) */
export const SPOT_TYPE_META = {
  "Open Raise":       { street: "preflop", minSeats: 2 },
  "Défense BB":       { street: "preflop", minSeats: 2 },
  "3bet":             { street: "preflop", minSeats: 2 },
  "Défense vs 3bet":  { street: "preflop", minSeats: 2 },
  "4bet":             { street: "preflop", minSeats: 2 },
  "Push/Fold":        { street: "preflop", minSeats: 2, shortStack: true },
  "Squeeze":          { street: "preflop", minSeats: 4, multiway: true },
  "Blind vs Blind":   { street: "preflop", minSeats: 2, blindsOnly: true },
  "C-bet Flop":       { street: "flop",    minSeats: 2 },
  "Check/Raise":      { street: "flop",    minSeats: 2 },
  "Probe Bet":        { street: "turn",    minSeats: 2 },
  "Donk Bet":         { street: "flop",    minSeats: 2 },
  "Turn Barrel":      { street: "turn",    minSeats: 2 },
  "River Decision":   { street: "river",   minSeats: 2 },
  "Call Down":        { street: "river",   minSeats: 2 },
  "Bluff Catch":      { street: "river",   minSeats: 2 },
  "Value Bet":        { street: "river",   minSeats: 2 },
  "Overbet":          { street: "turn",    minSeats: 2 },
};

/* Nombre de joueurs actifs maximal imposé par certaines phases (§14). */
const PHASE_ACTIVE_CAP = { "Heads-Up": 2, "Top 3": 3 };
/* Phase Heads-Up force EXACTEMENT 2 joueurs. */
const PHASE_EXACT = { "Heads-Up": 2 };

function positionsFor(n) {
  return POSITIONS_BY_SIZE[n] || POSITIONS_BY_SIZE[6];
}
function normStreet(s) {
  return String(s || "").toLowerCase();
}
function isRealPosition(p) {
  return p && p !== "Tous" && p !== "?";
}

/* ──────────────────────────────────────────────────────────────────────────
   resolveTrainingConstraints — cœur du moteur.
   ────────────────────────────────────────────────────────────────────────── */
export function resolveTrainingConstraints(config = {}) {
  const resolved = normalizeTrainingConfig(config);
  const conflicts = [];
  const add = (code, severity, field, message, extra = {}) =>
    conflicts.push({ code, severity, field, message, ...extra });

  /* ── Drapeaux format (§16) ──────────────────────────────────────────── */
  const fmtDetail = resolved.formatDetail || "Tous";
  const fmtFamily = resolved.format || "Tous";
  const isCash = fmtDetail === "Cash Game" || /^cash/i.test(fmtFamily);
  const isTournament = !isCash && (fmtDetail !== "Tous" || fmtFamily !== "Tous");
  // ICM applicable uniquement en tournoi (jamais en cash §16).
  const icmFamily = /icm|bounty|pko|spin/i.test(fmtFamily) || isTournament;

  /* ── 1. Cash Game × phase de tournoi (§16 : « pas de phase tournoi ») ── */
  if (isCash && resolved.tournamentPhase && resolved.tournamentPhase !== "Toutes") {
    add("PHASE_IN_CASH", "error", "tournamentPhase",
      `Phase « ${resolved.tournamentPhase} » incompatible avec le Cash Game — phase remise à « Toutes ».`,
      { from: resolved.tournamentPhase, to: "Toutes", resolved: true });
    resolved.tournamentPhase = "Toutes";
  }

  /* ── 2. Cash Game × pression ICM (§15/§16 : pas d'ICM en cash) ──────── */
  if (isCash && resolved.icmPressure && resolved.icmPressure !== "Désactivée") {
    add("ICM_IN_CASH", "error", "icmPressure",
      `Pression ICM « ${resolved.icmPressure} » impossible en Cash Game — désactivée.`,
      { from: resolved.icmPressure, to: "Désactivée", resolved: true });
    resolved.icmPressure = "Désactivée";
  }

  /* ── 3. Phase × structure de table (§14) ─────────────────────────────
     Heads-Up → exactement 2 joueurs. Top 3 → au plus 3 joueurs. */
  const exact = PHASE_EXACT[resolved.tournamentPhase];
  const cap = PHASE_ACTIVE_CAP[resolved.tournamentPhase] || null;
  if (exact && resolved.tableStructure !== exact) {
    add("PHASE_HEADSUP_STRUCTURE", "error", "tableStructure",
      `Phase « Heads-Up » impose 2 joueurs — structure ${resolved.tableStructure}J ramenée à 2J.`,
      { from: resolved.tableStructure, to: exact, resolved: true });
    resolved.tableStructure = exact;
  } else if (cap && resolved.tableStructure > cap) {
    add("PHASE_TOP3_STRUCTURE", "error", "tableStructure",
      `Phase « ${resolved.tournamentPhase} » limite à ${cap} joueurs actifs — structure ramenée à ${cap}J.`,
      { from: resolved.tableStructure, to: cap, resolved: true });
    resolved.tableStructure = cap;
  }

  /* ── 4. Positions (§20) — après stabilisation de la structure ────────── */
  const available = positionsFor(resolved.tableStructure);
  if (isRealPosition(resolved.heroPosition) && !available.includes(resolved.heroPosition)) {
    add("POSITION_HERO_INVALID", "error", "heroPosition",
      `Position Héro « ${resolved.heroPosition} » inexistante en ${resolved.tableStructure}J — libérée (Tous).`,
      { from: resolved.heroPosition, to: "Tous", resolved: true });
    resolved.heroPosition = "Tous";
  }
  if (isRealPosition(resolved.villainPosition) && !available.includes(resolved.villainPosition)) {
    add("POSITION_VILLAIN_INVALID", "error", "villainPosition",
      `Position Villain « ${resolved.villainPosition} » inexistante en ${resolved.tableStructure}J — libérée (Tous).`,
      { from: resolved.villainPosition, to: "Tous", resolved: true });
    resolved.villainPosition = "Tous";
  }
  if (isRealPosition(resolved.heroPosition) && resolved.heroPosition === resolved.villainPosition) {
    add("POSITION_HERO_VILLAIN_SAME", "error", "villainPosition",
      `Héro et Villain ne peuvent occuper la même position (${resolved.heroPosition}) — Villain libéré.`,
      { from: resolved.villainPosition, to: "Tous", resolved: true });
    resolved.villainPosition = "Tous";
  }

  /* ── 5. Types de spot (§13) ──────────────────────────────────────────
     minSeats, blindsOnly, et cohérence street. */
  const spotTypes = Array.isArray(resolved.spotTypes) ? resolved.spotTypes : [];
  const validSpotTypes = [];
  const spotTypeStreets = {};
  for (const st of spotTypes) {
    const meta = SPOT_TYPE_META[st];
    if (!meta) { validSpotTypes.push(st); continue; } // type inconnu : on laisse passer
    spotTypeStreets[st] = meta.street;
    // 5a. minSeats
    if (meta.minSeats > resolved.tableStructure) {
      add("SPOTTYPE_MIN_SEATS", "error", "spotTypes",
        `« ${st} » nécessite ≥ ${meta.minSeats} joueurs — retiré (structure ${resolved.tableStructure}J).`,
        { spotType: st, minSeats: meta.minSeats, resolved: true });
      continue;
    }
    // 5b. blindsOnly × position Héro fixée hors blindes (soft)
    if (meta.blindsOnly && isRealPosition(resolved.heroPosition) && !BLIND_POSITIONS.includes(resolved.heroPosition)) {
      add("SPOTTYPE_BLINDS_ONLY_POSITION", "warning", "spotTypes",
        `« ${st} » se joue depuis les blindes ; la position Héro fixée (${resolved.heroPosition}) sera ignorée pour ce type.`,
        { spotType: st });
    }
    // 5c. Push/Fold en stack profond (soft)
    if (meta.shortStack) {
      const depth = Number(resolved.customStack || resolved.stackDepth);
      if (Number.isFinite(depth) && depth >= 40) {
        add("SPOTTYPE_PUSHFOLD_DEEP", "warning", "stackDepth",
          `« ${st} » est un spot de tapis court ; un stack de ${depth}bb produira peu de situations pertinentes.`,
          { spotType: st, stack: depth });
      }
    }
    validSpotTypes.push(st);
  }
  if (validSpotTypes.length !== spotTypes.length) resolved.spotTypes = validSpotTypes;

  /* ── 6. Street de session × types de spot (§8) ───────────────────────
     En mode « street », les types postflop sélectionnés doivent correspondre
     à la street de départ ; sinon le générateur devra les ignorer. */
  const preflopOnly = resolved.sessionType === "full" || resolved.sessionType === "session";
  let allowedStreets;
  if (resolved.sessionType === "street") {
    allowedStreets = [normStreet(resolved.streetStart)];
    const chosenStreet = normStreet(resolved.streetStart);
    const typed = validSpotTypes.filter((st) => SPOT_TYPE_META[st]);
    if (typed.length) {
      const anyMatch = typed.some((st) => SPOT_TYPE_META[st].street === chosenStreet);
      if (!anyMatch) {
        add("SPOTTYPE_STREET_MISMATCH", "warning", "spotTypes",
          `Aucun type de spot sélectionné ne se joue en ${resolved.streetStart} ; le générateur relâchera la contrainte de type.`,
          { streetStart: resolved.streetStart });
      }
    }
  } else if (preflopOnly) {
    allowedStreets = ["preflop"];
  } else {
    allowedStreets = ["preflop", "flop", "turn", "river"];
  }

  /* ── 7. Stack (§12) ──────────────────────────────────────────────────
     customStack déjà borné (>0 ou null) par normalizeTrainingConfig. On
     signale seulement un stack personnalisé aberrant côté entrée. */
  if (config && config.customStack != null && resolved.customStack == null) {
    add("STACK_CUSTOM_INVALID", "warning", "customStack",
      `Stack personnalisé « ${config.customStack} » invalide — ignoré (preset utilisé).`,
      { from: config.customStack, to: null });
  }

  /* ── Synthèse ────────────────────────────────────────────────────────── */
  const blocking = conflicts.filter((c) => c.severity === "error" && !c.resolved);
  return {
    ok: blocking.length === 0,           // true : config jouable (les erreurs sont auto-résolues)
    hadConflicts: conflicts.length > 0,
    conflicts,
    resolved,                            // TrainingConfig corrigé, prêt pour le SpotGenerator
    meta: {
      availablePositions: available,
      activePlayerCap: exact || cap || null,
      isCash,
      isTournament,
      icmApplicable: icmFamily && !isCash,
      allowedStreets,
      preflopOnly,
      spotTypeStreets,
    },
  };
}
