/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-trainer — PFASE §29→§43, §64, §65, §67, §68, §71, §90, §91

   Ce que ce fichier verrouille, dans l'ordre de la mission :

     §29/§30  le Trainer CONSOMME une solution — il n'en choisit jamais les sizings
     §31/§32  Single Size affiche UN sizing, Simple en affiche deux, du même arbre
     §34/§37  aucune conversion implicite ; le type et la taille restent distincts
     §36      le retour n'affiche que ce qui est réellement disponible
     §40/§42  UN SEUL moteur pour 1T/2T/3T/4T, avec des états de table isolés
     §43/§68  le Vilain échantillonne, et la séquence est rejouable à graine égale
     §71      aucun bouton n'existe hors de la solution
     §90/§91  sans solution : « No verified solution available », jamais un repli
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  spotToGameState, solutionActsForSpot, trainerVerdict, villainActionFromSolution,
  prepareTrainerSpot, seededRng, trainerActionId, trainerActionLabel,
} from "./src/sizing/trainerBridge.js";
import { resolveTrainingSolution, ResolutionOutcome, suggestedComplexityFor, describeAvailability, compatibilityReport } from "./src/sizing/trainingSolutionResolver.js";
import { buildSolution, SolutionProvenance } from "./src/sizing/solutionSchema.js";
import { saveSolution, clearStore, storeSize } from "./src/sizing/solutionStore.js";
import { normalizeGameState, ActionType } from "./src/sizing/gameState.js";
import { gameStateHash, solutionId } from "./src/sizing/canonicalHash.js";
import { potSizing, jamSizing } from "./src/sizing/sizingSpec.js";
import { SolveStatus, EvaluationModel } from "./src/sizing/config.js";
import { getTrainingNode, compareAction } from "./src/sizing/pfase.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 1e-6) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

/* ── Spot Trainer réaliste + ledger ───────────────────────────────────────── */
const SPOT = (over = {}) => ({
  id: "spot-1", cat: "Flop", street: "RIVER", hpos: "BB", vpos: "BTN",
  stack: "94bb", pot: 12, toCall: 0,
  hand: [{ r: "A", s: "♠" }, { r: "K", s: "♠" }],
  board: [{ r: "5", s: "♠" }, { r: "8", s: "♥" }, { r: "2", s: "♣" }, { r: "Q", s: "♠" }, { r: "3", s: "♣" }],
  actionHistory: [
    { street: "PREFLOP", position: "BTN", actionType: "RAISE", amountBb: 3 },
    { street: "PREFLOP", position: "BB", actionType: "CALL", amountBb: 3 },
  ],
  heroRange: { AA: { r: 100, c: 0, f: 0 }, AKs: { r: 0, c: 100, f: 0 } },
  villainRange: { AA: { r: 100, c: 0, f: 0 }, KK: { r: 0, c: 100, f: 0 } },
  ...over,
});
const LEDGER = (over = {}) => ({
  depthBb: 100, pot: 12, effectiveStack: 94, opponentCapacity: 94,
  seats: {
    BB: { remaining: 94, street: 0, total: 6, folded: false, allIn: false, capacity: 94 },
    BTN: { remaining: 94, street: 0, total: 6, folded: false, allIn: false, capacity: 94 },
  },
  ...over,
});

const STUDY = { mode: "AUTOMATIC", betSizes: [potSizing(0.33), potSizing(0.75), jamSizing()], raiseSizes: [] };
const CFG = { maxIterations: 400, maxCombos: 200 };

