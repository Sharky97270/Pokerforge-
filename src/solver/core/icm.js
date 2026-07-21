/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · ICM ENGINE (§21) + PKO (§22)
   Équité de tournoi par le modèle Malmuth-Harville : la probabilité qu'un joueur
   finisse à une place donnée est proportionnelle à son stack parmi les joueurs
   encore en lice à cette place. On calcule EXACTEMENT ces probabilités de finish
   (récursion sur les payouts) → $EQ de chaque joueur.

   ⚠ PROVENANCE = ICM_ESTIMATE / PKO_ESTIMATE (§21/§58). Le CALCUL Malmuth-Harville
   est exact, mais ce N'EST PAS un « solve ICM/GTO complet » (future-game, ranges,
   FGS…). Ne jamais l'afficher comme « EXACT ICM SOLVE ».

   Perf : la récursion exacte est en O(P · 2^N) → on ÉNUMÈRE exactement jusqu'à
   ~10 joueurs / payouts, au-delà on tronque proprement (documenté).
════════════════════════════════════════════════════════════════════════════ */

/* Probabilités de finish exactes (Malmuth-Harville).
   stacks[]  : tapis des joueurs restants.
   payouts[] : gains par place (index 0 = 1re place), décroissants.
   Retourne finishProb[i][place] = P(joueur i finit à `place`). */
export function finishProbabilities(stacks){
  const n=stacks.length;
  const total=stacks.reduce((a,b)=>a+b,0);
  const prob=Array.from({length:n},()=>new Float64Array(n));
  // Personne n'a de jetons (cas dégénéré) : rien ne départage, on répartit les places
  // à égalité plutôt que de renvoyer des probabilités nulles — sans quoi la somme des
  // $EQ ne vaut pas le total des prix (même classe de bug que le masque à 0 ci-dessous).
  if(total<=0){
    for(let i=0;i<n;i++)for(let p=0;p<n;p++)prob[i][p]=1/n;
    return prob;
  }
  // rec(actifs, place) : répartit P(atteindre cette configuration) sur les 1res places.
  // On construit les probas de finir 1er, puis conditionnellement 2e, etc., via DFS
  // sur les ensembles d'« encore en jeu ». Mémoïsation sur le masque de bits.
  const memoReach=new Map();  // mask → P(cet ensemble est exactement "les survivants restants" à ce niveau)
  // Approche : P(i finit à la place p) = somme sur ordres des (p-1) premiers éliminés-du-haut.
  // On calcule P(i est 1er de l'ensemble S) = stack_i / sum(S). Puis on retire le
  // gagnant et on récurse pour les places suivantes — pondéré par la proba d'atteindre S.
  const fullMask=(1<<n)-1;
  function sumMask(mask){let s=0;for(let i=0;i<n;i++)if(mask&(1<<i))s+=stacks[i];return s;}
  // reachProb[mask] = P(les joueurs de `mask` sont ceux qui restent après que les
  // autres ont pris les meilleures places dans l'ordre). BFS par popcount décroissant.
  const reach=new Map();reach.set(fullMask,1);
  const byPop=[];for(let m=0;m<=fullMask;m++)byPop.push(m);
  byPop.sort((a,b)=>popcount(b)-popcount(a));
  const placeOf=(n1)=>n-n1;                 // popcount k → place attribuée = n-k+1... géré ci-dessous
  for(const mask of byPop){
    const pr=reach.get(mask);if(!pr)continue;
    const k=popcount(mask);
    const place=n-k;                        // le "1er de S" prend la place (n-k+1)? → index place = n-k
    const tot=sumMask(mask);
    if(tot<=0){
      /* Tous les joueurs encore dans `mask` ont 0 jeton. Avec `continue`, leur masse
         de probabilité était ABANDONNÉE : ils n'obtenaient aucune place et leur gain
         de dernière place s'évaporait — la somme des $EQ ne valait plus le total des
         prix (mesuré : 70 au lieu de 100 sur [100,0] / payouts [70,30]). Cas atteint
         dès qu'un all-in tapis complet est évalué, donc par icmRiskPremium ET par
         l'utilité ICM du solveur : exactement le nœud qui compte le plus.
         Rien ne départage des joueurs à 0 jeton → ils se partagent à égalité les
         places restantes. */
      const rem=[];for(let i=0;i<n;i++)if(mask&(1<<i))rem.push(i);
      for(const i of rem)for(let p=place;p<place+rem.length;p++)prob[i][p]+=pr/rem.length;
      continue;
    }
    for(let i=0;i<n;i++){
      if(!(mask&(1<<i)))continue;
      const pWin=stacks[i]/tot;             // P(i est le meilleur de S)
      prob[i][place]+=pr*pWin;              // i finit à cette place
      const sub=mask&~(1<<i);
      if(sub)reach.set(sub,(reach.get(sub)||0)+pr*pWin);
    }
  }
  return prob;
}
function popcount(x){let c=0;while(x){x&=x-1;c++;}return c;}

