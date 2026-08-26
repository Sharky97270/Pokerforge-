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

/* Équité EXACTE d'un affrontement combo vs combo par énumération des runouts.
   Conservée pour un usage ponctuel (une paire) ; le chemin de range passe
   désormais par `_exactRangeEquity`, qui mémorise les scores. */
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

/* ══════════════════════════════════════════════════════════════════════════
   P0 PERFORMANCE — ÉNUMÉRATION EXACTE PAR RUNOUT, SCORES MÉMORISÉS

   CE QUI N'ALLAIT PAS : le chemin exact appelait `exactMatchup` pour CHAQUE
   paire (main Hero, main Vilain), et chaque appel réévaluait DEUX mains de sept
   cartes par runout. Or, à board donné, le score d'une main ne dépend que de ses
   deux cartes : le même A♠K♦ était réévalué contre les 1 326 mains adverses.

   Mesuré (navigateur, profil CPU) : saisie de la 5e carte du board, range pleine
   contre range pleine → 1 326 × 1 326 × 2 = 3 516 552 évaluations, 166 s de
   thread principal BLOQUÉ. Le nombre d'évaluations réellement nécessaire est
   1 326 + 1 326 = 2 652, soit 1 326 fois moins.

   CE QU'ON FAIT : on boucle sur les RUNOUTS (un seul sur la river), on calcule
   le score de chaque main une fois par runout, puis on compare des ENTIERS.
   Coût : runouts × (nH + nV) évaluations au lieu de runouts × nH × nV × 2.
   Comme nH + nV ≤ 2·nH·nV dès que nH,nV ≥ 1, ce chemin n'est JAMAIS plus lent
   que l'ancien, quelle que soit la taille des ranges.
   C'est exactement le schéma déjà employé par `multistreet.js` (« scores PAR
   MAIN puis comparaisons ») ; l'équité était le dernier endroit à ne pas l'avoir.

   NEUTRALITÉ NUMÉRIQUE : mêmes valeurs, mêmes poids, même ordre d'accumulation
   (Hero majeur, Vilain mineur) — donc le même résultat au bit près. Les compteurs
   win/half/tot sont entiers : l'ordre des runouts n'a aucun effet.

   UNE CORRECTION ASSUMÉE, ET SEULEMENT UNE — LE CARD REMOVAL DU BOARD.
   L'ancien chemin exact ne retirait PAS les combos partageant une carte avec le
   board. eval7i([A♠,K♦, A♠,7♦,2♣,9♥,K♠]) évaluait alors une main de sept cartes
   contenant DEUX A♠ : une main impossible, dont le score ne veut rien dire. Le
   chemin Monte-Carlo du même fichier écartait déjà ces combos, et multistreet.js
   aussi (score −1). Le chemin exact était le seul à les compter, et le seul à
   avoir tort. Ils sont désormais écartés. L'écart que cela produit est mesuré,
   cas par cas, par `test-solver-equity-perf.mjs`.
════════════════════════════════════════════════════════════════════════════ */
function _exactRangeEquity(heroList,villList,fixed){
  const need=5-fixed.length;
  const nH=heroList.length,nV=villList.length;
  const hc=new Int32Array(nH*2),vc=new Int32Array(nV*2);
  for(let i=0;i<nH;i++){hc[i*2]=heroList[i].cards[0];hc[i*2+1]=heroList[i].cards[1];}
  for(let j=0;j<nV;j++){vc[j*2]=villList[j].cards[0];vc[j*2+1]=villList[j].cards[1];}
  const wH=new Float64Array(nH),wV=new Float64Array(nV);
  for(let i=0;i<nH;i++)wH[i]=heroList[i].w||1;
  for(let j=0;j<nV;j++)wV[j]=villList[j].w||1;

  /* Cartes du BOARD — une main qui en contient une n'existe pas. */
  const onBoard=new Uint8Array(52);
  for(const c of fixed)onBoard[c]=1;

  const sH=new Float64Array(nH),sV=new Float64Array(nV);     // −1 = main impossible
  /* RIVER (need === 0) : un seul runout, donc pas de compteurs par paire à tenir.
     Les allouer quand même coûtait 3 × 1 326² × 8 octets = 42 Mo par appel, à
     remplir de zéros puis à ramasser — pour n'y écrire qu'une fois. On accumule
     directement, dans le même ordre (Hero majeur, Vilain mineur) : même somme,
     mêmes bits, sans le tas. */
  const parPaire=need>0;
  const win=parPaire?new Float64Array(nH*nV):null;
  const half=parPaire?new Float64Array(nH*nV):null;
  const tot=parPaire?new Float64Array(nH*nV):null;
  let numDirect=0,denDirect=0;
  const b=[0,0,0,0,0];
  for(let k=0;k<fixed.length;k++)b[k]=fixed[k];
  const dead=new Uint8Array(52);
  const h7=[0,0,0,0,0,0,0];

  const scoreRunout=()=>{
    for(let i=0;i<nH;i++){
      const a=hc[i*2],d=hc[i*2+1];
      if(dead[a]||dead[d]){sH[i]=-1;continue;}
      h7[0]=a;h7[1]=d;h7[2]=b[0];h7[3]=b[1];h7[4]=b[2];h7[5]=b[3];h7[6]=b[4];
      sH[i]=eval7i(h7);
    }
    for(let j=0;j<nV;j++){
      const a=vc[j*2],d=vc[j*2+1];
      if(dead[a]||dead[d]){sV[j]=-1;continue;}
      h7[0]=a;h7[1]=d;h7[2]=b[0];h7[3]=b[1];h7[4]=b[2];h7[5]=b[3];h7[6]=b[4];
      sV[j]=eval7i(h7);
    }
    for(let i=0;i<nH;i++){
      const hs=sH[i];if(hs<0)continue;
      const h0=hc[i*2],h1=hc[i*2+1],row=i*nV;
      if(parPaire){
        for(let j=0;j<nV;j++){
          const vs=sV[j];if(vs<0)continue;
          const v0=vc[j*2],v1=vc[j*2+1];
          if(h0===v0||h0===v1||h1===v0||h1===v1)continue;
          const p=row+j;
          if(hs>vs)win[p]++;else if(hs===vs)half[p]++;
          tot[p]++;
        }
      }else{
        const hw=wH[i];
        for(let j=0;j<nV;j++){
          const vs=sV[j];if(vs<0)continue;
          const v0=vc[j*2],v1=vc[j*2+1];
          if(h0===v0||h0===v1||h1===v0||h1===v1)continue;
          const w=hw*wV[j];
          numDirect+=w*(hs>vs?1:hs===vs?0.5:0);denDirect+=w;
        }
      }
    }
  };

  if(need===0){
    for(let c=0;c<52;c++)dead[c]=onBoard[c];
    scoreRunout();
  }else{
    /* Runouts tirés des cartes hors board. Une paire dont une main touche le
       runout est ignorée POUR CE RUNOUT — exactement ce que faisait l'énumération
       par paire, qui excluait déjà ces cartes de son `avail`. */
    enumRunouts(fixed,need,(nc)=>{
      for(let c=0;c<52;c++)dead[c]=onBoard[c];
      for(let k=0;k<need;k++){b[fixed.length+k]=nc[k];dead[nc[k]]=1;}
      scoreRunout();
    });
  }

  if(!parPaire)return denDirect?numDirect/denDirect*100:50;

  let num=0,den=0;
  for(let i=0;i<nH;i++){
    const h0=hc[i*2],h1=hc[i*2+1],hw=wH[i],row=i*nV;
    for(let j=0;j<nV;j++){
      if(h0===vc[j*2]||h0===vc[j*2+1]||h1===vc[j*2]||h1===vc[j*2+1])continue;
      const p=row+j,t=tot[p];
      /* t === 0 : aucune configuration possible (main sur le board, ou tous les
         runouts bloqués). La paire ne pèse pas — on ne lui invente pas 50 %. */
      if(t===0)continue;
      const w=hw*wV[j];
      num+=w*((win[p]+half[p]*0.5)/t);den+=w;
    }
  }
  return den?num/den*100:50;
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
  /* Aiguillage INCHANGÉ (exact vs Monte-Carlo) : le prédicat porte sur le même
     coût estimé qu'avant. Seule l'IMPLÉMENTATION du chemin exact change — ainsi
     aucun spot ne bascule d'un régime à l'autre du fait de cette optimisation,
     et la provenance affichée (EXACT vs APPROXIMATION) reste la même. */
  if(need===0||evalCost<=budget){
    // Équité NON ARRONDIE — cf. note de précision au-dessus de monteCarloEquity.
    return{equity:_exactRangeEquity(heroList,villList,fixed),exact:true,evals:evalCost};
  }
  const iters=opts.iters||2500;
  // Seed déterministe dérivé du spot (ou fourni) → équité stable & reproductible (§15).
  const seed=opts.seed!=null?opts.seed:seedFrom(heroList,villList,fixed);
  /* §4 — la voie Monte-Carlo expose désormais son INCERTITUDE. Ajout STRICTEMENT
     ADDITIF : `equity`, `exact`, `samples` et `seed` gardent exactement leur sens et
     leur type ; les champs statistiques viennent en plus. Un appelant qui les ignore
     ne voit aucune différence.
     NB : `samples` reflète le nombre de tirages RÉELLEMENT effectués — il peut être
     inférieur à `iters` si une précision cible a été atteinte plus tôt. */
  const d=monteCarloEquityDetailed(heroList,villList,iters,fixed,seed,{
    targetCIWidth:opts.targetCIWidth,checkEvery:opts.checkEvery,minSamples:opts.minSamples,
  });
  return{
    equity:d.equity,exact:false,samples:d.samples,seed,
    standardError:d.standardError,
    confidenceInterval95:d.confidenceInterval95,
    confidenceLevel:d.confidenceLevel,
    stoppingReason:d.stoppingReason,
    elapsedMs:d.elapsedMs,
  };
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
  // Adaptateur : conserve le contrat historique (retourne un NOMBRE). Tous les
  // appelants existants restent inchangés ; le détail statistique passe par
  // monteCarloEquityDetailed.
  return monteCarloEquityDetailed(heroList,villList,iters,boardFixed,seed).equity;
}

