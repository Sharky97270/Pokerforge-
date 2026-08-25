import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { extractStreetStrategy } from "../src/sizing/strategyExtract.js";
import { potSizing, jamSizing } from "../src/sizing/sizingSpec.js";
const HERO={AA:{r:0,c:100,f:0},KK:{r:0,c:100,f:0},AKs:{r:0,c:100,f:0},"76s":{r:0,c:100,f:0},T9s:{r:0,c:100,f:0},"32o":{r:0,c:100,f:0}};
const VILL={QQ:{r:0,c:100,f:0},JJ:{r:0,c:100,f:0},AQs:{r:0,c:100,f:0},"98s":{r:0,c:100,f:0},"54s":{r:0,c:100,f:0},"72o":{r:0,c:100,f:0}};
const st=normalizeGameState({gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},minBet:1,
  players:[{id:"h",position:"BB",stack:40,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:40,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
const ts={betSpecs:[potSizing(0.33),potSizing(0.75),jamSizing()],raiseSpecs:[],allowJam:true};
console.log("Écart d'indifférence : pour chaque classe, max−min de l'EV sur les actions jouées à ≥5 %.");
console.log("it     NashConv   écart moyen   écart max   (racine)");
for(const it of [200,800,3200,12800]){
  const r=solveTreeSpec({state:st,heroRange:HERO,villainRange:VILL,treeSpec:ts,config:{maxIterations:it,maxCombos:0,seed:5}});
  const root=extractStreetStrategy(r.solution).nodes[""];
  const gaps=[];
  for(const cls of Object.keys(root.byClass)){
    const f=root.byClass[cls], e=root.ev.byClass[cls];
    const played=Object.keys(f).filter(a=>f[a]>=0.05);
    if(played.length<2) continue;
    const vs=played.map(a=>e[a]);
    gaps.push(Math.max(...vs)-Math.min(...vs));
  }
  const avg=gaps.reduce((a,b)=>a+b,0)/(gaps.length||1);
  console.log(String(it).padStart(5),String(r.convergence.nashConv).padStart(10),
    avg.toFixed(4).padStart(12),Math.max(...gaps).toFixed(4).padStart(11),' n='+gaps.length);
}
