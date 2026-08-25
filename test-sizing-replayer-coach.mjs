/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-replayer-coach — PFASE §47, §48, §49, §50, §51, §52, §53

   Trois surfaces, une même exigence : ne jamais produire un nombre qui n'a pas
   été mesuré.

     §49/§50  le Replayer confronte le coup joué aux solutions Single/Simple/Full,
              sans jamais prêter au sizing joué l'EV d'un sizing voisin
     §51      le TYPE de solution qui a servi au verdict reste attaché au verdict
     §47/§48  le Coach reçoit des faits, chaque rubrique portant sa disponibilité
     §52/§53  les textures décrivent le board ; elles ne décident de rien
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { boardTexture, matchesTexture, aggregateSolutions, sprBucket } from "./src/sizing/boardTexture.js";
import { buildCoachPayload, coachFactSheet } from "./src/sizing/coachPayload.js";
import { compareReplayDecision, formatReplayComparison, analyzeHandHistory } from "./src/sizing/replayerBridge.js";
import { buildSolution, SolutionProvenance } from "./src/sizing/solutionSchema.js";
import { saveSolution, clearStore } from "./src/sizing/solutionStore.js";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { gameStateHash, solutionId } from "./src/sizing/canonicalHash.js";
import { potSizing, jamSizing } from "./src/sizing/sizingSpec.js";
import { SolveStatus } from "./src/sizing/config.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

console.log("\n── §53 — les textures DÉCRIVENT, elles ne décident de rien");
{
  const mono = boardTexture(["As", "7s", "2s"]);
  ok(mono.monotone, "As7s2s est monotone");
  ok(mono.flushPossible, "et la couleur est possible");
  ok(!mono.rainbow, "il n'est pas rainbow");
  ok(mono.aceHigh, "hauteur As");
  ok(mono.tags.includes("monotone") && mono.tags.includes("ace-high"), "étiquettes cohérentes");

  const rainbow = boardTexture(["As", "7d", "2c"]);
  ok(rainbow.rainbow, "As7d2c est rainbow");
  ok(rainbow.disconnected, "et déconnecté");
  ok(!rainbow.flushPossible, "aucune couleur possible");

  const paired = boardTexture(["9h", "9d", "4c"]);
  ok(paired.paired && !paired.trips, "99x est apparié, pas brelan");
  const trips = boardTexture(["9h", "9d", "9c"]);
  ok(trips.trips, "999 est un brelan au board");
  const dbl = boardTexture(["9h", "9d", "4c", "4s"]);
  ok(dbl.doublePaired, "9944 est doublement apparié");

  const conn = boardTexture(["9h", "8d", "7c"]);
  ok(conn.connected && conn.straightPossible, "987 est connecté et permet une quinte");
  const low = boardTexture(["5h", "3d", "2c"]);
  ok(low.lowBoard, "532 est un board bas");
  ok(low.straightPossible, "et permet une quinte");

  eq(boardTexture(["As", "As", "2c"]), null, "une carte dupliquée n'a pas de texture — le board est impossible");
  eq(boardTexture([]), null, "un board vide non plus");
  eq(boardTexture(["Zz", "7d", "2c"]), null, "une carte illisible non plus");

  /* LE POINT DE FOND : aucune propriété n'est une consigne. */
  const clefs = Object.keys(rainbow);
  ok(!clefs.some(k => /size|bet|freq|action|reco/i.test(k)),
    "aucune propriété de texture ne porte un sizing, une fréquence ou une action");
}

