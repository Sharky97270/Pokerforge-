import { normalizeGameState } from "../src/sizing/gameState.js";
import { optimizeBettingTree } from "../src/sizing/dynamicOptimizer.js";
import { buildSolverFreqs } from "../src/solver/preflopRanges.js";
const hero = buildSolverFreqs("BTN","rfi",100,"BB");
const vill = (()=>{const raw=buildSolverFreqs("BB","vs_open",100,"BTN");const o={};for(const k in raw){const w=Math.min(100,(raw[k].c||0)+(raw[k].r||0));o[k]={r:0,c:w,f:100-w};}return o;})();
const st=normalizeGameState({gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:94,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:94,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
console.log("SPR",st.spr,"pot",st.pot,"eff",st.effectiveStack);
const t0=Date.now();
const r=optimizeBettingTree({state:st,heroRange:hero,villainRange:vill,
  mode:"SINGLE",complexity:"SINGLE",candidateProfile:"narrow",
  evaluationConfig:{maxIterations:200,maxCombos:120,seed:11,convergenceTarget:0.02},
  onProgress:p=>{}});
console.log("status",r.status,r.ok?"":r.reason,`${Date.now()-t0}ms`);
if(r.ok){
  console.log("candidats bets:",r.candidates.bets.map(c=>`${c.key}=${c.amountBb}bb`).join(", "));
  console.log("candidats raises:",r.candidates.raises.map(c=>c.key).join(", ")||"(aucun)");
  console.log("EV référence",r.reference.ev,"bruit",r.noise.floor,"échantillonné",r.noise.sampled);
  console.log("SÉLECTION:",r.selected.betKeys.join("+"),"EV",r.selected.ev,"perte",r.selected.metrics.absoluteEVLoss,"bb ·",r.selected.metrics.evLossPotPct,"% du pot · distinguable",r.selected.distinguishable);
  console.log("classement:");
  for(const e of r.ranking.slice(0,8)) console.log(`   ${e.betKeys.join("+")}${e.raiseKeys.length?" R:"+e.raiseKeys.join("+"):""}  EV ${e.ev}  perte ${e.metrics.absoluteEVLoss}`);
  console.log("instr",JSON.stringify(r.instrumentation));
}
