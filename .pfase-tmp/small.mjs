import { solveOptimizedTree } from "../src/sizing/pfase.js";
const HERO={ "AA":{r:0,c:100,f:0}, "KK":{r:0,c:100,f:0}, "AKs":{r:0,c:100,f:0}, "76s":{r:0,c:100,f:0}, "T9s":{r:0,c:100,f:0}, "32o":{r:0,c:100,f:0} };
const VILL={ "QQ":{r:0,c:100,f:0}, "JJ":{r:0,c:100,f:0}, "AQs":{r:0,c:100,f:0}, "98s":{r:0,c:100,f:0}, "54s":{r:0,c:100,f:0}, "72o":{r:0,c:100,f:0} };
const stateInput={gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:40,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:40,committedStreet:0}],
  deadPot:12,actorId:"h"};
const t0=Date.now();
const r=solveOptimizedTree({stateInput,heroRange:HERO,villainRange:VILL,mode:"SINGLE",
  userBetSpecs:[{type:"pot",value:0.33},{type:"pot",value:0.75},{type:"pot",value:1.5}],userRaiseSpecs:[],
  evaluationConfig:{maxIterations:150,maxCombos:0,seed:5,convergenceTarget:0.02,maxIterationsCeiling:40000},
  finalSolveConfig:{maxIterations:4000,maxCombos:0,seed:5},persist:false});
console.log("status",r.status,r.ok?"":r.reason,`${Date.now()-t0}ms`);
if(r.ok){console.log("retenu:",r.solution.selectedSizes.bets.map(b=>b.label).join(","),"perte",r.solution.simplificationMetrics.absoluteEVLoss,"floor",r.solution.measurement.floor,"iters",r.solution.instrumentation.optimization.effectiveIterations,"solves",r.solution.instrumentation.optimization.solveCount);
console.log("classement:",JSON.stringify(r.solution.actionRanking.actions.map(a=>`${a.label}:${a.ev}`)));}
if(r.ok){
  console.log("\nclassement complet (perte vs référence, plancher par évaluation) :");
  for(const e of r.optimization.ranking) console.log(`  ${e.betKeys.join("+")}  EV ${e.ev}  perte ${e.metrics.absoluteEVLoss}  plancher ${e.measurementFloor}  nashConv ${e.nashConv}  distinguable ${e.distinguishable}`);
}