/* Construit et stocke une solution VALIDE pour l'état d'un spot donné. */
function seedSolution(spot, ledger, complexity, sizings, over = {}) {
  const g = spotToGameState(spot, ledger);
  if (!g.ok) throw new Error("état invalide : " + g.errors.join(", "));
  const { hash } = gameStateHash({
    state: g.state, heroRange: spot.heroRange, villainRanges: [spot.villainRange],
    treeSpec: STUDY, solverConfig: CFG,
  });
  /* Labels calqués sur ceux que produit réellement `extractStreetStrategy` :
     "B" seul quand il n'y a qu'un sizing, "B0"/"B1"… sinon, et "J" pour le jam —
     qui est une ACTION à part (§74), pas une mise parmi d'autres. */
  const nonJam = sizings.filter(sp => sp.type !== "jam");
  const labels = ["X", ...sizings.map((sp, i) => (sp.type === "jam" ? "J" : (nonJam.length === 1 ? "B" : "B" + i)))];
  const freqs = labels.map((_, i) => (i === 0 ? 1 - 0.2 * (labels.length - 1) : 0.2));
  const sol = buildSolution({
    solutionId: solutionId(hash, complexity), gameStateHash: hash, canonical: "c",
    state: g.state, heroRange: spot.heroRange, villainRanges: [spot.villainRange],
    mode: "AUTOMATIC", complexity,
    candidates: { bets: [{ spec: potSizing(0.33) }, { spec: potSizing(0.75) }, { spec: jamSizing() }], raises: [], dropped: [] },
    selectedBetSpecs: sizings, selectedRaiseSpecs: [],
    referenceBetSpecs: [potSizing(0.33), potSizing(0.75), jamSizing()], referenceRaiseSpecs: [],
    treeSpec: STUDY,
    strategy: {
      coversStreetsAhead: false, classes: ["AA", "AKs"], nodeCount: 1,
      nodes: {
        "": {
          path: [], nodeId: 0, player: 0, actions: labels,
          actionTypes: Object.fromEntries(labels.map(l => [l, l === "X" ? "CHECK" : l === "J" ? "ALL_IN" : "BET"])),
          sizings: Object.fromEntries(labels.map((l, i) => {
            if (i === 0) return [l, { specKey: null, specLabel: null, spec: null, additionalBb: 0, toBb: 0, potFraction: 0 }];
            const spec = sizings[i - 1];
            const amt = spec.type === "jam" ? 94 : Math.round(12 * spec.value * 100) / 100;
            return [l, { specKey: spec.type === "jam" ? "jam" : `pot:${spec.value}`, specLabel: spec.type === "jam" ? "JAM" : `${spec.value * 100}%`, spec, additionalBb: amt, toBb: amt, potFraction: spec.type === "jam" ? null : spec.value }];
          })),
          aggregate: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])),
          byClass: { AKs: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])) },
          potBb: 12, toCallBb: 0,
          normalization: { ok: true, sum: 1, problems: [] },
        },
      },
    },
    metrics: { referenceEV: 12.56, simplifiedEV: 12.5, absoluteEVLoss: 0.06, relativeEVLoss: 0.0048, evLossPotPct: 0.5, retainedEV: 0.995 },
    actionRanking: { best: "pot:0.33", bestEV: 12.5, actions: [{ label: "pot:0.33", ev: 12.5, delta: 0, isBest: true }, { label: "pot:0.75", ev: 12.42, delta: -0.08, isBest: false }] },
    convergence: { iterations: 400, elapsedMs: 800, nashConv: 0.008, note: null, sampled: false, completed: true },
    status: SolveStatus.COMPLETE, partialReasons: [],
    provenance: SolutionProvenance.POKERFORGE_SOLVER,
    evaluationConfig: { maxIterations: 200 }, finalSolveConfig: CFG,
    optimizeFor: 0, seed: 11, solveId: "SHK-X",
    ...over,
  });
  sol.distinguishable = true;
  const r = saveSolution(sol);
  if (!r.ok) throw new Error("solution refusée : " + r.problems.join(", "));
  return { sol, hash, state: g.state };
}

