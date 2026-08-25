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
import { CHIP_UTILITY, makeIcmUtility, makePkoUtility } from "./icm.js";

/* ══════════════════════════════════════════════════════════════════════════
   LE RAKE (mission §78) — pourquoi il ne peut pas être un simple coefficient

   Jusqu'ici PokerForge TRANSPORTAIT le rake (il entre dans le hash d'état, il
   voyage dans la solution) sans jamais le RETIRER du pot. La solution le
   déclarait, ce qui était honnête, mais laissait le sizing inchangé — or le rake
   change réellement le jeu : il taxe les pots gagnés, donc renchérit les gros
   pots et décourage les bluffs marginaux.

   ── CE QUI EMPÊCHE UN RACCOURCI ────────────────────────────────────────────
   1. LA SOMME NULLE TOMBE. Un pot raké rend moins que ce qu'il a reçu : ce que
      Hero gagne n'est plus l'opposé de ce que le Vilain perd. Toutes les mesures
      qui présupposent la somme nulle deviennent invalides — au premier rang
      NashConv, dont la définition même repose sur v + (−v) = 0. On ne la
      « corrige » pas : on la rend `null`, et l'écran dit pourquoi.

   2. L'ICM N'EST PAS COMPATIBLE. Les utilités ICM/PKO transforment un TRANSFERT
      de jetons entre deux joueurs. Avec le rake, il n'y a plus de transfert :
      une part quitte la table. Écrire `U.h(d − R)` et `U.v(d + R)` reviendrait à
      inventer une convention ICM du rake que rien ne fonde. On refuse la
      combinaison plutôt que de produire un nombre indéfendable (§0, §99).

   ── LA RÈGLE APPLIQUÉE ─────────────────────────────────────────────────────
   Rake = min(pct × pot final, cap), prélevé sur le pot AVANT attribution, donc
   payé par celui qui l'encaisse — et partagé à parts égales sur un pot partagé.
   Convention « no flop, no drop » : ces arbres sont postflop, le flop est vu,
   le pot est donc raké même s'il est emporté sans abattage. `rakeUncontested:
   false` restitue la variante des salles qui ne rakent pas les pots non disputés.
   ══════════════════════════════════════════════════════════════════════════ */
export function makeRakeModel(startPot, rake, { rakeUncontested = true } = {}) {
  if (!rake || rake.applied !== true) return null;
  const pct = Math.max(0, +rake.pct || 0);
  if (!(pct > 0)) return null;
  const cap = rake.cap == null ? Infinity : Math.max(0, +rake.cap || 0);

  /* Part du rake supportée par HERO à ce nœud terminal, selon l'issue.
     `sd` : 1 Hero gagne l'abattage, 0 il le perd, 0.5 partage. */
  const shareH = (node, sd) => {
    const uncontested = node.result === "foldV" || node.result === "foldH";
    if (uncontested && !rakeUncontested) return 0;
    const total = startPot + node.betsH + node.betsV;
    const R = Math.min(total * pct, cap);
    if (!(R > 0)) return 0;
    /* L'ordre compte : à un nœud de fold, `sd` décrit l'abattage qui N'A PAS eu
       lieu. Tester `sd` avant `result` raketterait le mauvais joueur. */
    if (node.result === "foldV") return R;
    if (node.result === "foldH") return 0;
    if (sd >= 1) return R;
    if (sd <= 0) return 0;
    return R / 2;
  };
  /* Part du VILAIN : le complément, calculé sur le même pot. */
  const shareV = (node, sd) => {
    const uncontested = node.result === "foldV" || node.result === "foldH";
    if (uncontested && !rakeUncontested) return 0;
    const total = startPot + node.betsH + node.betsV;
    const R = Math.min(total * pct, cap);
    if (!(R > 0)) return 0;
    return R - shareH(node, sd);
  };
  return { shareH, shareV, pct, cap, rakeUncontested };
}

import { eval7i } from "./evaluator.js";
import { mulberry32 } from "./equity.js";

