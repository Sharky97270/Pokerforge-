import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { strategyEV, nodeActionEVs, bestResponseEV } from "../src/solver/core/multistreet.js";
import { potSizing, jamSizing } from "../src/sizing/sizingSpec.js";
const HERO={AA:{r:0,c:100,f:0},KK:{r:0,c:100,f:0},AKs:{r:0,c:100,f:0},"76s":{r:0,c:100,f:0},T9s:{r:0,c:100,f:0},"32o":{r:0,c:100,f:0}};
const VILL={QQ:{r:0,c:100,f:0},JJ:{r:0,c:100,f:0},AQs:{r:0,c:100,f:0},"98s":{r:0,c:100,f:0},"54s":{r:0,c:100,f:0},"72o":{r:0,c:100,f:0}};
const st=normalizeGameState({gameType:"CASH",street:"RIVER",board:[12,25,3,40,7],blinds:{sb:0.5,bb:1},minBet:1,
  players:[{id:"h",position:"BB",stack:40,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:40,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;
const ts={betSpecs:[potSizing(0.33),potSizing(0.75),jamSizing()],raiseSpecs:[],allowJam:true};
const r=solveTreeSpec({state:st,heroRange:HERO,villainRange:VILL,treeSpec:ts,config:{maxIterations:1200,maxCombos:0,seed:5}});
const sol=r.solution;
const se=strategyEV(sol);
const na=nodeActionEVs(sol,[]);
console.log("EV(stratégie moyenne)      ", se.ev);
console.log("EV mélangée via nodeActionEVs", na.mixedEV);
console.log("écart                       ", Math.abs(se.ev-na.mixedEV).toFixed(6));
console.log("moyenne des itérations      ", r.evIterateMean, "| source:", r.evSource);
const br=bestResponseEV(sol);
console.log("bornes best-response        ", JSON.stringify(br));
console.log("EV par action (racine)      ", JSON.stringify(na.byAction));
