/* ══════════════════════════════════════════════════════════════════════════
   spotSchema.js — TRAINING SPOT SCHEMA (Mission Master §26, Phase 4)

   Le SpotGenerator existant (spotAiEngine.js : SpotGenerationEngine,
   buildTrainerIntegrationQueue, generateFromTemplate) produit déjà des spots
   riches. Conformément au §21 (« ne pas créer un moteur parallèle »), Phase 4
   NE réécrit PAS de générateur : elle ajoute une couche de FINALISATION qui
   garantit que chaque spot émis porte le CONTRAT canonique du §26, sans retir
   aucun champ legacy.

   `finalizeTrainingSpot(spot, {config, meta, ctx})` :
   - conserve intégralement le spot d'origine (renderer, feedback, coach…) ;
   - ajoute `spot.spotId` + `spot.generationSeed` (stables → reproductibilité §65) ;
   - ajoute `spot.schema` = vue canonique §26 (format, tableStructure, hero,
     villains, positions, effectiveStack, blinds, antes, bounties, street,
     board, pot, actionHistory, allowedActions, strategyContext, difficulty,
     metadata).

   Module PUR (aucune dépendance React/DOM).
   ══════════════════════════════════════════════════════════════════════════ */

export const TRAINING_SPOT_SCHEMA_VERSION = 1;

/* Hash déterministe d'une chaîne → entier positif (seed reproductible §65). */
export function makeGenerationSeed(input) {
  const str = String(input == null ? "" : input);
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* Parse un stack "100bb" | "20" | 40 → nombre de bb (ou null). */
function parseBb(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* Le format implique-t-il des bounties (§16 PKO/KO/Mystery/Bounty) ? */
function formatHasBounties(fmtDetail, fmtFamily) {
  return /ko|bounty|pko|mystery/i.test(`${fmtDetail || ""} ${fmtFamily || ""}`);
}

/* Normalise la liste d'actions légales (§26 allowedActions). */
function normalizeAllowedActions(acts) {
  if (!Array.isArray(acts)) return [];
  return acts.map((a, i) => ({
    id: a?.id || `ACT${i}`,
    label: a?.l ?? a?.label ?? a?.id ?? "",
    size: a?.s ?? a?.size ?? null,
  }));
}

/* ──────────────────────────────────────────────────────────────────────────
   finalizeTrainingSpot — décore un spot avec le contrat §26.
   Idempotent : si `spot.schema` existe déjà, on le régénère (le config/ctx
   peut avoir changé), mais on ne duplique jamais et on ne perd aucun champ.
   ────────────────────────────────────────────────────────────────────────── */
export function finalizeTrainingSpot(spot, { config = {}, meta = {}, ctx = null } = {}) {
  if (!spot || typeof spot !== "object") return spot;

  const context = ctx || spot.ctx || null;
  const actionHistory = Array.isArray(context?.preActions) ? context.preActions : [];

  const fmtFamily = spot.fmt || config.format || "Tous";
  const fmtDetail = config.formatDetail || "Tous";
  const effectiveStack =
    parseBb(spot.stack) ?? parseBb(config.customStack) ?? parseBb(config.stackDepth) ?? null;
  const tableStructure = Number(config.tableStructure) || spot.nplayers || null;
  const spotId = spot.id || spot.spotId || `spot_${makeGenerationSeed(JSON.stringify(spot).slice(0, 200))}`;
  const generationSeed = spot.generationSeed ?? makeGenerationSeed(spotId);

  const schema = {
    schemaVersion: TRAINING_SPOT_SCHEMA_VERSION,
    spotId,
    generationSeed,
    format: fmtFamily,
    formatDetail: fmtDetail,
    tableStructure,
    hero: {
      position: spot.hpos || null,
      hand: Array.isArray(spot.hand) ? spot.hand : [],
      style: config.heroStyle || null,
    },
    villains: spot.vpos ? [{ position: spot.vpos, profile: spot.vtype || null }] : [],
    positions: {
      hero: spot.hpos || null,
      villain: spot.vpos || null,
      available: Array.isArray(meta.availablePositions) ? meta.availablePositions : null,
    },
    effectiveStack,
    blinds: { sb: 0.5, bb: 1 },
    antes: 0,
    bounties: formatHasBounties(fmtDetail, fmtFamily) ? { enabled: true } : null,
    street: spot.street || "Preflop",
    board: Array.isArray(spot.board) ? spot.board : [],
    pot: Number(spot.pot) || 0,
    actionHistory,
    facing: context?.facing || null,
    allowedActions: normalizeAllowedActions(spot.acts),
    strategyContext: {
      mode: config.trainingMode || spot.generationMode || "gto",
      villainProfile: spot.vtype || null,
      population: spot.populationModel || null,
      objective: config.workOnPrimary || spot.aiMeta?.objective || null,
      icmPressure: config.icmPressure || "Désactivée",
      icmApplicable: !!meta.icmApplicable,
      best: spot.best ?? null,
      okIndex: typeof spot.ok === "number" ? spot.ok : null,
    },
    difficulty: Number(spot.diff) || null,
    metadata: {
      templateId: spot.templateId || null,
      category: spot.cat || null,
      generatedAt: Date.now(),
    },
  };

  spot.spotId = spotId;
  spot.generationSeed = generationSeed;
  spot.schema = schema;
  return spot;
}

/* Décore un tableau de spots (valeurs falsy préservées telles quelles). */
export function finalizeTrainingSpots(spots, opts = {}) {
  if (!Array.isArray(spots)) return spots;
  return spots.map((s) => (s ? finalizeTrainingSpot(s, opts) : s));
}
