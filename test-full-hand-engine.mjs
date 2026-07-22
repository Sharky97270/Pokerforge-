import assert from "node:assert/strict";
import {
  createFullHand,
  legalActions,
  amountToCall,
  applyAction,
  playVillain,
  handStrength7,
  cardToInt,
  defaultVillainPolicy,
  FH_STREETS,
} from "./src/fullHandEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const C = (r, s) => ({ r, s });
const board5 = [C("Q", "♠"), C("J", "♦"), C("T", "♣"), C("2", "♥"), C("7", "♠")];

/* ── 1. Conversion carte + évaluation cohérente ── */
{
  ok(cardToInt(C("A", "♠")) > cardToInt(C("2", "♠")), "A > 2 (encodage rang)");
  const straight = handStrength7([C("A", "♥"), C("K", "♥")], board5); // AKQJT = quinte
  const pairDeux = handStrength7([C("2", "♠"), C("2", "♦")], board5); // brelan de 2
  ok(straight > 0 && pairDeux > 0, "évaluation renvoie un score");
  ok(straight > pairDeux, "AKQJT (quinte) bat un brelan de 2");
}

/* ── 2. Actions légales : check/bet quand rien à payer ── */
{
  const s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "hero" });
  eq(s.street, "flop", "démarre au flop");
  eq(s.board.length, 3, "3 cartes au flop");
  const la = legalActions(s).map(a => a.type);
  ok(la.includes("CHECK") && la.includes("BET") && !la.includes("CALL"), "check/bet quand toCall=0");
  eq(amountToCall(s, "hero"), 0, "rien à payer");
}

/* ── 3. Bet → l'adversaire fait face (fold/call/raise) ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "hero", startPot: 10, heroStack: 100, villStack: 100 });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  eq(s.toAct, "villain", "au villain de répondre");
  eq(s.pot, 16, "pot = 10 + 6");
  ok(amountToCall(s, "villain") === 6, "villain doit payer 6");
  const la = legalActions(s, "villain").map(a => a.type);
  ok(la.includes("FOLD") && la.includes("CALL") && la.includes("RAISE"), "fold/call/raise face à une mise");
}

/* ── 4. Fold → l'adversaire gagne, main terminée ── */
{
  let s = createFullHand({ heroHand: [C("2","♠"),C("3","♦")], villHand: [C("A","♥"),C("A","♦")], fullBoard: board5, firstToAct: "hero" });
  s = applyAction(s, "hero", { type: "BET", amount: 5 });
  s = applyAction(s, "villain", { type: "FOLD" });
  ok(s.done, "main terminée");
  eq(s.result.winner, "hero", "héro gagne sur fold villain");
  eq(s.result.reason, "fold", "raison = fold");
}

/* ── 5. Check-check → avance à la street suivante ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "hero" });
  s = applyAction(s, "hero", { type: "CHECK" });
  eq(s.toAct, "villain", "après check héro, au villain");
  ok(!s.done && s.street === "flop", "toujours au flop");
  s = applyAction(s, "villain", { type: "CHECK" });
  eq(s.street, "turn", "check-check → turn");
  eq(s.board.length, 4, "4 cartes au turn");
  eq(s.contrib.hero, 0, "contributions réinitialisées");
}

/* ── 6. Bet-call → avance à la street suivante, pot correct ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "hero", startPot: 10 });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  s = applyAction(s, "villain", { type: "CALL" });
  eq(s.street, "turn", "bet-call → turn");
  eq(s.pot, 22, "pot = 10 + 6 + 6");
}

/* ── 7. Déroulé complet flop→turn→river→showdown (réel) ── */
{
  let s = createFullHand({ heroHand: [C("A","♥"),C("K","♥")], villHand: [C("3","♣"),C("4","♣")], fullBoard: board5, firstToAct: "hero" });
  // check-check x3 → showdown
  for (const st of ["flop", "turn", "river"]) {
    eq(s.street, st, `street ${st}`);
    s = applyAction(s, "hero", { type: "CHECK" });
    s = applyAction(s, "villain", { type: "CHECK" });
  }
  ok(s.done, "main terminée après river");
  eq(s.result.reason, "showdown", "showdown réel");
  eq(s.result.winner, "hero", "AKQJT (quinte) bat 34 offsuit → héro gagne");
  eq(s.board.length, 5, "board complet à 5");
}

/* ── 8. Raise → réponse, puis call clôt ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "hero", startPot: 10 });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  s = applyAction(s, "villain", { type: "RAISE", amount: 18 }); // raise to 18
  eq(s.toAct, "hero", "héro face à la relance");
  ok(amountToCall(s, "hero") === 12, "héro doit payer 12 (18-6)");
  s = applyAction(s, "hero", { type: "CALL" });
  eq(s.street, "turn", "call clôt → turn");
  eq(s.pot, 46, "pot = 10 + 18 + 18");
}

/* ── 9. Villain policy : ne renvoie que des actions légales ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "villain" });
  const a = defaultVillainPolicy(s, { random: () => 0.5 });
  const legal = legalActions(s, "villain").map(x => x.type);
  ok(legal.includes(a.type), "action villain légale");
  s = playVillain(s, defaultVillainPolicy, { random: () => 0.5 });
  ok(s.toAct === "hero" || s.done || s.street !== "flop", "l'état progresse après le villain");
}

/* ── 10. Immutabilité : l'état d'entrée n'est jamais muté ── */
{
  const s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "hero" });
  const snap = JSON.stringify(s);
  applyAction(s, "hero", { type: "BET", amount: 5 });
  eq(JSON.stringify(s), snap, "applyAction ne mute pas l'entrée");
}

/* ── 11. Nouvelle street : l'OOP (premier au flop) reparle en premier ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: board5, firstToAct: "villain" });
  s = applyAction(s, "villain", { type: "CHECK" });
  s = applyAction(s, "hero", { type: "CHECK" });
  eq(s.street, "turn", "turn atteint");
  eq(s.toAct, "villain", "OOP (villain) reparle en premier au turn");
}

console.log(`✅ fullHandEngine — ${passed} assertions OK`);
