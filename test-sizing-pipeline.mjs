/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-pipeline — PFASE §101 : ACCEPTANCE TEST MASTER (CASE A → H)

   Ici, AUCUNE fixture : c'est le vrai SharkSolver qui tourne. Les EV ne sont
   donc pas connues d'avance, et les assertions portent sur ce qui doit être
   VRAI quelles que soient les valeurs — la structure du résultat, les relations
   entre niveaux, et l'honnêteté des annonces.

   Les ranges sont volontairement réduites (six classes par camp) : cela rend
   l'énumération de combos EXACTE (aucune abstraction, donc aucun PARTIAL
   parasite) et garde le fichier sous la minute, tout en exerçant exactement le
   même chemin de code que la production.

   Le pipeline complet du §108 est parcouru :
     état → candidats → arbres → solve → comparaison d'EV → sélection
          → arbre final → solve final → solution stockée → rechargée
          → nœud d'entraînement → verdict
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { solveOptimizedTree, solveSolutionFamily, getSolution, getTrainingNode, compareAction, describeSolution, describeFamily } from "./src/sizing/pfase.js";
import { clearStore, storeSize, inspectStore } from "./src/sizing/solutionStore.js";
import { prepareTrainerSpot, solutionActsForSpot } from "./src/sizing/trainerBridge.js";
import { potSizing, geometricSizing, jamSizing, previousBetSizing } from "./src/sizing/sizingSpec.js";
import { SolveStatus, statusYieldsStrategy } from "./src/sizing/config.js";
import { mayClaimSolved } from "./src/sizing/solutionSchema.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* Ranges réduites → énumération exacte, solves rapides. */
const HERO = { AA: { r: 0, c: 100, f: 0 }, KK: { r: 0, c: 100, f: 0 }, AKs: { r: 0, c: 100, f: 0 }, "76s": { r: 0, c: 100, f: 0 }, T9s: { r: 0, c: 100, f: 0 }, "32o": { r: 0, c: 100, f: 0 } };
const VILL = { QQ: { r: 0, c: 100, f: 0 }, JJ: { r: 0, c: 100, f: 0 }, AQs: { r: 0, c: 100, f: 0 }, "98s": { r: 0, c: 100, f: 0 }, "54s": { r: 0, c: 100, f: 0 }, "72o": { r: 0, c: 100, f: 0 } };

const RIVER = [12, 25, 3, 40, 7];           // 5♠ 8♥ 2♣ Q♠ 3♣
const TURN = [12, 25, 3, 40];

const stateInput = ({ street = "RIVER", board = RIVER, stack = 40, pot = 12 } = {}) => ({
  gameType: "CASH", street, board, blinds: { sb: 0.5, bb: 1 },
  players: [
    { id: "h", position: "BB", stack, committedStreet: 0, committedTotal: pot / 2, isHero: true },
    { id: "v", position: "BTN", stack, committedStreet: 0, committedTotal: pot / 2 },
  ],
  deadPot: pot, actorId: "h",
  actionHistory: [{ street: "PREFLOP", position: "BTN", actionType: "RAISE", size: 3 },
    { street: "PREFLOP", position: "BB", actionType: "CALL", size: 3 }],
});

const EVAL = { maxIterations: 200, maxCombos: 0, seed: 5, convergenceTarget: 0.02, maxIterationsCeiling: 800 };
const FINAL = { maxIterations: 600, maxCombos: 0, seed: 5 };

const solve = (over = {}) => solveOptimizedTree({
  stateInput: stateInput(over.spot || {}),
  heroRange: HERO, villainRange: VILL,
  evaluationConfig: EVAL, finalSolveConfig: FINAL,
  ...over,
});

const t0 = Date.now();
clearStore();