/* Résout l'arbre postflop pour un board de 3 à 5 cartes. */
export function solveTree(heroList,villList,board,opts={}){
  const iters=opts.iters||600;
  const startPot=opts.startPot||6;
  const initLen=board.length;
  const need=5-initLen;                       // cartes de board à tirer (0..2)
  const rng=mulberry32((opts.seed??123457)>>>0);
  /* Utilité terminale : chip-EV par défaut (somme nulle, comportement historique),
     ou utilité ICM en $EQ via makeIcmUtility (§21 stratégique) — auquel cas le jeu
     n'est PAS à somme nulle et NashConv devient ininterprétable (cf. nashConv). */
  const U=opts.utility||CHIP_UTILITY;
  /* Rake : actif seulement s'il est explicitement DÉCLARÉ appliqué. Sans cela le
     chemin de code est rigoureusement celui d'avant — le rake n'est pas une
     option qu'on active « au cas où ». */
  const rakeModel=makeRakeModel(startPot,opts.rake,{rakeUncontested:opts.rakeUncontested!==false});
  if(rakeModel&&(opts.icm||opts.pko)){
    /* Refus net plutôt qu'un nombre inventé (voir l'en-tête de makeRakeModel).
       On LÈVE : renvoyer un objet `{ok:false}` là où les appelants attendent une
       solution produisait un « Cannot read properties of undefined » quelques
       lignes plus loin — un message qui masque complètement la vraie cause. */
    throw new Error("rake et ICM/PKO ne se combinent pas : l'utilité ICM transforme un TRANSFERT de jetons entre deux joueurs, or le rake en fait sortir une part de la table. Aucune convention publiée ne fonde ce mélange — résoudre en chip-EV, ou sans rake.");
  }
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

  /* ── SOLVED NODE LOCK (§19) : fréquences verrouillées à des nœuds désignés par
     chemin d'actions depuis la racine (ex. path:["B"] = vilain face au bet).
     Au nœud verrouillé : stratégie IMPOSÉE (identique pour tous les combos),
     regrets non mis à jour — le reste de l'arbre RE-SOLVE contre ce verrou.
     ≠ Quick Node Lock (édition heuristique) : ici c'est un vrai re-solve CFR. ── */
  const locks={};
  // Fréquence d'une action au nœud : clé exacte, sinon "B" réparti sur les sizings B*.
  const lockArrFor=(n,freqs)=>{
    const nBets=n.actions.filter(a=>a.startsWith("B")).length||1;
    const arr=new Float64Array(n.actions.length);let s=0;
    n.actions.forEach((a,k)=>{
      let f=freqs&&freqs[a];
      if(f==null&&a.startsWith("B")&&freqs&&freqs.B!=null)f=freqs.B/nBets;
      arr[k]=Math.max(0,f||0);s+=arr[k];
    });
    if(s<=0)return null;
    for(let k=0;k<arr.length;k++)arr[k]/=s;
    return arr;
  };
  if(opts.locks)for(const L of opts.locks){
    if(L.match){
      // Verrou par MOTIF : tous les nœuds de décision correspondants (profils §20).
      (function walk(n){
        if(n.kind==="chance")return walk(n.next);
        if(n.kind!=="decision")return;
        const isVill=n.player===1;
        const hit=(L.match==="villFacingBet"&&isVill&&n.actions[0]==="F")
                ||(L.match==="villAfterCheck"&&isVill&&n.actions[0]==="X");
        if(hit){const arr=lockArrFor(n,L.freqs);if(arr)locks[n.id]=arr;}
        for(const a of n.actions)walk(n.children[a]);
      })(tree);
      continue;
    }
    let n=tree,okPath=true;
    for(const step of (L.path||[])){
      while(n&&n.kind==="chance")n=n.next;
      if(!n||!n.children||!n.children[step]){okPath=false;break;}
      n=n.children[step];
    }
    while(n&&n.kind==="chance")n=n.next;
    if(!okPath||!n||n.kind!=="decision")continue;
    const arr=lockArrFor(n,L.freqs);
    if(arr)locks[n.id]=arr;
  }

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
      /* U.h / U.v et non `x` / `-x` : sous ICM le jeu n'est PAS à somme nulle
         (les jetons transférés déplacent aussi l'équité des joueurs hors du coup),
         donc chaque camp a sa propre utilité. En chip-EV, U vaut CHIP_UTILITY et
         on retrouve exactement le comportement historique. */
      if(!rakeModel){
        for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=reachV[j]*U.h(terminalUtility(node,startPot,e));}vH[i]=acc;}
        for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=reachH[i]*U.v(terminalUtility(node,startPot,e));}vV[j]=acc;}
        return{vH,vV};
      }
      /* Avec rake, chaque camp paie SA part : les deux valeurs ne sont plus
         opposées, et c'est précisément ce qui rend le jeu non à somme nulle. */
      for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=reachV[j]*U.h(terminalUtility(node,startPot,e)-rakeModel.shareH(node,e));}vH[i]=acc;}
      for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=reachH[i]*U.v(terminalUtility(node,startPot,e)+rakeModel.shareV(node,e));}vV[j]=acc;}
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
    const lock=locks[node.id]||null;           // §19 : stratégie imposée à ce nœud
    const vH=new Float64Array(nH),vV=new Float64Array(nV);
    if(node.player===0){                                   // Hero agit
      const regT=getTbl(reg,node,key,nH,na),stT=getTbl(strat,node,key,nH,na);
      const S=[];for(let i=0;i<nH;i++)S[i]=lock||stratFromReg(regT[i]);
      const child=[];
      for(let a=0;a<na;a++){const cr=new Float64Array(nH);for(let i=0;i<nH;i++)cr[i]=reachH[i]*S[i][a];child[a]=traverse(node.children[node.actions[a]],cr,reachV,tw);}
      for(let i=0;i<nH;i++){
        let nv=0;for(let a=0;a<na;a++)nv+=S[i][a]*child[a].vH[i];vH[i]=nv;
        const rg=regT[i],st=stT[i];
        for(let a=0;a<na;a++){if(!lock)rg[a]=Math.max(0,rg[a]+child[a].vH[i]-nv);st[a]+=tw*reachH[i]*S[i][a];}
      }
      for(let j=0;j<nV;j++){let acc=0;for(let a=0;a<na;a++)acc+=child[a].vV[j];vV[j]=acc;}
    }else{                                                 // Villain agit
      const regT=getTbl(reg,node,key,nV,na),stT=getTbl(strat,node,key,nV,na);
      const S=[];for(let j=0;j<nV;j++)S[j]=lock||stratFromReg(regT[j]);
      const child=[];
      for(let a=0;a<na;a++){const cr=new Float64Array(nV);for(let j=0;j<nV;j++)cr[j]=reachV[j]*S[j][a];child[a]=traverse(node.children[node.actions[a]],reachH,cr,tw);}
      for(let j=0;j<nV;j++){
        let nv=0;for(let a=0;a<na;a++)nv+=S[j][a]*child[a].vV[j];vV[j]=nv;
        const rg=regT[j],st=stT[j];
        for(let a=0;a<na;a++){if(!lock)rg[a]=Math.max(0,rg[a]+child[a].vV[j]-nv);st[a]+=tw*reachV[j]*S[j][a];}
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

  // `strat` est EXPOSÉ dans le retour : c'est l'état complet de la solution, donc
  // ce qui doit être persisté pour la recharger sans re-solve (§16).
  const base={
    tree,E,strat,heroList,villList,wH,wV,startPot,initLen,
    utility:U,                                  // requis par bestResponseEV/nashConv
    /* Descripteur SÉRIALISABLE de l'utilité : `utility` porte des fonctions et ne
       survit pas au structured clone de la Solution Library (§16). Ces deux champs
       suffisent à la reconstruire à la relecture (cf. rehydrateTreeSolution). */
    // Basé sur la PRÉSENCE de paramètres, pas sur zeroSum : un solve ICM heads-up
    // est à somme nulle et resterait pourtant un solve ICM.
    utilityKind:opts.pko?"pko":opts.icm?"icm":"chip",
    icmParams:opts.icm||null,
    pkoParams:opts.pko||null,
    /* Sérialisable, et suffisant pour reconstruire le modèle à la relecture. */
    rakeParams:rakeModel?{pct:rakeModel.pct,cap:rakeModel.cap===Infinity?null:rakeModel.cap,applied:true,rakeUncontested:rakeModel.rakeUncontested}:null,
    /* La conséquence, portée par la solution elle-même : plus aucune mesure
       fondée sur la somme nulle n'est légitime au-dessus de ce résultat. */
    zeroSum:!rakeModel&&(U.zeroSum!==false),
    ev:Math.round(ev*1000)/1000,
    iters,sampled:need>0,boardCards:initLen,
    /* Board et graine CONSERVÉS : `nodeActionEVs` en a besoin pour rejouer
       exactement les mêmes runouts que le solve (§36/§49 — l'EV par action). */
    board:board.slice(),seed:(opts.seed??123457)>>>0,
  };
  /* Le modèle vivant, pour les mesures faites au-dessus de CETTE solution
     (bestResponseEV, nodeActionEVs, strategyEV) : il porte des fonctions et ne
     survit pas au clone, d'où sa reconstruction depuis rakeParams à la relecture. */
  base.rakeModel=rakeModel;
  attachStrategyAccessors(base);
  const heroCheck=base.aggAt(tree,0);
  base.heroCheck=Math.round(heroCheck*1000)/10;
  base.heroBet=Math.round((1-heroCheck)*1000)/10;
  return base;
}

/* ══ ACCESSEURS DE STRATÉGIE (§26/§16) — FABRIQUE UNIQUE ══
   avgOf / aggAt / ctxCount sont des fonctions PURES de (strat, wH, wV) : elles ne
   dépendent d'aucun état de la boucle CFR. On les attache ici plutôt que de les
   fermer sur le scope de solveTree, pour deux raisons :
     1. les closures ne survivent pas au structured clone → une solution persistée
        les perd ; on les RECONSTRUIT à la relecture (rehydrateTreeSolution) ;
     2. une seule implémentation sert le solve frais ET le solve rechargé, donc
        aucune dérive possible entre les deux chemins de lecture.
   Mute et retourne `sol`. */
export function attachStrategyAccessors(sol){
  const {strat,wH,wV,heroList,villList}=sol;
  const nH=heroList.length,nV=villList.length;
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
  sol.avgOf=avgOf;
  sol.aggAt=aggAt;
  // nb de contextes de runout appris à un nœud (>1 ⟺ sous-arbres par carte actifs)
  sol.ctxCount=(node)=>strat[node.id]?strat[node.id].size:0;
  return sol;
}

/* Solution rechargée depuis la bibliothèque → réattache les accesseurs perdus au
   clonage. `plain` doit porter strat/tree/heroList/villList/wH/wV (cf. SOLVE_DATA_KEYS
   dans library.js). Retourne null si l'objet n'est pas réhydratable — on préfère
   un cache manquant à une solution silencieusement amputée (§2). */
export function rehydrateTreeSolution(plain){
  if(!plain||!plain.strat||!plain.tree||!plain.heroList||!plain.villList)return null;
  /* `utility` porte des fonctions : elle a été retirée avant persistance. On la
     reconstruit depuis le descripteur. Une solution ICM dont les paramètres de
     tournoi manquent n'est PAS réhydratable en chip-EV — ce serait changer la
     nature du solve en silence (§2) : on la rejette, elle sera recalculée. */
  if(plain.utilityKind==="pko"){
    if(!plain.pkoParams)return null;
    const u=makePkoUtility(plain.pkoParams);
    if(!u)return null;
    plain.utility=u;
  }else if(plain.utilityKind==="icm"){
    if(!plain.icmParams)return null;
    const u=makeIcmUtility(plain.icmParams);
    if(!u)return null;
    plain.utility=u;
  }else{
    plain.utility=CHIP_UTILITY;
  }
  /* Le rake se reconstruit à l'identique : sans lui, une solution rechargée
     rendrait des EV plus optimistes que celle qui l'a produite. */
  if(plain.rakeParams)plain.rakeModel=makeRakeModel(plain.startPot,plain.rakeParams,{rakeUncontested:plain.rakeParams.rakeUncontested!==false});
  return attachStrategyAccessors(plain);
}
/* Alias rétro-compat : le board complet (5 cartes) est le cas exact. */
export const solveTreeFixedBoard=solveTree;

/* ══ MEILLEURE RÉPONSE / EXPLOITABILITÉ — board complet uniquement (exact). ══
   Valeur de la meilleure réponse de `brPlayer` contre la stratégie MOYENNE adverse.
   nashConv = brEV(Hero) + brEV(Villain) ≥ 0 ; ≈ 0 ⟺ équilibre (jeu zéro-somme). */
export function bestResponseEV(sol,brPlayer){
  if(sol.sampled)return null;   // exact seulement sur board complet (pas de bruit d'échantillonnage)
  const {tree,E,heroList,villList,wH,wV,startPot,avgOf}=sol;
  const U=sol.utility||CHIP_UTILITY;
  const nH=heroList.length,nV=villList.length;
  const nBr=brPlayer===0?nH:nV;
  function walk(node,oppReach){
    if(node.kind==="terminal"){
      const v=new Float64Array(nBr);
      const rm=sol.rakeModel||null;
      if(brPlayer===0){for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=oppReach[j]*U.h(terminalUtility(node,startPot,e)-(rm?rm.shareH(node,e):0));}v[i]=acc;}}
      else{for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=oppReach[i]*U.v(terminalUtility(node,startPot,e)+(rm?rm.shareV(node,e):0));}v[j]=acc;}}
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
  /* NashConv = brEV(H) + brEV(V) ≥ 0, avec ≈0 ⟺ équilibre. Cette identité SUPPOSE
     un jeu à somme nulle : c'est parce que les utilités s'annulent à l'équilibre
     que la somme mesure l'exploitabilité. Sous utilité ICM le jeu ne l'est pas
     (le transfert de jetons déplace aussi l'équité des joueurs hors du coup), et
     la somme n'a plus de sens — la renvoyer quand même afficherait un nombre
     d'apparence rigoureuse mais faux (§2). On renvoie null : l'UI sait déjà
     traiter « exploitabilité indisponible ». */
  if(sol&&sol.utility&&sol.utility.zeroSum===false)return null;
  /* Le rake casse la somme nulle aussi sûrement que l'ICM : NashConv = BR(0) +
     BR(1) suppose que la somme des deux valeurs d'équilibre est nulle. Avec un
     pot taxé elle vaut −rake, et l'« exploitabilité » lue serait décalée d'un
     biais constant qu'aucun affichage ne pourrait distinguer d'une divergence. */
  if(sol&&(sol.rakeModel||sol.rakeParams))return null;
  const h=bestResponseEV(sol,0),v=bestResponseEV(sol,1);
  if(h==null||v==null)return null;
  return Math.round((h+v)*10000)/10000;
}


