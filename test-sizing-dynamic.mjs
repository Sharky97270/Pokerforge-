/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-dynamic — PFASE §9, §10, §11, §16, §61, §62, §86

   CE QUE CE FICHIER PROUVE, ET POURQUOI IL INJECTE UN FAUX SOLVEUR

   §61 demande des « fixtures avec EV connues ». La raison est méthodologique :
   si la sélection n'était testée qu'à travers un vrai solve CFR, un mauvais
   choix serait indiscernable d'un bruit d'échantillonnage. En fixant les EV, on
   teste la LOGIQUE DE SÉLECTION seule. Le vrai solveur est éprouvé ailleurs
   (test-sizing-pipeline.mjs, et toute la suite `test:certify`).

   Les fixtures sont construites pour piéger l'erreur que §10 interdit
   explicitement — « ne pas sélectionner simplement les N meilleures tailles
   indépendantes » :

       33 seul  12.41        {33,75}   12.52
       75 seul  12.48        {33,150}  12.55   ← LA MEILLEURE PAIRE
      150 seul  12.31        {75,150}  12.50
                             {33,75,150} 12.56 (référence)

   75 est le meilleur sizing SEUL, mais la meilleure PAIRE ne le contient pas :
   33 et 150 se complètent, 33 et 75 font double emploi. Un moteur qui prendrait
   « les deux meilleurs » retiendrait {33,75} et perdrait 0.04 bb au lieu de 0.01.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { optimizeBettingTree, createEvaluationCache } from "./src/sizing/dynamicOptimizer.js";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { potSizing, jamSizing, specKey } from "./src/sizing/sizingSpec.js";
import { combinations, allSubsetsUpTo, subsetId, planStageOne, planStageTwo, referenceEntry, combinatorialSize } from "./src/sizing/combinationPlanner.js";
import { simplificationMetrics, selectUnderTolerance, actionLoss, checkStrategyNormalization, evForPlayer } from "./src/sizing/metrics.js";
import { SolveStatus } from "./src/sizing/config.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 1e-6) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

/* ── État de référence (les valeurs n'importent pas : le solveur est simulé) ── */
const STATE = normalizeGameState({
  gameType: "CASH", street: "RIVER", board: [12, 25, 3, 40, 7], blinds: { sb: 0.5, bb: 1 },
  players: [
    { id: "h", position: "BB", stack: 94, committedStreet: 0, isHero: true },
    { id: "v", position: "BTN", stack: 94, committedStreet: 0 },
  ],
  deadPot: 12, actorId: "h",
}).state;
const RANGE = { AA: { r: 100, c: 0, f: 0 }, KK: { r: 0, c: 100, f: 0 }, QQ: { r: 0, c: 100, f: 0 } };

/* ── LE FAUX SOLVEUR ─────────────────────────────────────────────────────
   Il ne calcule rien : il lit une table. `solveCount` compte les appels, ce qui
   permet de vérifier le cache et le budget. */
const EV_TABLE = {
  "pot:0.33": 12.41,
  "pot:0.75": 12.48,
  "pot:1.5": 12.31,
  "pot:0.33+pot:0.75": 12.52,
  "pot:0.33+pot:1.5": 12.55,
  "pot:0.75+pot:1.5": 12.50,
  "pot:0.33+pot:0.75+pot:1.5": 12.56,
};
let solveCount = 0;
function fakeSolver({ treeSpec }) {
  solveCount++;
  /* En restriction asymétrique (le défaut), le sous-ensemble étudié est celui
     du joueur 0 ; `betSpecs` porte le même ensemble. */
  const specs = (treeSpec.betSpecsByPlayer ? treeSpec.betSpecsByPlayer[0] : treeSpec.betSpecs) || [];
  const key = specs.map(specKey).sort().join("+");
  const ev = EV_TABLE[key];
  if (ev == null) return { ok: false, status: SolveStatus.FAILED, reason: `fixture absente pour « ${key} »`, ev: null, elapsedMs: 1 };
  return {
    ok: true, status: SolveStatus.COMPLETE, ev, partialReasons: [],
    /* `sampled:false` ⇒ pas de sondage de bruit, pas d'escalade : la fixture est
       exacte par construction, on veut mesurer la sélection, pas la convergence. */
    solution: { sampled: false, ev, iters: 1, tree: {}, utility: { zeroSum: true } },
    convergence: { iterations: 1, elapsedMs: 1, nashConv: 0, note: null, sampled: false, completed: true },
    instrumentation: { elapsedMs: 1 },
  };
}
const CANDIDATES = [potSizing(0.33), potSizing(0.75), potSizing(1.5)];
const run = (over = {}) => {
  solveCount = 0;
  return optimizeBettingTree({
    state: STATE, heroRange: RANGE, villainRange: RANGE,
    mode: "DYNAMIC", userBetSpecs: CANDIDATES, userRaiseSpecs: [],
    evaluationConfig: { maxIterations: 100, maxCombos: 100, seed: 1, autoEscalate: false, convergenceProbe: false },
    noiseProbeSeeds: 0, solveFn: fakeSolver, cache: createEvaluationCache(),
    ...over,
  });
};

