/* Tests — Replayer : pont vers le solveur CFR postflop.
   Lancement : node test-replayer-cfr.mjs

   Ce que cette suite verrouille :
     • le périmètre du modèle résolu (heads-up, Hero n'a rien investi sur la
       street, au plus une agression adverse) — ce qui en sort est REFUSÉ
       plutôt que présenté comme calculé ;
     • la traduction snapshot → spot (pot, toCall, sizing réellement joué) ;
     • la conversion résultat worker → bloc consommable, et le fait qu'aucune
       EV n'y est fabriquée à partir de fréquences ;
     • la priorité CFR > heuristique dans analyzeDecision, et la mesure
       « écart de fréquence » qui ne se confond jamais avec une EV.          */
import { parseHand } from "./src/replayer/handModel.js";
import { computeAllSnapshots } from "./src/replayer/stateEngine.js";
import {
  buildReplayerPostflopSpot, buildReplayerCfrRequest, cfrResultToBlock,
  solvableSteps, CFR_PROVENANCE,
} from "./src/replayer/postflopSolve.js";
import { analyzeDecision, analyzeHand, classifyFreqGap, CLASS, ACT } from "./src/replayer/decisionAnalysis.js";
import { buildHandState } from "./src/replayer/handState.js";
import { buildSolverPackage, buildTarget, PROV, PROV_META } from "./src/replayer/solverPackage.js";

let passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.error("  ✗ " + m); } }
function section(t) { console.log("\n── " + t); }

/* Hero (SB) check-call flop, check-fold turn, heads-up : deux décisions dans le
   modèle « Hero check → Villain bet → Hero F/C/R ». */
const HU = `PokerStars Hand #910001: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'CFR' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Hero: posts small blind $1
Villain: posts big blind $2
Dealt to Hero [Qs Jh]
Hero: raises $4 to $6
Villain: calls $4
*** FLOP *** [Ah Kd 7c]
Hero: checks
Villain: bets $6
Hero: calls $6
*** TURN *** [Ah Kd 7c] [2s]
Hero: checks
Villain: bets $18
Hero: folds`;

const hand = parseHand(HU, 0);
const snaps = computeAllSnapshots(hand);
const ev = hand.events;
const idxOf = pred => ev.findIndex(pred);
const heroFlopCheck = idxOf(e => e.street === "flop" && e.playerId === hand.heroId && e.type === "check");
const heroFlopCall = idxOf(e => e.street === "flop" && e.playerId === hand.heroId && e.type === "call");
const heroTurnFold = idxOf(e => e.street === "turn" && e.playerId === hand.heroId && e.type === "fold");
const vilFlopBet = idxOf(e => e.street === "flop" && e.playerId !== hand.heroId && e.type === "bet");

section("Périmètre : ce qui est dans le modèle résolu");
const spotLeads = buildReplayerPostflopSpot(hand, snaps, heroFlopCheck);
ok(!!spotLeads, "Hero ouvre le flop (check) → spot construit");
ok(spotLeads._mode === "leads", "mode « leads » détecté");
ok(spotLeads.street === "flop" && spotLeads.board.length === 3, "street et board cohérents");
ok(spotLeads.toCall === 0, "rien à payer quand Hero ouvre");
ok(spotLeads.acts.some(a => a.id === "CHECK") && spotLeads.acts.some(a => a.id === "BET"),
  "boutons Check/Bet proposés au solveur");
ok(spotLeads.hand.length === 2, "cartes Hero transmises");
ok(spotLeads.hpos === "SB" && spotLeads.vpos === "BB", "positions reprises du snapshot");

const spotFacing = buildReplayerPostflopSpot(hand, snaps, heroFlopCall);
ok(!!spotFacing, "Hero face à la mise flop → spot construit");
ok(spotFacing._mode === "facing", "mode « facing » détecté");
ok(spotFacing.toCall > 0, "montant à payer non nul");
ok(spotFacing.acts.length === 3, "boutons Fold/Call/Raise proposés");
ok(spotFacing.pot > spotFacing.toCall, "le pot inclut la mise adverse");

const spotTurn = buildReplayerPostflopSpot(hand, snaps, heroTurnFold);
ok(!!spotTurn && spotTurn.street === "turn" && spotTurn.board.length === 4, "décision turn également couverte");

section("Périmètre : ce qui en est EXCLU (refusé, jamais approximé)");
ok(buildReplayerPostflopSpot(hand, snaps, vilFlopBet) === null, "action du vilain → pas une décision Hero");
const heroPreflopRaise = idxOf(e => e.street === "preflop" && e.playerId === hand.heroId && e.type === "raise");
ok(buildReplayerPostflopSpot(hand, snaps, heroPreflopRaise) === null, "préflop → hors du modèle postflop");
const dealFlop = idxOf(e => e.type === "deal-flop");
ok(buildReplayerPostflopSpot(hand, snaps, dealFlop) === null, "distribution → pas une décision");
ok(buildReplayerPostflopSpot(hand, snaps, 0) === null, "étape 0 → pas de snapshot précédent");
ok(buildReplayerPostflopSpot(null, snaps, 3) === null, "main absente → null");

