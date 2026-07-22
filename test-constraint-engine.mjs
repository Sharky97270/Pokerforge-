import assert from "node:assert/strict";
import { buildTrainingConfig } from "./src/trainingConfig.js";
import { resolveTrainingConstraints, SPOT_TYPE_META } from "./src/constraintEngine.js";

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); passed++; };
const has = (r, code, msg) => { ok(r.conflicts.some(c => c.code === code), msg || `conflit ${code} présent`); };
const hasnt = (r, code, msg) => { ok(!r.conflicts.some(c => c.code === code), msg || `pas de conflit ${code}`); };

const cfg = (parts) => buildTrainingConfig(parts);

/* ── 1. Config propre → aucun conflit ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 6, hp: "BTN", vp: "BB" } }));
  ok(r.ok, "config propre ok");
  eq(r.conflicts.length, 0, "config propre : 0 conflit");
  eq(r.meta.availablePositions, ["UTG", "HJ", "CO", "BTN", "SB", "BB"], "positions 6J");
}

/* ── 2. Position Héro impossible pour la structure (§20) ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 4, hp: "UTG" } }));
  has(r, "POSITION_HERO_INVALID");
  eq(r.resolved.heroPosition, "Tous", "hero position auto-libérée");
  ok(r.ok, "auto-résolu → ok reste true");
}

/* ── 3. Villain = Héro → Villain libéré ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 6, hp: "CO", vp: "CO" } }));
  has(r, "POSITION_HERO_VILLAIN_SAME");
  eq(r.resolved.villainPosition, "Tous", "villain libéré");
}

/* ── 4. Villain impossible pour la structure ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 3, vp: "HJ" } }));
  has(r, "POSITION_VILLAIN_INVALID");
  eq(r.resolved.villainPosition, "Tous", "villain auto-libéré");
}

/* ── 5. Heads-Up impose 2 joueurs (§14) + re-dérive positions ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 6, phase: "Heads-Up", hp: "UTG" } }));
  has(r, "PHASE_HEADSUP_STRUCTURE");
  eq(r.resolved.tableStructure, 2, "structure forcée à 2J");
  eq(r.meta.availablePositions, ["SB", "BB"], "positions HU");
  // hp=UTG devient invalide après passage à 2J → aussi auto-libéré
  has(r, "POSITION_HERO_INVALID");
  eq(r.resolved.heroPosition, "Tous", "hero UTG libéré après HU");
  eq(r.meta.activePlayerCap, 2, "cap HU = 2");
}

/* ── 6. Top 3 limite à 3 joueurs (§14) ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 9, phase: "Top 3" } }));
  has(r, "PHASE_TOP3_STRUCTURE");
  eq(r.resolved.tableStructure, 3, "structure ramenée à 3J");
  eq(r.meta.activePlayerCap, 3, "cap Top3 = 3");
}
/* Top 3 avec structure déjà ≤ 3 → pas de conflit */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 3, phase: "Top 3" } }));
  hasnt(r, "PHASE_TOP3_STRUCTURE", "3J déjà conforme à Top 3");
}

/* ── 7. Cash Game × phase tournoi (§16) ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { fmtDetail: "Cash Game", fmt: "Cash 6-max", phase: "Bubble" } }));
  has(r, "PHASE_IN_CASH");
  eq(r.resolved.tournamentPhase, "Toutes", "phase remise à Toutes en cash");
  ok(r.meta.isCash, "meta.isCash");
  ok(!r.meta.isTournament, "meta.isTournament false en cash");
}

/* ── 8. Cash Game × ICM (§15) ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { fmtDetail: "Cash Game", fmt: "Cash 6-max", icm: "Forte" } }));
  has(r, "ICM_IN_CASH");
  eq(r.resolved.icmPressure, "Désactivée", "ICM désactivé en cash");
  ok(!r.meta.icmApplicable, "meta.icmApplicable false en cash");
}

/* ── 9. Squeeze nécessite ≥ 4 joueurs (§13) ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 3, spotTypes: ["Squeeze", "3bet"] } }));
  has(r, "SPOTTYPE_MIN_SEATS");
  ok(!r.resolved.spotTypes.includes("Squeeze"), "Squeeze retiré en 3J");
  ok(r.resolved.spotTypes.includes("3bet"), "3bet conservé");
}
/* Squeeze conservé en 6J */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 6, spotTypes: ["Squeeze"] } }));
  hasnt(r, "SPOTTYPE_MIN_SEATS", "Squeeze ok en 6J");
  ok(r.resolved.spotTypes.includes("Squeeze"), "Squeeze conservé");
}

/* ── 10. Blind vs Blind × position Héro non-blinde (soft warning) ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 6, hp: "BTN", spotTypes: ["Blind vs Blind"] } }));
  has(r, "SPOTTYPE_BLINDS_ONLY_POSITION");
  ok(r.conflicts.find(c => c.code === "SPOTTYPE_BLINDS_ONLY_POSITION").severity === "warning", "sévérité warning");
  ok(r.resolved.spotTypes.includes("Blind vs Blind"), "type conservé (soft)");
}

/* ── 11. Street mode × types incompatibles (§8, soft) ── */
{
  const r = resolveTrainingConstraints(cfg({
    f: { spotTypes: ["Open Raise"] }, trainMode: "street", streetStart: "Turn",
  }));
  has(r, "SPOTTYPE_STREET_MISMATCH");
  eq(r.meta.allowedStreets, ["turn"], "allowedStreets = turn");
}
/* Street mode cohérent → pas de mismatch */
{
  const r = resolveTrainingConstraints(cfg({
    f: { spotTypes: ["Probe Bet"] }, trainMode: "street", streetStart: "Turn",
  }));
  hasnt(r, "SPOTTYPE_STREET_MISMATCH", "Probe Bet cohérent avec Turn");
}

/* ── 12. preflopOnly pour full/session ── */
{
  const r = resolveTrainingConstraints(cfg({ trainMode: "full" }));
  ok(r.meta.preflopOnly, "full → preflopOnly");
  eq(r.meta.allowedStreets, ["preflop"], "full → allowedStreets preflop");
}

/* ── 13. Push/Fold en stack profond (soft) ── */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 6, spotTypes: ["Push/Fold"], stackEff: "100" } }));
  has(r, "SPOTTYPE_PUSHFOLD_DEEP");
  ok(r.resolved.spotTypes.includes("Push/Fold"), "Push/Fold conservé (soft)");
}

/* ── 14. Le config d'entrée n'est jamais muté ── */
{
  const input = cfg({ f: { nplayers: 4, hp: "UTG" } });
  const snapshot = JSON.stringify(input);
  resolveTrainingConstraints(input);
  eq(JSON.stringify(input), snapshot, "config d'entrée immuable");
}

/* ── 15. Couverture SPOT_TYPE_META : tous les types connus ont street+minSeats ── */
{
  for (const [id, m] of Object.entries(SPOT_TYPE_META)) {
    ok(["preflop", "flop", "turn", "river"].includes(m.street), `${id} street valide`);
    ok(m.minSeats >= 2, `${id} minSeats >= 2`);
  }
}

console.log(`✅ constraintEngine — ${passed} assertions OK`);