/* $EQ ICM de chaque joueur = Σ_place finishProb[place] · payout[place]. */
export function icmEquity(stacks,payouts){
  const n=stacks.length;
  const prob=finishProbabilities(stacks);
  const pay=[];for(let p=0;p<n;p++)pay.push(payouts[p]||0);
  const eq=new Float64Array(n);
  for(let i=0;i<n;i++){let e=0;for(let p=0;p<n;p++)e+=prob[i][p]*pay[p];eq[i]=e;}
  return{eq:Array.from(eq),finishProb:prob};
}

/* Risk premium du héros pour un affrontement all-in contre `villIdx` : les jetons
   sont TRANSFÉRÉS (zéro-somme) — gagner X à l'adversaire vs lui céder X. Perdre X
   coûte plus en $EQ que gagner X n'en rapporte (pression ICM). rp>0 ⟺ il faut plus
   d'équité brute que 50%. */
export function icmRiskPremium(stacks,payouts,heroIdx,riskChips,villIdx){
  if(villIdx==null){ // par défaut : l'adversaire couvrant le plus (sinon le premier autre)
    villIdx=heroIdx;let best=-1;
    for(let i=0;i<stacks.length;i++)if(i!==heroIdx&&stacks[i]>best){best=stacks[i];villIdx=i;}
  }
  const x=Math.min(riskChips,stacks[heroIdx],stacks[villIdx]);  // écrêté aux tapis
  const base=icmEquity(stacks,payouts).eq[heroIdx];
  const up=stacks.slice();up[heroIdx]+=x;up[villIdx]-=x;        // Hero gagne l'all-in
  const dn=stacks.slice();dn[heroIdx]-=x;dn[villIdx]+=x;        // Hero perd l'all-in
  const gain=icmEquity(up,payouts).eq[heroIdx]-base;
  const loss=base-icmEquity(dn,payouts).eq[heroIdx];
  // Équité brute requise pour un call EV-neutre en $ : loss/(gain+loss).
  const evNeutral=(gain+loss)>0?loss/(gain+loss):0.5;
  return{
    icmEqBb:base,evNeutralEquity:Math.round(evNeutral*1000)/10,   // % d'équité requise
    riskPremium:Math.round((evNeutral-0.5)*1000)/10,              // vs 50% chipEV
    gain:Math.round(gain*10000)/10000,loss:Math.round(loss*10000)/10000,
  };
}

/* ══ UTILITÉ ICM POUR LE SOLVEUR (§21 stratégique · roadmap §11) ═══════════════
   Jusqu'ici l'ICM ne servait qu'à AFFICHER une équité à côté d'une stratégie
   calculée en chip-EV : le solveur ignorait la pression ICM. Cette fabrique
   fournit au CFR une utilité terminale exprimée en $EQ, pour que la STRATÉGIE
   elle-même soit solvée sous contrainte ICM.

   DEUX PROPRIÉTÉS À NE PAS PERDRE DE VUE :

   1. LE JEU N'EST GÉNÉRALEMENT PLUS À SOMME NULLE. En chip-EV, ce que Hero gagne
      Vilain le perd, d'où le `-utilité` câblé dans le CFR. Sous ICM c'est FAUX dès
      qu'il reste un TROISIÈME joueur : transférer des jetons entre Hero et Vilain
      modifie aussi l'équité des joueurs NON IMPLIQUÉS dans le coup (leur position
      relative change). On renvoie donc deux fonctions d'utilité indépendantes, `h`
      et `v` — jamais l'une la négation de l'autre. Conséquence : NashConv, défini
      comme brEV(H)+brEV(V) ≥ 0 pour un jeu à somme nulle, n'est plus interprétable.
      EXCEPTION mesurée : à DEUX joueurs, la somme des $EQ vaut le total des prix,
      constant → ΔEQ(H)+ΔEQ(V) = 0 exactement, le jeu RESTE à somme nulle et
      NashConv redevient valide. `zeroSum` reflète donc le nombre de joueurs plutôt
      qu'un « mode ICM » global : masquer NashConv en heads-up serait perdre une
      information juste.

   2. PERF. icmEquity coûte 9 µs à 3 joueurs et 275 µs à 9 (récursion en O(2^n)).
      L'appeler à chaque nœud terminal × paire de combos × itération est hors de
      question. Mais un arbre 3 rues ne produit que ~89 résultats en jetons
      DISTINCTS pour 1345 nœuds terminaux : on mémoïse sur le delta de jetons.
      Clé ARRONDIE — sans quoi le bruit flottant (-81.6222 vs -81.62220000000002,
      ou 3.55e-15 vs 0) fragmente le cache en doublons.

   `stacks` et `delta` sont dans la MÊME unité (bb par défaut, cohérent avec le
   reste du solveur). Retourne {h, v, zeroSum:false, base, calls}. */
