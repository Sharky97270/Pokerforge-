/* ══════════════════════════════════════════════════════════════════════════
   test-immersion-amounts.mjs — TEST D'IMMERSION §68
   Pour chaque main : blind/bet/call/raise/pot/stack exacts, jetons au bon ancrage,
   mises collectées au pot, board distribué correctement, street suivante correcte,
   reset complet à la main suivante.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { createFullHand, applyAction, amountToCall } from "./src/fullHandEngine.js";
import {
  ANIM, buildSpotIntroSequence, buildActionSequence, buildStreetChangeSequence, buildShowdownSequence,
} from "./src/immersionEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const C = (r, s) => ({ r, s });
const B = [C("Q", "♠"), C("J", "♦"), C("T", "♣"), C("2", "♥"), C("7", "♠")];
const evt = (seq, type) => seq.find((e) => e.type === type);

/* ── §68 blindes — montants exacts dans la séquence d'intro ── */
{
  const seq = buildSpotIntroSequence({ schema: { street: "Preflop", blinds: { sb: 0.5, bb: 1 }, actionHistory: [], board: [], hero: { hand: [] } } });
  const blinds = seq.filter((e) => e.type === ANIM.POST_BLIND);
  eq(blinds.length, 2, "SB + BB postées");
  eq(blinds[0].amount, 0.5, "SB = 0.5bb");
  eq(blinds[1].amount, 1, "BB = 1bb");
}

/* ── §68 bet — montant exact + pot exact + stack exact ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: B, firstToAct: "hero", startPot: 10, heroStack: 100, villStack: 100 });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  eq(s.pot, 16, "pot = 10 + 6 (bet exact)");
  eq(s.heroStack, 94, "stack Héro = 100 - 6");
  eq(s.contrib.hero, 6, "contribution street = 6");
  const aseq = buildActionSequence({ actionType: "BET", amountBb: 6, position: "BTN" });
  eq(evt(aseq, ANIM.BET).amount, 6, "anim BET porte le montant engagé (6)");
}

/* ── §68 call — montant ajouté exact (pas le stack total) ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: B, firstToAct: "hero", startPot: 10 });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  eq(amountToCall(s, "villain"), 6, "à payer = 6 (montant ajouté, pas le stack)");
  s = applyAction(s, "villain", { type: "CALL" });
  eq(s.pot, 22, "pot après call = 10 + 6 + 6");
  eq(s.villStack, 94, "stack Villain = 100 - 6");
}

/* ── §68 raise — montant exact + pot exact ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: B, firstToAct: "hero", startPot: 10 });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  s = applyAction(s, "villain", { type: "RAISE", amount: 18 }); // raise-to 18
  eq(s.pot, 34, "pot = 10 + 6 + 18");
  eq(s.contrib.villain, 18, "contribution Villain = 18");
  eq(amountToCall(s, "hero"), 12, "Héro à payer = 18 - 6 = 12");
}

/* ── §68 board distribué correctement (3/4/5 selon street) ── */
{
  let s = createFullHand({ heroHand: [C("A","♥"),C("K","♥")], villHand: [C("3","♣"),C("4","♣")], fullBoard: B, firstToAct: "hero" });
  eq(s.board.length, 3, "flop = 3 cartes");
  eq(s.board.map(c => c.r).join(""), "QJT", "flop = les 3 premières du board");
  s = applyAction(s, "hero", { type: "CHECK" }); s = applyAction(s, "villain", { type: "CHECK" });
  eq(s.street, "turn", "next street = turn");
  eq(s.board.length, 4, "turn = 4 cartes");
  s = applyAction(s, "hero", { type: "CHECK" }); s = applyAction(s, "villain", { type: "CHECK" });
  eq(s.street, "river", "next street = river");
  eq(s.board.length, 5, "river = 5 cartes");
}

/* ── §68 mises collectées au pot — ordre collecte AVANT distribution ── */
{
  const seq = buildStreetChangeSequence("turn", B);
  eq(seq.map(e => e.type), [ANIM.MOVE_BETS_TO_POT, ANIM.DEAL_TURN], "collecte puis distribution turn");
  const intro = buildSpotIntroSequence({ schema: { street: "Flop", blinds: { sb: 0.5, bb: 1 }, board: B.slice(0,3), hero: { hand: [] }, actionHistory: [{ position: "BTN", actionType: "RAISE", amountBb: 2.5 }] } });
  const iMove = intro.findIndex(e => e.type === ANIM.MOVE_BETS_TO_POT);
  const iFlop = intro.findIndex(e => e.type === ANIM.DEAL_FLOP);
  ok(iMove >= 0 && iFlop > iMove, "collecte des mises avant la distribution du flop");
}

/* ── §68 séquence d'intro : ordre blindes → héro → action → board ── */
{
  const seq = buildSpotIntroSequence({ schema: {
    street: "Flop", blinds: { sb: 0.5, bb: 1 }, hero: { hand: [C("A","♠"),C("K","♠")] },
    board: B.slice(0, 3), actionHistory: [{ position: "BTN", actionType: "RAISE", amountBb: 2.5 }],
  }});
  const t = seq.map(e => e.type);
  ok(t.indexOf(ANIM.POST_BLIND) < t.indexOf(ANIM.DEAL_HERO), "blindes avant cartes Héro");
  ok(t.indexOf(ANIM.DEAL_HERO) < t.indexOf(ANIM.RAISE), "cartes Héro avant l'action Villain");
  ok(t.indexOf(ANIM.RAISE) < t.indexOf(ANIM.DEAL_FLOP), "action avant distribution du flop");
}

/* ── §68 showdown : collecte finale → showdown → gain ── */
{
  eq(buildShowdownSequence({ winner: "hero" }).map(e => e.type), [ANIM.MOVE_BETS_TO_POT, ANIM.SHOWDOWN, ANIM.POT_TO_WINNER], "séquence de fin de main");
}

/* ── §68 main suivante : reset complet de l'état visuel ── */
{
  let s = createFullHand({ heroHand: [C("A","♠"),C("K","♠")], villHand: [C("Q","♥"),C("Q","♦")], fullBoard: B, firstToAct: "hero", startPot: 10 });
  s = applyAction(s, "hero", { type: "BET", amount: 6 }); // état sale : pot gonflé, contrib
  // "main suivante" = nouvel état moteur
  const fresh = createFullHand({ heroHand: [C("2","♠"),C("3","♦")], villHand: [C("5","♥"),C("6","♦")], fullBoard: B, firstToAct: "hero", startPot: 5 });
  eq(fresh.street, "flop", "reset : street = flop");
  eq(fresh.pot, 5, "reset : pot = nouveau startPot");
  eq(fresh.contrib, { hero: 0, villain: 0 }, "reset : contributions à 0");
  eq(fresh.acted, { hero: false, villain: false }, "reset : personne n'a agi");
  eq(fresh.done, false, "reset : main non terminée");
  eq(fresh.result, null, "reset : pas de résultat");
}

console.log(`✅ immersion-amounts (§68) — ${passed} assertions OK`);
