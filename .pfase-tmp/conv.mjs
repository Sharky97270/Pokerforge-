import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { potSizing, jamSizing } from "../src/sizing/sizingSpec.js";
import { buildSolverFreqs } from "../src/solver/preflopRanges.js";
const hero = buildSolverFreqs("BTN","rfi",100,"BB");
const vill = (()=>{const raw=buildSolverFreqs("BB","vs_open",100,"BTN");const o={};for(const k in raw){const w=Math.min(100,(raw[k].c||0)+(raw[k].r||0));o[k]={r:0,c:w,f:100-w};}return o;})();
const st=normalizeGameState({gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:94,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:94,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
const REF=[potSizing(0.33),potSizing(0.66),potSizing(1),jamSizing()];
const trees={
  ref:{betSpecs:REF,raiseSpecs:[],allowJam:true},
  only33_sym:{betSpecs:[potSizing(0.33)],raiseSpecs:[]},
  only33_asym:{betSpecs:[potSizing(0.33)],betSpecsByPlayer:{0:[potSizing(0.33)],1:REF},raiseSpecs:[],allowJam:true},
  onlyJam_asym:{betSpecs:[jamSizing()],betSpecsByPlayer:{0:[jamSizing()],1:REF},raiseSpecs:[],allowJam:true},
  only66_asym:{betSpecs:[potSizing(0.66)],betSpecsByPlayer:{0:[potSizing(0.66)],1:REF},raiseSpecs:[],allowJam:true},
};
for(const it of [150,400,1000,2500]){
  const line=[];
  for(const [name,ts] of Object.entries(trees)){
    const r=solveTreeSpec({state:st,heroRange:hero,villainRange:vill,treeSpec:ts,config:{maxIterations:it,maxCombos:120,seed:11}});
    line.push(`${name}=${r.ok?r.ev.toFixed(4):"X"}${r.ok&&r.convergence.nashConv!=null?`(nc ${r.convergence.nashConv.toFixed(3)})`:""}`);
  }
  console.log(`it=${it}: `+line.join("  "));
}