console.log("\n══ CASE A — SINGLE ═══════════════════════════════════════════════");
{
  const r = solve({
    mode: "SINGLE",
    userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], userRaiseSpecs: [],
  });
  ok(r.ok, `solve abouti (${r.reason || ""})`);
  ok(statusYieldsStrategy(r.status), `statut exploitable : ${r.status}`);
  const s = r.solution;

  eq(s.selectedSizes.bets.length, 1, "UN seul sizing retenu");
  eq(s.referenceSizes.bets.length, 3, "les trois candidats ont bien servi de référence");
  ok(["33%", "75%", "150%"].includes(s.selectedSizes.bets[0].label), `le sizing retenu vient des candidats : ${s.selectedSizes.bets[0].label}`);

  /* L'EV est ENREGISTRÉE, la perte d'EV aussi (§101 CASE A). */
  ok(typeof s.simplificationMetrics.referenceEV === "number", "EV de référence enregistrée");
  ok(typeof s.simplificationMetrics.simplifiedEV === "number", "EV du sous-arbre retenu enregistrée");
  ok(typeof s.simplificationMetrics.absoluteEVLoss === "number", "perte d'EV enregistrée");
  ok(typeof s.simplificationMetrics.evLossPotPct === "number", "perte rapportée au pot enregistrée");
  ok(typeof s.measurement.floor === "number", "plancher de mesure enregistré");
  ok(typeof s.distinguishable === "boolean", "et l'on sait si la perte est distinguable du bruit");

  /* §85 — les neuf critères d'un Single Size valide. */
  ok(s.candidateSizes.bets.length >= 2, "1. plusieurs candidats");
  ok(r.optimization.evaluations.length >= 3, "2. évaluation réelle de chacun");
  ok(r.optimization.ranking.every(e => typeof e.ev === "number"), "3. comparaison d'EV");
  ok(s.selectedSizes.bets.length === 1, "4. sélection");
  ok(s.bettingTree && s.bettingTree.selectedBetSizes, "5. arbre final construit");
  ok(s.convergence && s.convergence.iterations > 0, "6. solve final exécuté");
  ok(getSolution(s.solutionId), "7. stockage");
  ok(s.source === "POKERFORGE_SOLVER" || s.source === "POKERFORGE_DATABASE", "8. provenance");
  ok(s.seed != null && s.canonical, "9. reproductible (graine + chaîne canonique)");

  /* Le Trainer voit EXACTEMENT ce sizing (§31). */
  const node = getTrainingNode(s, [], { handClass: "AKs" });
  ok(node.ok, "nœud d'entraînement disponible");
  const bets = node.actions.filter(a => a.actionType === "BET" || a.actionType === "ALL_IN");
  eq(bets.length, 1, "un seul bouton de mise dans le Trainer");
  eq(bets[0].specLabel, s.selectedSizes.bets[0].label, "et c'est bien le sizing retenu par le moteur");
  ok(node.actions.some(a => a.actionType === "CHECK"), "le check reste disponible");
  eq(node.actions.length, 2, "§71 — exactement deux actions, aucune option ajoutée");
  console.log(`   retenu ${s.selectedSizes.bets[0].label} · perte ${s.simplificationMetrics.absoluteEVLoss} bb · plancher ${s.measurement.floor} bb · ${Date.now() - t0} ms`);
}

console.log("\n══ CASE B — SIMPLE (la meilleure PAIRE, par comparaison de sous-ensembles) ══");
{
  const r = solve({
    mode: "DYNAMIC", complexity: "SIMPLE",
    userBetSpecs: [potSizing(0.25), potSizing(0.5), potSizing(0.75), potSizing(1.25)], userRaiseSpecs: [],
  });
  ok(r.ok, `solve abouti (${r.reason || ""})`);
  const s = r.solution;
  ok(s.selectedSizes.bets.length <= 2, "au plus deux sizings (plafond SIMPLE)");
  ok(s.selectedSizes.bets.length >= 1, "au moins un");

  /* §10 — des PAIRES ont réellement été évaluées, pas seulement des singletons. */
  const paires = r.optimization.evaluations.filter(e => e.betKeys.length === 2 && e.ok);
  ok(paires.length >= 3, `${paires.length} paires réellement solvées et comparées`);
  const singletons = r.optimization.evaluations.filter(e => e.betKeys.length === 1 && e.ok);
  eq(singletons.length, 4, "les quatre candidats ont aussi été évalués seuls (classement de l'étage 1)");

  /* La sélection est bien l'argmin de la perte parmi les éligibles. */
  const eligibles = r.optimization.ranking.filter(e => e.betKeys.length <= 2);
  const meilleure = eligibles[0];
  ok(meilleure, "un classement existe");
  const floor = s.measurement.floor;
  const perteRetenue = s.simplificationMetrics.absoluteEVLoss;
  ok(perteRetenue <= meilleure.metrics.absoluteEVLoss + floor + 1e-9,
    "la sélection est la meilleure perte, à départage par simplicité sous le plancher près");
  console.log(`   retenu ${s.selectedSizes.bets.map(b => b.label).join(" · ")} · perte ${perteRetenue} bb · ${paires.length} paires comparées`);
}

