/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · MULTI-STREET CFR v2 (§26) — EXPÉRIMENTAL
   CFR+ VECTORISÉ marchant le Game Tree Engine v2 (§12).

   v2 :
   · SOUS-ARBRES PAR CARTE : les infosets sont indexés par (nœud, cartes de board
     révélées depuis le board initial) → la stratégie turn/river DÉPEND de la carte
     tombée (plus de moyennage sur les runouts). L'arbre physique reste partagé ;
     seules les tables de regret/stratégie se ramifient (lazy, par runout visité).
   · Échantillonnage des runouts (chance sampling) seedé quand le board est
     incomplet ; énumération exacte du showdown quand le board est complet.
   · Zérotage des reaches aux nœuds chance : un combo qui contient la carte
     tombée n'existe pas sur ce runout.
   · MEILLEURE RÉPONSE / EXPLOITABILITÉ (board complet) : nashConv(sol) = somme
     des gains de meilleure réponse des deux joueurs contre la stratégie moyenne.
     ≈ 0 ⟺ équilibre du jeu modélisé. C'est LA mesure rigoureuse de validité.

   ⚠ Tant que non benchmarké sur un large éventail de spots, ne JAMAIS présenter
   ces résultats comme « GTO » dans l'UI (§2). Validé : jeu de clairvoyance
   (solution analytique) + exploitabilité ≈ 0.
════════════════════════════════════════════════════════════════════════════ */
import { buildPostflopTree, terminalUtility } from "./gametree.js";
import { eval7i } from "./evaluator.js";
import { mulberry32 } from "./equity.js";