console.log("\n── §11 — les combinaisons sont exactes et déterministes");
{
  eq(combinations([1, 2, 3], 2), [[1, 2], [1, 3], [2, 3]], "C(3,2) en ordre lexicographique");
  eq(combinations([1, 2, 3], 1).length, 3, "C(3,1)");
  eq(combinations([1, 2, 3], 4), [], "k > n → aucune combinaison");
  eq(allSubsetsUpTo([1, 2, 3], 2).length, 3 + 3, "sous-ensembles de taille 1..2 = 6");
  eq(subsetId(["b", "a"], []), subsetId(["a", "b"], []), "{a,b} et {b,a} portent le MÊME identifiant");
  ok(subsetId(["a"], ["r"]) !== subsetId(["a"], []), "les relances entrent dans l'identifiant");
  const sz = combinatorialSize({ nBets: 12, nRaises: 12, complexity: "ADVANCED" });
  eq(sz.total, (12 + 66 + 220) * (12 + 66), "la taille combinatoire théorique est calculée, pas devinée");
  ok(sz.total > 20000, `sans plafonnement, ADVANCED sur 12 candidats coûterait ${sz.total} solves — d'où le budget §11`);
}

console.log("\n── §9 — SINGLE retient le meilleur sizing SEUL");
{
  const r = run({ complexity: "SINGLE" });
  ok(r.ok, "l'optimisation aboutit");
  eq(r.selected.betKeys, ["pot:0.75"], "le meilleur sizing seul est 75% (12.48)");
  near(r.reference.ev, 12.56, "l'EV de référence est celle de l'arbre complet");
  near(r.selected.metrics.absoluteEVLoss, 12.56 - 12.48, "perte d'EV = référence − retenu");
  near(r.selected.metrics.evLossPotPct, ((12.56 - 12.48) / 12) * 100, "perte rapportée au pot", 1e-3);
  eq(r.selected.complexityCost, 1, "un seul sizing retenu");
  ok(r.selected.distinguishable, "la perte dépasse le plancher de bruit (nul ici : fixture exacte)");
}

console.log("\n── §10 — SIMPLE évalue les SOUS-ENSEMBLES, pas les meilleurs isolés");
{
  const r = run({ complexity: "SIMPLE" });
  ok(r.ok, "l'optimisation aboutit");
  eq(r.selected.betKeys.slice().sort(), ["pot:0.33", "pot:1.5"], "la meilleure PAIRE est {33,150} — pas {33,75}, la paire des deux meilleurs isolés");
  near(r.selected.metrics.absoluteEVLoss, 12.56 - 12.55, "perte 0.01 bb", 1e-9);

  /* Preuve explicite de l'erreur évitée. */
  const topTwoIndividually = ["pot:0.33", "pot:0.75"];
  const evTopTwo = EV_TABLE[topTwoIndividually.slice().sort().join("+")];
  ok(12.55 > evTopTwo, `la paire retenue (12.55) bat la paire des deux meilleurs isolés (${evTopTwo})`);
  const chosen = r.ranking.find(e => e.betKeys.length === 2 && e.betKeys.includes("pot:0.75") && e.betKeys.includes("pot:0.33"));
  ok(chosen && chosen.ev === evTopTwo, "la paire {33,75} a bien été ÉVALUÉE, et écartée sur mesure — pas ignorée");
}

console.log("\n── §5 — ADVANCED peut aller jusqu'à trois sizings");
{
  const r = run({ complexity: "ADVANCED" });
  ok(r.ok, "l'optimisation aboutit");
  eq(r.selected.betKeys.length, 3, "les trois sizings sont retenus (12.56 = la référence)");
  near(r.selected.metrics.absoluteEVLoss, 0, "perte nulle : l'arbre retenu EST la référence", 1e-9);
}