export function makeIcmUtility({stacks,payouts,heroIdx=0,villIdx=1,precision=6}={}){
  if(!stacks||stacks.length<2||!payouts)return null;
  const base=icmEquity(stacks,payouts).eq;
  const baseH=base[heroIdx],baseV=base[villIdx];
  const maxSwing=Math.min(stacks[heroIdx],stacks[villIdx]);   // on ne peut pas perdre plus que le tapis couvrant
  const memo=new Map();
  let calls=0;
  const evalDelta=(d)=>{
    // Écrêtage au tapis effectif : l'arbre le fait déjà, on se protège des arrondis.
    const x=Math.max(-maxSwing,Math.min(maxSwing,d));
    const key=x.toFixed(precision);
    let hit=memo.get(key);
    if(hit)return hit;
    const s=stacks.slice();
    s[heroIdx]+=x;s[villIdx]-=x;
    const eq=icmEquity(s,payouts).eq;
    calls++;
    hit=[eq[heroIdx]-baseH,eq[villIdx]-baseV];
    memo.set(key,hit);
    return hit;
  };
  /* UTILITÉ DÉGÉNÉRÉE — garde-fou §2. Si la structure de gains rend les jetons sans
     valeur en $ (payouts strictement plats : tout le monde touche la même chose quel
     que soit son classement), alors ΔEQ ≡ 0 pour TOUT transfert. Le CFR n'a plus
     aucun gradient et renvoie une stratégie uniforme 1/na — mesuré : 50/50 exact sur
     une décision fold/call. Ce n'est pas une stratégie d'équilibre, c'est l'absence
     d'information. L'appelant doit le signaler plutôt que d'afficher ce 50/50 comme
     un solve. On teste les deux extrêmes, seuls points où l'écart serait maximal. */
  const degenerate=Math.abs(evalDelta(maxSwing)[0])<1e-12&&Math.abs(evalDelta(-maxSwing)[0])<1e-12;

  return{
    h:(d)=>evalDelta(d)[0],
    v:(d)=>evalDelta(d)[1],
    degenerate,
    // À 2 joueurs la somme des $EQ est constante → somme nulle (vérifié à 1e-12).
    // Au-delà, l'équité des joueurs hors du coup bouge → somme non nulle.
    zeroSum:stacks.length===2,
    base:{hero:baseH,vill:baseV},
    get calls(){return calls;},
    get memoSize(){return memo.size;},
  };
}

/* Utilité chip-EV — le comportement historique, rendu EXPLICITE pour que le CFR
   n'ait qu'un seul chemin de code. Somme nulle : v = -h. */
export const CHIP_UTILITY={h:(d)=>d,v:(d)=>-d,zeroSum:true};

