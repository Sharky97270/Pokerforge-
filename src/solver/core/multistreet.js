/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · MULTI-STREET CFR (§26) — EXPÉRIMENTAL
   CFR+ VECTORISÉ marchant le Game Tree Engine (§12). V1 : board complet fixé
   (5 cartes) → les nœuds chance sont des passe-plats ; le betting multi-rue est
   résolu exactement. L'échantillonnage des runouts turn/river (board incomplet)
   viendra ensuite.

   ⚠ Tant que ce solveur n'est pas benchmarké sur un large éventail de spots, ses
   résultats ne doivent JAMAIS être présentés comme « GTO » dans l'UI (§2). Validé
   pour l'instant sur le jeu de clairvoyance (solution analytique connue).

   Mécanique : CFR+ « simultané » — une passe met à jour les regrets du joueur qui
   agit à chaque nœud. Valeurs contrefactuelles pondérées par le reach adverse ;
   moyennage de stratégie pondéré par le reach propre et l'itération (linéaire).
════════════════════════════════════════════════════════════════════════════ */
import { buildPostflopTree, terminalUtility } from "./gametree.js";
import { eval7i } from "./evaluator.js";
import { mulberry32 } from "./equity.js";

/* Résout l'arbre postflop pour un board de 3 à 5 cartes.
   · 5 cartes (river)  → énumération EXACTE (E calculé une fois).
   · <5 cartes (flop/turn) → échantillonnage des runouts (§26) : à chaque itération
     on tire les cartes manquantes et on recalcule E. Les stratégies aux nœuds
     turn/river sont MOYENNÉES sur les runouts (l'arbre V1 ne se ramifie pas par
     carte de board — simplification documentée ; un vrai solveur a des sous-arbres
     par carte). RÉSULTATS EXPÉRIMENTAUX tant que non benchmarkés (§2). */