console.log("\n── §5 — FULL ne simplifie rien");
{
  const r = run({ complexity: "FULL" });
  ok(r.ok, "l'optimisation aboutit");
  eq(r.selected.betKeys.length, 3, "tous les candidats sont conservés");
  near(r.selected.metrics.absoluteEVLoss, 0, "perte nulle par définition");
  eq(r.evaluations.length, 0, "aucun sous-ensemble n'a même été évalué");
  ok(/aucune simplification/i.test(r.planner.note), "et la raison est écrite");
}

console.log("\n── §4 — FIXED résout l'arbre fourni tel quel");
{
  const r = run({ mode: "FIXED" });
  ok(r.ok, "l'optimisation aboutit");
  eq(r.selected.betKeys.length, 3, "aucun sizing n'est supprimé");
  eq(r.complexity, "FULL", "FIXED implique la complexité FULL");
  ok(/FIXED/.test(r.planner.note), "et le rapport le dit");
}

console.log("\n── §86 — CRITÈRE DYNAMIC : changer les candidats change le résultat");
{
  /* « Dynamic est terminé uniquement si modifier les candidats peut réellement
     changer le sous-arbre retenu, la stratégie et l'EV. Le simple masquage de
     boutons n'est pas du Dynamic Sizing. » */
  const avec150 = run({ complexity: "SINGLE", userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)] });
  const sans75 = run({ complexity: "SINGLE", userBetSpecs: [potSizing(0.33), potSizing(1.5)] });
  eq(avec150.selected.betKeys, ["pot:0.75"], "avec 75% dans les candidats, c'est lui qui est retenu");
  eq(sans75.selected.betKeys, ["pot:0.33"], "en le retirant, le moteur retient 33% — un AUTRE sous-arbre");
  ok(avec150.reference.ev !== sans75.reference.ev, "et l'EV de référence change aussi");
  ok(avec150.selected.metrics.absoluteEVLoss !== sans75.selected.metrics.absoluteEVLoss, "ainsi que la perte d'EV mesurée");
}

console.log("\n── §62 — l'ORDRE des candidats ne change pas le résultat");
{
  const a = run({ complexity: "SIMPLE", userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)] });
  const b = run({ complexity: "SIMPLE", userBetSpecs: [potSizing(1.5), potSizing(0.33), potSizing(0.75)] });
  const c = run({ complexity: "SIMPLE", userBetSpecs: [potSizing(0.75), potSizing(1.5), potSizing(0.33)] });
  eq(a.selected.betKeys.slice().sort(), b.selected.betKeys.slice().sort(), "ordre 2 → même sélection");
  eq(a.selected.betKeys.slice().sort(), c.selected.betKeys.slice().sort(), "ordre 3 → même sélection");
  near(a.selected.ev, b.selected.ev, "même EV");
  near(a.selected.ev, c.selected.ev, "même EV");
  /* Cohérence de classement : si 33 bat 150 en solo, le classement doit le dire,
     quel que soit l'ordre d'entrée. */
  const rank = (r) => r.evaluations.filter(e => e.stage === 1 && e.dimension === "bet" && e.ok)
    .sort((x, y) => y.ev - x.ev).map(e => e.betKeys[0]);
  eq(rank(a), rank(b), "le classement individuel est stable");
  eq(rank(a), ["pot:0.75", "pot:0.33", "pot:1.5"], "et il reflète les EV des fixtures");
}

console.log("\n── §20 — le cache évite les re-solves, sans confondre deux arbres");
{
  solveCount = 0;
  const cache = createEvaluationCache();
  const base = {
    state: STATE, heroRange: RANGE, villainRange: RANGE, mode: "DYNAMIC",
    userBetSpecs: CANDIDATES, userRaiseSpecs: [], complexity: "SIMPLE",
    evaluationConfig: { maxIterations: 100, maxCombos: 100, seed: 1, autoEscalate: false, convergenceProbe: false },
    noiseProbeSeeds: 0, solveFn: fakeSolver, cache,
  };
  const r1 = optimizeBettingTree(base);
  const solves1 = solveCount;
  const r2 = optimizeBettingTree(base);
  const solves2 = solveCount - solves1;
  ok(solves1 > 0, `premier passage : ${solves1} solves`);
  eq(solves2, 0, "second passage identique : AUCUN solve (tout vient du cache)");
  eq(r1.selected.betKeys.slice().sort(), r2.selected.betKeys.slice().sort(), "et la sélection est identique");
  /* Le nombre de solves distincts doit correspondre aux sous-arbres distincts :
     3 singletons + 3 paires + 1 référence = 7. */
  eq(solves1, 7, "3 sizings seuls + 3 paires + la référence = 7 solves distincts, aucun doublon");
}

