/* test-trainer-pause-policy.mjs — réglage « Pause après » (Lot 4 bis)

   Couvre les quatre options × toutes les classes de verdict, la non-confusion
   entre « non évaluée » et « erreur », et l'unicité de la clé de déclenchement
   (tableId + handId + decisionId) qui protège des re-rendus React. */
import assert from "node:assert/strict";
import {
  PAUSE_AFTER, PAUSE_AFTER_OPTIONS, PAUSE_AFTER_DEFAULT, VERDICT_CLASS,
  shouldPauseAfter, classFromSpotVerdict, classFromPostflopQuality,
  isEvaluableSpot, normalizePauseAfter, isPauseAfter,
  decisionId, pauseKey, pausedCountLabel,
} from "./src/trainerPausePolicy.js";
import { spotVerdict } from "./src/trainerRoundEngine.js";
import { evaluatePostflopDecision } from "./src/postflopHeuristic.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* ── 1. Les quatre options existent, sont distinctes et documentées ── */
{
  eq(PAUSE_AFTER_OPTIONS.length, 4, "quatre options");
  eq(PAUSE_AFTER_OPTIONS.map(o => o.l), ["Jamais", "Erreur", "Imprécision+", "Chaque action"], "libellés français attendus");
  ok(PAUSE_AFTER_OPTIONS.every(o => o.hint && o.hint.length > 20), "chaque option porte une explication");
  eq(new Set(PAUSE_AFTER_OPTIONS.map(o => o.id)).size, 4, "identifiants distincts");
  eq(PAUSE_AFTER_DEFAULT, PAUSE_AFTER.NEVER, "défaut = comportement actuel (aucune pause)");
  eq(normalizePauseAfter("n'importe quoi"), PAUSE_AFTER.NEVER, "valeur invalide → défaut sûr");
  eq(normalizePauseAfter(PAUSE_AFTER.EVERY), PAUSE_AFTER.EVERY, "valeur valide conservée");
  ok(!isPauseAfter(undefined), "undefined n'est pas une option");
}

/* ── 2. Matrice complète option × classe de verdict ──
   Écrite en toutes lettres : c'est le contrat visible par le joueur. */
{
  const C = VERDICT_CLASS;
  const attendu = {
    // best, correct, inaccuracy, mistake, blunder, unevaluated
    [PAUSE_AFTER.NEVER]:      [false, false, false, false, false, false],
    [PAUSE_AFTER.MISTAKE]:    [false, false, false, true,  true,  false],
    [PAUSE_AFTER.INACCURACY]: [false, false, true,  true,  true,  false],
    [PAUSE_AFTER.EVERY]:      [true,  true,  true,  true,  true,  true ],
  };
  const classes = [C.BEST, C.CORRECT, C.INACCURACY, C.MISTAKE, C.BLUNDER, C.UNEVALUATED];
  for (const [policy, attendus] of Object.entries(attendu)) {
    classes.forEach((cl, i) => {
      eq(shouldPauseAfter(policy, cl), attendus[i], `${policy} × ${cl} → ${attendus[i]}`);
    });
  }
}

/* ── 3. « Non évaluée » n'est JAMAIS traitée comme une faute du joueur ── */
{
  ok(!shouldPauseAfter(PAUSE_AFTER.MISTAKE, VERDICT_CLASS.UNEVALUATED),
    "option Erreur ne s'arrête pas sur une décision non évaluée");
  ok(!shouldPauseAfter(PAUSE_AFTER.INACCURACY, VERDICT_CLASS.UNEVALUATED),
    "option Imprécision+ ne s'arrête pas sur une décision non évaluée");
  ok(shouldPauseAfter(PAUSE_AFTER.EVERY, VERDICT_CLASS.UNEVALUATED),
    "option Chaque action s'arrête quand même (elle ne juge pas, elle rythme)");

  ok(!isEvaluableSpot(null), "spot absent = non évaluable");
  ok(!isEvaluableSpot({ acts: [] }), "sans action = non évaluable");
  ok(!isEvaluableSpot({ acts: [{ id: "FOLD" }], ok: 7 }), "index de solution hors bornes = non évaluable");
  ok(!isEvaluableSpot({ acts: [{ id: "FOLD" }], ok: 0, invalid: true }), "scénario marqué invalide = non évaluable");
  ok(isEvaluableSpot({ acts: [{ id: "FOLD" }, { id: "CALL" }], ok: 1 }), "spot complet = évaluable");
}

