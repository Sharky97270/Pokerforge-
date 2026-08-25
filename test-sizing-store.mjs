/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-store — PFASE §17, §18, §22, §28, §55, §80, §88, §92

   Le magasin de solutions est le point où une erreur devient DURABLE : une
   solution fausse stockée est relue, servie, entraînée contre, et personne ne la
   remet en question. Ce fichier verrouille donc trois choses :

     · ce qui est REFUSÉ à l'entrée (§92) ;
     · ce qui est REFUSÉ à la sortie parce que produit par un moteur périmé (§80) ;
     · la NORMALISATION : un état, quatre solutions (§28).

   Il vérifie aussi que la provenance ne peut pas mentir (§18) : une
   APPROXIMATION ne porte jamais un badge de solution calculée.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  buildSolution, validateSolution, isCurrentEngine, stalenessOf,
  SolutionProvenance, PROVENANCE_META, deriveProvenance, mayClaimSolved, derivePotType,
} from "./src/sizing/solutionSchema.js";
import {
  saveSolution, getSolutionById, getSolution, complexitiesFor, solutionFamily,
  hasSolution, deleteSolution, clearStore, storeSize, inspectStore, storeStatus,
} from "./src/sizing/solutionStore.js";
import { normalizeGameState, ActionType } from "./src/sizing/gameState.js";
import { gameStateHash, solutionId } from "./src/sizing/canonicalHash.js";
import { potSizing, jamSizing } from "./src/sizing/sizingSpec.js";
import { SOLUTION_SCHEMA_VERSION, SIZING_ENGINE_VERSION, SOLVER_VERSION, SolveStatus, EvaluationModel } from "./src/sizing/config.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const STATE = normalizeGameState({
  gameType: "CASH", street: "RIVER", board: [12, 25, 3, 40, 7], blinds: { sb: 0.5, bb: 1 },
  players: [
    { id: "h", position: "BB", stack: 94, committedStreet: 0, isHero: true },
    { id: "v", position: "BTN", stack: 94, committedStreet: 0 },
  ],
  deadPot: 12, actorId: "h",
  actionHistory: [{ street: "PREFLOP", position: "BTN", actionType: "RAISE", size: 3 },
    { street: "PREFLOP", position: "BB", actionType: "CALL", size: 3 }],
}).state;
const RANGE = { AA: { r: 100, c: 0, f: 0 }, KK: { r: 0, c: 100, f: 0 } };
const HASH = gameStateHash({ state: STATE, heroRange: RANGE, villainRanges: [RANGE] }).hash;

/* Stratégie minimale mais VALIDE : un nœud racine dont les fréquences somment à 1. */
const strategyFor = (labels) => ({
  coversStreetsAhead: false, classes: ["AA", "KK"], nodeCount: 1,
  nodes: {
    "": {
      path: [], nodeId: 0, player: 0,
      actions: labels,
      actionTypes: Object.fromEntries(labels.map(l => [l, l === "X" ? "CHECK" : "BET"])),
      sizings: Object.fromEntries(labels.map((l, i) => [l, {
        specKey: l === "X" ? null : `pot:${0.33 * (i || 1)}`, specLabel: l === "X" ? null : `${33 * (i || 1)}%`,
        spec: l === "X" ? null : potSizing(0.33 * (i || 1)),
        additionalBb: l === "X" ? 0 : 4 * i, toBb: l === "X" ? 0 : 4 * i, potFraction: l === "X" ? 0 : 0.33 * i,
      }])),
      aggregate: Object.fromEntries(labels.map((l, i) => [l, i === 0 ? 1 - (labels.length - 1) * 0.1 : 0.1])),
      byClass: { AA: Object.fromEntries(labels.map((l, i) => [l, i === 0 ? 1 - (labels.length - 1) * 0.1 : 0.1])) },
      potBb: 12, toCallBb: 0,
      normalization: { ok: true, sum: 1, problems: [] },
    },
  },
});

