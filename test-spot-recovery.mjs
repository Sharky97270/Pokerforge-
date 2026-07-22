import assert from "node:assert/strict";
import {
  createSpotRecoveryManager,
  assessSpot,
  RECOVERY_STATUS,
} from "./src/spotRecovery.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* Spot valide minimal (préflop RFI). */
const validSpot = () => ({
  id: "ok1", hpos: "BTN", vpos: "BB", stack: "40bb", street: "Preflop",
  board: [], pot: 1.5, toCall: 0,
  acts: [{ id: "FOLD", l: "Fold" }, { id: "RAISE", l: "Open 2.5bb" }],
});

/* ── 1. assessSpot : valide vs injouable ── */
{
  const a = assessSpot(validSpot(), { facing: null });
  ok(a.playable, "spot valide jouable");
  eq(a.reason, null, "aucune raison d'échec");
}
{
  const bad = { ...validSpot(), acts: [] }; // aucune action légale
  const a = assessSpot(bad, {});
  ok(!a.playable, "spot sans action injouable");
  ok(a.reason, "raison d'échec fournie");
}
{
  const bad = { ...validSpot(), hpos: "BTN", vpos: "BTN" }; // même siège
  const a = assessSpot(bad, {});
  ok(!a.playable, "hero=villain injouable");
}
{
  const a = assessSpot(null, {});
  ok(!a.playable, "spot null injouable");
}

/* ── 2. Manager : enregistre les échecs, jamais d'erreur joueur ── */
{
  const rec = createSpotRecoveryManager();
  eq(rec.count, 0, "journal vide au départ");
  const g = rec.guard({ ...validSpot(), acts: [] }, {}, { tableId: 2 });
  ok(!g.playable, "guard détecte l'injouable");
  eq(g.status, RECOVERY_STATUS.INVALID, "status INVALID par défaut");
  eq(rec.count, 1, "échec journalisé");
  eq(rec.failures[0].tableId, 2, "tableId journalisé");
  ok(rec.failures[0].reason, "raison journalisée");
}

/* ── 3. guard sur spot valide : rien journalisé ── */
{
  const rec = createSpotRecoveryManager();
  const g = rec.guard(validSpot(), { facing: null });
  ok(g.playable, "spot valide passe");
  eq(g.status, RECOVERY_STATUS.VALID, "status VALID");
  eq(rec.count, 0, "aucun échec journalisé");
}

/* ── 4. record + hasFailed + generationSeed ── */
{
  const rec = createSpotRecoveryManager();
  rec.record({ spot: { spotId: "s9", generationSeed: 123 }, status: RECOVERY_STATUS.FAILED, reason: "boom" });
  ok(rec.hasFailed("s9"), "hasFailed reconnaît le spot");
  eq(rec.failures[0].generationSeed, 123, "seed journalisé (repro §65)");
  eq(rec.failures[0].status, RECOVERY_STATUS.FAILED, "status FAILED");
}

/* ── 5. maxLog borne le journal ── */
{
  const rec = createSpotRecoveryManager({ maxLog: 3 });
  for (let i = 0; i < 10; i++) rec.record({ spot: { id: `x${i}` }, reason: "r" });
  eq(rec.count, 3, "journal borné à maxLog");
}

/* ── 6. clear remet à zéro ── */
{
  const rec = createSpotRecoveryManager();
  rec.record({ spot: { id: "a" }, reason: "r" });
  rec.clear();
  eq(rec.count, 0, "clear vide le journal");
  ok(!rec.hasFailed("a"), "clear oublie les ids");
}

console.log(`✅ spotRecovery — ${passed} assertions OK`);
