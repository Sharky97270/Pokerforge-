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

/* ── 7. Push/fold préflop HU : la SEULE surface exactement solvée ──
   Ce chemin ne s'était en réalité JAMAIS déclenché. Trois défauts cumulés :
     • le jam est typé `raise` par le parser (« raises $38 to $40 and is
       all-in »), alors qu'on exigeait un événement `allin` ;
     • `toCall` était mesuré APRÈS application de l'action, donc un call de
       tapis donnait un écart de mises nul et se lisait comme une ouverture ;
     • Hero qui se couche sort des joueurs actifs, ce qui faisait échouer le
       test heads-up sur le cas le plus utile (« avais-je raison de folder ? »).
   Ces six nœuds sont donc des tests de non-régression, pas de confort.      */
section("Push/fold préflop HU — solveur exact");
{
  const HU = (tag, btnSeat, heroCards, line) => `PokerStars Hand #94000${tag}: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'PF' 2-max Seat #${btnSeat} is the button
Seat 1: Hero ($40 in chips)
Seat 2: Villain ($40 in chips)
${btnSeat===1?"Hero: posts small blind $1\nVillain: posts big blind $2":"Villain: posts small blind $1\nHero: posts big blind $2"}
Dealt to Hero [${heroCards}]
${line}`;

  const decide = (hh) => {
    const h = parseHand(hh,0), s = computeAllSnapshots(h);
    const i = h.events.findIndex(e=>e.playerId===h.heroId && canonFromEvent(e.type));
    return analyzeDecision(h,i,s[i],{});
  };

  const cases = [
    ["SB jam AKo",   HU(1,1,"Ah Ks","Hero: raises $38 to $40 and is all-in\nVillain: folds"), 0],
    ["SB fold 72o",  HU(2,1,"7h 2s","Hero: folds"), 0],
    ["SB fold AKo",  HU(3,1,"Ah Ks","Hero: folds"), 100],
    ["BB call AKo",  HU(4,2,"Ah Ks","Villain: raises $38 to $40 and is all-in\nHero: calls $38"), 0],
    ["BB call 72o",  HU(5,2,"7h 2s","Villain: raises $38 to $40 and is all-in\nHero: calls $38"), 100],
    ["BB fold 72o",  HU(6,2,"7h 2s","Villain: raises $38 to $40 and is all-in\nHero: folds"), 0],
  ];

  for (const [tag, hh, expectedGap] of cases) {
    const d = decide(hh);
    ok(d && d.source==="solver", `${tag} : référence solveur atteinte`);
    ok(d && d.metric==="frequency", `${tag} : mesure déclarée comme une fréquence`);
    ok(d && d.evLoss===null, `${tag} : aucune EV fabriquée depuis une fréquence`);
    ok(d && d.freqGap===expectedGap, `${tag} : écart ${expectedGap} pts (obtenu ${d&&d.freqGap})`);
  }

  // Les décisions correctes sont notées A+, les hors-range sanctionnées.
  ok(decide(cases[0][1]).cls===CLASS.EXCELLENTE, "jam AKo 20bb classé conforme");
  ok(decide(cases[2][1]).cls===CLASS.CRITIQUE, "fold AKo 20bb classé hors équilibre");
  ok(decide(cases[4][1]).cls===CLASS.CRITIQUE, "call 72o face à un jam classé hors équilibre");

  // Hors zone push/fold (200bb) : on refuse plutôt que d'appliquer la matrice.
  const deep = `PokerStars Hand #940007: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'PF' 2-max Seat #1 is the button
Seat 1: Hero ($400 in chips)
Seat 2: Villain ($400 in chips)
Hero: posts small blind $1
Villain: posts big blind $2
Dealt to Hero [Ah Ks]
Hero: folds`;
  ok(decide(deep).source!=="solver", "200bb : hors zone push/fold, pas de matrice appliquée");
}

console.log(`\n${failed===0?"✅":"❌"} Replayer Decision Analysis : ${passed} ok, ${failed} échec(s)`);
process.exit(failed===0?0:1);