const mkSolution = (complexity, over = {}) => buildSolution({
  solutionId: solutionId(HASH, complexity), gameStateHash: HASH, canonical: "canon",
  state: STATE, heroRange: RANGE, villainRanges: [RANGE],
  mode: "AUTOMATIC", complexity,
  candidates: { bets: [{ spec: potSizing(0.33) }, { spec: potSizing(0.75) }, { spec: jamSizing() }], raises: [], dropped: [] },
  selectedBetSpecs: complexity === "SINGLE" ? [potSizing(0.33)] : [potSizing(0.33), potSizing(0.75)],
  selectedRaiseSpecs: [],
  referenceBetSpecs: [potSizing(0.33), potSizing(0.75), jamSizing()],
  referenceRaiseSpecs: [],
  treeSpec: { mode: "AUTOMATIC", complexity },
  strategy: strategyFor(["X", "B"]),
  metrics: { referenceEV: 12.56, simplifiedEV: 12.48, absoluteEVLoss: 0.08, relativeEVLoss: 0.0064, evLossPotPct: 0.66, retainedEV: 0.994 },
  convergence: { iterations: 400, elapsedMs: 900, nashConv: 0.01, note: null, sampled: false, completed: true },
  status: SolveStatus.COMPLETE, partialReasons: [],
  provenance: SolutionProvenance.POKERFORGE_SOLVER,
  evaluationConfig: { maxIterations: 200 }, finalSolveConfig: { maxIterations: 400 },
  optimizeFor: 0, seed: 11, solveId: "SHK-0001",
  ...over,
});

clearStore();

console.log("\n── §17 — une solution porte TOUT ce que la mission exige");
{
  const s = mkSolution("SINGLE");
  const requis = ["solutionId", "schemaVersion", "gameType", "format", "players", "positions",
    "effectiveStacks", "pot", "street", "board", "actionHistory", "heroRange", "villainRanges",
    "rake", "antes", "potType", "solverEngine", "solverVersion", "sizingMode", "sizingComplexity",
    "candidateSizes", "selectedSizes", "bettingTree", "strategy", "frequencies", "ev",
    "simplificationMetrics", "convergence", "accuracy", "createdAt", "source"];
  for (const f of requis) ok(Object.prototype.hasOwnProperty.call(s, f), `champ §17 présent : ${f}`);
  eq(s.schemaVersion, SOLUTION_SCHEMA_VERSION, "version de schéma");
  eq(s.sizingEngineVersion, SIZING_ENGINE_VERSION, "version du moteur de sizing");
  eq(s.solverVersion, SOLVER_VERSION, "version du solveur");
  eq(s.potType, "SRP", "type de pot DÉRIVÉ de l'historique (une relance préflop)");
  ok(s.frequencies && Math.abs(Object.values(s.frequencies).reduce((a, b) => a + b, 0) - 1) < 1e-6,
    "les fréquences racine sont exposées et normalisées");
}

console.log("\n── §17 — le type de pot vient de l'HISTORIQUE, pas de la taille du pot");
{
  const noHist = { actionHistory: [] };
  eq(derivePotType(noHist), "UNKNOWN", "sans historique, on ne devine pas");
  eq(derivePotType({ actionHistory: [{ actionType: "CALL" }, { actionType: "CHECK" }] }), "LIMP", "aucune relance → pot limpé");
  eq(derivePotType({ actionHistory: [{ actionType: "RAISE" }, { actionType: "CALL" }] }), "SRP", "une relance → pot simple-relancé");
  eq(derivePotType({ actionHistory: [{ actionType: "RAISE" }, { actionType: "RAISE" }] }), "3BP", "deux relances → pot 3-bet");
  eq(derivePotType({ actionHistory: [{ actionType: "RAISE" }, { actionType: "RAISE" }, { actionType: "RAISE" }] }), "4BP", "trois → pot 4-bet");
}