console.log("\n── §16 — la stratégie la plus SIMPLE sous une tolérance");
{
  const strict = run({ complexity: "ADVANCED", maxAcceptableEVLoss: 0.001 });
  eq(strict.selected.betKeys.length, 3, "tolérance 0.001 bb : seule la référence tient");
  ok(strict.tolerance.satisfied, "et la tolérance est tenue");

  const souple = run({ complexity: "ADVANCED", maxAcceptableEVLoss: 0.02 });
  eq(souple.selected.betKeys.slice().sort(), ["pot:0.33", "pot:1.5"], "tolérance 0.02 bb : deux sizings suffisent");
  eq(souple.selected.complexityCost, 2, "et c'est la solution la plus SIMPLE qui les tient");
  ok(souple.tolerance.satisfied, "tolérance tenue");

  const impossible = run({ complexity: "SINGLE", maxAcceptableEVLoss: 0.001 });
  ok(!impossible.tolerance.satisfied, "tolérance 0.001 bb inatteignable en Single Size");
  ok(/aucune simplification ne tient/i.test(impossible.tolerance.note), "et le moteur le DIT plutôt que de prétendre l'avoir tenue");
  eq(impossible.selected.betKeys, ["pot:0.75"], "il rend tout de même la meilleure option");
}

console.log("\n── §22 — un échec de la référence fait échouer l'optimisation");
{
  const r = optimizeBettingTree({
    state: STATE, heroRange: RANGE, villainRange: RANGE, mode: "DYNAMIC",
    userBetSpecs: [potSizing(0.33), potSizing(0.9)],   // « 0.9 » n'est pas dans la table
    userRaiseSpecs: [], complexity: "SINGLE",
    evaluationConfig: { seed: 1, autoEscalate: false, convergenceProbe: false }, noiseProbeSeeds: 0,
    solveFn: fakeSolver, cache: createEvaluationCache(),
  });
  ok(!r.ok, "aucune solution n'est fabriquée");
  eq(r.status, SolveStatus.FAILED, "le statut est FAILED");
  ok(/référence non résolu/.test(r.reason), "et la raison est explicite");
}

console.log("\n── §59 — l'annulation est propre");
{
  let n = 0;
  const aborting = { get aborted() { return n++ > 2; } };
  const r = optimizeBettingTree({
    state: STATE, heroRange: RANGE, villainRange: RANGE, mode: "DYNAMIC",
    userBetSpecs: CANDIDATES, userRaiseSpecs: [], complexity: "SIMPLE",
    evaluationConfig: { seed: 1, autoEscalate: false, convergenceProbe: false }, noiseProbeSeeds: 0,
    solveFn: fakeSolver, cache: createEvaluationCache(), signal: aborting,
  });
  ok(!r.ok, "une optimisation annulée ne rend pas de solution");
  eq(r.status, SolveStatus.CANCELLED, "elle est marquée CANCELLED, distincte d'un échec");
}

console.log("\n── §14 — les métriques refusent les ratios trompeurs");
{
  const m1 = simplificationMetrics({ referenceEV: 18.420, simplifiedEV: 18.392, pot: 20 });
  near(m1.absoluteEVLoss, 0.028, "perte absolue = 0.028 bb", 1e-9);
  near(m1.retainedEV, 18.392 / 18.420, "EV conservée définie quand la référence est franchement positive", 1e-6);
  near(m1.evLossPotPct, (0.028 / 20) * 100, "perte rapportée au pot", 1e-6);

  /* LE PIÈGE NOMMÉ AU §14 : référence négative → « EV conservée » de 112 %. */
  const m2 = simplificationMetrics({ referenceEV: -0.40, simplifiedEV: -0.45, pot: 12 });
  near(m2.absoluteEVLoss, 0.05, "la perte reste juste", 1e-9);
  eq(m2.retainedEV, null, "« EV conservée » n'est PAS calculée sur une référence négative");
  ok(/pas de définition utile/i.test(m2.retainedEVNote), "et l'on dit pourquoi");

  const m3 = simplificationMetrics({ referenceEV: 0.001, simplifiedEV: 0.0005, pot: 12 });
  eq(m3.relativeEVLoss, null, "aucun ratio sur une référence quasi nulle");
  ok(/trop proche de zéro/i.test(m3.relativeEVLossNote), "et la raison est écrite");

  const m4 = simplificationMetrics({ referenceEV: 12.0, simplifiedEV: 12.1, pot: 12 });
  ok(m4.negativeLoss, "une perte négative est SIGNALÉE");
  ok(/pas comme un gain/i.test(m4.negativeLossNote), "et interprétée comme non mesurable, pas comme un gain");

  const m5 = simplificationMetrics({ referenceEV: 1, simplifiedEV: null, pot: 12 });
  eq(m5.absoluteEVLoss, null, "sans EV des deux côtés, aucune perte n'est calculée");
}

