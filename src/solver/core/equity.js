/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · EQUITY ENGINE (§10)
   Équité Hero (%) par Monte-Carlo main-vs-range / range-vs-range, avec card
   removal et board fixé (postflop sur texture réelle).
   Provenance = NUMERICAL_APPROXIMATION (échantillonnage — comporte une marge
   d'erreur). Une énumération exacte (EXACT_CALCULATION) reste à ajouter (§10).
   Isolé du monolithe (Phase 9).
════════════════════════════════════════════════════════════════════════════ */
import { eval7i } from "./evaluator.js";

function _buildSampler(list){
  const cum=[];let tot=0;
  for(const e of list){tot+=e.w;cum.push(tot);}
  return{list,cum,tot};
}
function _sample(s){
  const x=Math.random()*s.tot;
  let lo=0,hi=s.cum.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(s.cum[m]<x)lo=m+1;else hi=m;}
  return s.list[lo].cards;
}
/* Équité Hero (%) par Monte-Carlo. board = cartes fixées (0..5 ints) → postflop
   sur texture réelle. Retourne un entier 0..100. */
export function monteCarloEquity(heroList,villList,iters=2500,boardFixed=[]){
  if(!heroList||!villList||!heroList.length||!villList.length)return 50;
  const fixed=boardFixed||[];
  const hs=_buildSampler(heroList),vs=_buildSampler(villList);
  const used=new Uint8Array(52);
  let score=0,n=0,guard=0;
  while(n<iters&&guard<iters*4){
    guard++;
    const h=_sample(hs),v=_sample(vs);
    // collisions main/main ou main/board
    if(h[0]===v[0]||h[0]===v[1]||h[1]===v[0]||h[1]===v[1])continue;
    if(fixed.includes(h[0])||fixed.includes(h[1])||fixed.includes(v[0])||fixed.includes(v[1]))continue;
    used.fill(0);used[h[0]]=1;used[h[1]]=1;used[v[0]]=1;used[v[1]]=1;
    for(const c of fixed)used[c]=1;
    const board=fixed.slice();
    while(board.length<5){const c=(Math.random()*52)|0;if(!used[c]){used[c]=1;board.push(c);}}
    const hv=eval7i([h[0],h[1],board[0],board[1],board[2],board[3],board[4]]);
    const vv=eval7i([v[0],v[1],board[0],board[1],board[2],board[3],board[4]]);
    if(hv>vv)score+=1;else if(hv===vv)score+=0.5;
    n++;
  }
  return n?Math.round(score/n*100):50;
}