/* ── MONTE-CARLO INSTRUMENTÉ (§4) ─────────────────────────────────────────────
   Même échantillonnage que ci-dessus, mais on accumule aussi la somme des carrés :
   cela donne la variance, donc l'erreur standard, donc un INTERVALLE DE CONFIANCE.

   Pourquoi c'est nécessaire : une équité Monte-Carlo sans intervalle ne dit pas à
   quel point on sait. « 46,2 % » sur 200 tirages et « 46,2 % » sur 200 000 sont deux
   affirmations très différentes, et rien ne les distinguait jusqu'ici.

   Le tirage vaut 1 (gain), 0,5 (égalité) ou 0 (défaite) : la variance se calcule
   directement, sans hypothèse supplémentaire. On applique la correction de Bessel
   (n−1) car on estime la variance à partir de l'échantillon lui-même.

   CRITÈRE D'ARRÊT : soit le plafond d'échantillons, soit une largeur d'intervalle
   cible atteinte (`targetCIWidth`, en points). Le second permet de demander une
   PRÉCISION plutôt qu'un budget — on s'arrête quand on sait assez.

   @returns {{equity:number, samples:number, seed:(number|null), standardError:number,
              confidenceInterval95:{lower:number,upper:number}, confidenceLevel:number,
              stoppingReason:"sample_limit"|"precision_target"|"exhausted", elapsedMs:number}} */
