/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-matrix.mjs — TESTS AUTOMATIQUES §67
   Balaye la matrice : structures 2J-9J · positions · stacks · types de spot ·
   formats · phases · GTO/Exploit · 1T-4T · spot invalide · HH import · Replayer.
   Exerce les moteurs purs (constraint, génération, similarité, recovery).
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { POSITIONS_BY_SIZE } from "./src/data/content.js";
import { buildTrainingConfig, trainingConfigToFilters, normalizeTrainingConfig } from "./src/trainingConfig.js";
import { resolveTrainingConstraints, SPOT_TYPE_META } from "./src/constraintEngine.js";
import { buildTrainerIntegrationQueue, createTrainingSpotFromHand } from "./src/spotAiEngine.js";
import { generateSimilarSpots } from "./src/spotSimilarityEngine.js";
import { validateSpotConsistency } from "./src/trainerActionEvent.js";
import { assessSpot, createSpotRecoveryManager } from "./src/spotRecovery.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const seq = (s = 1) => () => ((s = (s * 9301 + 49297) % 233280), s / 233280);

const cfg = (parts) => buildTrainingConfig(parts);
const genQueue = (filters, extra = {}) => buildTrainerIntegrationQueue({
  filters, count: 12, mode: "gto", random: seq(7), spotTypeMap: {}, ...extra,
});
const allValid = (q) => q.every((s) => validateSpotConsistency(s, s.ctx || {}, { requireVillain: false }).ok);

/* ── §67.1 — Structures 2J → 9J : positions disponibles correctes ── */
for (let n = 2; n <= 9; n++) {
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: n } }));
  eq(r.resolved.tableStructure, n, `structure ${n}J conservée`);
  eq(r.meta.availablePositions, POSITIONS_BY_SIZE[n], `positions disponibles ${n}J`);
}

/* ── §67.2 — Toutes les positions Héro (6-max) résolvent ── */
for (const p of POSITIONS_BY_SIZE[6]) {
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 6, hp: p } }));
  ok(r.ok, `position Héro ${p} valide en 6-max`);
  eq(r.resolved.heroPosition, p, `position ${p} conservée`);
}
/* Position impossible pour la structure → auto-libérée (jamais bloquant) */
{
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 3, hp: "UTG" } }));
  ok(r.ok, "3J + UTG reste jouable (auto-résolu)");
  eq(r.resolved.heroPosition, "Tous", "UTG libéré en 3J");
}

/* ── §67.3 — Tous les stacks presets ── */
for (const st of ["", "5", "10", "15", "20", "25", "30", "40", "60", "100", "150", "200"]) {
  const c = normalizeTrainingConfig(cfg({ f: { stackEff: st } }));
  eq(c.stackDepth, st, `stack "${st}" conservé`);
}

/* ── §67.4 — Tous les types de spot (minSeats + street cohérents) ── */
for (const [id, meta] of Object.entries(SPOT_TYPE_META)) {
  ok(["preflop", "flop", "turn", "river"].includes(meta.street), `${id} : street valide`);
  // À une structure ≥ minSeats, le type est conservé ; en dessous, retiré (pas de crash).
  const big = resolveTrainingConstraints(cfg({ f: { nplayers: 9, spotTypes: [id] } }));
  ok(big.resolved.spotTypes.includes(id), `${id} conservé en 9J`);
  const small = resolveTrainingConstraints(cfg({ f: { nplayers: 2, spotTypes: [id] } }));
  if (meta.minSeats > 2) ok(!small.resolved.spotTypes.includes(id), `${id} (minSeats ${meta.minSeats}) retiré en 2J`);
}