/* ── 4. Branchement sur les DEUX moteurs de verdict réels ──
   Si ces correspondances cassent, la pause se déclencherait sur le mauvais palier
   sans qu'aucun autre test ne s'en aperçoive. */
{
  const spot = { acts: [{ id: "FOLD" }, { id: "CALL" }, { id: "RAISE" }], ok: 2,
    ev: { FOLD: 0, CALL: 1.0, RAISE: 1.2 } };
  eq(classFromSpotVerdict(spotVerdict(spot, 2)), VERDICT_CLASS.BEST, "action optimale → best");
  eq(classFromSpotVerdict(spotVerdict(spot, 1)), VERDICT_CLASS.CORRECT, "-0.2bb → correct");
  const spot2 = { acts: [{ id: "FOLD" }, { id: "CALL" }], ok: 1, ev: { FOLD: 0, CALL: 0.6 } };
  eq(classFromSpotVerdict(spotVerdict(spot2, 0)), VERDICT_CLASS.INACCURACY, "-0.6bb → imprécision");
  const spot3 = { acts: [{ id: "FOLD" }, { id: "CALL" }], ok: 1, ev: { FOLD: 0, CALL: 2 } };
  eq(classFromSpotVerdict(spotVerdict(spot3, 0)), VERDICT_CLASS.MISTAKE, "-2bb → erreur");
  const spot4 = { acts: [{ id: "FOLD" }, { id: "CALL" }], ok: 1, ev: { FOLD: 0, CALL: 9 } };
  eq(classFromSpotVerdict(spotVerdict(spot4, 0)), VERDICT_CLASS.BLUNDER, "-9bb → blunder");
  eq(classFromSpotVerdict(null), VERDICT_CLASS.UNEVALUATED, "pas de verdict → non évaluée");

  eq(classFromPostflopQuality("best"), VERDICT_CLASS.BEST, "postflop best");
  eq(classFromPostflopQuality("ok"), VERDICT_CLASS.CORRECT, "postflop ok");
  eq(classFromPostflopQuality("imprecise"), VERDICT_CLASS.INACCURACY, "postflop imprecise");
  eq(classFromPostflopQuality("error"), VERDICT_CLASS.MISTAKE, "postflop error");
  eq(classFromPostflopQuality(undefined), VERDICT_CLASS.UNEVALUATED, "qualité absente → non évaluée");

  // Le moteur Full Hand produit bien une des quatre qualités reconnues.
  const ev = evaluatePostflopDecision({
    heroHand: [{ r: "A", s: "♠" }, { r: "K", s: "♠" }],
    board: [{ r: "A", s: "♦" }, { r: "7", s: "♣" }, { r: "2", s: "♥" }],
    street: "flop", pot: 10, facingBet: false, actionType: "FOLD",
  });
  ok(classFromPostflopQuality(ev.quality) !== VERDICT_CLASS.UNEVALUATED,
    `qualité Full Hand reconnue (obtenu « ${ev.quality} »)`);
}

/* ── 5. Une pause AU PLUS par décision, même sous re-rendus React ── */
{
  const k1 = pauseKey(0, "dyn_9001", decisionId({ street: "Preflop" }));
  const k2 = pauseKey(0, "dyn_9001", decisionId({ street: "Preflop" }));
  eq(k1, k2, "même décision → même clé (donc un seul déclenchement)");

  const differentes = new Set([
    pauseKey(0, "dyn_9001", decisionId({ street: "Preflop" })),
    pauseKey(1, "dyn_9001", decisionId({ street: "Preflop" })),   // autre table
    pauseKey(0, "dyn_9002", decisionId({ street: "Preflop" })),   // autre main
    pauseKey(0, "dyn_9001", decisionId({ street: "flop" })),      // autre street
    pauseKey(0, "dyn_9001", decisionId({ street: "flop", index: 1 })), // 2e décision du flop
  ]);
  eq(differentes.size, 5, "table, main, street et rang de décision changent tous la clé");

  // Full Hand : trois streets = trois pauses distinctes possibles sur la même main.
  const fh = ["flop", "turn", "river"].map(s => pauseKey(2, "dyn_77", decisionId({ street: s })));
  eq(new Set(fh).size, 3, "flop/turn/river : trois décisions, trois clés");
}

/* ── 6. Compteur global ── */
{
  eq(pausedCountLabel(0), null, "aucune table en pause → rien à afficher");
  eq(pausedCountLabel(1), "1 table en pause", "singulier");
  eq(pausedCountLabel(3), "3 tables en pause", "pluriel");
}

console.log(`✅ trainerPausePolicy (Lot 4 bis — Pause après) — ${passed} assertions OK`);
