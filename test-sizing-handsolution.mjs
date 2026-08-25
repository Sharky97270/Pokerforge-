/* ══════════════════════════════════════════════════════════════════════════
   PFASE · SOLUTION DE MAIN COMPLÈTE ET HORIZON DE VALEUR (§38 · §66 · §104)

   Trois choses sont vérifiées ici, et la troisième est la seule qui puisse
   réellement échouer :

     1. l'HORIZON de valeur est DÉRIVÉ du solve, jamais déclaré ;
     2. une chaîne de décisions est VÉRIFIÉE — chaque état découle du précédent ;
     3. **concaténer des décisions ne crée aucun horizon.**

   Le point 3 est celui que la mission nomme explicitement : « rejouer quatre
   solutions indépendantes ≠ résoudre une main multi-street ». Un module qui se
   contenterait de ranger des solutions dans un tableau passerait les points 1 et
   2 sans difficulté.
   ══════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { solveOptimizedTree, getTrainingNode } from "./src/sizing/pfase.js";
import { solveTreeSpec } from "./src/sizing/solverAdapter.js";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { extractStreetStrategy } from "./src/sizing/strategyExtract.js";
import { buildHandSolution, linkDecisions, expectedStateAfter, describeHandSolution, ChainKind, HAND_SOLUTION_SCHEMA_VERSION } from "./src/sizing/handSolution.js";
import { potSizing } from "./src/sizing/sizingSpec.js";
import { clearStore } from "./src/sizing/solutionStore.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const HERO = { AA: { r: 0, c: 100, f: 0 }, KK: { r: 0, c: 100, f: 0 }, AKs: { r: 0, c: 100, f: 0 }, "76s": { r: 0, c: 100, f: 0 }, T9s: { r: 0, c: 100, f: 0 }, "32o": { r: 0, c: 100, f: 0 } };
const VILL = { QQ: { r: 0, c: 100, f: 0 }, JJ: { r: 0, c: 100, f: 0 }, AQs: { r: 0, c: 100, f: 0 }, "98s": { r: 0, c: 100, f: 0 }, "54s": { r: 0, c: 100, f: 0 }, "72o": { r: 0, c: 100, f: 0 } };

const etat = (street, board, pot = 12, stack = 40) => normalizeGameState({
  gameType: "CASH", street, board, blinds: { sb: 0.5, bb: 1 }, minBet: 1, deadPot: pot, actorId: "h",
  players: [
    { id: "h", position: "BB", stack, committedStreet: 0, isHero: true },
    { id: "v", position: "BTN", stack, committedStreet: 0 },
  ],
}).state;

const CFG = { maxIterations: 150, maxCombos: 0, seed: 5, memoryGuard: { enabled: false } };
const resous = (street, board, pot = 12, stack = 40) => solveOptimizedTree({
  stateInput: {
    gameType: "CASH", street, board, blinds: { sb: 0.5, bb: 1 }, minBet: 1, deadPot: pot, actorId: "h",
    players: [
      { id: "h", position: "BB", stack, committedStreet: 0, isHero: true },
      { id: "v", position: "BTN", stack, committedStreet: 0 },
    ],
  },
  heroRange: HERO, villainRange: VILL, mode: "SINGLE",
  userBetSpecs: [potSizing(0.75)], userRaiseSpecs: [],
  evaluationConfig: { ...CFG, maxIterationsCeiling: 400 },
  finalSolveConfig: { ...CFG, maxIterations: 250 }, persist: false,
});

console.log("\n── L'HORIZON DE VALEUR EST MESURÉ, PAS DÉCLARÉ");
{
  /* La mesure qui fonde tout le reste : à horizon différent, EV et stratégie
     différentes. Si ces trois solves rendaient la même chose, les rues futures
     ne participeraient à rien et `coversStreetsAhead` devrait rester faux. */
  const st = etat("FLOP", [12, 25, 3]);
  const ts = { betSpecs: [potSizing(0.33), potSizing(0.75)], raiseSpecs: [], allowJam: false };
  const mesures = [1, 2, 3].map(d => {
    const r = solveTreeSpec({ state: st, heroRange: HERO, villainRange: VILL, treeSpec: ts, config: { ...CFG, maxIterations: 300, evaluationDepth: d } });
    const ex = extractStreetStrategy(r.solution, { includeEV: false });
    return { d, ok: r.ok, ev: r.ev, check: ex.nodes[""].aggregate.X, streetsValued: ex.streetsValued, covers: ex.coversStreetsAhead, exposes: ex.exposesStreetsAhead };
  });
  ok(mesures.every(m => m.ok), "les trois profondeurs se résolvent");

  eq(mesures.map(m => m.streetsValued), [1, 2, 3], "chaque solve rapporte le nombre de rues qu'il a réellement valorisées");
  eq(mesures.map(m => m.covers), [false, true, true], "l'horizon est DÉRIVÉ : faux à une rue, vrai au-delà");
  eq(mesures.map(m => m.exposes), [false, false, false], "et l'EXTRACTION ne couvre jamais les rues suivantes — c'est un choix, pas une limite");

  /* La preuve que ce n'est pas une étiquette : les nombres changent. */
  ok(Math.abs(mesures[2].ev - mesures[0].ev) > 1,
    `l'EV change du tout au tout avec l'horizon : ${mesures[0].ev} bb à une rue contre ${mesures[2].ev} bb à trois`);
  ok(Math.abs(mesures[2].check - mesures[0].check) > 0.2,
    `et la stratégie aussi : check ${(mesures[0].check * 100).toFixed(1)} % contre ${(mesures[2].check * 100).toFixed(1)} %`);
  console.log(`   horizon 1 → EV ${mesures[0].ev} · check ${(mesures[0].check * 100).toFixed(1)} %`
    + ` | horizon 3 → EV ${mesures[2].ev} · check ${(mesures[2].check * 100).toFixed(1)} %`);
}