/* ── §67.5 — Tous les formats (cash coupe phase & ICM) ── */
const FORMATS = [
  { d: "Tous", f: "Tous" }, { d: "MTT", f: "MTT ChipEV" }, { d: "KO", f: "MTT Bounty/PKO" },
  { d: "PKO", f: "MTT Bounty/PKO" }, { d: "Mystery KO", f: "MTT Bounty/PKO" }, { d: "Satellite", f: "MTT ICM" },
  { d: "Sit&Go", f: "MTT ICM" }, { d: "Expresso / Spin", f: "Spin & Go" }, { d: "Cash Game", f: "Cash 6-max" },
];
for (const fmt of FORMATS) {
  const r = resolveTrainingConstraints(cfg({ f: { fmtDetail: fmt.d, fmt: fmt.f, phase: "Bubble", icm: "Forte" } }));
  ok(r.ok, `format ${fmt.d} jouable`);
  if (fmt.d === "Cash Game") {
    eq(r.resolved.tournamentPhase, "Toutes", "cash : phase neutralisée");
    eq(r.resolved.icmPressure, "Désactivée", "cash : ICM neutralisé");
    ok(!r.meta.isTournament && r.meta.isCash, "cash flags");
  }
}

/* ── §67.6 — Toutes les phases (HU→2J, Top 3→3J) ── */
const PHASES = ["Toutes", "Early Game", "Middle Game", "Late Game", "Bubble", "ITM", "Demi-finale", "Table Finale", "Top 3", "Heads-Up"];
for (const ph of PHASES) {
  const r = resolveTrainingConstraints(cfg({ f: { nplayers: 9, phase: ph } }));
  ok(r.ok, `phase ${ph} jouable`);
  if (ph === "Heads-Up") eq(r.resolved.tableStructure, 2, "Heads-Up → 2J");
  if (ph === "Top 3") eq(r.resolved.tableStructure, 3, "Top 3 → 3J");
}

/* ── §67.7 — GTO et Exploit : queues non vides et 100% valides ── */
for (const mode of ["gto", "exploit"]) {
  const q = genQueue(trainingConfigToFilters(cfg({ f: { nplayers: 6 } })), { mode });
  ok(q.length > 0, `${mode} : queue non vide`);
  ok(allValid(q), `${mode} : tous les spots générés sont valides`);
}

/* ── §67.8 — 1T à 4T : tableCount borné [1,4] ── */
for (const [inp, exp] of [[1, 1], [2, 2], [3, 3], [4, 4], [7, 4], [0, 1]]) {
  eq(normalizeTrainingConfig(cfg({ ntables: inp })).tableCount, exp, `tableCount ${inp} → ${exp}`);
}

/* ── §67.9 — Spot invalide détecté (recovery, jamais compté erreur joueur) ── */
{
  const rec = createSpotRecoveryManager();
  const broken = { id: "x", hpos: "BTN", vpos: "BTN", stack: "40bb", street: "Preflop", board: [], pot: 1.5, acts: [] };
  const a = assessSpot(broken, {});
  ok(!a.playable, "spot cassé (hero=villain, 0 action) non jouable");
  const g = rec.guard(broken, {});
  ok(!g.playable && rec.count === 1, "recovery journalise l'échec");
}

/* ── §67.10 — HH import : main réelle → spot valide ── */
{
  const spot = createTrainingSpotFromHand({ heroPos: "CO", villainPos: "BB", street: "Flop", board: [{ r: "A", s: "♠" }, { r: "7", s: "♦" }, { r: "2", s: "♣" }], toCall: 4, pot: 12, stack: 60 });
  ok(validateSpotConsistency(spot, spot.ctx || {}, { requireVillain: false }).ok, "spot HH importé valide");
  eq(spot.hpos, "CO", "position Héro préservée");
}

/* ── §67.11 — Replayer : spots similaires tous valides ── */
{
  const ref = { id: "h", heroPos: "BTN", villainPos: "BB", street: "Flop", board: [{ r: "K", s: "♠" }, { r: "7", s: "♦" }, { r: "2", s: "♣" }], hand: [{ r: "A", s: "♠" }, { r: "Q", s: "♠" }], stack: 40, toCall: 6, pot: 20, actionHistory: [{ actionType: "RAISE" }, { actionType: "3BET" }] };
  const variants = generateSimilarSpots(ref, { count: 10, mode: "similar", random: seq(3) });
  const spots = variants.map((v) => createTrainingSpotFromHand(v));
  ok(spots.length === 10, "10 variantes");
  ok(spots.every((s) => validateSpotConsistency(s, s.ctx || {}, { requireVillain: false }).ok), "toutes les variantes sont valides");
}

console.log(`✅ trainer-matrix (§67) — ${passed} assertions OK`);
