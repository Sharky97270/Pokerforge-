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
/* Coefficient binomial (petit k). */
function comb(n,k){ if(k<0||k>n)return 0; let r=1; for(let i=0;i<k;i++)r=r*(n-i)/(i+1); return Math.round(r); }

/* Énumère toutes les combinaisons de `k` cartes parmi celles non mortes, appelle
   cb(cards[]). Utilisé pour l'énumération EXACTE des runouts (k petit : 0,1,2). */
function enumRunouts(dead,k,cb){
  const avail=[];
  for(let c=0;c<52;c++)if(!dead.includes(c))avail.push(c);
  if(k===0){cb([]);return;}
  const idx=new Array(k);
  (function rec(start,depth){
    if(depth===k){cb(idx.map(i=>avail[i]));return;}
    for(let i=start;i<=avail.length-(k-depth);i++){idx[depth]=i;rec(i+1,depth+1);}
  })(0,0);
}

/* Équité EXACTE d'un affrontement combo vs combo par énumération des runouts. */
function exactMatchup(h,v,fixed){
  const dead=[h[0],h[1],v[0],v[1],...fixed];
  const need=5-fixed.length;
  let win=0,half=0,tot=0;
  enumRunouts(dead,need,(nc)=>{
    const b=need?[...fixed,...nc]:fixed;
    const hv=eval7i([h[0],h[1],b[0],b[1],b[2],b[3],b[4]]);
    const vv=eval7i([v[0],v[1],b[0],b[1],b[2],b[3],b[4]]);
    if(hv>vv)win++;else if(hv===vv)half++;tot++;
  });
  return tot?(win+half*0.5)/tot:0.5;
}

/* ── computeEquity — choisit AUTOMATIQUEMENT énumération exacte vs Monte-Carlo (§10).
   Retourne { equity, exact, evals?, samples? }. Le champ `exact` permet à l'appelant
   de fixer la provenance (EXACT_CALCULATION vs NUMERICAL_APPROXIMATION). Le moteur
   reste indépendant du système de provenance. ── */
export function computeEquity(heroList,villList,boardFixed=[],opts={}){
  if(!heroList||!villList||!heroList.length||!villList.length)return{equity:50,exact:false,samples:0};
  const budget=opts.budget||200000;
  const fixed=boardFixed||[];
  const need=5-fixed.length;
  // coût estimé en O(1) (borne haute nH×nV × runouts) → décide exact vs MC sans
  // parcourir toutes les paires (évite un double-loop coûteux sur grosses ranges).
  const runoutCombos=need===0?1:comb(52-4-fixed.length,need);
  const evalCost=heroList.length*villList.length*runoutCombos;
  if(need===0||evalCost<=budget){
    let num=0,den=0;
    for(const h of heroList)for(const v of villList){
      const hc=h.cards,vc=v.cards,w=(h.w||1)*(v.w||1);
      if(hc[0]===vc[0]||hc[0]===vc[1]||hc[1]===vc[0]||hc[1]===vc[1])continue;
      num+=w*exactMatchup(hc,vc,fixed);den+=w;
    }
    return{equity:den?Math.round(num/den*100):50,exact:true,evals:evalCost};
  }
  const iters=opts.iters||2500;
  return{equity:monteCarloEquity(heroList,villList,iters,fixed),exact:false,samples:iters};
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