/* Multiway : trois joueurs voient le flop → hors modèle heads-up. */
const MULTI = `PokerStars Hand #910002: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'Multi' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: V1 ($200 in chips)
Seat 5: V2 ($200 in chips)
Hero: posts small blind $1
V1: posts big blind $2
Dealt to Hero [Qs Jh]
V2: calls $2
Hero: calls $1
V1: checks
*** FLOP *** [Ah Kd 7c]
Hero: checks
V1: checks
V2: bets $4
Hero: calls $4`;
const hMulti = parseHand(MULTI, 0);
const sMulti = computeAllSnapshots(hMulti);
const multiSteps = solvableSteps(hMulti, sMulti);
ok(multiSteps.length === 0, "pot multiway → aucune étape résoluble");

/* Check-raise : Hero a déjà investi sur la street → arbre différent. */
const XR = `PokerStars Hand #910003: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'XR' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Hero: posts small blind $1
Villain: posts big blind $2
Dealt to Hero [Qs Jh]
Hero: raises $4 to $6
Villain: calls $4
*** FLOP *** [Ah Kd 7c]
Hero: bets $6
Villain: raises $18 to $24
Hero: calls $18`;
const hXr = parseHand(XR, 0);
const sXr = computeAllSnapshots(hXr);
const xrCall = sXr.findIndex(s => s.currentEvent?.street === "flop"
  && s.currentEvent?.playerId === hXr.heroId && s.currentEvent?.type === "call");
ok(buildReplayerPostflopSpot(hXr, sXr, xrCall) === null,
  "Hero face à une relance de sa propre mise → refusé (hors arbre modélisé)");
const xrBet = sXr.findIndex(s => s.currentEvent?.street === "flop"
  && s.currentEvent?.playerId === hXr.heroId && s.currentEvent?.type === "bet");
ok(buildReplayerPostflopSpot(hXr, sXr, xrBet) !== null, "sa mise d'ouverture reste, elle, dans le modèle");

section("Requête worker");
const built = buildReplayerCfrRequest(hand, snaps, heroFlopCall);
ok(!!built, "requête construite pour une décision face à une mise");
ok(Array.isArray(built.request.board) && built.request.board.length === 3, "board converti en entiers");
ok(built.request.board.every(c => Number.isInteger(c) && c >= 0 && c <= 51), "cartes dans 0..51");
ok(!!built.request.heroClassKey, "classe de main Hero transmise");
ok(built.request.heroFreqs && built.request.villFreqs, "ranges d'entrée présentes");
ok(JSON.stringify(built.request).length > 0, "requête sérialisable (postMessage)");
ok(built.meta.mode === "facing", "métadonnées cohérentes avec le mode");
const builtLeads = buildReplayerCfrRequest(hand, snaps, heroFlopCheck);
ok(builtLeads.request.opts.nodePath === null, "mode leads → nœud racine");
ok(built.request.opts.nodePath?.join(",") === "X,B", "mode facing → nœud « check puis mise »");

section("Étapes résolubles de la main");
const steps = solvableSteps(hand, snaps);
ok(steps.includes(heroFlopCheck) && steps.includes(heroFlopCall) && steps.includes(heroTurnFold),
  "les trois décisions postflop sont repérées");
ok(!steps.includes(heroPreflopRaise), "le préflop n'y figure pas");

section("Résultat worker → bloc (aucune EV fabriquée)");
const fakeRes = { ok: true, distByLabel: { F: 30, C: 55, R: 15 }, actions: ["F", "C", "R"], nashConv: 0.004, solveMs: 900 };
const block = cfrResultToBlock(fakeRes, built);
ok(!!block, "bloc produit");
ok(block.source === "solver" && block.provenance === CFR_PROVENANCE, "provenance CFR explicite");
ok(block.metric === "frequency", "la mesure est déclarée comme une fréquence");
ok(block.freqByAction.CALL === 55 && block.freqByAction.FOLD === 30, "fréquences mappées sur les actions");
ok(block.bestAction === "CALL", "action majoritaire identifiée");
ok(!JSON.stringify(block).includes("evBb"), "aucune EV dans le bloc");
ok(block.nashConv === 0.004, "NashConv transporté");
ok(cfrResultToBlock({ ok: false, reason: "timeout" }, built) === null, "échec worker → null");
ok(cfrResultToBlock(null, built) === null, "réponse absente → null");

section("Priorité CFR > heuristique dans analyzeDecision");
const stubCtx = {
  buildScenario: () => ({ street: "Flop" }),
  solve: () => ({ ok: true, alts: [
    { action: "Call", freq: 45, evBb: 0.2, comment: "" },
    { action: "Fold", freq: 55, evBb: 0, comment: "" },
  ] }),
};
const heuristicOnly = analyzeDecision(hand, heroFlopCall, snaps[heroFlopCall], stubCtx);
ok(heuristicOnly.source === "heuristic", "sans CFR : référence heuristique");
ok(heuristicOnly.metric === "ev", "l'heuristique reste mesurée en EV");