console.log("\n── §18 — la provenance est DÉRIVÉE, et ne peut pas mentir");
{
  eq(deriveProvenance({ solvedNow: true }), SolutionProvenance.POKERFORGE_SOLVER, "résolu ici");
  eq(deriveProvenance({ fromStore: true }), SolutionProvenance.POKERFORGE_DATABASE, "relu du magasin");
  eq(deriveProvenance({ imported: true }), SolutionProvenance.VERIFIED_IMPORT, "importé vérifié");
  eq(deriveProvenance({ approximate: true, solvedNow: true }), SolutionProvenance.APPROXIMATION,
    "« approximatif » l'emporte sur tout le reste — on ne peut pas se re-badger calculé");
  eq(deriveProvenance({}), SolutionProvenance.APPROXIMATION, "sans origine connue, c'est une approximation");

  ok(!PROVENANCE_META.APPROXIMATION.gtoClaim, "§18 — une APPROXIMATION ne porte JAMAIS un badge de solution calculée");
  ok(PROVENANCE_META.POKERFORGE_SOLVER.gtoClaim, "un solve PokerForge, si");
  eq(PROVENANCE_META.APPROXIMATION.badge, "APPROXIMATE", "et son badge le dit à l'écran");

  ok(mayClaimSolved(mkSolution("SINGLE")), "solution résolue et complète → présentable comme calculée");
  ok(!mayClaimSolved(mkSolution("SINGLE", { provenance: SolutionProvenance.APPROXIMATION })),
    "une approximation ne l'est pas, même complète");
  ok(!mayClaimSolved(mkSolution("SINGLE", { status: SolveStatus.FAILED, strategy: null, selectedBetSpecs: [] })),
    "un solve échoué non plus, même avec une provenance solveur");
  ok(mayClaimSolved(mkSolution("SINGLE", { status: SolveStatus.PARTIAL, partialReasons: ["profondeur bornée"] })),
    "un PARTIAL reste utilisable — à condition d'être annoncé");
}

console.log("\n── §92 — ce qui est incohérent n'entre pas dans le magasin");
{
  clearStore();
  const bad = [
    [mkSolution("SINGLE", { solutionId: null }), "solutionId manquant"],
    [{ ...mkSolution("SINGLE"), schemaVersion: 999 }, "schéma inconnu"],
    [{ ...mkSolution("SINGLE"), source: "MAGIQUE" }, "provenance inventée"],
    [{ ...mkSolution("SINGLE"), status: "PEUT-ÊTRE" }, "statut inventé"],
    [mkSolution("SINGLE", { strategy: null }), "statut annonçant une stratégie absente"],
    [mkSolution("SINGLE", { selectedBetSpecs: [] }), "aucun sizing retenu"],
  ];
  for (const [sol, why] of bad) {
    const v = validateSolution(sol);
    ok(!v.ok, `refusé : ${why}`);
    const r = saveSolution(sol);
    ok(!r.ok, `non stocké : ${why}`);
  }
  eq(storeSize(), 0, "après six refus, le magasin est toujours vide");

  /* §93 — une distribution non normalisée est un bug, pas un arrondi. */
  const denorm = mkSolution("SINGLE");
  denorm.strategy.nodes[""].normalization = { ok: false, sum: 1.4, problems: ["somme = 1.4"] };
  ok(!validateSolution(denorm).ok, "distribution non normalisée → refusée");

  /* §55 — un badge sans ses paramètres. */
  const faussetICM = { ...mkSolution("SINGLE"), evaluationModel: EvaluationModel.ICM, icmParams: null };
  const v = validateSolution(faussetICM);
  ok(!v.ok && v.problems.some(p => /ICM/.test(p)), "§55 — badge ICM sans paramètres → refusé");
}

console.log("\n── §28 — UN état, QUATRE solutions (normalisation)");
{
  clearStore();
  for (const c of ["FULL", "ADVANCED", "SIMPLE", "SINGLE"]) {
    const r = saveSolution(mkSolution(c));
    ok(r.ok, `${c} stockée`);
  }
  eq(storeSize(), 4, "quatre solutions");
  eq(complexitiesFor(HASH), ["SINGLE", "SIMPLE", "ADVANCED", "FULL"], "les quatre niveaux sont rattachés au MÊME état, du plus simple au plus complet");
  eq(solutionFamily(HASH).length, 4, "la famille est complète");
  ok(hasSolution(HASH, "SINGLE") && hasSolution(HASH, "FULL"), "chaque niveau est retrouvable");
  const insp = inspectStore();
  eq(insp.states, 1, "l'état de jeu n'est stocké QU'UNE fois — pas quatre copies");
  eq(insp.solutions, 4, "et quatre solutions le référencent");
  eq(insp.byComplexity, { FULL: 1, ADVANCED: 1, SIMPLE: 1, SINGLE: 1 }, "un exemplaire par niveau");

  /* La lecture reconstitue l'état complet malgré la normalisation. */
  const s = getSolution(HASH, "SIMPLE");
  eq(s.street, "RIVER", "l'état est bien re-fusionné à la lecture");
  eq(s.board.length, 5, "board complet");
  ok(s.heroRange && s.heroRange.AA, "la range aussi");
  eq(s.source, SolutionProvenance.POKERFORGE_DATABASE, "et la provenance devient « bibliothèque » (§18)");
}

