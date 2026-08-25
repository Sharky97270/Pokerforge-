import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { potSizing, previousBetSizing } from "../src/sizing/sizingSpec.js";
import { buildSolverFreqs } from "../src/solver/preflopRanges.js";

const hero = buildSolverFreqs("BTN","rfi",100,"BB");
const vill = (()=>{const raw=buildSolverFreqs("BB","vs_open",100,"BTN");const o={};for(const k in raw){const w=Math.min(100,(raw[k].c||0)+(raw[k].r||0));o[k]={r:0,c:w,f:100-w};}return o;})();

const mk=(street,board)=>normalizeGameState({
  gameType:"CASH",street,board,
  blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:94,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:94,committedStreet:0}],
  deadPot:12, actorId:"h",
}).state;

for (const [street,board,depth] of [["FLOP",[12,25,3],1],["FLOP",[12,25,3],2],["FLOP",[12,25,3],3],["TURN",[12,25,3,40],1],["TURN",[12,25,3,40],2],["RIVER",[12,25,3,40,7],1]]) {
  for (const [it,mc] of [[60,60],[100,100],[120,140]]) {
    const st=mk(street,board);
    const t0=Date.now();
    const r=solveTreeSpec({state:st,heroRange:hero,villainRange:vill,
      treeSpec:{betSpecs:[potSizing(0.33),potSizing(0.75)],raiseSpecs:[previousBetSizing(2.5)],maxRaisesPerStreet:1},
      config:{maxIterations:it,maxCombos:mc,evaluationDepth:depth,seed:7},optimizeFor:0});
    console.log(`${street} depth=${depth} it=${it} mc=${mc} → ${r.ok?"EV "+r.ev:"FAIL "+r.reason} · ${Date.now()-t0}ms · nodes ${r.instrumentation?.treeNodes}`);
  }
}
