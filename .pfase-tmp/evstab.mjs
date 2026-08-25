import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { strategyEV } from "../src/solver/core/multistreet.js";
import { potSizing, jamSizing } from "../src/sizing/sizingSpec.js";
const HERO={AA:{r:0,c:100,f:0},KK:{r:0,c:100,f:0},AKs:{r:0,c:100,f:0},"76s":{r:0,c:100,f:0},T9s:{r:0,c:100,f:0},"32o":{r:0,c:100,f:0}};
const VILL={QQ:{r:0,c:100,f:0},JJ:{r:0,c:100,f:0},AQs:{r:0,c:100,f:0},"98s":{r:0,c:100,f:0},"54s":{r:0,c:100,f:0},"72o":{r:0,c:100,f:0}};
const st=normalizeGameState({gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},minBet:1,
  players:[{id:"h",position:"BB",stack:40,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:40,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
const ts={betSpecs:[potSizing(0.33),potSizing(0.75),jamSizing()],raiseSpecs:[],allowJam:true};
console.log("it     sol.ev    EV(stratégie moyenne)   NashConv");
for(const it of [100,200,400,800,1600,3200]){
  const r=solveTreeSpec({state:st,heroRange:HERO,villainRange:VILL,treeSpec:ts,config:{maxIterations:it,maxCombos:0,seed:5}});
  const se=strategyEV(r.solution);
  console.log(String(it).padStart(5),String(r.ev).padStart(9),String(se.ev).padStart(22),String(r.convergence.nashConv).padStart(10));
}
