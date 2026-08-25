import { solveSolutionFamily } from "../src/sizing/pfase.js";
import { buildSolverFreqs } from "../src/solver/preflopRanges.js";
const hero = buildSolverFreqs("BTN","rfi",100,"BB");
const vill = (()=>{const raw=buildSolverFreqs("BB","vs_open",100,"BTN");const o={};for(const k in raw){const w=Math.min(100,(raw[k].c||0)+(raw[k].r||0));o[k]={r:0,c:w,f:100-w};}return o;})();
const stateInput={gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:94,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:94,committedStreet:0}],
  deadPot:12,actorId:"h"};
const t0=Date.now();
const f=solveSolutionFamily({stateInput,heroRange:hero,villainRange:vill,
  mode:"AUTOMATIC",candidateProfile:"narrow",
  evaluationConfig:{maxIterations:200,maxCombos:90,seed:11,convergenceTarget:0.04,maxIterationsCeiling:400},
  finalSolveConfig:{maxIterations:400,maxCombos:120,seed:11}});
console.log("status",f.status,`${Date.now()-t0}ms`,"hash",f.gameStateHash,"cache",JSON.stringify(f.cacheStats));
console.log("\n  NIVEAU     SIZINGS RETENUS            EV finale   PERTE (bb)  distinguable");
for(const d of f.family){
  console.log(`  ${d.complexity.padEnd(9)}  ${String(d.selected).padEnd(24)}  ${String(d.evLossBb!=null?"":"")}${String(d.evLossBb).padStart(8)}    ${String(d.distinguishable)}`);
}
console.log("\nfamille détectée sous un hash unique :", f.family.length, "niveaux");
console.log("\ndétail par niveau :");
for(const r of f.results) console.log(` ${r.complexity}: ok=${r.ok} status=${r.status} ${r.reason||""}`);
