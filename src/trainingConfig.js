/* ══════════════════════════════════════════════════════════════════════════
   trainingConfig.js — SOURCE UNIQUE DE VÉRITÉ (Mission Master §3, Phase 2)

   Objectif : centraliser TOUTE la configuration d'entraînement dans un objet
   canonique unique (`TrainingConfig`). Avant cette couche, la vérité était
   éclatée entre l'objet `f` (filtres, localStorage `pf_trainer_cfg`) et six
   states React frères : smode, ntables, trainerMode, platform, trainMode,
   streetStart. Aucun consommateur du pipeline (génération, contraintes,
   moteur) ne doit plus lire ces sources séparément — tout passe par ici.

   PRINCIPE (§3) :
   - AUCUNE option existante n'est supprimée : les champs legacy `f` sont tous
     projetés dans le config canonique, et re-projetés en retour (round-trip).
   - Une option UI ne lance jamais un générateur indépendant : elle édite un
     morceau du config, et le générateur consomme le config complet.

   Ce module est volontairement pur (aucune dépendance React / DOM) pour être
   testable et réutilisable par le ConstraintEngine (§25) et le SpotGenerator
   (§26) des phases suivantes.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Valeurs par défaut alignées sur TRAINER_CFG_DEFAULT + states frères ── */
export const DEFAULT_TRAINING_CONFIG = Object.freeze({
  // §4 Session
  sessionLength: 20,          // ← smode (20 Sprint · 50 Standard · 100 Marathon · 999 Illimité)
  // §5 Multitabling
  tableCount: 1,              // ← ntables (1..4)
  // §6 Mode d'entraînement
  trainingMode: "gto",        // ← trainerMode ("gto" | "exploit")
  // §7 Plateforme
  platform: "pokerstars",     // ← platform
  // §8 Type de session
  sessionType: "spot",        // ← trainMode ("spot" | "street" | "full" | "session" | "mix")
  streetStart: "Flop",        // ← streetStart (street de départ du mode "street")
  // §9 Mode adaptatif
  adaptiveMode: "balanced",   // ← f.adaptiveMode
  // §10 Structure de table
  tableStructure: 6,          // ← f.nplayers (2..9)
  // §11 Placement Hero
  heroDisplayMode: "hero",    // ← f.heroLayout ("hero" | "table")
  // §12 Stack effectif
  stackDepth: "",             // ← f.stackEff ("" = Tous, sinon preset bb)
  customStack: null,          // ← f.customStack (bb personnalisé, null si preset)
  // §13 Types de spots
  spotTypes: [],              // ← f.spotTypes
  // §14 Phase tournoi
  tournamentPhase: "Toutes",  // ← f.phase
  // §15 Pression ICM
  icmPressure: "Désactivée",  // ← f.icm
  // §16 Format
  format: "Tous",             // ← f.fmt
  formatDetail: "Tous",       // ← f.fmtDetail
  // §17 Niveau du field
  fieldLevel: "Standard",     // ← f.field
  // §18 Style Hero
  heroStyle: "GTO",           // ← f.heroStyle
  // §19 Profil Villain
  villainProfile: "Tous",     // ← f.vt
  villainAdvanced: "Tous",    // ← f.vilainAdv
  // §20 Positions
  heroPosition: "Tous",       // ← f.hp
  villainPosition: "Tous",    // ← f.vp
  // §21 Je veux travailler
  workOn: [],                 // ← f.objectives
  workOnPrimary: null,        // ← f.objective
  // §22 Difficulté
  difficulty: "Tous",         // ← f.diff
  difficultyLevel: 0,         // ← f.diffLvl
  // Catégorie de filtre (RFI / Vs Open / Flop…) — conservée (option existante)
  category: "Tous",           // ← f.cat
  // §23 Timer
  timer: 0,                   // ← f.timer (0 = aucun, sinon secondes)
  // §24 Niveau Coach AI
  coachLevel: "Intermédiaire",// ← f.coachLevel
});

/* Longueurs de session valides (§4). */
export const SESSION_LENGTHS = [20, 50, 100, 999];
/* Nombre de tables valide (§5). */
export const TABLE_COUNTS = [1, 2, 3, 4];
/* Types de session (§8). */
export const SESSION_TYPES = ["spot", "street", "full", "session", "mix"];
/* Modes d'entraînement (§6). */
export const TRAINING_MODES = ["gto", "exploit"];
/* Streets de départ possibles pour le type "street" (§8). */
export const START_STREETS = ["Flop", "Turn", "River"];

/* ──────────────────────────────────────────────────────────────────────────
   MAPPING LEGACY `f`  →  champs canoniques.
   Décrit, pour chaque champ canonique, la clé `f` d'origine. Sert au round-trip
   (buildTrainingConfig ↔ trainingConfigToFilters) et garantit qu'aucune option
   n'est perdue.
   ────────────────────────────────────────────────────────────────────────── */
