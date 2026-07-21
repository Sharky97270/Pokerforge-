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
function _sample(s,rng){
  const x=rng()*s.tot;
  let lo=0,hi=s.cum.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(s.cum[m]<x)lo=m+1;else hi=m;}
  return s.list[lo].cards;
}
/* PRNG déterministe (mulberry32) — reproductibilité des solves (§15). */
export function mulberry32(a){
  return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
/* Graine déterministe dérivée du spot : même spot → même seed → même équité. */
export function seedFrom(heroList,villList,board){
  let h=2166136261;const mix=x=>{h^=x>>>0;h=Math.imul(h,16777619);};
  mix(heroList.length);mix(villList.length);
  for(const c of (board||[]))mix(c+1);
  for(let i=0;i<Math.min(8,heroList.length);i++){mix(heroList[i].cards[0]+1);mix(heroList[i].cards[1]+1);}
  for(let i=0;i<Math.min(8,villList.length);i++){mix(villList[i].cards[0]+1);mix(villList[i].cards[1]+1);}
  return h>>>0;
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
    // Équité NON ARRONDIE — cf. note de précision au-dessus de monteCarloEquity.
    return{equity:den?num/den*100:50,exact:true,evals:evalCost};
  }
  const iters=opts.iters||2500;
  // Seed déterministe dérivé du spot (ou fourni) → équité stable & reproductible (§15).
  const seed=opts.seed!=null?opts.seed:seedFrom(heroList,villList,fixed);
  return{equity:monteCarloEquity(heroList,villList,iters,fixed,seed),exact:false,samples:iters,seed};
}

/* ── PRÉCISION : équité NON ARRONDIE (0..100, flottant) ────────────────────────
   Cette fonction et computeEquity renvoyaient `Math.round(...*100)`, soit un
   plancher de granularité de 1 POINT. Anodin pour l'affichage, disqualifiant comme
   primitive de calcul : une décision de range marginale se joue SOUS le point, et
   aucun budget d'échantillonnage ne rattrape un arrondi.

   Mesuré sur AKs vs QQ (réf. publiée ≈46.0%), 12 tirages par palier :
     400 itérations   → écart-type ±3.01
     5 000            → ±0.72
     20 000           → ±0.28
     80 000           → ±0.00  ← ce n'était PAS de la précision, mais l'arrondi
                                 masquant toute variation résiduelle.

   L'arrondi appartient désormais à la couche d'AFFICHAGE (SharkSolverTab arrondit
   au dixième au moment de composer ses props). Le CFR n'est pas concerné : il
   construit sa propre matrice d'équité depuis eval7i et ne passe pas par ici.

   Prérequis à la génération de ranges préflop pré-solvées (§11) : le push/fold
   tapis court est exactement solvable sans arbre postflop, mais seulement si la
   primitive d'équité sait exprimer mieux que le point entier.
   board = cartes fixées (0..5 ints) → postflop sur texture réelle. */
export function monteCarloEquity(heroList,villList,iters=2500,boardFixed=[],seed=null){
  if(!heroList||!villList||!heroList.length||!villList.length)return 50;
  const fixed=boardFixed||[];
  // rng seedé (reproductible) si seed fourni, sinon Math.random.
  const rng=seed==null?Math.random:mulberry32(seed>>>0);
  const hs=_buildSampler(heroList),vs=_buildSampler(villList);
  const used=new Uint8Array(52);
  let score=0,n=0,guard=0;
  while(n<iters&&guard<iters*4){
    guard++;
    const h=_sample(hs,rng),v=_sample(vs,rng);
    // collisions main/main ou main/board
    if(h[0]===v[0]||h[0]===v[1]||h[1]===v[0]||h[1]===v[1])continue;
    if(fixed.includes(h[0])||fixed.includes(h[1])||fixed.includes(v[0])||fixed.includes(v[1]))continue;
    used.fill(0);used[h[0]]=1;used[h[1]]=1;used[v[0]]=1;used[v[1]]=1;
    for(const c of fixed)used[c]=1;
    const board=fixed.slice();
    while(board.length<5){const c=(rng()*52)|0;if(!used[c]){used[c]=1;board.push(c);}}
    const hv=eval7i([h[0],h[1],board[0],board[1],board[2],board[3],board[4]]);
    const vv=eval7i([v[0],v[1],board[0],board[1],board[2],board[3],board[4]]);
    if(hv>vv)score+=1;else if(hv===vv)score+=0.5;
    n++;
  }
  return n?score/n*100:50;
}
