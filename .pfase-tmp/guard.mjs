import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec, estimateSolveMemory } from "../src/sizing/solverAdapter.js";
import { potSizing, previousBetSizing } from "../src/sizing/sizingSpec.js";
import { buildSolverFreqs } from "../src/solver/preflopRanges.js";
const hero = buildSolverFreqs("BTN","rfi",100,"BB");
const vill = (()=>{const raw=buildSolverFreqs("BB","vs_open",100,"BTN");const o={};for(const k in raw){const w=Math.min(100,(raw[k].c||0)+(raw[k].r||0));o[k]={r:0,c:w,f:100-w};}return o;})();
const st=normalizeGameState({gameType:"CASH",street:"FLOP",board:[12,25,3],blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:94,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:94,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
const ts={betSpecs:[potSizing(0.33),potSizing(0.75)],raiseSpecs:[previousBetSizing(2.5)],maxRaisesPerStreet:1};
for(const d of [1,2,3]) console.log("depth",d,JSON.stringify(estimateSolveMemory({state:st,treeSpec:ts,depth:d,maxCombos:140,iterations:120})));
const t0=Date.now();
const r=solveTreeSpec({state:st,heroRange:hero,villainRange:vill,treeSpec:ts,config:{maxIterations:120,maxCombos:140,evaluationDepth:3,seed:7}});
console.log("solve depth3-requested →",r.status,r.ev,`${Date.now()-t0}ms`);
console.log("  guardNotes:",JSON.stringify(r.instrumentation?.guardNotes));
console.log("  partialReasons:",JSON.stringify(r.partialReasons));