/* Résout l'arbre postflop pour un board de 3 à 5 cartes. */
export function solveTree(heroList,villList,board,opts={}){
  const iters=opts.iters||600;
  const startPot=opts.startPot||6;
  const initLen=board.length;
  const need=5-initLen;                       // cartes de board à tirer (0..2)
  const rng=mulberry32((opts.seed??123457)>>>0);
  const tree=buildPostflopTree({...opts,startPot,streets:opts.streets||1,ipProbe:opts.ipProbe!==false});
  const nH=heroList.length,nV=villList.length;
  const wH=heroList.map(e=>e.w??1),wV=villList.map(e=>e.w??1);

  // Showdown E[i][j] ∈ {1,0.5,0} pour le board complet courant ; -1 si collision.
  // PERF ranges larges : scores PAR MAIN (nH+nV eval7i) puis comparaisons —
  // au lieu de 2·nH·nV évaluations par board.
  const E=Array.from({length:nH},()=>new Float32Array(nV));
  const sH=new Float64Array(nH),sV=new Float64Array(nV);
  const computeE=(b)=>{
    for(let i=0;i<nH;i++){const h=heroList[i].cards;
      sH[i]=(b.includes(h[0])||b.includes(h[1]))?-1:eval7i([h[0],h[1],b[0],b[1],b[2],b[3],b[4]]);}
    for(let j=0;j<nV;j++){const v=villList[j].cards;
      sV[j]=(b.includes(v[0])||b.includes(v[1]))?-1:eval7i([v[0],v[1],b[0],b[1],b[2],b[3],b[4]]);}
    for(let i=0;i<nH;i++){const h=heroList[i].cards;const row=E[i];const hs=sH[i];
      for(let j=0;j<nV;j++){const v=villList[j].cards;
        if(hs<0||sV[j]<0||h[0]===v[0]||h[0]===v[1]||h[1]===v[0]||h[1]===v[1]){row[j]=-1;continue;}
        row[j]=hs>sV[j]?1:hs===sV[j]?0.5:0;
      }}
  };
  const used=new Uint8Array(52);
  const sampleBoard=()=>{
    used.fill(0);for(const c of board)used[c]=1;
    const b=board.slice();
    while(b.length<5){const c=(rng()*52)|0;if(!used[c]){used[c]=1;b.push(c);}}
    return b;
  };
  let curB=board.slice();
  if(need===0){curB=board.slice();computeE(curB);}

  /* Tables de regret / stratégie cumulée : node.id → Map(ctx → [combo][action]).
     ctx = cartes révélées depuis le board initial à la street du nœud (sous-arbres
     par carte). Allocation lazy par runout réellement visité. */
  const reg={},strat={};
  (function init(n){
    if(n.kind==="decision"){reg[n.id]=new Map();strat[n.id]=new Map();for(const a of n.actions)init(n.children[a]);}
    else if(n.kind==="chance")init(n.next);
  })(tree);
  // Clé de contexte d'un nœud : cartes du board visibles à sa street, au-delà du
  // board initial. La street 0 de l'arbre = le board initial (flop OU turn OU river),
  // donc visibles à la street s = initLen + s.
  const keyFor=(node)=>{const vis=initLen+node.street;return vis<=initLen?"":curB.slice(initLen,Math.min(5,vis)).join(",");};
  const getTbl=(store,node,key,nc,na)=>{
    const m=store[node.id];let t=m.get(key);
    if(!t){t=Array.from({length:nc},()=>new Float64Array(na));m.set(key,t);}
    return t;
  };
  const stratFromReg=(r)=>{
    let s=0;const out=new Float64Array(r.length);
    for(let k=0;k<r.length;k++){out[k]=r[k]>0?r[k]:0;s+=out[k];}
    if(s>0)for(let k=0;k<r.length;k++)out[k]/=s;else out.fill(1/r.length);
    return out;
  };

  // Retourne {vH,vV} : valeurs contrefactuelles par combo, perspective de chaque joueur.
  function traverse(node,reachH,reachV,tw){
    if(node.kind==="terminal"){
      const vH=new Float64Array(nH),vV=new Float64Array(nV);
      for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=reachV[j]*terminalUtility(node,startPot,e);}vH[i]=acc;}
      for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=reachH[i]*(-terminalUtility(node,startPot,e));}vV[j]=acc;}
      return{vH,vV};
    }
    if(node.kind==="chance"){
      const ci=initLen+node.street;            // index de la carte révélée pour street+1
      if(ci>=initLen&&ci<5){
        // Carte échantillonnée : les combos qui la contiennent n'existent pas sur ce runout.
        const c=curB[ci];
        const rh=Float64Array.from(reachH),rv=Float64Array.from(reachV);
        for(let i=0;i<nH;i++){const h=heroList[i].cards;if(h[0]===c||h[1]===c)rh[i]=0;}
        for(let j=0;j<nV;j++){const v=villList[j].cards;if(v[0]===c||v[1]===c)rv[j]=0;}
        return traverse(node.next,rh,rv,tw);
      }
      return traverse(node.next,reachH,reachV,tw);
    }
    const na=node.actions.length,key=keyFor(node);
    const vH=new Float64Array(nH),vV=new Float64Array(nV);
    if(node.player===0){                                   // Hero agit
      const regT=getTbl(reg,node,key,nH,na),stT=getTbl(strat,node,key,nH,na);
      const S=[];for(let i=0;i<nH;i++)S[i]=stratFromReg(regT[i]);
      const child=[];
      for(let a=0;a<na;a++){const cr=new Float64Array(nH);for(let i=0;i<nH;i++)cr[i]=reachH[i]*S[i][a];child[a]=traverse(node.children[node.actions[a]],cr,reachV,tw);}
      for(let i=0;i<nH;i++){
        let nv=0;for(let a=0;a<na;a++)nv+=S[i][a]*child[a].vH[i];vH[i]=nv;
        const rg=regT[i],st=stT[i];
        for(let a=0;a<na;a++){rg[a]=Math.max(0,rg[a]+child[a].vH[i]-nv);st[a]+=tw*reachH[i]*S[i][a];}
      }
      for(let j=0;j<nV;j++){let acc=0;for(let a=0;a<na;a++)acc+=child[a].vV[j];vV[j]=acc;}
    }else{                                                 // Villain agit
      const regT=getTbl(reg,node,key,nV,na),stT=getTbl(strat,node,key,nV,na);
      const S=[];for(let j=0;j<nV;j++)S[j]=stratFromReg(regT[j]);
      const child=[];
      for(let a=0;a<na;a++){const cr=new Float64Array(nV);for(let j=0;j<nV;j++)cr[j]=reachV[j]*S[j][a];child[a]=traverse(node.children[node.actions[a]],reachH,cr,tw);}
      for(let j=0;j<nV;j++){
        let nv=0;for(let a=0;a<na;a++)nv+=S[j][a]*child[a].vV[j];vV[j]=nv;
        const rg=regT[j],st=stT[j];
        for(let a=0;a<na;a++){rg[a]=Math.max(0,rg[a]+child[a].vV[j]-nv);st[a]+=tw*reachV[j]*S[j][a];}
      }
      for(let i=0;i<nH;i++){let acc=0;for(let a=0;a<na;a++)acc+=child[a].vH[i];vH[i]=acc;}
    }
    return{vH,vV};
  }

  const sumWH=wH.reduce((a,b)=>a+b,0),sumWV=wV.reduce((a,b)=>a+b,0);
  let evNum=0,evDen=0;
  for(let t=0;t<iters;t++){
    if(need>0){curB=sampleBoard();computeE(curB);}   // échantillonne le runout (§26)
    const r=traverse(tree,Float64Array.from(wH),Float64Array.from(wV),t+1);
    let num=0;for(let i=0;i<nH;i++)num+=wH[i]*r.vH[i];
    evNum+=num;evDen+=sumWH*sumWV;                   // EV Hero moyennée sur les runouts
  }
  const ev=evDen?evNum/evDen:0;

  // Stratégie moyenne par nœud/combo, pour un contexte de runout donné (déf. board initial).
  const avgOf=(node,c,key="")=>{
    const m=strat[node.id];const t=m?m.get(key):null;
    const na=node.actions.length;
    if(!t)return new Array(na).fill(1/na);
    const st=t[c];let s=0;for(const x of st)s+=x;
    const out=new Array(na);for(let k=0;k<na;k++)out[k]=s>0?st[k]/s:1/na;
    return out;
  };
  // Fréquence agrégée (pondérée par le poids des combos) d'une action à un nœud.
  const aggAt=(node,actIdx,key="")=>{let num=0,den=0;const nc=node.player===0?nH:nV,w=node.player===0?wH:wV;for(let c=0;c<nc;c++){num+=w[c]*avgOf(node,c,key)[actIdx];den+=w[c];}return den?num/den:0;};

  const heroCheck=aggAt(tree,0);
  return{
    tree,E,avgOf,aggAt,heroList,villList,wH,wV,startPot,initLen,
    // nb de contextes de runout appris à un nœud (>1 ⟺ sous-arbres par carte actifs)
    ctxCount:(node)=>strat[node.id]?strat[node.id].size:0,
    heroCheck:Math.round(heroCheck*1000)/10,
    heroBet:Math.round((1-heroCheck)*1000)/10,
    ev:Math.round(ev*1000)/1000,
    iters,sampled:need>0,boardCards:initLen,
  };
}
/* Alias rétro-compat : le board complet (5 cartes) est le cas exact. */
export const solveTreeFixedBoard=solveTree;