console.log("\n── §88 — sauver, relire : la solution est identique");
{
  clearStore();
  const orig = mkSolution("SINGLE");
  saveSolution(orig);
  const relu = getSolutionById(orig.solutionId);
  ok(relu, "relue");
  eq(relu.selectedSizes.bets.map(b => b.key), orig.selectedSizes.bets.map(b => b.key), "mêmes sizings retenus");
  eq(relu.simplificationMetrics.absoluteEVLoss, orig.simplificationMetrics.absoluteEVLoss, "même perte d'EV");
  eq(relu.strategy.nodes[""].aggregate, orig.strategy.nodes[""].aggregate, "mêmes fréquences");
  eq(relu.seed, orig.seed, "même graine — la solution est reproductible (§15)");
  eq(relu.convergence.nashConv, orig.convergence.nashConv, "même convergence");
  ok(relu.canonical === "canon", "la chaîne canonique voyage avec la solution — le hash est vérifiable (§19)");
}

console.log("\n── §80 — une solution d'un moteur périmé n'est PAS servie");
{
  clearStore();
  const vieux = mkSolution("SINGLE");
  vieux.sizingEngineVersion = "0.9.0";
  saveSolution(vieux);
  eq(getSolutionById(vieux.solutionId), null, "elle n'est pas servie");
  ok(storeStatus.staleDropped > 0, "et le refus est comptabilisé");

  const inspecte = getSolutionById(vieux.solutionId, { allowStale: true });
  ok(inspecte && inspecte.isStale, "elle reste inspectable pour diagnostic");
  ok(inspecte.stale.some(s => /moteur de sizing/.test(s)), "avec le motif exact de péremption");

  ok(!isCurrentEngine(vieux), "isCurrentEngine dit non");
  ok(isCurrentEngine(mkSolution("SINGLE")), "et oui pour une solution courante");
  eq(stalenessOf(mkSolution("SINGLE")), [], "aucune péremption pour une solution courante");
  ok(stalenessOf({ ...vieux, solverVersion: "vieux-solveur" }).length >= 2, "les péremptions cumulées sont listées");
}

console.log("\n── suppression et vidage");
{
  clearStore();
  const s = mkSolution("SINGLE");
  saveSolution(s);
  eq(storeSize(), 1, "une solution");
  ok(deleteSolution(s.solutionId), "supprimée");
  eq(storeSize(), 0, "magasin vide");
  ok(!deleteSolution("inconnu"), "supprimer un inconnu ne ment pas sur le résultat");
  saveSolution(mkSolution("FULL"));
  clearStore();
  eq(storeSize(), 0, "vidage complet");
  eq(inspectStore().states, 0, "y compris les états partagés");
}

console.log("\n── §22 — un statut FAILED ne produit aucune stratégie");
{
  const echoue = mkSolution("SINGLE", { status: SolveStatus.FAILED, strategy: null, selectedBetSpecs: [] });
  const v = validateSolution(echoue);
  ok(v.ok, "une solution FAILED sans stratégie est structurellement VALIDE — c'est un constat d'échec honnête");
  ok(!mayClaimSolved(echoue), "mais elle ne peut pas être présentée comme une stratégie");
}

console.log(`\n✅ PFASE magasin de solutions (§17/§18/§28/§80/§88) — ${passed} assertions OK\n`);
