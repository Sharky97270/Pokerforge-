/* Tests — Replayer : analyse des décisions (Phase D, §21/§22/§29).
   Lancement : node test-replayer-decision-analysis.mjs                */
import { parseHand } from "./src/replayer/handModel.js";
import { computeAllSnapshots } from "./src/replayer/stateEngine.js";
import {
  ACT, CLASS, canonFromEvent, canonFromLabel, classifyEvLoss,
  analyzeDecision, analyzeHand,
} from "./src/replayer/decisionAnalysis.js";

let passed=0, failed=0;
function ok(c,m){ if(c) passed++; else { failed++; console.error("  ✗ "+m); } }
function section(t){ console.log("\n── "+t); }

const HH = `PokerStars Hand #777001: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'Test' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Seat 5: Player5 ($200 in chips)
Hero: posts small blind $1
Player5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: calls $5
Player5: folds
*** FLOP *** [Ah Kd 7c]
Hero: checks
Villain: bets $7
Hero: calls $7
*** TURN *** [Ah Kd 7c] [2s]
Hero: checks
Villain: bets $19
Hero: folds`;

const hand = parseHand(HH,0);
const snaps = computeAllSnapshots(hand);

/* Moteur heuristique simulé : Bet=+0.5 (meilleur), Call=+0.2, Check=+0.4, Fold=0 */
const stubCtx = {
  buildScenario: ()=>({ street:"Flop" }),
  solve: ()=>({ ok:true, alts:[
    { action:"Bet",   freq:55, evBb:0.5, comment:"" },
    { action:"Check", freq:30, evBb:0.4, comment:"" },
    { action:"Call",  freq:10, evBb:0.2, comment:"" },
    { action:"Fold",  freq:5,  evBb:0,   comment:"" },
  ]}),
};

/* ── 1. Mapping des actions ── */
section("Mapping des actions");
ok(canonFromEvent("fold")===ACT.FOLD && canonFromEvent("allin")===ACT.ALLIN, "événement → famille");
ok(canonFromEvent("deal-flop")===null, "événement non-action → null");
ok(canonFromLabel("All-in")===ACT.ALLIN, "libellé all-in");
ok(canonFromLabel("3-Bet")===ACT.RAISE, "3-Bet → RAISE (pas BET)");
ok(canonFromLabel("C-bet 66% pot")===ACT.BET, "C-bet → BET");
ok(canonFromLabel("Open 2.5bb")===ACT.RAISE, "Open → RAISE");
ok(canonFromLabel("Limp")===ACT.CALL, "Limp → CALL");

/* ── 2. Barème de classification ── */
section("Barème EV Loss → classification");
ok(classifyEvLoss(0).cls===CLASS.EXCELLENTE && classifyEvLoss(0).grade==="A+", "0 bb → A+ excellente");
ok(classifyEvLoss(0.05).cls===CLASS.BONNE, "0.05 bb → bonne");
ok(classifyEvLoss(0.3).cls===CLASS.IMPRECISION, "0.3 bb → imprécision");
ok(classifyEvLoss(1.0).cls===CLASS.ERREUR, "1.0 bb → erreur");
ok(classifyEvLoss(3.0).cls===CLASS.CRITIQUE, "3.0 bb → erreur critique");
ok(classifyEvLoss(null).cls===CLASS.INCONNUE, "null → non évaluée");

/* ── 3. Décisions Hero uniquement ── */
section("Détection des décisions Hero");
{
  const heroSteps = snaps.map((s,i)=>analyzeDecision(hand,i,s,stubCtx)).filter(Boolean);
  const heroEvents = hand.events.filter(e=>e.playerId===hand.heroId &&
    ["fold","check","call","bet","raise","allin"].includes(e.type));
  ok(heroSteps.length===heroEvents.length, `${heroEvents.length} décisions Hero détectées (obtenu ${heroSteps.length})`);
  ok(heroSteps.every(d=>d.isHeroDecision), "toutes marquées isHeroDecision");
  // une étape de distribution n'est pas une décision
  const dealIdx = hand.events.findIndex(e=>e.type==="deal-flop");
  ok(analyzeDecision(hand,dealIdx,snaps[dealIdx],stubCtx)===null, "deal-flop → pas une décision");
  // une action du vilain n'est pas une décision Hero
  const vilIdx = hand.events.findIndex(e=>e.type==="bet" && e.playerId!==hand.heroId);
  ok(analyzeDecision(hand,vilIdx,snaps[vilIdx],stubCtx)===null, "action vilain → ignorée");
}

/* ── 4. EV Loss et note ── */
section("EV Loss / note");
{
  // Hero check au flop → Check(0.4) vs meilleur Bet(0.5) ⇒ EV Loss 0.1 ⇒ Bonne (A)
  const checkIdx = hand.events.findIndex(e=>e.type==="check" && e.playerId===hand.heroId);
  const d = analyzeDecision(hand,checkIdx,snaps[checkIdx],stubCtx);
  ok(d && d.played===ACT.CHECK, "action jouée = CHECK");
  ok(d && Math.abs(d.evLoss-0.1)<1e-6, `EV Loss 0.1 (obtenu ${d&&d.evLoss})`);
  ok(d && d.cls===CLASS.BONNE && d.grade==="A", "note A / bonne décision");
  ok(d && d.source==="heuristic", "source heuristique honnête");
  ok(d && d.recommended && d.recommended.action===ACT.BET, "recommandation = BET (meilleure EV)");

  // Hero fold turn → Fold(0) vs Bet(0.5) ⇒ EV Loss 0.5 ⇒ Erreur (C)
  const foldIdx = hand.events.findIndex(e=>e.type==="fold" && e.playerId===hand.heroId);
  const f = analyzeDecision(hand,foldIdx,snaps[foldIdx],stubCtx);
  ok(f && Math.abs(f.evLoss-0.5)<1e-6, `EV Loss fold 0.5 (obtenu ${f&&f.evLoss})`);
  ok(f && f.cls===CLASS.ERREUR, "fold → erreur");
}

/* ── 5. Analyse de toute la main (§29) ── */
section("Analyser toute la main");
{
  const r = analyzeHand(hand,snaps,stubCtx);
  ok(r.decisions.length>0, "décisions collectées");
  ok(r.totalEvLoss>0, `EV perdue totale > 0 (obtenu ${r.totalEvLoss})`);
  ok(r.worst && r.worst.evLoss>=Math.max(...r.decisions.map(d=>d.evLoss||0))-1e-9, "pire décision identifiée");
  const sum=Object.values(r.counts).reduce((a,b)=>a+b,0);
  ok(sum===r.decisions.length, "comptes par classe cohérents");
  ok(r.errors.every(d=>d.cls===CLASS.ERREUR||d.cls===CLASS.CRITIQUE), "liste d'erreurs filtrée");
  ok(r.source==="heuristic", "provenance globale honnête");
}

/* ── 6. Absence de référence → non évaluée (aucune fabrication) ── */
section("Aucune référence disponible");
{
  const noCtx = { buildScenario:()=>null, solve:()=>null };
  const checkIdx = hand.events.findIndex(e=>e.type==="check" && e.playerId===hand.heroId);
  const d = analyzeDecision(hand,checkIdx,snaps[checkIdx],noCtx);
  ok(d && d.source==="none", "source 'none' quand aucune référence");
  ok(d && d.evLoss===null && d.cls===CLASS.INCONNUE, "pas d'EV inventée");
}

console.log(`\n${failed===0?"✅":"❌"} Replayer Decision Analysis : ${passed} ok, ${failed} échec(s)`);
process.exit(failed===0?0:1);
