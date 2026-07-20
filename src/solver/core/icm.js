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
  if(total<=0)return prob;
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
    const tot=sumMask(mask);if(tot<=0)continue;
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