/* ══════════════════════════════════════════════════════════════════════════
   nodeActionEVs — L'EV DE CHAQUE ACTION À UN NŒUD (mission §36, §49)

   « Après décision : afficher Action Hero · Action GTO · Sizing · Fréquence ·
     EV · EV loss » (§36) et « EV played · EV best · EV difference » (§49).

   Jusqu'ici PokerForge répondait « EV indisponible » : `solveTree` ne conserve
   pas les valeurs contrefactuelles après convergence. Cette fonction les
   RECALCULE, exactement, à partir de la stratégie moyenne déjà stockée.

   ── CE QUI EST CALCULÉ, PRÉCISÉMENT ────────────────────────────────────────
   Pour l'action a au nœud N, du point de vue du joueur qui y parle :

       EV(a) = Σᵢ rp[i]·v_a[i]  /  ( Σᵢ rp[i] · Σⱼ ro[j] )

   où rp est le reach du joueur jusqu'à N (ses propres probabilités d'action le
   long du chemin, pondérées par sa range), ro celui de l'adversaire, et v_a la
   valeur du sous-arbre atteint par a, les DEUX camps jouant ensuite leur
   stratégie moyenne.

   C'est donc une EV CONDITIONNELLE : « sachant que nous sommes ici, que vaut
   cette action ». C'est la grandeur qu'un joueur lit, et elle est comparable
   entre actions du même nœud. Elle n'est PAS comparable à `sol.ev`, qui est
   l'EV de la racine — deux questions différentes.

   ── PÉRIMÈTRE ──────────────────────────────────────────────────────────────
   Nœuds de la RUE COURANTE (street 0), ceux que `extractStreetStrategy`
   expose. Au-delà, la stratégie dépend de la carte tombée et la solution ne la
   couvre pas (voir LIMITATIONS L8) : on rend `available:false` avec le motif,
   jamais un nombre.

   Board complet → exact. Board incomplet → moyenne sur les runouts
   ré-échantillonnés avec LA MÊME GRAINE que le solve, donc reproductible ;
   `exact:false` le dit.
   ══════════════════════════════════════════════════════════════════════════ */