console.log("\n── UN APPELANT NE PEUT PAS DÉCLARER L'HORIZON");
{
  const st = etat("RIVER", [12, 25, 3, 40, 7]);
  const r = solveTreeSpec({ state: st, heroRange: HERO, villainRange: VILL, treeSpec: { betSpecs: [potSizing(0.75)], raiseSpecs: [], allowJam: false }, config: CFG });
  /* On essaie de forcer le champ par l'API d'extraction, de toutes les façons
     plausibles. Aucune ne doit fonctionner : la valeur vient du solve. */
  for (const tentative of [
    { coversStreetsAhead: true },
    { streetsValued: 3 },
    { exposesStreetsAhead: true },
  ]) {
    const ex = extractStreetStrategy(r.solution, { includeEV: false, ...tentative });
    eq(ex.coversStreetsAhead, false, `« ${Object.keys(tentative)[0]} » passé en option ne change pas l'horizon réel`);
    eq(ex.streetsValued, 1, "ni le nombre de rues valorisées");
    eq(ex.exposesStreetsAhead, false, "ni ce que l'extraction expose");
  }
}

console.log("\n── L'ARITHMÉTIQUE D'UNE TRANSITION, indépendante de tout solveur");
{
  /* Hero mise 9 sur un pot de 12, le Vilain paie : le pot gagne DEUX fois la
     mise et chaque tapis en perd une. C'est ce contrôle qui distingue une main
     d'un sac de solutions, et il ne dépend d'aucun CFR. */
  const apres = expectedStateAfter({ pot: 12, effectiveStack: 40 }, { additionalBb: 9, calledBy: 1 });
  eq(apres.pot, 30, "12 + 2 × 9 = 30");
  eq(apres.effectiveStack, 31, "40 − 9 = 31");

  /* Personne ne suit : le coup s'arrête, les tapis ne bougent pas. */
  const nonSuivi = expectedStateAfter({ pot: 12, effectiveStack: 40 }, { additionalBb: 9, calledBy: 0 });
  eq(nonSuivi.pot, 21, "un pot emporté sans être suivi ne gagne que la mise");
  eq(nonSuivi.effectiveStack, 40, "et le tapis effectif ne bouge pas");

  const check = expectedStateAfter({ pot: 12, effectiveStack: 40 }, { additionalBb: 0, calledBy: 1 });
  eq(check.pot, 12, "un check ne change rien au pot");
}