export function monteCarloEquityDetailed(heroList,villList,iters=2500,boardFixed=[],seed=null,opts={}){
  const t0=Date.now();
  const empty={equity:50,samples:0,seed,standardError:0,
    confidenceInterval95:{lower:50,upper:50},confidenceLevel:0.95,
    stoppingReason:"exhausted",elapsedMs:0};
  if(!heroList||!villList||!heroList.length||!villList.length)return empty;
  const fixed=boardFixed||[];
  // rng seedé (reproductible) si seed fourni, sinon Math.random.
  const rng=seed==null?Math.random:mulberry32(seed>>>0);
  const hs=_buildSampler(heroList),vs=_buildSampler(villList);
  const used=new Uint8Array(52);
  /* Largeur d'IC visée (en points de %). null = pas de cible, on va au plafond.
     On ne teste la cible que tous les `checkEvery` tirages : évaluer un critère
     d'arrêt à chaque tirage coûterait plus cher que le tirage lui-même. */
  const targetCIWidth=opts.targetCIWidth!=null?opts.targetCIWidth:null;
  const checkEvery=opts.checkEvery||500;
  const minSamples=opts.minSamples||200;   // en deçà, l'estimation de variance est trop instable
  let score=0,sq=0,n=0,guard=0,stop="sample_limit";
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
    const x=hv>vv?1:hv===vv?0.5:0;
    score+=x;sq+=x*x;
    n++;
    if(targetCIWidth!=null&&n>=minSamples&&n%checkEvery===0){
      if(2*1.96*_sePct(score,sq,n)<=targetCIWidth){stop="precision_target";break;}
    }
  }
  if(!n)return {...empty,elapsedMs:Date.now()-t0};
  if(n<iters&&stop==="sample_limit")stop="exhausted";   // garde-fou atteint
  const equity=score/n*100;
  const se=_sePct(score,sq,n);
  const half=1.96*se;
  return {
    equity,samples:n,seed,
    standardError:se,
    confidenceInterval95:{lower:Math.max(0,equity-half),upper:Math.min(100,equity+half)},
    confidenceLevel:0.95,
    stoppingReason:stop,
    elapsedMs:Date.now()-t0,
  };
}

/* Erreur standard de la moyenne, en points de pourcentage.
   var = (Σx² − n·moy²)/(n−1) puis SE = √(var/n). */
function _sePct(score,sq,n){
  if(n<2)return 0;
  const mean=score/n;
  const varSample=Math.max(0,(sq-n*mean*mean)/(n-1));
  return 100*Math.sqrt(varSample/n);
}