export function nodeActionEVs(sol, path = [], { samples = null } = {}) {
  if (!sol || !sol.tree || typeof sol.avgOf !== "function") {
    return { available: false, reason: "solution inexploitable" };
  }
  const { tree, heroList, villList, wH, wV, startPot, initLen } = sol;
  const U = sol.utility || CHIP_UTILITY;
  const RM = sol.rakeModel || null;      // le pot vu par le joueur est le pot NET
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  /* 1. Localiser le nœud cible en suivant le chemin d'actions. */
  let node = tree;
  for (const step of path) {
    if (!node || node.kind !== "decision" || !node.children[step]) {
      return { available: false, reason: `chemin « ${path.join("|")} » absent de l'arbre` };
    }
    node = node.children[step];
    if (node && node.kind === "chance") {
      return { available: false, reason: "le chemin traverse une carte à venir — la solution ne couvre que la rue courante (LIMITATIONS L8)" };
    }
  }
  if (!node || node.kind !== "decision") return { available: false, reason: "le chemin ne mène pas à un nœud de décision" };
  if (node.street !== 0) return { available: false, reason: "nœud hors de la rue courante" };

  const p = node.player;                        // joueur qui parle au nœud cible
  const nP = p === 0 ? nH : nV, nO = p === 0 ? nV : nH;
  const wP = p === 0 ? wH : wV, wO = p === 0 ? wV : wH;

  /* 2. Reaches jusqu'au nœud : chacun ne multiplie que SES propres probabilités. */
  const rp = Float64Array.from(wP), ro = Float64Array.from(wO);
  {
    let cur = tree;
    for (const step of path) {
      const k = cur.actions.indexOf(step);
      const mine = cur.player === p;
      const tgt = mine ? rp : ro;
      const n = mine ? nP : nO;
      for (let c = 0; c < n; c++) tgt[c] *= sol.avgOf(cur, c, "")[k];
      cur = cur.children[step];
    }
  }
  const sumP = rp.reduce((a, b) => a + b, 0);
  const sumO = ro.reduce((a, b) => a + b, 0);
  if (!(sumP > 0) || !(sumO > 0)) {
    return { available: false, reason: "nœud jamais atteint par les ranges solvées" };
  }

  /* 3. Valeur d'un sous-arbre, les deux camps jouant leur stratégie moyenne. */
  const E = Array.from({ length: nH }, () => new Float32Array(nV));
  const sH = new Float64Array(nH), sV = new Float64Array(nV);
  const computeE = (b) => {
    for (let i = 0; i < nH; i++) { const h = heroList[i].cards;
      sH[i] = (b.includes(h[0]) || b.includes(h[1])) ? -1 : eval7i([h[0], h[1], b[0], b[1], b[2], b[3], b[4]]); }
    for (let j = 0; j < nV; j++) { const v = villList[j].cards;
      sV[j] = (b.includes(v[0]) || b.includes(v[1])) ? -1 : eval7i([v[0], v[1], b[0], b[1], b[2], b[3], b[4]]); }
    for (let i = 0; i < nH; i++) { const h = heroList[i].cards; const row = E[i]; const hs = sH[i];
      for (let j = 0; j < nV; j++) { const v = villList[j].cards;
        if (hs < 0 || sV[j] < 0 || h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) { row[j] = -1; continue; }
        row[j] = hs > sV[j] ? 1 : hs === sV[j] ? 0.5 : 0;
      } }
  };
  let curB = board.slice();
  const keyFor = (n) => { const vis = initLen + n.street; return vis <= initLen ? "" : curB.slice(initLen, Math.min(5, vis)).join(","); };

  function walk(n, oppReach) {
    if (n.kind === "terminal") {
      const v = new Float64Array(nP);
      for (let i = 0; i < nP; i++) {
        let acc = 0;
        for (let j = 0; j < nO; j++) {
          const e = p === 0 ? E[i][j] : E[j][i];
          if (e < 0) continue;
          acc += oppReach[j] * (p === 0
            ? U.h(terminalUtility(n, startPot, e) - (RM ? RM.shareH(n, e) : 0))
            : U.v(terminalUtility(n, startPot, e) + (RM ? RM.shareV(n, e) : 0)));
        }
        v[i] = acc;
      }
      return v;
    }
    if (n.kind === "chance") {
      const ci = initLen + n.street;
      if (ci >= initLen && ci < 5) {
        const c = curB[ci];
        const list = p === 0 ? villList : heroList;
        const r = Float64Array.from(oppReach);
        for (let j = 0; j < nO; j++) { const cc = list[j].cards; if (cc[0] === c || cc[1] === c) r[j] = 0; }
        return walk(n.next, r);
      }
      return walk(n.next, oppReach);
    }
    const na = n.actions.length, key = keyFor(n);
    if (n.player === p) {
      /* Notre joueur : on MÉLANGE selon sa stratégie moyenne (on n'optimise pas —
         ce n'est pas une meilleure réponse, c'est la valeur de la stratégie). */
      const childs = n.actions.map(a => walk(n.children[a], oppReach));
      const v = new Float64Array(nP);
      for (let c = 0; c < nP; c++) {
        const d = sol.avgOf(n, c, key);
        let acc = 0;
        for (let a = 0; a < na; a++) acc += d[a] * childs[a][c];
        v[c] = acc;
      }
      return v;
    }
    /* L'adversaire : on scinde SON reach par action et on somme. */
    const v = new Float64Array(nP);
    for (let a = 0; a < na; a++) {
      const cr = new Float64Array(nO);
      for (let c = 0; c < nO; c++) cr[c] = oppReach[c] * sol.avgOf(n, c, key)[a];
      const cv = walk(n.children[n.actions[a]], cr);
      for (let c = 0; c < nP; c++) v[c] += cv[c];
    }
    return v;
  }

  /* 4. Une valeur par action, moyennée sur les runouts si le board est incomplet. */
  const nRuns = need > 0 ? Math.max(1, samples || Math.min(sol.iters || 200, 200)) : 1;
  const rng = mulberry32((sol.seed ?? 123457) >>> 0);
  const used = new Uint8Array(52);
  const sampleBoard = () => {
    used.fill(0); for (const c of board) used[c] = 1;
    const b = board.slice();
    while (b.length < 5) { const c = (rng() * 52) | 0; if (!used[c]) { used[c] = 1; b.push(c); } }
    return b;
  };
  const acc = node.actions.map(() => new Float64Array(nP));
  /* ── LE DÉNOMINATEUR EST PAR COMBO, PAS GLOBAL ────────────────────────────
     Une main de l'adversaire qui partage une carte avec la nôtre n'existe pas :
     elle est écartée du numérateur. La compter au dénominateur écrase l'EV du
     rapport des combinaisons bloquées — et le symptôme est net : sur un river à
     pot mort de 12 bb, un FOLD doit valoir exactement −6 bb, or on lisait
     −5.93 bb. Un pour cent d'erreur, mais sur la seule valeur du tableau dont on
     connaît la réponse d'avance : le reste était faux dans les mêmes proportions.
     On accumule donc, par combo, la masse d'adversaire RÉELLEMENT rencontrée. */
  const mass = new Float64Array(nP);
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) { curB = sampleBoard(); }
    computeE(curB);
    for (let i = 0; i < nP; i++) {
      let m = 0;
      for (let j = 0; j < nO; j++) { const e = p === 0 ? E[i][j] : E[j][i]; if (e >= 0) m += ro[j]; }
      mass[i] += m;
    }
    node.actions.forEach((a, k) => {
      const v = walk(node.children[a], ro);
      for (let i = 0; i < nP; i++) acc[k][i] += v[i];
    });
  }
  const inv = 1 / nRuns;

  /* 5. Agrégation : sur toute la range, puis par classe de main. */
  /* Masse totale rencontrée par la range du joueur — le dénominateur agrégé. */
  let den = 0;
  for (let i = 0; i < nP; i++) den += rp[i] * mass[i] * inv;
  if (!(den > 0)) return { available: false, reason: "aucune confrontation possible : les ranges se bloquent entièrement" };
  const byAction = {}, byClass = {};
  const list = p === 0 ? heroList : villList;
  const classIdx = new Map();
  for (let i = 0; i < list.length; i++) {
    const k = list[i].key; if (!k) continue;
    if (!classIdx.has(k)) classIdx.set(k, []);
    classIdx.get(k).push(i);
  }
  node.actions.forEach((a, k) => {
    let num = 0;
    for (let i = 0; i < nP; i++) num += rp[i] * acc[k][i] * inv;
    byAction[a] = Math.round((num / den) * 10000) / 10000;
  });

  /* ── AUTO-CONTRÔLE : L'EV MÉLANGÉE ────────────────────────────────────────
     Le mélange se fait PAR COMBO — chaque main a ses propres fréquences. Mélanger
     les fréquences agrégées de la range avec les EV agrégées donnerait un autre
     nombre (la moyenne d'un produit n'est pas le produit des moyennes) ; c'est une
     erreur facile, et `mixedEV` sert à la rendre visible.

     CONTRE QUOI LE VÉRIFIER — et surtout contre quoi NE PAS le vérifier. À la
     racine, `mixedEV` doit valoir `strategyEV(sol).ev`, l'EV de la stratégie
     MOYENNE. Il ne vaut PAS `sol.ev`, qui est la moyenne des EV des stratégies
     COURANTES sur toutes les itérations : deux grandeurs différentes, dont l'écart
     mesuré valait encore 0.086 bb à 600 itérations. Confondre les deux fait
     chercher un bug là où il n'y en a pas.

     Vérifié : écart de 2·10⁻⁵ contre `strategyEV` à 1200 itérations — l'arrondi
     à quatre décimales, rien d'autre. */
  let mixNum = 0;
  for (let i = 0; i < nP; i++) {
    const d = sol.avgOf(node, i, "");
    let vi = 0;
    for (let k = 0; k < node.actions.length; k++) vi += d[k] * acc[k][i] * inv;
    mixNum += rp[i] * vi;
  }
  const mixedEV = Math.round((mixNum / den) * 10000) / 10000;
  for (const [cls, idxs] of classIdx) {
    let dp = 0; for (const i of idxs) dp += rp[i];
    if (!(dp > 0)) continue;
    const row = {};
    let dm = 0; for (const i of idxs) dm += rp[i] * mass[i] * inv;
    if (!(dm > 0)) continue;
    node.actions.forEach((a, k) => {
      let num = 0;
      for (const i of idxs) num += rp[i] * acc[k][i] * inv;
      row[a] = Math.round((num / dm) * 10000) / 10000;
    });
    byClass[cls] = row;
  }

  return {
    available: true,
    exact: need === 0,
    samples: nRuns,
    note: need === 0
      ? "board complet — EV par action exacte"
      : `board incomplet — moyenne sur ${nRuns} runouts ré-échantillonnés avec la graine du solve (reproductible, non exacte)`,
    byAction, byClass,
    /* EV de la stratégie AU NŒUD, mélangée par combo. À la racine, elle vaut
       `strategyEV(sol).ev` — voir l'auto-contrôle ci-dessus. */
    mixedEV,
    reachShare: Math.round((sumP / wP.reduce((a, b) => a + b, 0)) * 10000) / 10000,
  };
}