const withCfr = analyzeDecision(hand, heroFlopCall, snaps[heroFlopCall], { ...stubCtx, cfr: { [heroFlopCall]: block } });
ok(withCfr.source === "solver", "avec CFR : la référence devient calculée");
ok(withCfr.provenance === CFR_PROVENANCE, "provenance CFR conservée jusqu'à l'UI");
ok(withCfr.metric === "frequency", "mesure en fréquence");
ok(withCfr.evLoss === null, "aucune EV n'est inventée à partir de fréquences");
ok(withCfr.freqGap === 0, "action jouée (call 55%) = action majoritaire → écart nul");
ok(withCfr.cls === CLASS.EXCELLENTE, "classée conforme à l'équilibre");
ok(withCfr.alternatives.length === 3, "les trois actions d'équilibre sont exposées");

const foldBlock = { ...block, freqByAction: { FOLD: 10, CALL: 75, RAISE: 15 }, bestAction: "CALL" };
const withGap = analyzeDecision(hand, heroTurnFold, snaps[heroTurnFold], { ...stubCtx, cfr: { [heroTurnFold]: foldBlock } });
ok(withGap.freqGap === 65, "fold à 10% face à un call à 75% → écart de 65 points");
ok(withGap.cls === CLASS.CRITIQUE, "écart majeur classé hors équilibre");
ok(withGap.evLoss === null, "toujours aucune EV inventée");

const unsolved = analyzeDecision(hand, heroFlopCall, snaps[heroFlopCall], { ...stubCtx, cfr: { [heroFlopCall]: { unsolvable: true } } });
ok(unsolved.source === "heuristic", "marqueur d'échec → repli propre sur l'heuristique");

section("Barème d'écart de fréquence");
ok(classifyFreqGap(0).cls === CLASS.EXCELLENTE, "écart nul → conforme");
ok(classifyFreqGap(10).cls === CLASS.BONNE, "10 pts → proche de l'équilibre");
ok(classifyFreqGap(25).cls === CLASS.IMPRECISION, "25 pts → écart notable");
ok(classifyFreqGap(50).cls === CLASS.ERREUR, "50 pts → action minoritaire");
ok(classifyFreqGap(80).cls === CLASS.CRITIQUE, "80 pts → hors équilibre");
ok(classifyFreqGap(null).cls === CLASS.INCONNUE, "sans mesure → non évaluée");

section("Remontée dans le package solveur et niveau de confiance");
const hs = buildHandState(hand);
const ctxCfr = { ...stubCtx, cfr: { [heroFlopCall]: block } };
const pkg = buildSolverPackage(hand, snaps, hs, ctxCfr, { equity: null });
ok(pkg.sources.includes(PROV.SOLVER_CFR), "provenance CFR exposée par le package");
ok(pkg.level === 2, "une décision CFR fait passer la main au niveau 2");
ok(/CFR|calcul/i.test(pkg.disclaimer || ""), "l'avertissement rappelle les ranges heuristiques");
const tgt = buildTarget(hand, snaps, ctxCfr, heroFlopCall);
ok(tgt.metric === "frequency" && tgt.freqGapPts === 0, "la cible transporte la mesure et l'écart");
ok(tgt.evLossBB === null, "aucune EV sur une décision CFR");
ok(tgt.source === PROV.SOLVER_CFR, "badge CFR sur la décision ciblée");
ok(PROV_META[PROV.SOLVER_CFR].computed === true, "le CFR compte comme une donnée calculée");
ok(PROV_META[PROV.SOLVER_CFR].color !== PROV_META[PROV.SOLVER].color, "couleur distincte du solveur exact");
ok(/heuristi/i.test(PROV_META[PROV.SOLVER_CFR].desc), "sa description assume les ranges heuristiques");

const full = analyzeHand(hand, snaps, ctxCfr);
ok(full.decisions.some(d => d.provenance === CFR_PROVENANCE), "l'analyse complète intègre la décision CFR");
ok(Number.isFinite(full.totalEvLoss), "l'EV totale reste calculable sur les décisions qui en ont une");

section("Cohérence des versions client / serveur");
const fnSrc = (await import("node:fs")).readFileSync("./supabase/functions/analyze-hand/index.ts", "utf8");
const cliSrc = (await import("node:fs")).readFileSync("./src/replayer/aiAnalysis.js", "utf8");
const v = fnSrc.match(/PROMPT_VERSION = "([^"]+)"/)[1];
ok(cliSrc.includes(`"${v}"`), `version de prompt alignée (${v})`);
ok(/frequency/.test(fnSrc), "le prompt serveur distingue EV et fréquence");
/* Depuis le prompt v3, la provenance CFR porte son nom §6 —
   SOLVER_APPROXIMATION — et le prompt impose la formulation associée
   (« calcul CFR », ranges d'entrée estimées, pas un solve GTO complet). */
ok(/SOLVER_APPROXIMATION/.test(fnSrc) && /CFR/.test(fnSrc),
  "le prompt serveur connaît la provenance CFR (SOLVER_APPROXIMATION)");

console.log(`\n${failed === 0 ? "✅" : "❌"} Replayer CFR : ${passed} assertions OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