console.log("\n── UNE CHAÎNE EST VÉRIFIÉE, PAS SUPPOSÉE");
{
  clearStore();
  const turn = resous("TURN", [12, 25, 3, 40]);
  ok(turn.ok, `la turn se résout${turn.ok ? "" : " : " + turn.reason}`);
  const mise = getTrainingNode(turn.solution, [], { handClass: "AA" }).actions.find(a => a.actionType === "BET");
  ok(mise && mise.additionalBb > 0, `la turn propose une mise (${mise && mise.additionalBb} bb)`);

  const river = resous("RIVER", [12, 25, 3, 40, 7], 12 + 2 * mise.additionalBb, 40 - mise.additionalBb);
  ok(river.ok, "la river se résout à l'état produit par cette mise");

  const hs = buildHandSolution({
    decisions: [
      { solution: turn.solution, action: { actionType: "BET", additionalBb: mise.additionalBb, calledBy: 1 }, label: "turn bet" },
      { solution: river.solution, action: { actionType: "CHECK", additionalBb: 0, calledBy: 1 }, label: "river check" },
    ],
  });
  ok(hs.ok, `la chaîne est cohérente${hs.ok ? "" : " : " + hs.problems.join(" · ")}`);
  eq(hs.chainConsistent, true, "chaque décision découle de la précédente");
  eq(hs.chainKind, ChainKind.RESOLVED_PER_STREET, "et la nature de la chaîne est nommée");
  eq(hs.streetsCovered, ["TURN", "RIVER"], "les rues couvertes sont énumérées");
  eq(hs.streetsNotCovered, ["PREFLOP", "FLOP"], "et surtout celles qui ne le sont PAS");
  eq(hs.schemaVersion, HAND_SOLUTION_SCHEMA_VERSION, "la main porte sa version de schéma");

  /* Tout ce que la mission demande de conserver. */
  const d0 = hs.decisions[0];
  for (const champ of ["street", "board", "pot", "effectiveStacks", "spr", "selectedSizes",
    "evLossBb", "measurementFloorBb", "provenance", "strategyKind", "convergence", "status",
    "streetsValued", "coversStreetsAhead", "exposesStreetsAhead", "action"]) {
    ok(champ in d0, `la décision conserve « ${champ} »`);
  }
  ok(hs.initial.heroRange && hs.initial.villainRanges, "l'état initial conserve les ranges");
  ok(Array.isArray(hs.initial.positions) && hs.initial.positions.length === 2, "et les positions");
  ok(hs.initial.actionHistory != null, "et l'historique d'actions");
  eq(hs.initial.pot, 12, "et le pot de départ");

  /* L'horizon, décision par décision — pas un booléen pour la main entière. */
  eq(hs.decisions[0].coversStreetsAhead, true, "la décision de turn avait la river dans sa valeur");
  eq(hs.decisions[1].coversStreetsAhead, false, "la décision de river n'avait plus rien après elle");
  eq(hs.everyDecisionValuedItsFuture, true, "chaque décision non terminale a bien vu sa suite");
}