console.log("\n── §52 — les textures servent au filtrage et à l'agrégation");
{
  ok(matchesTexture(["As", "7s", "2s"], { monotone: true }), "filtre monotone");
  ok(!matchesTexture(["As", "7d", "2c"], { monotone: true }), "un board rainbow n'y répond pas");
  ok(matchesTexture(["9h", "8d", "7c"], { tags: ["connected", "straight-possible"] }), "filtre par étiquettes cumulées");
  ok(!matchesTexture(["9h", "8d", "7c"], { tags: ["monotone"] }), "une étiquette absente exclut");
  eq(sprBucket(0.5), "spr<1", "tranche SPR basse");
  eq(sprBucket(20), "spr 15+", "tranche SPR haute");
  eq(sprBucket(null), "spr-inconnu", "SPR inconnu nommé comme tel");
}

/* ── Fabrique de solutions valides pour les tests de rejeu ───────────────── */
const STATE_IN = {
  gameType: "CASH", street: "RIVER", board: [12, 25, 3, 40, 7], blinds: { sb: 0.5, bb: 1 },
  players: [
    { id: "h", position: "BB", stack: 40, committedStreet: 0, committedTotal: 6, isHero: true },
    { id: "v", position: "BTN", stack: 40, committedStreet: 0, committedTotal: 6 },
  ],
  deadPot: 12, actorId: "h",
  actionHistory: [{ street: "PREFLOP", position: "BTN", actionType: "RAISE", size: 3 },
    { street: "PREFLOP", position: "BB", actionType: "CALL", size: 3 }],
};
const RANGE = { AA: { r: 0, c: 100, f: 0 }, AKs: { r: 0, c: 100, f: 0 }, KK: { r: 0, c: 100, f: 0 } };
const STUDY = { mode: "AUTOMATIC", betSizes: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], raiseSizes: [] };
const CFG = { maxIterations: 400, maxCombos: 200 };
const state = normalizeGameState(STATE_IN).state;
const HASH = gameStateHash({ state, heroRange: RANGE, villainRanges: [RANGE], treeSpec: STUDY, solverConfig: CFG }).hash;

function seed(complexity, sizings, over = {}) {
  const nonJam = sizings.filter(s => s.type !== "jam");
  const labels = ["X", ...sizings.map((s, i) => (s.type === "jam" ? "J" : (nonJam.length === 1 ? "B" : "B" + i)))];
  const freqs = labels.map((_, i) => (i === 0 ? 1 - 0.25 * (labels.length - 1) : 0.25));
  const sol = buildSolution({
    solutionId: solutionId(HASH, complexity), gameStateHash: HASH, canonical: "c",
    state, heroRange: RANGE, villainRanges: [RANGE],
    mode: "AUTOMATIC", complexity,
    candidates: { bets: [{ spec: potSizing(0.33) }, { spec: potSizing(0.75) }, { spec: potSizing(1.5) }], raises: [], dropped: [] },
    selectedBetSpecs: sizings, selectedRaiseSpecs: [],
    referenceBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], referenceRaiseSpecs: [],
    treeSpec: STUDY,
    strategy: {
      coversStreetsAhead: false, classes: ["AA", "AKs", "KK"], nodeCount: 1,
      nodes: {
        "": {
          path: [], nodeId: 0, player: 0, actions: labels,
          actionTypes: Object.fromEntries(labels.map(l => [l, l === "X" ? "CHECK" : l === "J" ? "ALL_IN" : "BET"])),
          sizings: Object.fromEntries(labels.map((l, i) => {
            if (i === 0) return [l, { specKey: null, specLabel: null, spec: null, additionalBb: 0, toBb: 0, potFraction: 0 }];
            const sp = sizings[i - 1];
            const amt = sp.type === "jam" ? 40 : Math.round(12 * sp.value * 100) / 100;
            return [l, { specKey: sp.type === "jam" ? "jam" : `pot:${sp.value}`, specLabel: sp.type === "jam" ? "JAM" : `${sp.value * 100}%`, spec: sp, additionalBb: amt, toBb: amt, potFraction: sp.type === "jam" ? null : sp.value }];
          })),
          aggregate: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])),
          byClass: { AKs: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])) },
          potBb: 12, toCallBb: 0, normalization: { ok: true, sum: 1, problems: [] },
        },
      },
    },
    metrics: { referenceEV: 1.2, simplifiedEV: 1.14, absoluteEVLoss: 0.06, relativeEVLoss: 0.05, evLossPotPct: 0.5, retainedEV: 0.95 },
    actionRanking: { best: "pot:0.33", bestEV: 1.14, actions: [
      { label: "pot:0.33", displayLabel: "pot:0.33", ev: 1.14, delta: 0, isBest: true },
      { label: "pot:0.75", displayLabel: "pot:0.75", ev: 1.09, delta: -0.05, isBest: false },
      { label: "pot:1.5", displayLabel: "pot:1.5", ev: 0.97, delta: -0.17, isBest: false },
    ] },
    convergence: { iterations: 400, elapsedMs: 500, nashConv: 0.009, note: null, sampled: false, completed: true },
    status: SolveStatus.COMPLETE, partialReasons: [],
    provenance: SolutionProvenance.POKERFORGE_SOLVER,
    evaluationConfig: { maxIterations: 200 }, finalSolveConfig: CFG,
    optimizeFor: 0, seed: 11, solveId: "SHK-R",
    ...over,
  });
  sol.distinguishable = true;
  sol.measurement = { floor: 0.012, seedNoise: 0, convergenceDrift: 0.005, escalations: 1, iterations: 400, probes: [], sampled: false };
  const r = saveSolution(sol);
  if (!r.ok) throw new Error("solution refusée : " + r.problems.join(", "));
  return sol;
}

