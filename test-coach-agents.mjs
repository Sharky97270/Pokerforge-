import { analyzeHandHistory } from "./src/coachEngine.js";
import { CoachAIOrchestrator } from "./src/coachAgents.js";

const GG = `Poker Hand #HD1: Hold'em No Limit ($1/$2) - 2024/03/10 12:00:00
Table 'T' 6-max Seat #1 is the button
Seat 1: Hero ($200 in chips)
Seat 6: Vil ($180 in chips)
Vil: posts small blind $1
Hero: posts big blind $2
*** HOLE CARDS ***
Dealt to Hero [As Ad]
Vil: raises $4 to $6
Hero: raises $12 to $18
Vil: calls $12
*** FLOP *** [Tc 6h 2s]
Vil: checks
Hero: bets $20
Vil: calls $20
*** TURN *** [Tc 6h 2s] [Kd]
Vil: checks
Hero: checks
*** RIVER *** [Tc 6h 2s Kd] [4c]
Vil: bets $60
Hero: calls $60
*** SHOW DOWN ***
Vil: shows [Kh Qd]
Hero: shows [As Ad]
Vil collected $156 from pot
*** SUMMARY ***`;

const MTT = `Winamax Poker - Tournament "Kill The Fish" buyIn: 5€ - HandId: #1 - Holdem no limit (100/200/25) - 2024/02/01 18:00:00 UTC
Table: 'Final' 9-max Seat #3 is the button
Seat 3: Hero (4200)
Seat 4: Vil (9000)
Hero posts small blind 100
Vil posts big blind 200
*** PRE-FLOP ***
Dealt to Hero [Ah Th]
Hero raises 4000 to 4200 and is all-in
Vil calls 4000
*** FLOP *** [2c 7d 9s]
*** TURN *** [2c 7d 9s][Jh]
*** RIVER *** [2c 7d 9s Jh][3c]
Vil collected 8450
*** SUMMARY ***`;

function show(title, engine, opt) {
  console.log("\n" + "=".repeat(70) + "\n" + title);
  const o = CoachAIOrchestrator(engine, opt);
  if (!o.ok) { console.log("  KO:", o.error); return false; }
  console.log("  Agents actifs :", o.agents.filter(a => a.active).map(a => a.name).join(", "));
  console.log("  Agents en veille :", o.agents.filter(a => !a.active).map(a => a.name).join(", ") || "—");
  console.log("  handSummary.heroAction:", o.handSummary.heroAction);
  console.log("  gtoInsight.bestAction:", o.gtoInsight.bestAction, "| sizing:", o.gtoInsight.sizing);
  console.log("  exploitInsight:", o.exploitInsight ? o.exploitInsight.exploitLine.join(" / ") : "(veille)");
  console.log("  icmInsight:", o.icmInsight ? `${o.icmInsight.stackPressure} | ${o.icmInsight.adjustment}` : "(veille)");
  console.log("  leakInsight:", o.leakInsight ? `${o.leakInsight.family} (${o.leakInsight.severityLabel}, prio ${o.leakInsight.priority}, ${o.leakInsight.frequencyLabel})` : "(aucun)");
  console.log("  mentalInsight:", o.mentalInsight ? o.mentalInsight.flags.map(f => f.patternType).join(", ") : "(veille)");
  console.log("  trainerHandoff:", o.trainerHandoff ? o.trainerHandoff.drillTemplate.label : "(aucun)");
  console.log("  careerUpdates:", o.careerUpdates.map(c => c.mission).join(" | "));
  console.log("  actions:", o.suggestedActions.filter(a => !a.disabled).length + "/" + o.suggestedActions.length, "actives");
  // central mental visible toujours
  const mentalAgent = o.agents.find(a => a.id === "mental");
  if (!mentalAgent) { console.log("  ✗ Mental Coach absent de la colonne"); return false; }
  return true;
}

let ok = 0, ko = 0;
// 1) cash, river big call, station profile + low field + mental tracking
(show("CASH GG — station + field low + mental ON", analyzeHandHistory(GG), { villainProfile: "station", field: "low", mentalTracking: true, pastLeaks: ["river:hero-call", "river:hero-call"] }) ? ok++ : ko++);
// 2) cash, no exploit, no mental tracking → exploit & icm en veille, mental peut s'activer via pattern (river call)
(show("CASH GG — sans options", analyzeHandHistory(GG), {}) ? ok++ : ko++);
// 3) MTT short stack → ICM actif, mental ICM
(show("MTT Winamax short-stack — ICM", analyzeHandHistory(MTT), { mentalTracking: false }) ? ok++ : ko++);
// 4) MTT + bounty hunter profile
(show("MTT — bounty hunter", analyzeHandHistory(MTT), { villainProfile: "bounty", tourStage: "bubble" }) ? ok++ : ko++);

console.log("\n" + "=".repeat(70) + `\nRÉSULTAT : ${ok} OK / ${ko} KO`);
process.exit(ko ? 1 : 0);
