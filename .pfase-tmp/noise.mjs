import { normalizeGameState } from "../src/sizing/gameState.js";
import { solveTreeSpec } from "../src/sizing/solverAdapter.js";
import { potSizing, previousBetSizing } from "../src/sizing/sizingSpec.js";
import { buildSolverFreqs } from "../src/solver/preflopRanges.js";

const hero = buildSolverFreqs("BTN","rfi",100,"BB");
const vill = (()=>{const raw=buildSolverFreqs("BB","vs_open",100,"BTN");const o={};for(const k in raw){const w=Math.min(100,(raw[k].c||0)+(raw[k].r||0));o[k]={r:0,c:w,f:100-w};}return o;})();
const mk=(street,board)=>normalizeGameState({gameType:"CASH",street,board,blinds:{sb:0.5,bb:1},
  players:[{id:"h",position:"BB",stack:94,committedStreet:0,isHero:true},{id:"v",position:"BTN",stack:94,committedStreet:0}],
  deadPot:12,actorId:"h"}).state;

const sizes=[0.33,0.75,1.5];
function run(street,board,depth,it,mc,seeds){
  const st=mk(street,board);
  const rows=[];
  for(const seed of seeds){
    const evs=sizes.map(f=>{
      const r=solveTreeSpec({state:st,heroRange:hero,villainRange:vill,
        treeSpec:{betSpecs:[potSizing(f)],raiseSpecs:[previousBetSizing(2.5)],maxRaisesPerStreet:1},
        config:{maxIterations:it,maxCombos:mc,evaluationDepth:depth,seed},optimizeFor:0});
      return r.ok?r.ev:NaN;
    });
    const best=evs.indexOf(Math.max(...evs));
    rows.push({seed,evs:evs.map(v=>v.toFixed(4)).join(" | "),best:sizes[best]});
  }
  console.log(`\n${street} depth=${depth} it=${it} mc=${mc}`);
  for(const r of rows) console.log(`  seed ${r.seed}: ${r.evs}  → meilleur ${r.best}`);
}
run("RIVER",[12,25,3,40,7],1,200,200,[1,2,3]);
run("TURN",[12,25,3,40],2,150,120,[1,2,3,4]);
run("FLOP",[12,25,3],2,120,90,[1,2,3,4]);
