import assert from "node:assert/strict";
import {
  finalizeTrainingSpot,
  finalizeTrainingSpots,
  makeGenerationSeed,
  TRAINING_SPOT_SCHEMA_VERSION,
} from "./src/spotSchema.js";
import { buildTrainingConfig } from "./src/trainingConfig.js";
import { resolveTrainingConstraints } from "./src/constraintEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* Spot legacy représentatif (forme produite par le générateur). */
const legacySpot = () => ({
  id: "ai_rfi_123", templateId: "rfi_btn", cat: "RFI", street: "Preflop",
  fmt: "MTT ChipEV", hpos: "BTN", vpos: "BB", vtype: "TAG", stack: "40bb",
  hand: [{ r: "A", s: "s" }, { r: "K", s: "d" }], board: [], pot: 1.5, toCall: 0,
  acts: [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "RAISE", l: "Open 2.5bb", s: "2.5bb" }],
  ok: 1, best: "Open 2.5bb", diff: 2, populationModel: "gg-reg",
  ctx: { preActions: [{ position: "CO", actionType: "FOLD", amountBb: 0 }], facing: null },
});

const cfg = buildTrainingConfig({ f: { nplayers: 6, heroStyle: "TAG", fmtDetail: "MTT" }, trainerMode: "gto" });
const res = resolveTrainingConstraints(cfg);

/* ── 1. Contrat §26 présent et complet ── */
{
  const s = finalizeTrainingSpot(legacySpot(), { config: res.resolved, meta: res.meta });
  ok(s.schema, "schema attaché");
  eq(s.schema.schemaVersion, TRAINING_SPOT_SCHEMA_VERSION, "schemaVersion");
  eq(s.spotId, "ai_rfi_123", "spotId ← id");
  ok(Number.isInteger(s.generationSeed), "generationSeed entier");
  eq(s.schema.format, "MTT ChipEV", "format");
  eq(s.schema.tableStructure, 6, "tableStructure ← config");
  eq(s.schema.hero.position, "BTN", "hero.position");
  eq(s.schema.hero.hand.length, 2, "hero.hand");
  eq(s.schema.hero.style, "TAG", "hero.style ← config");
  eq(s.schema.villains, [{ position: "BB", profile: "TAG" }], "villains");
  eq(s.schema.effectiveStack, 40, "effectiveStack parsé de '40bb'");
  eq(s.schema.blinds, { sb: 0.5, bb: 1 }, "blinds");
  eq(s.schema.street, "Preflop", "street");
  eq(s.schema.pot, 1.5, "pot");
  eq(s.schema.actionHistory.length, 1, "actionHistory ← ctx.preActions");
  eq(s.schema.allowedActions.length, 2, "allowedActions");
  eq(s.schema.allowedActions[1], { id: "RAISE", label: "Open 2.5bb", size: "2.5bb" }, "allowedActions normalisées");
  eq(s.schema.difficulty, 2, "difficulty ← diff");
  eq(s.schema.strategyContext.mode, "gto", "strategyContext.mode");
  eq(s.schema.strategyContext.population, "gg-reg", "strategyContext.population");
  eq(s.schema.metadata.templateId, "rfi_btn", "metadata.templateId");
  eq(s.schema.metadata.category, "RFI", "metadata.category");
}

/* ── 2. Aucun champ legacy retiré ── */
{
  const before = legacySpot();
  const s = finalizeTrainingSpot(before, { config: res.resolved, meta: res.meta });
  for (const k of ["id", "cat", "street", "fmt", "hpos", "vpos", "acts", "ok", "best", "diff", "hand"]) {
    ok(k in s, `champ legacy ${k} conservé`);
  }
  eq(s.acts.length, 2, "acts intact");
}

/* ── 3. Bounties dérivés du format PKO ── */
{
  const cfgKo = buildTrainingConfig({ f: { fmtDetail: "PKO", fmt: "MTT Bounty/PKO" } });
  const s = finalizeTrainingSpot({ ...legacySpot(), fmt: "MTT Bounty/PKO" }, { config: cfgKo, meta: {} });
  ok(s.schema.bounties && s.schema.bounties.enabled, "bounties activés en PKO");
}
{
  const s = finalizeTrainingSpot(legacySpot(), { config: cfg, meta: {} });
  eq(s.schema.bounties, null, "pas de bounties hors KO");
}

/* ── 4. availablePositions repris de meta ── */
{
  const s = finalizeTrainingSpot(legacySpot(), { config: res.resolved, meta: res.meta });
  eq(s.schema.positions.available, res.meta.availablePositions, "positions.available ← meta");
}

/* ── 5. Seed déterministe et reproductible (§65) ── */
{
  eq(makeGenerationSeed("ai_rfi_123"), makeGenerationSeed("ai_rfi_123"), "seed déterministe");
  ok(makeGenerationSeed("a") !== makeGenerationSeed("b"), "seeds distincts");
  const s1 = finalizeTrainingSpot(legacySpot(), { config: cfg, meta: {} });
  const s2 = finalizeTrainingSpot(legacySpot(), { config: cfg, meta: {} });
  eq(s1.generationSeed, s2.generationSeed, "même spotId → même seed");
}

/* ── 6. effectiveStack : fallback customStack/stackDepth ── */
{
  const cfgCustom = buildTrainingConfig({ f: { customStack: 33 } });
  const noStack = { ...legacySpot(), stack: undefined };
  const s = finalizeTrainingSpot(noStack, { config: cfgCustom, meta: {} });
  eq(s.schema.effectiveStack, 33, "fallback customStack");
}

/* ── 7. finalizeTrainingSpots : tableau + valeurs falsy préservées ── */
{
  const arr = finalizeTrainingSpots([legacySpot(), null, legacySpot()], { config: cfg, meta: {} });
  eq(arr.length, 3, "longueur préservée");
  eq(arr[1], null, "null préservé");
  ok(arr[0].schema && arr[2].schema, "spots valides décorés");
}

/* ── 8. Idempotence : re-finaliser ne casse rien ── */
{
  const s = finalizeTrainingSpot(legacySpot(), { config: cfg, meta: {} });
  const seed1 = s.generationSeed;
  const s2 = finalizeTrainingSpot(s, { config: cfg, meta: {} });
  eq(s2.generationSeed, seed1, "seed stable après re-finalisation");
  ok(s2.schema, "schema toujours présent");
}

console.log(`✅ spotSchema — ${passed} assertions OK`);