console.log("\n── §49 — le rejeu confronte le coup joué aux trois niveaux");
{
  clearStore();
  seed("SINGLE", [potSizing(0.75)]);
  seed("SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  seed("FULL", [potSizing(0.33), potSizing(0.75), potSizing(1.5)]);

  const cmp = compareReplayDecision({
    gameStateHash: HASH, handClass: "AKs",
    played: { actionType: "BET", sizeBb: 9 },   // 75 % de 12 = 9bb : dans l'arbre
  });
  ok(cmp.ok, "comparaison produite");
  eq(cmp.rows.length, 3, "trois niveaux confrontés");
  eq(cmp.rows.map(r => r.complexity), ["SINGLE", "SIMPLE", "FULL"], "du plus simple au plus complet");
  eq(cmp.rows[0].actions.length, 2, "Single Size : check + une mise");
  eq(cmp.rows[1].actions.length, 3, "Simple : check + deux mises");
  eq(cmp.rows[2].actions.length, 4, "Full : check + trois mises");
  ok(cmp.rows.every(r => r.inTree), "le sizing joué (9bb) existe aux trois niveaux");
  eq(cmp.rows[0].matched.specLabel, "75%", "et il est identifié");

  const lignes = formatReplayComparison(cmp);
  ok(lignes[0].startsWith("Joué : BET 9bb"), `première ligne : « ${lignes[0]} »`);
  ok(lignes.some(l => l.startsWith("SINGLE :")), "une ligne par niveau");
  ok(lignes.some(l => /EV exacte indisponible/.test(l)), "et l'EV est annoncée indisponible plutôt que fabriquée");
}

console.log("\n── §50 — un sizing non étudié n'hérite JAMAIS de l'EV du voisin");
{
  clearStore();
  seed("SINGLE", [potSizing(0.75)]);
  const cmp = compareReplayDecision({
    gameStateHash: HASH, handClass: "AKs", levels: ["SINGLE"],
    played: { actionType: "BET", sizeBb: 7.44 },   // 62 % de 12 : absent de l'arbre
  });
  const r = cmp.rows[0];
  ok(!r.inTree, "62 % n'est pas dans l'arbre");
  eq(r.verdict, "sizing non étudié", "verdict explicite");
  eq(r.evAvailable, false, "aucune EV attribuée");
  ok(r.nearestStudied, "le sizing étudié le plus proche est cité");
  eq(r.nearestStudied.specLabel, "75%", "c'est 75 %");
  eq(r.nearestStudied.approximate, true, "marqué approximatif");
  ok(/ne s'applique pas au sizing joué/.test(r.nearestStudied.note), "avec l'avertissement complet");
  /* La fréquence du voisin ne doit PAS être présentée comme celle du coup joué. */
  ok(r.matched == null, "aucune correspondance n'est déclarée");

  const lignes = formatReplayComparison(cmp);
  ok(lignes.some(l => /comparaison approximative/.test(l)), "et le résumé le dit aussi");
}

console.log("\n── §37 — un CALL n'est pas un BET, même à montant égal");
{
  clearStore();
  seed("SINGLE", [potSizing(0.75)]);
  const cmp = compareReplayDecision({
    gameStateHash: HASH, handClass: "AKs", levels: ["SINGLE"],
    played: { actionType: "CALL", sizeBb: 9 },
  });
  const r = cmp.rows[0];
  ok(!r.inTree, "aucun CALL à ce nœud (Hero ouvre)");
  ok(/n'existe pas à ce nœud/.test(r.reason || ""), "et c'est le TYPE qui est en cause, pas le montant");
}

console.log("\n── §51 — le type de solution reste attaché au verdict");
{
  clearStore();
  seed("SINGLE", [potSizing(0.75)]);
  seed("FULL", [potSizing(0.33), potSizing(0.75), potSizing(1.5)]);

  const single = analyzeHandHistory({
    complexity: "SINGLE",
    decisions: [{ gameStateHash: HASH, handClass: "AKs", street: "RIVER", played: { actionType: "BET", sizeBb: 9 } }],
  });
  eq(single.complexity, "SINGLE", "le niveau demandé est conservé");
  eq(single.resolved, 1, "une décision comparée");
  eq(single.results[0].verdictSource.complexity, "SINGLE", "et le verdict sait contre quoi il a été rendu");

  const full = analyzeHandHistory({
    complexity: "FULL",
    decisions: [{ gameStateHash: HASH, handClass: "AKs", street: "RIVER", played: { actionType: "BET", sizeBb: 9 } }],
  });
  eq(full.results[0].verdictSource.complexity, "FULL", "un autre niveau donne un autre verdictSource");
  ok(full.results[0].rows[0].actions.length > single.results[0].rows[0].actions.length,
    "et l'arbre confronté n'est pas le même");

  /* Une décision sans solution ne doit PAS gonfler les statistiques. */
  const mixte = analyzeHandHistory({
    complexity: "SINGLE",
    decisions: [
      { gameStateHash: HASH, handClass: "AKs", played: { actionType: "BET", sizeBb: 9 } },
      { gameStateHash: "PFS-INEXISTANT", handClass: "AKs", played: { actionType: "BET", sizeBb: 9 } },
    ],
  });
  eq(mixte.total, 2, "deux décisions fournies");
  eq(mixte.resolved, 1, "une seule comparée");
  eq(mixte.unresolved, 1, "l'autre est comptée comme non résolue");
  ok(/ne comptent dans aucune statistique/.test(mixte.coverageNote), "et le rapport dit que le dénominateur est partiel");
}

console.log("\n── §47 — le Coach reçoit des faits, pas une invitation à broder");
{
  clearStore();
  const sol = seed("SINGLE", [potSizing(0.33)]);
  const p = buildCoachPayload({
    solution: sol, handClass: "AKs",
    heroAction: { actionType: "BET", toBb: 3.96 },
  });
  ok(p.ok, "charge utile produite");
  eq(p.spot.street, "RIVER", "la rue est fournie");
  ok(p.spot.spr > 0, "le SPR aussi");
  eq(p.spot.potType, "SRP", "et le type de pot, dérivé de l'historique");
  ok(p.node && p.node.actions.length === 2, "le nœud et ses actions sont fournis");
  ok(p.provenance.mayClaimSolved, "la solution peut être présentée comme calculée");
  ok(p.provenance.forbidden.length >= 3, "et la liste des interdits accompagne la charge utile");
  ok(p.provenance.forbidden.some(f => /règle générale/.test(f)), "dont l'interdiction des règles générales (§47)");
}

console.log("\n── §48 — les sept rubriques, chacune avec sa disponibilité");
{
  clearStore();
  const sol = seed("SIMPLE", [potSizing(0.33), potSizing(0.75)]);
  const p = buildCoachPayload({ solution: sol, handClass: "AKs" });
  const s = p.sections;
  eq(Object.keys(s), ["whyThisSize", "alternatives", "evCost", "rangeLogic", "boardLogic", "sprLogic", "exploitation"],
    "les sept rubriques du §48");

  ok(s.whyThisSize.supported, "WHY THIS SIZE : disponible");
  eq(s.whyThisSize.data.selected, ["33%", "75%"], "avec les sizings retenus");
  eq(s.whyThisSize.data.comparedAgainst.length, 3, "et ceux contre lesquels ils ont été comparés");

  ok(s.alternatives.supported, "ALTERNATIVES : disponible");
  eq(s.alternatives.data.ranked[0].evGapToBest, 0, "le meilleur a un écart nul");
  ok(s.alternatives.data.ranked[2].evGapToBest < 0, "et les autres un écart négatif MESURÉ");

  ok(s.evCost.supported, "EV COST : disponible");
  eq(s.evCost.data.absoluteEVLossBb, 0.06, "la perte d'EV");
  eq(s.evCost.data.measurementFloorBb, 0.012, "et son plancher de mesure");

  ok(s.boardLogic.supported, "BOARD LOGIC : disponible");
  ok(/n'expliquent aucun sizing par elles-mêmes/.test(s.boardLogic.data.caveat),
    "§53 — avec l'avertissement qui empêche de transformer une texture en règle");

  ok(s.sprLogic.supported, "SPR LOGIC : disponible");
  ok(/ne détermine pas à lui seul le sizing/.test(s.sprLogic.data.note), "avec la même précaution");

  ok(!s.exploitation.supported, "EXPLOITATION : INDISPONIBLE sur une solution GTO");
  ok(/§44/.test(s.exploitation.reason), "et le motif cite la règle");

  ok(s.rangeLogic.supported, "RANGE LOGIC : disponible");
  ok(/heuristiques/.test(s.rangeLogic.data.caveat), "avec la réserve sur des ranges d'entrée estimées");
}

console.log("\n── §0 — sans solution, le Coach n'a rien à dire de stratégique");
{
  const vide = buildCoachPayload({ solution: null });
  ok(!vide.ok, "aucune charge utile");
  const fiche = coachFactSheet(vide);
  ok(/AUCUNE SOLUTION EXPLOITABLE/.test(fiche), "la fiche le dit en clair");
  ok(/aucune fréquence, aucun sizing, aucune EV/.test(fiche), "et interdit explicitement d'en produire");

  clearStore();
  const echoue = seedFailed();
  const p = buildCoachPayload({ solution: echoue });
  ok(!p.ok, "un solve échoué ne produit pas de charge utile stratégique");
  ok(p.failure, "mais le motif d'échec est transmis — l'expliquer est légitime");
}

console.log("\n── la fiche de faits ne contient QUE des faits");
{
  clearStore();
  const sol = seed("SINGLE", [potSizing(0.33)]);
  const fiche = coachFactSheet(buildCoachPayload({ solution: sol, handClass: "AKs" }));
  ok(/PROVENANCE : PF SOLVED/.test(fiche), "la provenance ouvre la fiche");
  ok(/SPOT : RIVER/.test(fiche), "le spot est décrit");
  ok(/EXPLOITATION : INDISPONIBLE/.test(fiche), "une rubbrique absente est annoncée absente");
  ok(/PRÉCISION : exploitabilité 0.009 bb/.test(fiche), "la précision réelle est citée");
  ok(/CONTRAINTE : n'énonce aucun nombre absent de cette fiche/.test(fiche), "et la contrainte clôt la fiche");
  ok(/INTERDIT :/.test(fiche), "les interdits sont répétés dans la fiche elle-même");

  /* Le mot « GTO » n'est pas banni du texte — il apparaît légitimement dans les
     MOTIFS (« les sizings exploitants ne se confondent pas avec les sizings
     GTO »). Ce qui est verrouillé, c'est l'AUTORISATION de l'employer comme
     label de résultat : elle dépend de `mayClaimSolved`, pas du ton. */
  const approx = { ...sol, source: SolutionProvenance.APPROXIMATION, provenanceMeta: { badge: "APPROXIMATE", gtoClaim: false } };
  const pApprox = buildCoachPayload({ solution: approx, handClass: "AKs" });
  ok(!pApprox.provenance.mayClaimSolved, "une APPROXIMATION ne peut pas se revendiquer calculée");
  ok(pApprox.provenance.forbidden.some(f => /employer le mot « GTO »/.test(f)),
    "et la charge utile interdit alors explicitement le mot « GTO »");
  const ficheApprox = coachFactSheet(pApprox);
  ok(/NE PEUT PAS être présentée comme calculée/.test(ficheApprox), "la fiche le met en tête");

  /* Sur une solution réellement calculée, cet interdit ne figure PAS — sinon il
     serait décoratif et perdrait tout sens. */
  ok(!p_solvedForbiddenHasGto(sol), "sur un solve vérifié, l'interdit du mot « GTO » n'est pas ajouté");
}
function p_solvedForbiddenHasGto(sol) {
  const p = buildCoachPayload({ solution: sol, handClass: "AKs" });
  return p.provenance.forbidden.some(f => /employer le mot « GTO »/.test(f));
}

console.log("\n── §52 — l'agrégation est possible sur le format de solution livré");
{
  clearStore();
  const a = seed("SINGLE", [potSizing(0.33)]);
  const agg = aggregateSolutions([a], { groupBy: "tag" });
  ok(agg.length > 0, "des groupes sont produits");
  ok(agg.every(g => typeof g.evLossMean === "number"), "avec la perte d'EV moyenne");
  ok(agg.every(g => Array.isArray(g.sizings)), "et les sizings retenus comptés");
  ok(agg.some(g => g.betFrequencyMean != null), "ainsi que la fréquence de mise agrégée");
  const parSpr = aggregateSolutions([a], { groupBy: "spr" });
  ok(parSpr[0].key.startsWith("spr"), "agrégation par tranche de SPR possible");
  const parPot = aggregateSolutions([a], { groupBy: "potType" });
  eq(parPot[0].key, "SRP", "agrégation par type de pot possible");
}

function seedFailed() {
  const sol = buildSolution({
    solutionId: solutionId(HASH, "ADVANCED"), gameStateHash: HASH, canonical: "c",
    state, heroRange: RANGE, villainRanges: [RANGE],
    mode: "AUTOMATIC", complexity: "ADVANCED",
    candidates: { bets: [], raises: [], dropped: [] },
    selectedBetSpecs: [], selectedRaiseSpecs: [],
    referenceBetSpecs: [], referenceRaiseSpecs: [],
    treeSpec: STUDY, strategy: null, metrics: null,
    convergence: null, status: SolveStatus.FAILED, partialReasons: ["solve interrompu"],
    provenance: SolutionProvenance.POKERFORGE_SOLVER,
    evaluationConfig: {}, finalSolveConfig: {}, optimizeFor: 0,
  });
  return sol;
}

console.log(`\n✅ PFASE Replayer · Coach · textures (§47→§53) — ${passed} assertions OK\n`);