console.log("\n══ CASE C — FIXED (aucun sizing supprimé) ═══════════════════════");
{
  const r = solve({
    mode: "FIXED",
    userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], userRaiseSpecs: [],
  });
  ok(r.ok, `solve abouti (${r.reason || ""})`);
  const s = r.solution;
  eq(s.selectedSizes.bets.length, 3, "les TROIS sizings restent disponibles");
  eq(s.selectedSizes.bets.map(b => b.label).sort(), ["150%", "33%", "75%"], "et ce sont bien ceux fournis");
  eq(s.simplificationMetrics.absoluteEVLoss, 0, "perte d'EV nulle : rien n'a été simplifié");
  eq(r.optimization.evaluations.length, 0, "aucun sous-ensemble n'a même été évalué");

  const node = getTrainingNode(s, [], { handClass: "AKs" });
  const mises = node.actions.filter(a => a.actionType === "BET" || a.actionType === "ALL_IN");
  eq(mises.length, 3, "le Trainer affiche les trois");
  console.log(`   trois sizings conservés : ${s.selectedSizes.bets.map(b => b.label).join(" · ")}`);
}

console.log("\n══ CASE D — GEOMETRIC (même board, deux tapis) ══════════════════");
{
  const petit = solve({
    spot: { street: "TURN", board: TURN, stack: 20, pot: 12 },
    mode: "FIXED", userBetSpecs: [geometricSizing(2)], userRaiseSpecs: [],
  });
  const gros = solve({
    spot: { street: "TURN", board: TURN, stack: 120, pot: 12 },
    mode: "FIXED", userBetSpecs: [geometricSizing(2)], userRaiseSpecs: [],
  });
  ok(petit.ok && gros.ok, "les deux solves aboutissent");
  const mP = getTrainingNode(petit.solution, [], { handClass: "AKs" }).actions.find(a => a.actionType !== "CHECK");
  const mG = getTrainingNode(gros.solution, [], { handClass: "AKs" }).actions.find(a => a.actionType !== "CHECK");
  ok(mP && mG, "chaque solution porte une mise géométrique");
  ok(mG.toBb > mP.toBb * 1.5, `CASE D : le montant géométrique CHANGE avec le tapis (${mP.toBb}bb à 20bb de tapis, ${mG.toBb}bb à 120bb)`);
  ok(petit.solution.gameStateHash !== gros.solution.gameStateHash, "et les deux états sont bien distincts pour le cache");
  console.log(`   géométrique : ${mP.toBb}bb (tapis 20) vs ${mG.toBb}bb (tapis 120)`);
}

console.log("\n══ CASE E — MULTITABLE (4 spots, 4 jeux de sizings) ═════════════");
{
  const boards = [
    [12, 25, 3, 40, 7],
    [30, 17, 9, 44, 22],
    [51, 36, 27, 6, 19],
    [45, 41, 11, 28, 2],
  ];
  const tables = boards.map((board, i) => solve({
    spot: { street: "RIVER", board, stack: 40, pot: 12 },
    mode: "SINGLE", userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], userRaiseSpecs: [],
  }));
  ok(tables.every(t => t.ok), "les quatre tables ont leur solution");
  const ids = tables.map(t => t.solution.solutionId);
  eq(new Set(ids).size, 4, "§42 — quatre solutionId distincts, aucun état partagé");
  const hashes = tables.map(t => t.solution.gameStateHash);
  eq(new Set(hashes).size, 4, "quatre états de jeu distincts");
  const retenus = tables.map(t => t.solution.selectedSizes.bets[0].label);
  ok(retenus.every(Boolean), "chaque table a SON sizing retenu");
  console.log(`   sizings par table : ${retenus.join(" | ")}`);
  /* Chaque table lit bien SA solution, pas celle d'une voisine. */
  tables.forEach((t, i) => {
    const node = getTrainingNode(t.solution, [], { handClass: "AKs" });
    const bet = node.actions.find(a => a.actionType !== "CHECK");
    eq(bet.specLabel, retenus[i], `table ${i} : le nœud rendu est bien celui de sa propre solution`);
  });
}