console.log("\n── §7/§29 — le spot Trainer devient un état canonique fidèle");
{
  const g = spotToGameState(SPOT(), LEDGER());
  ok(g.ok, `état construit${g.ok ? "" : " : " + g.errors.join(", ")}`);
  eq(g.state.street, "RIVER", "rue reprise du spot");
  eq(g.state.pot, 12, "pot repris du LEDGER (source unique du Trainer)");
  eq(g.state.effectiveStack, 94, "tapis effectif repris du ledger");
  eq(g.state.board.length, 5, "board converti");
  eq(g.state.actorPosition, "BB", "l'acteur est le héros");
  /* §37 — un « 3-bet » du Trainer est un RAISE, jamais un BET. */
  eq(g.state.actionHistory[0].actionType, ActionType.RAISE, "l'ouverture préflop est typée RAISE");
  eq(g.state.actionHistory[1].actionType, ActionType.CALL, "le call reste un CALL");
}

console.log("\n── §31 — Single Size : UN seul sizing affiché");
{
  clearStore();
  const { sol } = seedSolution(SPOT(), LEDGER(), "SINGLE", [potSizing(0.33)]);
  const r = solutionActsForSpot({ solution: sol, handClass: "AKs" });
  ok(r.ok, "actions produites");
  eq(r.acts.length, 2, "exactement deux boutons : Check et une mise");
  eq(r.acts.map(a => a.id), ["CHECK", "BET33"], "et pas la liste 25/33/50/75/POT des templates");
  eq(r.acts[1].amountBb, 3.96, "le montant vient de la solution, pas d'un libellé");
  eq(r.acts[1].actionType, ActionType.BET, "type strict porté par l'act");
  ok(/33%/.test(r.acts[1].l), "le libellé est dérivé du montant et de la fraction");
}

console.log("\n── §32 — Simple : deux sizings, issus du MÊME arbre");
{
  clearStore();
  const { sol } = seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  const r = solutionActsForSpot({ solution: sol, handClass: "AKs" });
  eq(r.acts.length, 3, "Check + deux mises");
  eq(r.acts.map(a => a.id), ["CHECK", "BET33", "BET75"], "les deux sizings retenus");
  eq(r.complexity, "SIMPLE", "le niveau est transporté jusqu'à l'écran");
  ok(r.acts.every(a => a.solverLabel), "chaque bouton garde le label du nœud solveur — traçabilité");
}

console.log("\n── §33/§71 — Full affiche toutes les actions, et RIEN d'autre");
{
  clearStore();
  const { sol } = seedSolution(SPOT(), LEDGER(), "FULL", [potSizing(0.33), potSizing(0.75), jamSizing()]);
  const r = solutionActsForSpot({ solution: sol, handClass: "AKs" });
  eq(r.acts.map(a => a.id), ["CHECK", "BET33", "BET75", "ALLIN"], "les trois sizings + check");
  const node = getTrainingNode(sol, [], { handClass: "AKs" });
  eq(r.acts.length, node.actions.length, "§71 — autant de boutons que d'actions dans la solution, ni plus ni moins");
  eq(r.acts[3].actionType, ActionType.ALL_IN, "§74 — le jam est une action à part entière");
  eq(r.acts[3].amountBb, 94, "et son montant vient du tapis");
}

console.log("\n── §36 — les fréquences viennent de la MAIN quand elles existent");
{
  clearStore();
  const { sol } = seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  const avecMain = solutionActsForSpot({ solution: sol, handClass: "AKs" });
  eq(avecMain.frequencySource, "hand-class", "AKs est dans la range solvée → fréquences de la MAIN");
  const sansMain = solutionActsForSpot({ solution: sol, handClass: "72o" });
  eq(sansMain.frequencySource, "range-aggregate", "72o n'y est pas → repli sur la range");
  ok(/absente de la range/.test(sansMain.frequencyNote), "et le repli est DIT — une fréquence de range n'est pas celle d'une main");
  const somme = Object.values(avecMain.freq).reduce((a, b) => a + b, 0);
  near(somme, 100, "les fréquences affichées somment à 100 %", 0.2);
}

