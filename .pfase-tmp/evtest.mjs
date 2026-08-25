import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { nodeActionEVs } from "../src/solver/core/multistreet.js";
import { potSizing, jamSizing } from "../src/sizing/sizingSpec.js";

const HERO={AA:{r:0,c:100,f:0},KK:{r:0,c:100,f:0},AKs:{r:0,c:100,f:0},"76s":{r:0,c:100,f:0},T9s:{r:0,c:100,f:0},"32o":{r:0,c:100,f:0}};
const VILL={QQ:{r:0,c:100,f:0},JJ:{r:0,c:100,f:0},AQs:{r:0,c:100,f:0},"98s":{r:0,c:100,f:0},"54s":{r:0,c:100,f:0},"72o":{r:0,c:100,f:0}};
const st=normalizeGameState({gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},minBet:1,
  players:[{id:"h",position:"BB",stack:40,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:40,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
const r=solveTreeSpec({state:st,heroRange:HERO,villainRange:VILL,
  treeSpec:{betSpecs:[potSizing(0.33),potSizing(0.75),jamSizing()],raiseSpecs:[],allowJam:true},
  config:{maxIterations:600,maxCombos:0,seed:5}});
console.log("solve",r.ok?r.status:r.reason,"EV racine",r.ev,"NashConv",r.convergence.nashConv);

for(const path of [[],["X"],["B0"]]){
  const ev=nodeActionEVs(r.solution,path);
  if(!ev.available){console.log(`nœud [${path.join("|")}] : indisponible — ${ev.reason}`);continue;}
  console.log(`\nnœud [${path.join("|")||"racine"}] · exact=${ev.exact} · part de range atteinte ${(ev.reachShare*100).toFixed(1)}%`);
  console.log("  toute la range :",JSON.stringify(ev.byAction));
  for(const cls of ["AA","AKs","32o"]) if(ev.byClass[cls]) console.log(`  ${cls.padEnd(4)}:`,JSON.stringify(ev.byClass[cls]));
}
const root=nodeActionEVs(r.solution,[]);
console.log(`
AUTO-CONTRÔLE — EV mélangée à la racine ${root.mixedEV} vs EV de la solution ${r.ev} · écart ${Math.abs(root.mixedEV-r.ev).toFixed(5)}`);