console.log("\n══ CASE F — le sizing change entre TURN et RIVER ════════════════");
{
  /* Même main, deux rues : le pot et le SPR changent, donc l'arbre change. */
  const turn = solve({
    spot: { street: "TURN", board: TURN, stack: 40, pot: 12 },
    mode: "SINGLE", userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], userRaiseSpecs: [],
  });
  const river = solve({
    spot: { street: "RIVER", board: RIVER, stack: 34, pot: 24 },
    mode: "SINGLE", userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], userRaiseSpecs: [],
  });
  ok(turn.ok && river.ok, "les deux rues sont résolues");
  eq(turn.solution.street, "TURN", "solution de turn");
  eq(river.solution.street, "RIVER", "solution de river");
  ok(turn.solution.pot !== river.solution.pot, "le pot a changé");
  ok(turn.solution.spr !== river.solution.spr, "le SPR aussi");
  const bT = getTrainingNode(turn.solution, [], { handClass: "AKs" }).actions.find(a => a.actionType !== "CHECK");
  const bR = getTrainingNode(river.solution, [], { handClass: "AKs" }).actions.find(a => a.actionType !== "CHECK");
  ok(bT.toBb !== bR.toBb, `§38 — le montant proposé à la river (${bR.toBb}bb) n'est PAS celui de la turn (${bT.toBb}bb)`);
  ok(turn.solution.strategy.coversStreetsAhead === false,
    "§39 — la solution de turn ne prétend PAS couvrir la river : elle impose une re-résolution au nouvel état");
  console.log(`   turn : ${bT.specLabel} = ${bT.toBb}bb (pot ${turn.solution.pot}) · river : ${bR.specLabel} = ${bR.toBb}bb (pot ${river.solution.pot})`);
}

console.log("\n══ CASE G — SAVE / LOAD ═════════════════════════════════════════");
{
  clearStore();
  const r = solve({
    mode: "SINGLE", userBetSpecs: [potSizing(0.33), potSizing(0.75)], userRaiseSpecs: [],
  });
  ok(r.ok, "solve abouti");
  const id = r.solution.solutionId;
  eq(storeSize(), 1, "une solution stockée");

  const relu = getSolution(id);
  ok(relu, "rechargée par identifiant");
  eq(relu.selectedSizes.bets.map(b => b.label), r.solution.selectedSizes.bets.map(b => b.label), "mêmes sizings retenus");
  eq(relu.simplificationMetrics.absoluteEVLoss, r.solution.simplificationMetrics.absoluteEVLoss, "même perte d'EV");
  eq(relu.strategy.nodes[""].aggregate, r.solution.strategy.nodes[""].aggregate, "mêmes fréquences, au bit près");
  eq(relu.seed, r.solution.seed, "même graine");
  eq(relu.convergence.nashConv, r.solution.convergence.nashConv, "même convergence");

  /* Et le Trainer s'entraîne contre la solution RECHARGÉE, sans recopie. */
  const node = getTrainingNode(relu, [], { handClass: "AKs" });
  ok(node.ok, "§87 — la solution rechargée est directement entraînable");
  eq(node.actions.map(a => a.specLabel), getTrainingNode(r.solution, [], { handClass: "AKs" }).actions.map(a => a.specLabel),
    "les mêmes boutons, sans recopier aucun sizing à la main");
  eq(relu.source, "POKERFORGE_DATABASE", "et sa provenance devient « bibliothèque » (§18)");
  console.log(`   ${id} rechargée à l'identique`);
}

