/* test-postflop-heuristic.mjs — évaluation postflop heuristique (Full Hand §60) */
import assert from "node:assert/strict";
import { evaluatePostflopDecision, normalizedHandStrength } from "./src/postflopHeuristic.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const C = (r, s) => ({ r, s });

const nutStraight = [C("A", "♥"), C("K", "♥")];        // sur QJT → quinte
const boardQJT = [C("Q", "♠"), C("J", "♦"), C("T", "♣")];
const trash = [C("7", "♦"), C("2", "♣")];              // air sur QJT

/* ── 1. Force normalisée cohérente ── */
{
  const strong = normalizedHandStrength(nutStraight, boardQJT);
  const weak = normalizedHandStrength(trash, boardQJT);
  ok(strong > weak, "quinte > air");
  ok(strong >= 0.4, `quinte : force élevée ≥ 0.4 (${strong})`);
}

/* ── 2. Main forte, pas de mise : BET idéal, CHECK imprécis (manque de value) ── */
{
  const bet = evaluatePostflopDecision({ heroHand: nutStraight, board: boardQJT, pot: 12, facingBet: false, actionType: "BET" });
  eq(bet.quality, "best", "forte + BET = best");
  eq(bet.evDelta, 0, "best → 0 EV perdue");
  eq(bet.source, "heuristic-estimate", "provenance estimation");
  const check = evaluatePostflopDecision({ heroHand: nutStraight, board: boardQJT, pot: 12, facingBet: false, actionType: "CHECK" });
  ok(!check.correct && check.evDelta < 0, "forte + CHECK = manque de value (EV perdue)");
  eq(check.bestActionId, "BET", "meilleure action = BET");
}

/* ── 3. Main faible face à une mise : FOLD idéal, CALL = erreur ── */
{
  const fold = evaluatePostflopDecision({ heroHand: trash, board: boardQJT, pot: 12, facingBet: true, actionType: "FOLD" });
  eq(fold.quality, "best", "faible + FOLD face à mise = best");
  const call = evaluatePostflopDecision({ heroHand: trash, board: boardQJT, pot: 12, facingBet: true, actionType: "CALL" });
  eq(call.quality, "error", "faible + CALL face à mise = erreur");
  ok(call.evDelta < -0.3, "erreur : EV perdue notable");
}

/* ── 4. Main forte face à une mise : RAISE idéal, FOLD = grosse erreur ── */
{
  const raise = evaluatePostflopDecision({ heroHand: nutStraight, board: boardQJT, pot: 20, facingBet: true, actionType: "RAISE" });
  eq(raise.quality, "best", "forte + RAISE face à mise = best");
  const fold = evaluatePostflopDecision({ heroHand: nutStraight, board: boardQJT, pot: 20, facingBet: true, actionType: "FOLD" });
  eq(fold.quality, "error", "forte + FOLD = grosse erreur");
  ok(fold.evDelta < raise.evDelta, "fold de la nuts perd plus d'EV");
}

/* ── 5. L'EV perdue s'amplifie avec la taille du pot ── */
{
  const small = evaluatePostflopDecision({ heroHand: trash, board: boardQJT, pot: 6, facingBet: true, actionType: "CALL" });
  const big = evaluatePostflopDecision({ heroHand: trash, board: boardQJT, pot: 40, facingBet: true, actionType: "CALL" });
  ok(big.evDelta < small.evDelta, "call payant plus cher dans un gros pot");
}

/* ── 6. correct=true seulement pour best/ok ── */
{
  const ok1 = evaluatePostflopDecision({ heroHand: [C("A","♠"),C("A","♦")], board: [C("K","♠"),C("7","♦"),C("2","♣")], pot: 10, facingBet: false, actionType: "BET" });
  ok(ok1.correct, "value bet AA = correct");
  const err = evaluatePostflopDecision({ heroHand: trash, board: boardQJT, pot: 10, facingBet: true, actionType: "CALL" });
  ok(!err.correct, "call air = incorrect");
}

/* ── 7. evDelta toujours ≤ 0 (jamais de gain fictif) ── */
{
  for (const at of ["CHECK", "BET", "FOLD", "CALL", "RAISE"]) {
    for (const fb of [true, false]) {
      const r = evaluatePostflopDecision({ heroHand: nutStraight, board: boardQJT, pot: 12, facingBet: fb, actionType: at });
      ok(r.evDelta <= 0, `evDelta ≤ 0 (${at}, facing=${fb})`);
    }
  }
}

console.log(`✅ postflopHeuristic (§60) — ${passed} assertions OK`);