console.log("\n── §34/§50 — aucun sizing joué n'est arrondi vers un sizing étudié");
{
  clearStore();
  const { sol } = seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  const exact = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 3.96 } });
  ok(exact.ok && exact.inTree, "un sizing exact est reconnu");
  eq(exact.matched.specLabel, "33%", "et identifié par son spec");

  const approx = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 8.2 } });
  ok(approx.ok && !approx.inTree, "8.2bb n'est pas dans l'arbre");
  eq(approx.verdict, "sizing non étudié", "et c'est le verdict rendu");
  ok(!approx.evAvailable, "§50 — l'EV du voisin n'est PAS attribuée");
  ok(approx.nearestStudied, "le sizing étudié le plus proche est CITÉ");
  eq(approx.nearestStudied.approximate, true, "explicitement marqué approximatif");
  ok(/ne s'applique pas au sizing joué/.test(approx.nearestStudied.note), "avec l'avertissement complet");

  /* §37 — un CALL n'est jamais confondu avec un BET, même à montant égal. */
  const call = compareAction({ solution: sol, handClass: "AKs", actionType: "CALL", sizeBb: 3.96 });
  ok(call.ok && !call.inTree, "aucun CALL à ce nœud (Hero ouvre)");
  ok(/n'existe pas à ce nœud/.test(call.reason), "et la raison distingue bien le TYPE");
}

console.log("\n── §36 — on n'annonce que ce qui est disponible");
{
  clearStore();
  const { sol } = seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  const v = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 3.96 } });
  ok(v.solutionAction, "l'action de la solution est fournie");
  ok(typeof v.matched.frequency === "number", "la fréquence l'est aussi");
  eq(v.evAvailable, false, "l'EV par action ne l'est pas — et on le dit plutôt que d'en inventer une");
  ok(/n'est pas conservée/.test(v.evNote), "avec l'explication");
  ok(v.sizingRanking && v.sizingRanking.actions.length, "§15 — mais l'écart d'EV entre SIZINGS, lui, est disponible");
  near(v.evLossOfSolution, 0.06, "et la perte d'EV de la simplification aussi");
}

console.log("\n── §43/§68 — le Vilain échantillonne, et la séquence est rejouable");
{
  clearStore();
  const { sol } = seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  const tirer = (seed, n) => {
    const rng = seededRng(seed);
    return Array.from({ length: n }, () => villainActionFromSolution({ solution: sol, handClass: "AKs", rng }).actionType);
  };
  const a = tirer(4242, 60), b = tirer(4242, 60), c = tirer(9999, 60);
  eq(a, b, "§68 — même graine, même séquence : la QA est reproductible");
  ok(a.join("") !== c.join(""), "graine différente, séquence différente");
  const distinctes = new Set(a);
  ok(distinctes.size > 1, "§43 — le Vilain ne joue PAS systématiquement l'action majoritaire");
  const partBet = a.filter(x => x === "BET").length / a.length;
  ok(partBet > 0.2 && partBet < 0.6, `la proportion de mises (${Math.round(partBet * 100)} %) suit les fréquences (40 % attendus)`);
  const one = villainActionFromSolution({ solution: sol, handClass: "AKs", rng: seededRng(1) });
  ok(one.distribution.length === 3, "la distribution complète accompagne la décision — le Coach peut la citer");
}

console.log("\n── §90/§91 — sans solution : on le DIT, on ne fabrique rien");
{
  clearStore();
  const r = prepareTrainerSpot({ spot: SPOT(), ledger: LEDGER(), complexity: "SIMPLE", studySpec: STUDY, solverConfig: CFG });
  ok(!r.ok, "aucune solution → aucune action");
  eq(r.outcome, ResolutionOutcome.NONE, "issue explicite");
  eq(r.message, "No verified solution available", "§90 — le message exact");
  eq(r.acts.length, 0, "et surtout : AUCUN bouton fabriqué");
  eq(r.offeredActions.map(a => a.id), ["SOLVE_SPOT", "APPROXIMATE_TRAINING", "CHANGE_SETTINGS"], "§90 — les trois suites proposées");
  ok(r.offeredActions[1].detail.includes("APPROXIMATE"), "§91 — l'entraînement approximatif est étiqueté, jamais « GTO »");
}

