import assert from "node:assert/strict";
import {
  generateSimilarSpots,
  buildSimilarSession,
  derivePotType,
  LOCKABLE_VARS,
  VARIABLE_VARS,
} from "./src/spotSimilarityEngine.js";
import { createTrainingSpotFromHand } from "./src/spotAiEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* Main de référence (3-bet pot flop, BTN vs BB). */
const ref = {
  id: "hand42", heroPos: "BTN", villainPos: "BB", street: "Flop",
  board: [{ r: "K", s: "♠" }, { r: "7", s: "♦" }, { r: "2", s: "♣" }],
  hand: [{ r: "A", s: "♠" }, { r: "Q", s: "♠" }], stack: 40, toCall: 6, pot: 20,
  vtype: "Reg",
  actionHistory: [
    { position: "BTN", actionType: "RAISE" },
    { position: "BB", actionType: "3BET" },
    { position: "BTN", actionType: "CALL" },
  ],
};
const seq = () => { let n = 0; return () => ((n = (n * 9301 + 49297) % 233280), n / 233280); };

/* ── 1. Verrouillage : positions / street / action history préservés ── */
{
  const spots = generateSimilarSpots(ref, { count: 6, mode: "similar", random: seq() });
  eq(spots.length, 6, "6 spots générés");
  for (const s of spots) {
    eq(s.heroPos, "BTN", "position Héro verrouillée");
    eq(s.villainPos, "BB", "position Villain verrouillée");
    eq(s.street, "Flop", "street verrouillée");
    eq(s.actionHistory.length, 3, "action history verrouillée");
    eq(s.potType, "3bet", "type de pot verrouillé (3bet)");
  }
}

/* ── 2. derivePotType : compte les relances ── */
{
  eq(derivePotType(ref), "3bet", "2 relances → 3bet pot");
  eq(derivePotType({ actionHistory: [{ actionType: "RAISE" }] }), "single-raised", "1 relance");
  eq(derivePotType({ actionHistory: [] }), "limped", "aucune relance → limped");
  eq(derivePotType({ actionHistory: [{ action: "RAISE" }, { action: "3BET" }, { action: "4BET" }] }), "4bet", "3 relances → 4bet");
}

/* ── 3. Board varié mais bonne longueur pour la street (flop=3) ── */
{
  const spots = generateSimilarSpots(ref, { count: 8, mode: "similar", random: seq() });
  for (const s of spots) eq(s.board.length, 3, "board flop = 3 cartes");
  const boards = spots.map((s) => s.board.map((c) => c.r + c.s).join(""));
  ok(new Set(boards).size > 1, "les boards varient entre les spots");
}

/* ── 4. Mode "near" : board+main varient, PAS le stack ── */
{
  const spots = generateSimilarSpots(ref, { count: 6, mode: "near", random: seq() });
  for (const s of spots) eq(s.stack, 40, "near : stack identique à la référence");
  ok(spots.some((s) => s.hand.map((c) => c.r + c.s).join("") !== "A♠Q♠"), "near : la main varie");
}

/* ── 5. Verrou explicite : heroHand verrouillé → main identique ── */
{
  const spots = generateSimilarSpots(ref, { count: 4, mode: "similar", lock: ["heroHand"], random: seq() });
  for (const s of spots) eq(s.hand.map((c) => c.r + c.s).join(""), "A♠Q♠", "heroHand verrouillé");
}

/* ── 6. Mode "similar" : le stack peut varier (preset voisin) ── */
{
  const spots = generateSimilarSpots(ref, { count: 12, mode: "similar", random: seq() });
  ok(spots.every((s) => s.stack >= 30 && s.stack <= 60), "similar : stack dans une fenêtre voisine (30-60)");
}

/* ── 7. buildSimilarSession (§52) : 4 familles × 5 = 20 spots ── */
{
  const session = buildSimilarSession(ref, { perGroup: 5, random: seq() });
  eq(session.length, 20, "20 spots (4×5)");
  const modes = new Set(session.map((s) => s._mode));
  ok(modes.has("near") && modes.has("similar") && modes.has("conceptual") && modes.has("harder"), "les 4 familles présentes");
  ok(session.every((s) => s._variantOf === "hand42"), "traçabilité vers la main d'origine");
}

/* ── 8. Sortie compatible createTrainingSpotFromHand ── */
{
  const [variant] = generateSimilarSpots(ref, { count: 1, mode: "similar", random: seq() });
  const spot = createTrainingSpotFromHand(variant);
  eq(spot.hpos, "BTN", "spot conserve la position Héro");
  eq(spot.vpos, "BB", "spot conserve la position Villain");
  eq(spot.street, "Flop", "spot conserve la street");
  ok(Array.isArray(spot.acts) && spot.acts.length >= 2, "spot a des actions jouables");
  ok(spot.board.length === 3, "spot board flop = 3");
}

/* ── 9. Immutabilité de la référence ── */
{
  const snap = JSON.stringify(ref);
  generateSimilarSpots(ref, { count: 5, mode: "harder", random: seq() });
  eq(JSON.stringify(ref), snap, "la référence n'est jamais mutée");
}

/* ── 10. Constantes exportées cohérentes avec le §51 ── */
{
  ok(LOCKABLE_VARS.includes("heroPosition") && LOCKABLE_VARS.includes("actionHistory"), "verrouillables §51");
  ok(VARIABLE_VARS.includes("board") && VARIABLE_VARS.includes("villainProfile"), "modifiables §51");
}

console.log(`✅ spotSimilarityEngine — ${passed} assertions OK`);