console.log("\n══ CASE H — SOLVE INVALIDE : aucune stratégie inventée ══════════");
{
  clearStore();
  /* Range vide → le solve DOIT échouer, et rien ne doit être stocké. */
  const r = solveOptimizedTree({
    stateInput: stateInput(), heroRange: { AA: { r: 0, c: 0, f: 100 } }, villainRange: VILL,
    mode: "SINGLE", userBetSpecs: [potSizing(0.33)], userRaiseSpecs: [],
    evaluationConfig: EVAL, finalSolveConfig: FINAL,
  });
  ok(!r.ok, "aucune solution produite");
  ok(!r.solution, "et aucun objet solution");
  eq(storeSize(), 0, "rien n'est entré dans le magasin");

  /* Board impossible : deux fois la même carte. */
  const dup = solveOptimizedTree({
    stateInput: { ...stateInput(), board: [12, 12, 3, 40, 7] },
    heroRange: HERO, villainRange: VILL, mode: "SINGLE",
    userBetSpecs: [potSizing(0.33)], userRaiseSpecs: [],
    evaluationConfig: EVAL, finalSolveConfig: FINAL,
  });
  ok(!dup.ok, "board avec carte dupliquée → refusé");
  ok(/invalide|dupliquée/i.test(dup.reason + JSON.stringify(dup.problems || [])), "avec le motif exact");

  /* Et le Trainer, face à l'absence de solution, ne fabrique aucune action. */
  const spot = {
    id: "s", street: "RIVER", hpos: "BB", vpos: "BTN", stack: "40bb", pot: 12, toCall: 0,
    hand: [{ r: "A", s: "♠" }, { r: "K", s: "♠" }],
    board: [{ r: "5", s: "♠" }, { r: "8", s: "♥" }, { r: "2", s: "♣" }, { r: "Q", s: "♠" }, { r: "3", s: "♣" }],
    heroRange: HERO, villainRange: VILL,
  };
  const t = prepareTrainerSpot({
    spot, ledger: { pot: 12, seats: { BB: { remaining: 40, street: 0, total: 6 }, BTN: { remaining: 40, street: 0, total: 6 } } },
    complexity: "SINGLE", studySpec: { mode: "SINGLE", betSizes: [potSizing(0.33)] }, solverConfig: FINAL,
  });
  ok(!t.ok, "le Trainer n'obtient rien");
  eq(t.message, "No verified solution available", "§90 — et le dit exactement");
  eq(t.acts.length, 0, "CASE H — aucune stratégie inventée, aucun bouton");
}

console.log("\n══ §110 — la famille FULL → SINGLE, avec ce qu'elle coûte ═══════");
{
  clearStore();
  const f = solveSolutionFamily({
    stateInput: stateInput(), heroRange: HERO, villainRange: VILL,
    mode: "DYNAMIC", userBetSpecs: [potSizing(0.33), potSizing(0.75), potSizing(1.5)], userRaiseSpecs: [],
    evaluationConfig: EVAL, finalSolveConfig: FINAL,
  });
  ok(f.ok, "la famille est produite");
  eq(f.results.length, 4, "quatre niveaux");
  ok(f.results.every(x => x.ok), "les quatre aboutissent");
  eq(inspectStore().states, 1, "§28 — UN état de jeu, quatre solutions");
  eq(f.family.length, 4, "et la famille se relit d'un bloc");
  ok(f.cacheStats.hits > 0, `le cache partagé a évité ${f.cacheStats.hits} re-solves entre niveaux`);

  const parNiveau = Object.fromEntries(f.family.map(d => [d.complexity, d]));
  eq(parNiveau.FULL.evLossBb, 0, "FULL ne simplifie rien : perte nulle par définition");
  ok(parNiveau.SINGLE.selected.split("·").length === 1, "SINGLE ne retient qu'un sizing");
  ok(f.family.every(d => typeof d.evLossBb === "number"), "chaque niveau annonce ce qu'il coûte");
  ok(f.family.every(d => typeof d.measurementFloor === "number"), "et le plancher sous lequel ce coût n'est pas mesurable");
  ok(f.family.every(d => d.badge === "PF SOLVED" || d.badge === "PF VERIFIED DB"), "tous portent un badge de solution calculée");
  ok(f.family.every(d => mayClaimSolved(getSolution(`${f.gameStateHash}#${d.complexity}`))), "et chacun a le droit de le porter");

  console.log("\n   NIVEAU     SIZINGS                    PERTE (bb)   distinguable");
  for (const d of f.family) {
    console.log(`   ${d.complexity.padEnd(9)}  ${String(d.selected).padEnd(24)}  ${String(d.evLossBb).padStart(8)}   ${d.distinguishable}`);
  }
}

console.log(`\n✅ PFASE pipeline complet — CASE A→H + §110 (${Math.round((Date.now() - t0) / 1000)} s) — ${passed} assertions OK\n`);