/* ══ UTILITÉ PKO POUR LE SOLVEUR (§22 stratégique · roadmap §11) ═══════════════
   Même démarche que makeIcmUtility, avec la spécificité qui définit le PKO : la
   prime ne se capture QU'À L'ÉLIMINATION. Elle n'est donc pas une valeur continue
   ajoutée partout, mais un SAUT aux seuls nœuds terminaux où un tapis tombe à zéro.

   Utilité de chaque joueur pour un transfert de d jetons :
       Hero   : ΔEQ_ICM_hero(d) + realization·bounty[vilain]  si le VILAIN est éliminé
       Vilain : ΔEQ_ICM_vill(d) + realization·bounty[hero]    si HERO est éliminé

   Le gain de prime est PUREMENT ASYMÉTRIQUE : chacun encaisse en éliminant l'autre.
   On ne retire PAS à Hero une part de sa propre prime quand il bust — piège dans
   lequel une première version est tombée, avec un effet mesurable et faux. Sa prime
   n'est pas un actif qu'il détient : elle est posée sur SA tête et ne lui reviendrait
   qu'en gagnant le tournoi. La compter comme une perte d'équité double le coût du
   bust et INVERSE la conclusion — mesuré : la prime faisait folder DAVANTAGE
   (88.4% → 94.9% quand elle passait de 5 à 80), au lieu d'élargir.

   EFFET ATTENDU, et c'est l'inverse de l'ICM : la prime récompense la prise de
   risque, donc elle ÉLARGIT les calls là où l'ICM les resserre. Sur un même spot
   de bulle les deux forces s'opposent et le résultat net dépend du rapport entre
   la prime et le saut de paiement — ce que le solveur tranche désormais au lieu
   de le laisser à l'intuition.

   CE QUE CE MODÈLE NE FAIT PAS, et qui impose PKO_ESTIMATE (§22/§58) :
     · la valeur de sa PROPRE prime n'est pas modélisée : en PKO réel un joueur
       encaisse sa tête restante s'il gagne le tournoi. Terme de second ordre,
       volontairement omis — l'inclure correctement supposerait de l'intégrer aux
       payouts, pas de le soustraire à l'élimination ;
     · `realization` (part de la prime encaissée immédiatement, typiquement 0.5 en
       PKO progressif, le reste grossissant sa propre tête) est un PARAMÈTRE, pas
       un résultat de calcul ;
     · les primes des joueurs hors du coup ne bougent pas.
   Ce n'est donc pas un « solve PKO complet » et ne doit jamais être présenté comme
   tel — mais la STRATÉGIE, elle, est bien re-solvée par CFR sous cette utilité.

   `bounties` est dans la MÊME unité que `payouts`. Retourne la même interface que
   makeIcmUtility, plus `bountySwing`. */
export function makePkoUtility({stacks,payouts,heroIdx=0,villIdx=1,bounties=[],realization=0.5,precision=6}={}){
  if(!stacks||stacks.length<2||!payouts)return null;
  const icm=makeIcmUtility({stacks,payouts,heroIdx,villIdx,precision});
  if(!icm)return null;
  const bH=bounties[heroIdx]||0,bV=bounties[villIdx]||0;
  const heroKoGain=realization*bV;   // Hero élimine le vilain → encaisse sa tête
  const villKoGain=realization*bH;   // le vilain élimine Hero → encaisse celle de Hero
  const sH=stacks[heroIdx],sV=stacks[villIdx];
  /* Élimination = engagement TOTAL du tapis. `d` est le gain net de Hero : quand il
     gagne, d vaut exactement l'engagement du vilain (sa part de pot + ses mises),
     donc `d >= sV` teste bien la mise à zéro de son tapis — et symétriquement.
     Attention : encore faut-il que l'arbre PRODUISE un terminal all-in. Avec un
     sizing qui n'atteint pas le tapis, aucune élimination n'est possible et la
     prime reste sans effet — ce n'est pas un bug mais l'absence de KO à gagner. */
  const villOut=(d)=>sV-d<=1e-9;
  const heroOut=(d)=>sH+d<=1e-9;
  return{
    h:(d)=>icm.h(d)+(villOut(d)?heroKoGain:0),
    v:(d)=>icm.v(d)+(heroOut(d)?villKoGain:0),
    /* Dégénéré seulement si NI l'ICM NI la prime ne créent d'écart : avec des gains
       plats mais une vraie prime, les jetons gardent une valeur (celle du KO) et la
       stratégie redevient signifiante — ne pas la déclarer vide à tort. */
    degenerate:icm.degenerate&&heroKoGain===0&&villKoGain===0,
    // Le terme de prime brise la somme nulle même en heads-up : les deux camps
    // encaissent sur des ÉVÉNEMENTS DISJOINTS, rien ne s'annule.
    zeroSum:icm.zeroSum&&heroKoGain===0&&villKoGain===0,
    base:icm.base,
    bountySwing:{heroKoGain,villKoGain,realization},
    get calls(){return icm.calls;},
    get memoSize(){return icm.memoSize;},
  };
}

/* ── PKO (§22) : valeur = équité chips (part du pot) + valeur de bounty capturée.
   bountyValue = fraction du bounty adverse réalisée si Hero gagne l'affrontement.
   Estimation (pas un solve PKO complet) → PKO_ESTIMATE. ── */
export function pkoValue({potBb,heroEquity,villainBounty=0,bountyRealization=0.5}){
  const chipEv=heroEquity*potBb;
  const bountyEv=heroEquity*villainBounty*bountyRealization;
  return{
    chipEv:Math.round(chipEv*1000)/1000,
    bountyEv:Math.round(bountyEv*1000)/1000,
    totalEv:Math.round((chipEv+bountyEv)*1000)/1000,
    // Élargissement de range : le bounty ↑ la valeur d'un call → seuil d'équité ↓.
    equityDiscount:Math.round(villainBounty*bountyRealization/(potBb+villainBounty*bountyRealization||1)*1000)/10,
  };
}