/* ══ MEILLEURE RÉPONSE / EXPLOITABILITÉ — board complet uniquement (exact). ══
   Valeur de la meilleure réponse de `brPlayer` contre la stratégie MOYENNE adverse.
   nashConv = brEV(Hero) + brEV(Villain) ≥ 0 ; ≈ 0 ⟺ équilibre (jeu zéro-somme). */
export function bestResponseEV(sol,brPlayer){
  if(sol.sampled)return null;   // exact seulement sur board complet (pas de bruit d'échantillonnage)
  const {tree,E,heroList,villList,wH,wV,startPot,avgOf}=sol;
  const nH=heroList.length,nV=villList.length;
  const nBr=brPlayer===0?nH:nV;
  function walk(node,oppReach){
    if(node.kind==="terminal"){
      const v=new Float64Array(nBr);
      if(brPlayer===0){for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=oppReach[j]*terminalUtility(node,startPot,e);}v[i]=acc;}}
      else{for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=oppReach[i]*(-terminalUtility(node,startPot,e));}v[j]=acc;}}
      return v;
    }
    if(node.kind==="chance")return walk(node.next,oppReach);
    const na=node.actions.length;
    if(node.player===brPlayer){
      // Le BR choisit, par combo, l'action qui maximise sa valeur (même oppReach partout).
      const childs=node.actions.map(a=>walk(node.children[a],oppReach));
      const v=new Float64Array(nBr);
      for(let c=0;c<nBr;c++){let best=-Infinity;for(let a=0;a<na;a++)if(childs[a][c]>best)best=childs[a][c];v[c]=best;}
      return v;
    }
    // L'adversaire joue sa stratégie moyenne : on scinde son reach par action et on somme.
    const nOpp=node.player===0?nH:nV;
    const v=new Float64Array(nBr);
    for(let a=0;a<na;a++){
      const cr=new Float64Array(nOpp);
      for(let c=0;c<nOpp;c++)cr[c]=oppReach[c]*avgOf(node,c)[a];
      const cv=walk(node.children[node.actions[a]],cr);
      for(let c=0;c<nBr;c++)v[c]+=cv[c];
    }
    return v;
  }
  const oppW=brPlayer===0?Float64Array.from(wV):Float64Array.from(wH);
  const myW=brPlayer===0?wH:wV;
  const v=walk(tree,oppW);
  let num=0;for(let c=0;c<nBr;c++)num+=myW[c]*v[c];
  const den=wH.reduce((a,b)=>a+b,0)*wV.reduce((a,b)=>a+b,0);
  return den?num/den:0;
}
/* NashConv (bb) : somme des gains de meilleure réponse. ≈0 ⟺ équilibre. */
export function nashConv(sol){
  const h=bestResponseEV(sol,0),v=bestResponseEV(sol,1);
  if(h==null||v==null)return null;
  return Math.round((h+v)*10000)/10000;
}