export function solveTree(heroList,villList,board,opts={}){
  const iters=opts.iters||600;
  const startPot=opts.startPot||6;
  const need=5-board.length;                 // cartes de board à tirer (0..2)
  const rng=mulberry32((opts.seed??123457)>>>0);
  const tree=buildPostflopTree({betFrac:opts.betFrac||0.66,startPot,streets:opts.streets||1,ipProbe:opts.ipProbe!==false});
  const nH=heroList.length,nV=villList.length;
  const wH=heroList.map(e=>e.w??1),wV=villList.map(e=>e.w??1);

  // Showdown E[i][j] ∈ {1,0.5,0} pour un board complet donné ; -1 si collision.
  let E=Array.from({length:nH},()=>new Float32Array(nV));
  const computeE=(b)=>{
    for(let i=0;i<nH;i++){const h=heroList[i].cards;const row=E[i];
      for(let j=0;j<nV;j++){const v=villList[j].cards;
        if(h[0]===v[0]||h[0]===v[1]||h[1]===v[0]||h[1]===v[1]||b.includes(h[0])||b.includes(h[1])||b.includes(v[0])||b.includes(v[1])){row[j]=-1;continue;}
        const hv=eval7i([h[0],h[1],b[0],b[1],b[2],b[3],b[4]]);
        const vv=eval7i([v[0],v[1],b[0],b[1],b[2],b[3],b[4]]);
        row[j]=hv>vv?1:hv===vv?0.5:0;
      }}
  };
  const used=new Uint8Array(52);
  const sampleBoard=()=>{
    used.fill(0);for(const c of board)used[c]=1;
    const b=board.slice();
    while(b.length<5){const c=(rng()*52)|0;if(!used[c]){used[c]=1;b.push(c);}}
    return b;
  };
  if(need===0)computeE(board);

  // Tables de regret / stratégie cumulée, par nœud de décision, par combo du joueur qui agit.
  const reg={},strat={};
  (function init(n){
    if(n.kind==="decision"){
      const nc=n.player===0?nH:nV,na=n.actions.length;
      reg[n.id]=Array.from({length:nc},()=>new Float64Array(na));
      strat[n.id]=Array.from({length:nc},()=>new Float64Array(na));
      for(const a of n.actions)init(n.children[a]);
    }else if(n.kind==="chance")init(n.next);
  })(tree);

  const stratOf=(node,c)=>{
    const r=reg[node.id][c];let s=0;const out=new Float64Array(r.length);
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
    if(node.kind==="chance")return traverse(node.next,reachH,reachV,tw);
    const na=node.actions.length,vH=new Float64Array(nH),vV=new Float64Array(nV);
    if(node.player===0){                                   // Hero agit
      const S=[];for(let i=0;i<nH;i++)S[i]=stratOf(node,i);
      const child=[];
      for(let a=0;a<na;a++){const cr=new Float64Array(nH);for(let i=0;i<nH;i++)cr[i]=reachH[i]*S[i][a];child[a]=traverse(node.children[node.actions[a]],cr,reachV,tw);}
      for(let i=0;i<nH;i++){
        let nv=0;for(let a=0;a<na;a++)nv+=S[i][a]*child[a].vH[i];vH[i]=nv;
        const rg=reg[node.id][i],st=strat[node.id][i];
        for(let a=0;a<na;a++){rg[a]=Math.max(0,rg[a]+child[a].vH[i]-nv);st[a]+=tw*reachH[i]*S[i][a];}
      }
      for(let j=0;j<nV;j++){let acc=0;for(let a=0;a<na;a++)acc+=child[a].vV[j];vV[j]=acc;}
    }else{                                                 // Villain agit
      const S=[];for(let j=0;j<nV;j++)S[j]=stratOf(node,j);
      const child=[];
      for(let a=0;a<na;a++){const cr=new Float64Array(nV);for(let j=0;j<nV;j++)cr[j]=reachV[j]*S[j][a];child[a]=traverse(node.children[node.actions[a]],reachH,cr,tw);}
      for(let j=0;j<nV;j++){
        let nv=0;for(let a=0;a<na;a++)nv+=S[j][a]*child[a].vV[j];vV[j]=nv;
        const rg=reg[node.id][j],st=strat[node.id][j];
        for(let a=0;a<na;a++){rg[a]=Math.max(0,rg[a]+child[a].vV[j]-nv);st[a]+=tw*reachV[j]*S[j][a];}
      }
      for(let i=0;i<nH;i++){let acc=0;for(let a=0;a<na;a++)acc+=child[a].vH[i];vH[i]=acc;}
    }
    return{vH,vV};
  }

  const sumWH=wH.reduce((a,b)=>a+b,0),sumWV=wV.reduce((a,b)=>a+b,0);
  let evNum=0,evDen=0;
  for(let t=0;t<iters;t++){
    if(need>0)computeE(sampleBoard());              // échantillonne le runout (§26)
    const r=traverse(tree,Float64Array.from(wH),Float64Array.from(wV),t+1);
    let num=0;for(let i=0;i<nH;i++)num+=wH[i]*r.vH[i];
    evNum+=num;evDen+=sumWH*sumWV;                  // EV Hero moyennée sur les runouts
  }
  const ev=evDen?evNum/evDen:0;

  // Stratégie moyenne par nœud/combo.
  const avgOf=(node,c)=>{const st=strat[node.id][c];let s=0;for(const x of st)s+=x;const out=new Array(st.length);for(let k=0;k<st.length;k++)out[k]=s>0?st[k]/s:1/st.length;return out;};
  // Fréquence agrégée (pondérée par le poids des combos) d'une action à un nœud.
  const aggAt=(node,actIdx)=>{let num=0,den=0;const nc=node.player===0?nH:nV,w=node.player===0?wH:wV;for(let c=0;c<nc;c++){num+=w[c]*avgOf(node,c)[actIdx];den+=w[c];}return den?num/den:0;};

  return{
    tree,E,avgOf,aggAt,heroList,villList,
    heroCheck:Math.round(aggAt(tree,0)*1000)/10,
    heroBet:Math.round(aggAt(tree,1)*1000)/10,
    ev:Math.round(ev*1000)/1000,
    iters,sampled:need>0,boardCards:board.length,
  };
}
/* Alias rétro-compat : le board complet (5 cartes) est le cas exact. */
export const solveTreeFixedBoard=solveTree;