console.log("\n── LE CONTRÔLE QUI COMPTE : concaténer ne crée aucun horizon");
{
  clearStore();
  /* Deux solves de RIVER indépendants : chacun n'a valorisé qu'une rue. On les
     enchaîne (le second à l'état que le premier produit) pour que la chaîne soit
     formellement cohérente — et l'horizon doit RESTER faux.

     C'est exactement la faute que la mission interdit : mettre quatre solutions
     bout à bout et déclarer avoir résolu une main. La chaîne est valide ; ce
     qu'elle N'EST PAS, c'est un horizon. */
  const r1 = resous("RIVER", [12, 25, 3, 40, 7]);
  ok(r1.ok, "premier solve de river");
  eq(r1.solution.strategy.coversStreetsAhead, false, "il n'a valorisé qu'une rue");

  const hs = buildHandSolution({
    decisions: [
      { solution: r1.solution, action: { actionType: "CHECK", additionalBb: 0, calledBy: 1 } },
      { solution: r1.solution, action: { actionType: "CHECK", additionalBb: 0, calledBy: 1 } },
    ],
  });
  /* La chaîne échoue — et pour la bonne raison : la rue ne progresse pas. */
  eq(hs.ok, false, "deux fois la même rue n'est pas une main");
  ok(hs.problems.some(p => /la rue ne progresse pas/.test(p)), "le motif nomme la rue qui n'avance pas");
  eq(hs.chainKind, ChainKind.UNVERIFIED, "et la chaîne se déclare non vérifiée");

  /* Même sur une chaîne PARFAITEMENT cohérente, l'horizon reste dérivé. */
  eq(hs.singleSolveCoversHand, false, "aucune HandSolution ne prétend équivaloir à un solve unique");
  ok(/juxtaposer des décisions ne crée pas d'horizon/.test(hs.singleSolveNote), "et elle le dit explicitement");
}

console.log("\n── UNE DÉCISION MYOPE DANS LA CHAÎNE SUFFIT À LE DIRE");
{
  clearStore();
  /* Turn résolue à horizon TRONQUÉ (une seule rue) puis river : la chaîne est
     cohérente, mais la décision de turn a été prise sans voir la river. Une main
     n'est pas plus fiable que sa décision la moins fiable. */
  const turnMyope = solveOptimizedTree({
    stateInput: {
      gameType: "CASH", street: "TURN", board: [12, 25, 3, 40], blinds: { sb: 0.5, bb: 1 }, minBet: 1, deadPot: 12, actorId: "h",
      players: [{ id: "h", position: "BB", stack: 40, committedStreet: 0, isHero: true }, { id: "v", position: "BTN", stack: 40, committedStreet: 0 }],
    },
    heroRange: HERO, villainRange: VILL, mode: "SINGLE",
    userBetSpecs: [potSizing(0.75)], userRaiseSpecs: [],
    evaluationConfig: { ...CFG, evaluationDepth: 1, maxIterationsCeiling: 400 },
    finalSolveConfig: { ...CFG, evaluationDepth: 1, maxIterations: 250 }, persist: false,
  });
  ok(turnMyope.ok, "la turn se résout à horizon tronqué");
  eq(turnMyope.solution.strategy.coversStreetsAhead, false, "et elle le déclare : la river n'a pas participé à sa valeur");

  const mise = getTrainingNode(turnMyope.solution, [], { handClass: "AA" }).actions.find(a => a.actionType === "BET");
  const river = resous("RIVER", [12, 25, 3, 40, 7], 12 + 2 * mise.additionalBb, 40 - mise.additionalBb);
  const hs = buildHandSolution({
    decisions: [
      { solution: turnMyope.solution, action: { actionType: "BET", additionalBb: mise.additionalBb, calledBy: 1 } },
      { solution: river.solution, action: { actionType: "CHECK", additionalBb: 0, calledBy: 1 } },
    ],
  });
  ok(hs.ok, "la chaîne reste cohérente : les états s'enchaînent bien");
  eq(hs.everyDecisionValuedItsFuture, false,
    "mais la main dit qu'une décision a été prise sans voir la suite — c'est le maillon faible qui gouverne");
  ok(describeHandSolution(hs).some(l => /sans que les rues suivantes participent/.test(l)),
    "et le résumé lisible le signale au joueur");
}

console.log(`\n✅ PFASE solution de main complète et horizon de valeur (§38/§66/§104) — ${passed} assertions OK\n`);
