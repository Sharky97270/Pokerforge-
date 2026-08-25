import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { extractStreetStrategy } from "../src/sizing/strategyExtract.js";
import { potSizing, jamSizing } from "../src/sizing/sizingSpec.js";
const HERO={AA:{r:0,c:100,f:0},KK:{r:0,c:100,f:0},AKs:{r:0,c:100,f:0},"76s":{r:0,c:100,f:0},T9s:{r:0,c:100,f:0},"32o":{r:0,c:100,f:0}};
const VILL={QQ:{r:0,c:100,f:0},JJ:{r:0,c:100,f:0},AQs:{r:0,c:100,f:0},"98s":{r:0,c:100,f:0},"54s":{r:0,c:100,f:0},"72o":{r:0,c:100,f:0}};
const st=normalizeGameState({gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},minBet:1,
  players:[{id:"h",position:"BB",stack:40,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:40,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
const r=solveTreeSpec({state:st,heroRange:HERO,villainRange:VILL,treeSpec:{betSpecs:[potSizing(0.33),potSizing(0.75),jamSizing()],raiseSpecs:[],allowJam:true},config:{maxIterations:12800,maxCombos:0,seed:5}});
const sol=r.solution;
const cnt={};for(const h of sol.heroList){cnt[h.key]=(cnt[h.key]||0)+1;}
console.log("combos par classe (hero) :",JSON.stringify(cnt));
console.log("poids wH :",Array.from(sol.wH).map(x=>x.toFixed(3)).join(" "));
console.log("NashConv",r.convergence.nashConv,"| EV",r.ev,"\n");
const root=extractStreetStrategy(sol).nodes[""];
for(const cls of Object.keys(root.byClass)){
  const f=root.byClass[cls],e=root.ev.byClass[cls];
  const line=Object.keys(f).map(a=>a+' '+(f[a]*100).toFixed(1)+'% ev='+e[a].toFixed(3)).join('  |  ');
  console.log(cls.padEnd(5),line);
}