console.log("\n── §30 — un autre NIVEAU est proposé, jamais substitué en silence");
{
  clearStore();
  seedSolution(SPOT(), LEDGER(), "FULL", [potSizing(0.33), potSizing(0.75), jamSizing()]);
  const r = prepareTrainerSpot({ spot: SPOT(), ledger: LEDGER(), complexity: "SINGLE", studySpec: STUDY, solverConfig: CFG });
  ok(r.ok, "une solution du même état est trouvée");
  eq(r.outcome, ResolutionOutcome.OTHER_COMPLEXITY, "mais à un autre niveau");
  eq(r.complexity, "FULL", "le niveau RÉELLEMENT servi est FULL");
  eq(r.requestedComplexity, "SINGLE", "et le niveau demandé reste visible");
  ok(r.complexityDowngraded, "l'écart est signalé");
  ok(/aucune solution SINGLE/.test(r.downgradeReason), "avec le motif exact");
}

console.log("\n── §30 — pas de « board le plus proche »");
{
  clearStore();
  seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  /* Même spot, une seule carte de board changée : la solution ne doit PAS être servie. */
  const autre = SPOT({ board: [{ r: "5", s: "♠" }, { r: "8", s: "♥" }, { r: "2", s: "♣" }, { r: "Q", s: "♠" }, { r: "4", s: "♣" }] });
  const r = prepareTrainerSpot({ spot: autre, ledger: LEDGER(), complexity: "SIMPLE", studySpec: STUDY, solverConfig: CFG });
  ok(!r.ok, "un board différent d'UNE carte n'est pas « assez proche »");
  eq(r.outcome, ResolutionOutcome.NONE, "aucune solution — pas de substitution");
}

console.log("\n── §56 — le domaine du moteur est vérifié avant tout");
{
  clearStore();
  const multiway = spotToGameState(SPOT(), LEDGER({
    seats: {
      BB: { remaining: 94, street: 0, total: 6, folded: false, allIn: false },
      BTN: { remaining: 94, street: 0, total: 6, folded: false, allIn: false },
      CO: { remaining: 94, street: 0, total: 6, folded: false, allIn: false },
    },
  }));
  const r = resolveTrainingSolution({ state: multiway.state, heroRange: SPOT().heroRange, villainRange: SPOT().villainRange, studySpec: STUDY, solverConfig: CFG, complexity: "SIMPLE" });
  eq(r.outcome, ResolutionOutcome.UNSUPPORTED, "3 joueurs dans le coup → hors domaine");
  ok(/heads-up/.test(r.reason), "et l'on dit pourquoi : une solution HU n'est pas une vérité 3-way");
  ok(!r.mayClaimSolved, "aucune revendication de solution calculée");

  const preflop = normalizeGameState({
    street: "PREFLOP", board: [], blinds: { sb: 0.5, bb: 1 },
    players: [{ position: "BB", stack: 100, isHero: true }, { position: "BTN", stack: 100 }], deadPot: 1.5,
  });
  const rp = resolveTrainingSolution({ state: preflop.state, studySpec: STUDY, solverConfig: CFG });
  eq(rp.outcome, ResolutionOutcome.UNSUPPORTED, "le préflop reste hors du périmètre PFASE");
}

console.log("\n── §44/§55 — GTO et Exploit, ChipEV et ICM, ne se confondent pas");
{
  clearStore();
  const { sol, state } = seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  eq(compatibilityReport(sol, { state, trainingMode: "gto" }).ok, true, "solution GTO pour un entraînement GTO");
  const exploitCompat = compatibilityReport(sol, { state, trainingMode: "exploit" });
  eq(exploitCompat.ok, false, "§44 — une solution GTO n'est pas servie en mode Exploit");
  ok(/ne remplacent pas les sizings GTO/.test(exploitCompat.mismatches[0]), "avec le motif de la mission");

  const icmState = { ...state, evaluationModel: EvaluationModel.ICM };
  const icmCompat = compatibilityReport(sol, { state: icmState, trainingMode: "gto" });
  eq(icmCompat.ok, false, "§55 — une solution ChipEV n'est pas servie pour un spot ICM");
  ok(/jamais re-badgée ICM/.test(icmCompat.mismatches.join(" ")), "et l'interdit est cité");
}