const F_TO_CONFIG = {
  adaptiveMode: "adaptiveMode",
  tableStructure: "nplayers",
  heroDisplayMode: "heroLayout",
  stackDepth: "stackEff",
  customStack: "customStack",
  spotTypes: "spotTypes",
  tournamentPhase: "phase",
  icmPressure: "icm",
  format: "fmt",
  formatDetail: "fmtDetail",
  fieldLevel: "field",
  heroStyle: "heroStyle",
  villainProfile: "vt",
  villainAdvanced: "vilainAdv",
  heroPosition: "hp",
  villainPosition: "vp",
  workOn: "objectives",
  workOnPrimary: "objective",
  difficulty: "diff",
  difficultyLevel: "diffLvl",
  category: "cat",
  timer: "timer",
  coachLevel: "coachLevel",
};

function coerceNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ──────────────────────────────────────────────────────────────────────────
   buildTrainingConfig — assemble le config canonique à partir des sources
   éparses actuelles. C'est le point d'entrée que TrainerTab utilise pour
   produire la SOURCE UNIQUE consommée par le pipeline.

   parts = {
     f,                     // objet filtres legacy (TRAINER_CFG_DEFAULT + overrides)
     sessionLength|smode,   // longueur de session
     tableCount|ntables,    // nombre de tables
     trainingMode|trainerMode,
     platform,
     sessionType|trainMode,
     streetStart,
   }
   ────────────────────────────────────────────────────────────────────────── */
export function buildTrainingConfig(parts = {}) {
  const f = parts.f || {};
  const cfg = { ...DEFAULT_TRAINING_CONFIG };

  // Champs issus de `f`
  for (const [ck, fk] of Object.entries(F_TO_CONFIG)) {
    if (f[fk] !== undefined) cfg[ck] = f[fk];
  }
  // Tableaux : cloner pour éviter tout partage de référence avec `f`
  cfg.spotTypes = Array.isArray(cfg.spotTypes) ? [...cfg.spotTypes] : [];
  cfg.workOn = Array.isArray(cfg.workOn) ? [...cfg.workOn] : [];

  // States frères (priorité aux valeurs explicites, alias legacy acceptés)
  const pick = (canon, alias, fallback) =>
    parts[canon] !== undefined ? parts[canon]
    : parts[alias] !== undefined ? parts[alias]
    : fallback;

  cfg.sessionLength = coerceNumber(pick("sessionLength", "smode", cfg.sessionLength), cfg.sessionLength);
  cfg.tableCount    = coerceNumber(pick("tableCount", "ntables", cfg.tableCount), cfg.tableCount);
  cfg.trainingMode  = pick("trainingMode", "trainerMode", cfg.trainingMode);
  cfg.platform      = parts.platform !== undefined ? parts.platform : cfg.platform;
  cfg.sessionType   = pick("sessionType", "trainMode", cfg.sessionType);
  cfg.streetStart   = parts.streetStart !== undefined ? parts.streetStart : cfg.streetStart;

  return normalizeTrainingConfig(cfg);
}

/* ──────────────────────────────────────────────────────────────────────────
   normalizeTrainingConfig — coercition de types + garde-fous LÉGERS (borne les
   valeurs invalides sans supprimer d'option). Ce n'est PAS encore le
   ConstraintEngine (§25, phase suivante) qui gérera les incompatibilités
   croisées (position × structure, phase × format…) : ici on garantit seulement
   qu'aucun champ n'a un type aberrant.
   ────────────────────────────────────────────────────────────────────────── */