/* ══════════════════════════════════════════════════════════════════════════
   strategyEV — L'EV DE LA STRATÉGIE MOYENNE (celle qui est réellement servie)

   `solveTree` renvoie `ev` = moyenne, SUR LES ITÉRATIONS, de la valeur de la
   stratégie COURANTE de chaque itération. Ce n'est pas la même chose que la
   valeur de la stratégie MOYENNE — celle qui est stockée, affichée au Trainer
   et jouée. Deux conséquences :

     · la moyenne des itérations inclut les premières, très loin de l'équilibre,
       et met donc longtemps à s'en détacher : c'est l'essentiel de la « dérive »
       qu'on observait en doublant les itérations ;
     · l'EV annoncée ne décrivait pas la stratégie livrée.

   Cette fonction calcule la seconde. Une seule traversée par runout.
   ══════════════════════════════════════════════════════════════════════════ */
export function strategyEV(sol, { samples = null } = {}) {
  if (!sol || !sol.tree || typeof sol.avgOf !== "function") return null;
  const { tree, heroList, villList, wH, wV, startPot, initLen } = sol;
  const U = sol.utility || CHIP_UTILITY;
  const RM = sol.rakeModel || null;      // le pot vu par le joueur est le pot NET
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  const E = Array.from({ length: nH }, () => new Float32Array(nV));
  const sH = new Float64Array(nH), sV = new Float64Array(nV);
  const computeE = (b) => {
    for (let i = 0; i < nH; i++) { const h = heroList[i].cards;
      sH[i] = (b.includes(h[0]) || b.includes(h[1])) ? -1 : eval7i([h[0], h[1], b[0], b[1], b[2], b[3], b[4]]); }
    for (let j = 0; j < nV; j++) { const v = villList[j].cards;
      sV[j] = (b.includes(v[0]) || b.includes(v[1])) ? -1 : eval7i([v[0], v[1], b[0], b[1], b[2], b[3], b[4]]); }
    for (let i = 0; i < nH; i++) { const h = heroList[i].cards; const row = E[i]; const hs = sH[i];
      for (let j = 0; j < nV; j++) { const v = villList[j].cards;
        if (hs < 0 || sV[j] < 0 || h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) { row[j] = -1; continue; }
        row[j] = hs > sV[j] ? 1 : hs === sV[j] ? 0.5 : 0;
      } }
  };
  let curB = board.slice();
  const keyFor = (n) => { const vis = initLen + n.street; return vis <= initLen ? "" : curB.slice(initLen, Math.min(5, vis)).join(","); };

  /* Valeur pour le joueur 0, les deux camps jouant leur stratégie moyenne. */
  function walk(n, reachV) {
    if (n.kind === "terminal") {
      const v = new Float64Array(nH);
      for (let i = 0; i < nH; i++) { let acc = 0;
        for (let j = 0; j < nV; j++) { const e = E[i][j]; if (e < 0) continue;
          acc += reachV[j] * U.h(terminalUtility(n, startPot, e) - (RM ? RM.shareH(n, e) : 0)); }
        v[i] = acc; }
      return v;
    }
    if (n.kind === "chance") {
      const ci = initLen + n.street;
      if (ci >= initLen && ci < 5) {
        const c = curB[ci];
        const r = Float64Array.from(reachV);
        for (let j = 0; j < nV; j++) { const cc = villList[j].cards; if (cc[0] === c || cc[1] === c) r[j] = 0; }
        return walk(n.next, r);
      }
      return walk(n.next, reachV);
    }
    const na = n.actions.length, key = keyFor(n);
    if (n.player === 0) {
      const childs = n.actions.map(a => walk(n.children[a], reachV));
      const v = new Float64Array(nH);
      for (let i = 0; i < nH; i++) { const d = sol.avgOf(n, i, key); let acc = 0;
        for (let a = 0; a < na; a++) acc += d[a] * childs[a][i]; v[i] = acc; }
      return v;
    }
    const v = new Float64Array(nH);
    for (let a = 0; a < na; a++) {
      const cr = new Float64Array(nV);
      for (let j = 0; j < nV; j++) cr[j] = reachV[j] * sol.avgOf(n, j, key)[a];
      const cv = walk(n.children[n.actions[a]], cr);
      for (let i = 0; i < nH; i++) v[i] += cv[i];
    }
    return v;
  }

  const nRuns = need > 0 ? Math.max(1, samples || Math.min(sol.iters || 200, 200)) : 1;
  const rng = mulberry32((sol.seed ?? 123457) >>> 0);
  const used = new Uint8Array(52);
  const sampleBoard = () => {
    used.fill(0); for (const c of board) used[c] = 1;
    const b = board.slice();
    while (b.length < 5) { const c = (rng() * 52) | 0; if (!used[c]) { used[c] = 1; b.push(c); } }
    return b;
  };
  /* Dénominateur : la masse d'affrontements RÉELLEMENT possibles (cf. la même
     correction dans `nodeActionEVs`). `solveTree.ev` divise, lui, par
     `sumWH·sumWV` — donc par des paires bloquées qui n'ont jamais lieu — et
     sous-estime l'EV du rapport des combinaisons impossibles. C'est un écart de
     l'ordre du pour cent ici, davantage sur des ranges larges et un board chargé.
     Les deux conventions ne sont donc pas interchangeables ; celle-ci est la
     bonne, et c'est elle que PFASE rapporte. */
  let total = 0, totalMass = 0;
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) curB = sampleBoard();
    computeE(curB);
    const v = walk(tree, Float64Array.from(wV));
    let num = 0, m = 0;
    for (let i = 0; i < nH; i++) {
      num += wH[i] * v[i];
      let mi = 0; for (let j = 0; j < nV; j++) if (E[i][j] >= 0) mi += wV[j];
      m += wH[i] * mi;
    }
    total += num; totalMass += m;
  }
  if (!(totalMass > 0)) return null;
  return { ev: Math.round((total / totalMass) * 100000) / 100000, exact: need === 0, samples: nRuns };
}