console.log("\n── §40/§42 — UN moteur, des états de table ISOLÉS");
{
  clearStore();
  /* Quatre tables, quatre spots différents : chacune doit obtenir SES sizings.
     Le défaut redouté (§42) est le partage accidentel d'état entre tables. */
  const boards = [
    [{ r: "5", s: "♠" }, { r: "8", s: "♥" }, { r: "2", s: "♣" }, { r: "Q", s: "♠" }, { r: "3", s: "♣" }],
    [{ r: "K", s: "♦" }, { r: "9", s: "♥" }, { r: "4", s: "♠" }, { r: "J", s: "♣" }, { r: "6", s: "♦" }],
    [{ r: "A", s: "♣" }, { r: "T", s: "♠" }, { r: "7", s: "♥" }, { r: "2", s: "♦" }, { r: "5", s: "♥" }],
    [{ r: "Q", s: "♥" }, { r: "Q", s: "♦" }, { r: "3", s: "♠" }, { r: "8", s: "♣" }, { r: "T", s: "♦" }],
  ];
  const sizingsParTable = [[potSizing(0.33)], [potSizing(0.75)], [jamSizing()], [potSizing(0.33), potSizing(0.75)]];
  const tables = boards.map((board, i) => {
    const spot = SPOT({ id: `T${i}`, board });
    const sol = seedSolution(spot, LEDGER(), i === 3 ? "SIMPLE" : "SINGLE", sizingsParTable[i]).sol;
    return { tableId: `T${i}`, spot, sol };
  });
  eq(storeSize(), 4, "quatre solutions distinctes stockées");

  const rendu = tables.map(t => prepareTrainerSpot({
    spot: t.spot, ledger: LEDGER(), complexity: t.tableId === "T3" ? "SIMPLE" : "SINGLE",
    studySpec: STUDY, solverConfig: CFG, handClass: "AKs",
  }));
  ok(rendu.every(r => r.ok), "les quatre tables obtiennent leur solution");
  const ids = rendu.map(r => r.solutionId);
  eq(new Set(ids).size, 4, "§42 — quatre solutionId distincts : aucun état partagé");
  eq(rendu[0].acts.map(a => a.id), ["CHECK", "BET33"], "table 0 : 33%");
  eq(rendu[1].acts.map(a => a.id), ["CHECK", "BET75"], "table 1 : 75%");
  eq(rendu[2].acts.map(a => a.id), ["CHECK", "ALLIN"], "table 2 : jam");
  eq(rendu[3].acts.map(a => a.id), ["CHECK", "BET33", "BET75"], "table 3 : deux sizings");
  /* Le moteur est LE MÊME : c'est la même fonction qui a servi les quatre. */
  ok(rendu.every(r => r.state && r.solution), "§40 — un seul moteur d'entraînement, quatre rendus");
}

