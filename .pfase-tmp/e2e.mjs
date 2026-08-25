import { solveOptimizedTree, describeSolution, getTrainingNode, compareAction, getSolution } from "../src/sizing/pfase.js";
import { buildSolverFreqs } from "../src/solver/preflopRanges.js";
const hero = buildSolverFreqs("BTN","rfi",100,"BB");
const vill = (()=>{const raw=buildSolverFreqs("BB","vs_open",100,"BTN");const o={};for(const k in raw){const w=Math.min(100,(raw[k].c||0)+(raw[k].r||0));o[k]={r:0,c:w,f:100-w};}return o;})();
const stateInput={gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:94,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:94,committedStreet:0}],
  deadPot:12,actorId:"h"};
const t0=Date.now();
const r=solveOptimizedTree({stateInput,heroRange:hero,villainRange:vill,
  mode:"SINGLE",candidateProfile:"narrow",
  evaluationConfig:{maxIterations:200,maxCombos:100,seed:11,convergenceTarget:0.03,maxIterationsCeiling:800},
  finalSolveConfig:{maxIterations:600,maxCombos:150,seed:11},
  onProgress:p=>process.stdout.write(`  · ${p.phase} ${p.step||""}\r`)});
console.log("\nstatus",r.status,r.ok?"":r.reason,r.problems||"",`${Date.now()-t0}ms`);
if(!r.ok) process.exit(1);
console.log(JSON.stringify(describeSolution(r.solution),null,1));
console.log("actionRanking:",JSON.stringify(r.solution.actionRanking));
const node=getTrainingNode(r.solution,[], {handClass:"AKs"});
console.log("nœud racine:",node.actions.map(a=>`${a.actionType} ${a.specLabel||""} ${a.toBb}bb f=${(a.frequency*100).toFixed(1)}%`).join(" | "));
console.log("source freq:",node.frequencySource);
console.log("compare BET exact:",JSON.stringify(compareAction({solution:r.solution,handClass:"AKs",actionType:"BET",sizeBb:node.actions.find(a=>a.actionType==="BET")?.toBb}).verdict));
console.log("compare BET 6.1bb:",JSON.stringify(compareAction({solution:r.solution,handClass:"AKs",actionType:"BET",sizeBb:6.1}),null,1).slice(0,700));
// persistance mémoire
const again=getSolution(r.solution.solutionId);
console.log("relecture store:",!!again, again&&again.source, again&&again.selectedSizes.bets.map(b=>b.label).join(","));