console.log("\n── §15 — l'écart d'EV entre sizings vient des mesures");
{
  const r = actionLoss({ "pot:0.33": 12.41, "pot:0.75": 12.48, "pot:1.5": 12.31 });
  eq(r.best, "pot:0.75", "le meilleur est identifié");
  eq(r.actions[0].delta, 0, "le meilleur a un écart nul");
  near(r.actions[1].delta, -0.07, "33% perd 0.07 bb face au meilleur", 1e-9);
  near(r.actions[2].delta, -0.17, "150% en perd 0.17", 1e-9);
  ok(r.actions.every((a, i) => i === 0 || a.ev <= r.actions[i - 1].ev), "le classement est décroissant");
  eq(actionLoss({}).actions, [], "aucune EV → aucun classement inventé");
}

console.log("\n── §93 — une distribution doit sommer à 1");
{
  ok(checkStrategyNormalization({ X: 0.6, B: 0.4 }).ok, "0.6 + 0.4 = 1");
  ok(!checkStrategyNormalization({ X: 0.6, B: 0.6 }).ok, "1.2 est refusé");
  ok(!checkStrategyNormalization({}).ok, "une distribution vide est refusée");
  ok(checkStrategyNormalization({ X: 0.6, B: 0.4000001 }).ok, "une tolérance numérique explicite est admise");
  ok(!checkStrategyNormalization({ X: 1.2, B: -0.2 }).ok, "une fréquence négative est refusée");
}

console.log("\n── §9 — la convention d'EV est unique et documentée");
{
  const zeroSum = { ev: 2.5, utility: { zeroSum: true } };
  eq(evForPlayer(zeroSum, 0), 2.5, "EV du joueur 0 telle quelle");
  eq(evForPlayer(zeroSum, 1), -2.5, "en chip-EV, le joueur 1 a l'opposé");
  const icm = { ev: 2.5, utility: { zeroSum: false } };
  eq(evForPlayer(icm, 1), null, "sous ICM le jeu n'est pas à somme nulle : l'EV du joueur 1 n'est PAS déduite");
  eq(evForPlayer(null, 0), null, "sans solution, pas d'EV");
}

console.log("\n── §11 — le plan est déterministe et le budget est tracé");
{
  const bets = CANDIDATES.map(s => ({ key: specKey(s), spec: s }));
  const s1 = planStageOne({ betCandidates: bets, raiseCandidates: [] });
  eq(s1.length, 3, "un sous-ensemble par candidat à l'étage 1");
  eq(planStageOne({ betCandidates: bets, raiseCandidates: [] }).map(e => e.id), s1.map(e => e.id), "déterminisme du plan");

  const s2 = planStageTwo({
    betCandidates: bets, raiseCandidates: [],
    rankedBetKeys: ["pot:0.75", "pot:0.33", "pot:1.5"], complexity: "SIMPLE",
  });
  eq(s2.entries.length, 3 + 3, "SIMPLE → 3 singletons + 3 paires");
  ok(!s2.truncated, "sans dépassement de budget, rien n'est tronqué");

  const serre = planStageTwo({
    betCandidates: bets, raiseCandidates: [],
    rankedBetKeys: ["pot:0.75", "pot:0.33", "pot:1.5"], complexity: "SIMPLE",
    budget: { maxBetSubsets: 2 },
  });
  ok(serre.truncated, "un budget serré tronque");
  ok(serre.pruned.length > 0, "et la raison est consignée — jamais un oubli silencieux");
  ok(/budget/.test(serre.pruned[0].reason), "avec le motif « budget »");

  const ref = referenceEntry({ betCandidates: bets, raiseCandidates: [] });
  eq(ref.betKeys.length, 3, "la référence contient TOUS les candidats");
  eq(ref.stage, 0, "et se distingue des étages d'évaluation");
}

console.log(`\n✅ PFASE sélection dynamique (§9/§10/§11/§16/§61/§62/§86) — ${passed} assertions OK\n`);