console.log("\n── §67 — 4 tables × 100 décisions : isolation et stabilité");
{
  const tablesIds = ["A", "B", "C", "D"];
  const sols = {};
  clearStore();
  tablesIds.forEach((id, i) => {
    const board = [{ r: "5", s: "♠" }, { r: "8", s: "♥" }, { r: "2", s: "♣" }, { r: "Q", s: "♠" }, { r: ["3", "4", "6", "7"][i], s: "♣" }];
    sols[id] = seedSolution(SPOT({ id, board }), LEDGER(), "SINGLE", [[potSizing(0.33)], [potSizing(0.75)], [jamSizing()], [potSizing(0.33)]][i]).sol;
  });
  const compteurs = {};
  let echecs = 0;
  for (const id of tablesIds) {
    const rng = seededRng(id.charCodeAt(0));
    compteurs[id] = new Set();
    for (let k = 0; k < 100; k++) {
      const v = villainActionFromSolution({ solution: sols[id], handClass: "AKs", rng });
      if (!v.ok) echecs++;
      compteurs[id].add(v.toBb);
    }
  }
  eq(echecs, 0, "400 décisions (4 tables × 100) résolues sans un seul échec");
  eq([...compteurs.A].sort(), [0, 3.96], "table A ne voit QUE ses montants (0 ou 3.96)");
  eq([...compteurs.B].sort(), [0, 9], "table B ne voit que les siens (0 ou 9)");
  eq([...compteurs.C].sort((x, y) => x - y), [0, 94], "table C ne voit que les siens (0 ou 94)");
  ok(![...compteurs.A].includes(9) && ![...compteurs.A].includes(94), "§67 — aucun sizing d'une autre table ne fuit");
}

console.log("\n── §41 — le multitabling SUGGÈRE, il n'impose pas");
{
  eq(suggestedComplexityFor(1).complexity, "SIMPLE", "1 table → Simple proposé");
  eq(suggestedComplexityFor(3).complexity, "SINGLE", "3 tables → Single Size proposé");
  eq(suggestedComplexityFor(4).complexity, "SINGLE", "4 tables aussi");
  ok(suggestedComplexityFor(4).suggested, "et c'est bien une suggestion");
  const choisi = suggestedComplexityFor(4, { userChoice: "ADVANCED" });
  eq(choisi.complexity, "ADVANCED", "§41 — un choix explicite de l'utilisateur n'est PAS écrasé");
  ok(!choisi.suggested, "et il est signalé comme non suggéré");
  ok(/respecté tel quel/.test(choisi.reason), "avec la raison");
}

console.log("\n── §28/§110 — la famille de solutions se décrit d'elle-même");
{
  clearStore();
  const spot = SPOT();
  const { hash } = seedSolution(spot, LEDGER(), "SINGLE", [potSizing(0.33)]);
  seedSolution(spot, LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  seedSolution(spot, LEDGER(), "FULL", [potSizing(0.33), potSizing(0.75), jamSizing()]);
  const d = describeAvailability(hash);
  ok(d.any, "des solutions existent");
  eq(d.levels.length, 3, "trois niveaux");
  eq(d.levels.map(l => l.complexity), ["SINGLE", "SIMPLE", "FULL"], "du plus simple au plus complet");
  ok(d.levels.every(l => Array.isArray(l.sizings) && l.sizings.length), "chacun annonce ses sizings");
  ok(d.levels.every(l => typeof l.evLossBb === "number"), "et ce que la simplification coûte");
  eq(describeAvailability("PFS-INCONNU").note, "No verified solution available", "un état inconnu le dit clairement");
}

console.log("\n── identifiants et libellés dérivent du MONTANT, pas d'un template");
{
  eq(trainerActionId({ actionType: "CHECK" }, 0), "CHECK", "check");
  eq(trainerActionId({ actionType: "BET", potFraction: 0.33 }, 1), "BET33", "une mise de 33 % → BET33");
  eq(trainerActionId({ actionType: "BET", potFraction: 0.66 }, 1), "BET66", "une mise de 66 % → BET66 (et non BET75 par défaut)");
  eq(trainerActionId({ actionType: "ALL_IN" }, 2), "ALLIN", "le jam");
  eq(trainerActionId({ actionType: "RAISE" }, 0), "RAISE", "une relance");
  eq(trainerActionLabel({ actionType: "CALL", additionalBb: 8 }), "Call 8bb", "le libellé d'un call porte le montant à payer");
  eq(trainerActionLabel({ actionType: "ALL_IN", toBb: 94 }), "Tapis 94bb", "celui d'un jam porte le total");
}

console.log(`\n✅ PFASE intégration Trainer (§29→§43/§64/§67/§68/§71/§90) — ${passed} assertions OK\n`);