export function normalizeTrainingConfig(cfg = {}) {
  const out = { ...DEFAULT_TRAINING_CONFIG, ...cfg };

  out.sessionLength = SESSION_LENGTHS.includes(coerceNumber(out.sessionLength))
    ? coerceNumber(out.sessionLength) : DEFAULT_TRAINING_CONFIG.sessionLength;

  out.tableCount = Math.max(1, Math.min(4, coerceNumber(out.tableCount, 1)));

  out.trainingMode = TRAINING_MODES.includes(out.trainingMode)
    ? out.trainingMode : DEFAULT_TRAINING_CONFIG.trainingMode;

  out.sessionType = SESSION_TYPES.includes(out.sessionType)
    ? out.sessionType : DEFAULT_TRAINING_CONFIG.sessionType;

  out.streetStart = START_STREETS.includes(out.streetStart)
    ? out.streetStart : DEFAULT_TRAINING_CONFIG.streetStart;

  out.tableStructure = Math.max(2, Math.min(9, coerceNumber(out.tableStructure, 6)));

  out.heroDisplayMode = out.heroDisplayMode === "table" ? "table" : "hero";

  out.timer = Math.max(0, coerceNumber(out.timer, 0));
  out.difficultyLevel = Math.max(0, coerceNumber(out.difficultyLevel, 0));

  out.spotTypes = Array.isArray(out.spotTypes) ? out.spotTypes : [];
  out.workOn = Array.isArray(out.workOn) ? out.workOn : [];

  // customStack : null si non défini/invalide, sinon nombre positif
  const cs = coerceNumber(out.customStack);
  out.customStack = Number.isFinite(cs) && cs > 0 ? cs : null;

  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   trainingConfigToFilters — projette le config canonique vers l'objet `f`
   attendu par le code existant (spotMatchFilter, generateDynamicSpots, buildQ,
   RangeGrid…). Round-trip garanti : buildTrainingConfig(f) → toFilters ≈ f.
   ────────────────────────────────────────────────────────────────────────── */
export function trainingConfigToFilters(cfg = {}) {
  const c = normalizeTrainingConfig(cfg);
  const f = {};
  for (const [ck, fk] of Object.entries(F_TO_CONFIG)) {
    f[fk] = c[ck];
  }
  // Clonage défensif des tableaux
  f.spotTypes = Array.isArray(f.spotTypes) ? [...f.spotTypes] : [];
  f.objectives = Array.isArray(f.objectives) ? [...f.objectives] : [];
  return f;
}

/* ──────────────────────────────────────────────────────────────────────────
   trainingConfigToEngineOpts — dérive les options de génération (buildQ) à
   partir du seul config canonique. Remplace l'assemblage ad-hoc dispersé dans
   start() / launchDrill(). Reproduit exactement la logique existante :
   - full/session  → { onlyPreflop:true, preferFlop:true }
   - street        → { onlyStreet:<streetStart> }
   - spot/mix      → {}
   plus le contexte moteur (trainerMode, trainMode, platform, adaptiveMode).
   ────────────────────────────────────────────────────────────────────────── */
export function trainingConfigToEngineOpts(cfg = {}) {
  const c = normalizeTrainingConfig(cfg);
  const opts = {
    trainerMode: c.trainingMode,
    trainMode: c.sessionType,
    platform: c.platform,
    adaptiveMode: c.adaptiveMode,
  };
  if (c.sessionType === "full" || c.sessionType === "session") {
    opts.onlyPreflop = true;
    opts.preferFlop = true;
  } else if (c.sessionType === "street") {
    opts.onlyStreet = c.streetStart;
  }
  return opts;
}

/* ──────────────────────────────────────────────────────────────────────────
   PERSISTANCE UNIFIÉE.
   Historiquement : `pf_trainer_cfg` (l'objet `f`) + `pf_train_mode`. On conserve
   ces clés pour compatibilité descendante ET on écrit un snapshot canonique
   `pf_training_config` (source unique). Au chargement, le snapshot canonique
   prime ; à défaut on reconstruit depuis les clés legacy.
   ────────────────────────────────────────────────────────────────────────── */
export const TRAINING_CONFIG_STORE_KEY = "pf_training_config";
const LEGACY_F_KEY = "pf_trainer_cfg";
const LEGACY_TRAINMODE_KEY = "pf_train_mode";

export function saveTrainingConfig(cfg, storage) {
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return;
  const c = normalizeTrainingConfig(cfg);
  try { store.setItem(TRAINING_CONFIG_STORE_KEY, JSON.stringify(c)); } catch {}
  // Compat legacy : conserver `f` et le train mode pour tout code non migré
  try { store.setItem(LEGACY_F_KEY, JSON.stringify(trainingConfigToFilters(c))); } catch {}
  try { store.setItem(LEGACY_TRAINMODE_KEY, c.sessionType); } catch {}
}

/* Charge le config canonique. Ordre : snapshot canonique → legacy `f`+trainMode
   → défauts. Retourne toujours un config normalisé complet. */
export function loadTrainingConfig(storage) {
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return { ...DEFAULT_TRAINING_CONFIG };
  // 1) snapshot canonique
  try {
    const raw = store.getItem(TRAINING_CONFIG_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return normalizeTrainingConfig(parsed);
    }
  } catch {}
  // 2) reconstruction depuis le legacy
  let f = {};
  try {
    const raw = store.getItem(LEGACY_F_KEY);
    if (raw) { const p = JSON.parse(raw); if (p && typeof p === "object") f = p; }
  } catch {}
  let trainMode;
  try { trainMode = store.getItem(LEGACY_TRAINMODE_KEY) || undefined; } catch {}
  return buildTrainingConfig({ f, sessionType: trainMode });
}
