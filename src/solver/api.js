/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER · SOLVER API (§17)
   Interface interne STABLE au-dessus du Core (Card/Combo/Evaluator/Equity/CFR).
   Les autres modules de PokerForge (Trainer, Replayer, HH Analyzer, Leak
   Detector, Coach AI) doivent interroger CETTE API — jamais l'implémentation
   CFR directement. Chaque résultat porte sa PROVENANCE (§6).

   Surface V1 :
     makeSolveId(spec)                         → identifiant déterministe (§15)
     computeEquity(heroList, villList, board)  → { equity, source, exact }        (§10)
     solveSubgame(heroFreqs, villFreqs, …)     → { source, result, convergence }  (§13,§14)
     getPresolvedSolution / getClosestSolution → stubs bibliothèque pré-solvée     (§16)
════════════════════════════════════════════════════════════════════════════ */
import { ResultSource, RangeSource } from "./provenance.js";
import { solvePushFold, pfExploitability, pfRangePct, pfToFreqs,
         PF_HANDS, PF_MATRIX_META } from "./core/pushfold.js";
import PF_RANGES from "./data/pushfoldRanges.js";
import { computeEquity as _equity, monteCarloEquity, monteCarloEquityDetailed } from "./core/equity.js";
// §5 — cadre théorique : ce que la théorie des jeux autorise à revendiquer.
import { deriveEquilibriumScope, mayClaimNashApproximation } from "./certification/types.js";
import { solveRiverCFR } from "./core/cfr.js";
import { solveTree, nashConv } from "./core/multistreet.js";
import { rangeComboList, reduceRange } from "./core/combos.js";
import { icmEquity, icmRiskPremium, pkoValue, makeIcmUtility, makePkoUtility } from "./core/icm.js";
import { storeSolution, getSolution, getClosest, librarySize,
         hydrateLibrary, libraryStatus, persistedCount, clearLibrary } from "./library.js";

/* Identifiant de solve déterministe : même spec → même ID (reproductibilité §15). */
export function makeSolveId(spec){
  const raw=typeof spec==="string"?spec:JSON.stringify(spec);
  let h=0;for(let i=0;i<raw.length;i++)h=(h*31+raw.charCodeAt(i))>>>0;
  return "SHK-"+h.toString(16).toUpperCase().padStart(8,"0").slice(0,8);
}

/* Équité Hero (%) + PROVENANCE. Énumération exacte si calculable, sinon Monte-Carlo. */
export function computeEquity(heroList,villList,board=[],opts={}){
  const r=_equity(heroList,villList,board,opts);
  return {
    equity:r.equity,
    exact:r.exact,
    source:r.exact?ResultSource.EXACT_CALCULATION:ResultSource.NUMERICAL_APPROXIMATION,
    evals:r.evals,samples:r.samples,seed:r.seed,   // seed → reproductibilité (§15)
  };
}

/* Résolution CFR+ d'un sous-jeu 1-street heads-up + convergence + provenance.
   `result` conserve la forme de solveRiverCFR (rétro-compatible) ; on y ajoute
   la provenance et un résumé de convergence exploitable par l'UI/Coach. */
function _hashSeed(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
/* Signature canonique d'une range (clés + poids de continuation) → clé de solve. */
function _freqSig(freqs){const keys=Object.keys(freqs).sort();let s="";for(const k of keys){const f=freqs[k];const w=(f.r||0)+(f.c||0);if(w>0)s+=k+":"+w+";";}return s;}

export function solveSubgame(heroFreqs,villFreqs,board,potBb,betFrac,opts={}){
  /* 200 par défaut (et non 50) : en dessous de 169 classes, la réduction supprime
     des classes de mains entières. `maxCombos:0` = range non plafonnée. */
  const iters=opts.iters||400,maxCombos=opts.maxCombos!=null?opts.maxCombos:200;
  // Signature complète du solve (ranges réelles incluses) → seed + SolveID déterministes.
  /* Même correction qu'en multi-rue : `runouts` et `raiseMult` changent le
     résultat et doivent donc changer la clé (§63). */
  const sig=_freqSig(heroFreqs)+"#"+_freqSig(villFreqs)+"#"+(board||[]).join(",")+"#"+potBb+"#"+betFrac+"#"+iters+"#"+maxCombos+"#ro:"+(opts.runouts??60)+"#rm:"+(opts.raiseMult??3);
  const seed=opts.seed!=null?opts.seed:_hashSeed(sig);
  const solveId=makeSolveId(sig+"#"+seed);
  // §16 : solution déjà en bibliothèque → chargement IMMÉDIAT (provenance PRESOLVED_LIBRARY).
  if(!opts.force){
    const cached=getSolution(solveId);
    if(cached)return{...cached,source:ResultSource.PRESOLVED_LIBRARY,fromLibrary:true};
  }
  // maxCombos passé EXPLICITEMENT : il entre dans la signature de cache ci-dessus,
  // il doit donc être exactement celui utilisé par le solve (sinon la clé ment).
  const result=solveRiverCFR(heroFreqs,villFreqs,board,potBb,betFrac,{...opts,maxCombos,seed});
  if(!result)return{source:ResultSource.NO_SOLUTION,result:null,convergence:null,solveId:null};
  const out={
    source:ResultSource.CFR_SOLVE,
    result,
    convergence:{
      stability:result.stability,avgRegret:result.avgRegret,
      exploitBb:result.exploitBb,status:result.convStatus,driftPct:result.driftPct,
    },
    solveId,seed,fromLibrary:false,
  };
  storeSolution(solveId,out);   // stocke pour rechargement instantané (§16)
  return out;
}

/* ── MULTI-STREET (§26) — EXPÉRIMENTAL. Résout l'arbre postflop multi-rue
   (sous-arbres par carte, raises, all-in) sur ranges 169 bornées à maxCombos.
   Benchmarké : clairvoyance analytique ≤0.4%, NashConv ≈0 (river ranges larges).
   `experimental:true` : l'UI ne doit PAS l'afficher comme « GTO » sans le dire (§2). ── */
export function solveMultiStreet(heroFreqs,villFreqs,board,opts={}){
  /* Défaut 200 et non 100 : il y a jusqu'à 169 classes de mains. En dessous, la
     réduction doit SUPPRIMER des classes entières (cf. reduceRange). Au-dessus,
     la forme de la range est conservée exactement. `maxCombos:0` = non plafonné. */
  const maxCombos=opts.maxCombos!=null?opts.maxCombos:200;
  const reduce=(freqs)=>reduceRange(
    rangeComboList(freqs).filter(e=>!board.includes(e.cards[0])&&!board.includes(e.cards[1])),
    maxCombos);
  const rH=reduce(heroFreqs),rV=reduce(villFreqs);
  const H=rH.list,V=rV.list;
  if(!H.length||!V.length||board.length<3)return{source:ResultSource.NO_SOLUTION,result:null,convergence:null,solveId:null,experimental:true};
  const nStreets=opts.streets??(6-board.length-1);          // flop→3, turn→2, river→1
  /* §21 STRATÉGIQUE — `opts.icm = {stacks,payouts,heroIdx,villIdx}` fait solver la
     stratégie en $EQ ICM et non en jetons. Distinction essentielle : jusqu'ici l'ICM
     n'était qu'un affichage à côté d'une stratégie chip-EV ; ici il ENTRE dans le
     calcul. Le jeu cesse d'être à somme nulle → NashConv indisponible (cf. nashConv). */
  /* §22 STRATÉGIQUE — `opts.pko` ajoute la capture de prime à l'élimination par
     dessus l'ICM. Prioritaire sur `opts.icm` : le PKO l'englobe déjà. */
  const tourneyUtility=opts.pko?makePkoUtility(opts.pko):opts.icm?makeIcmUtility(opts.icm):null;
  const icmUtility=tourneyUtility;
  // Le contexte ICM entre dans la SIGNATURE : mêmes ranges + mêmes stacks de
  // tournoi différents = solves différents, ils ne doivent pas partager de clé.
  /* ── LA SIGNATURE DOIT DÉCRIRE L'ARBRE, PAS SEULEMENT LES RANGES ─────────
     Version antérieure : ni `effStack`, ni `maxRaisesPerStreet`, ni `ipProbe`,
     ni `raiseMult` n'entraient dans la clé. Deux solves d'un même board et de
     mêmes ranges à des TAPIS DIFFÉRENTS partageaient donc le même solveId : le
     second était servi depuis la bibliothèque avec la stratégie du premier.
     C'est exactement la collision que §63 du cahier des charges interdit, et
     elle bloquait l'Adaptive Sizing Engine (dont tout le principe est de solver
     le MÊME spot avec des arbres différents).
     Tout ce qui change la FORME de l'arbre entre désormais dans la clé. ── */
  const _treeSig=[
    opts.betFrac!=null?"bf:"+opts.betFrac:"",
    opts.betSizes?"bs:"+JSON.stringify(opts.betSizes):"",
    opts.betSizesByPlayer?"bp:"+JSON.stringify(opts.betSizesByPlayer):"",
    opts.raiseSizes?"rs:"+JSON.stringify(opts.raiseSizes):"",
    "rm:"+(opts.raiseMult??3),
    "mr:"+(opts.maxRaisesPerStreet??1),
    "es:"+(opts.effStack==null?"inf":opts.effStack),
    "ip:"+(opts.ipProbe!==false?1:0),
    opts.allowJam?"jam:1":"",
    opts.nodeOverrides?"no:"+JSON.stringify(opts.nodeOverrides):"",
    opts.minBet!=null?"mb:"+opts.minBet:"",
    opts.bb!=null?"bb:"+opts.bb:"",
  ].filter(Boolean).join("|");
  const sig="ms2|"+_freqSig(heroFreqs)+"#"+_freqSig(villFreqs)+"#"+board.join(",")+"#"+(opts.startPot||6)+"#"+_treeSig+"#"+(opts.iters||200)+"#"+maxCombos+"#"+nStreets+"#"+(opts.locks?JSON.stringify(opts.locks):"")+"#"+(opts.pko?"pko:"+JSON.stringify(opts.pko):opts.icm?"icm:"+JSON.stringify(opts.icm):"chip");
  const seed=opts.seed!=null?opts.seed:_hashSeed(sig);
  const solveId=makeSolveId(sig+"#"+seed);
  if(!opts.force){
    const cached=getSolution(solveId);
    if(cached)return{...cached,source:ResultSource.PRESOLVED_LIBRARY,fromLibrary:true};
  }
  const sol=solveTree(H,V,board,{...opts,streets:nStreets,seed,iters:opts.iters||200,
    utility:tourneyUtility||undefined});
  const nc=sol.sampled?null:nashConv(sol);
  // Raisons DISTINCTES d'absence de NashConv — les confondre induirait en erreur.
  const convNote=tourneyUtility&&tourneyUtility.zeroSum===false
    ? (opts.pko
        ? "mode PKO : la capture de prime brise la somme nulle, NashConv n'est pas interprétable"
        : "mode ICM : le jeu n'est pas à somme nulle, NashConv n'est pas interprétable")
    : "board incomplet — exploitabilité exacte indisponible (runouts échantillonnés)";
  /* §5 — CADRE THÉORIQUE attaché au résultat. Additif : aucun champ existant ne change.
     Objet : rendre STRUCTURELLEMENT impossible d'annoncer « équilibre de Nash » là où
     la théorie ne le permet pas. `NashConv = brEV(H) + brEV(V)` est une identité qui
     SUPPOSE la somme nulle ; à 3 joueurs sous ICM les jetons transférés déplacent
     l'équité de joueurs absents du coup, et la métrique perd son sens.
     Le nombre de joueurs vient des tapis de tournoi quand ils existent (ICM/PKO) ;
     sinon le sous-jeu postflop est heads-up par construction. */
  const _players=(opts.pko&&Array.isArray(opts.pko.stacks)&&opts.pko.stacks.length)
    ||(opts.icm&&Array.isArray(opts.icm.stacks)&&opts.icm.stacks.length)||2;
  const _utilKind=opts.pko?"pko":opts.icm?"icm":"chip";
  const equilibriumScope=deriveEquilibriumScope({playerCount:_players,utilityKind:_utilKind});
  const out={
    source:ResultSource.CFR_SOLVE,experimental:true,fromLibrary:false,
    result:sol,
    convergence:nc==null?{nashConv:null,note:convNote}:{nashConv:nc},
    equilibriumScope,
    /* Verrou de vocabulaire : `true` UNIQUEMENT si le cadre autorise la revendication
       ET si l'exploitabilité a réellement été mesurée. Une UI doit lire ce booléen
       plutôt que d'inférer depuis NashConv — inférer, c'est reconstituer la règle à
       chaque endroit, donc l'oublier quelque part. */
    mayClaimNashApproximation:mayClaimNashApproximation(equilibriumScope)&&nc!=null,
    /* §21 — la stratégie est-elle solvée sous contrainte ICM, ou en jetons ?
       `icm.strategic:true` signifie que l'ICM est ENTRÉ dans le calcul de la
       stratégie, pas seulement affiché à côté. */
    icm:tourneyUtility?{
      strategic:true,
      mode:opts.pko?"pko":"icm",
      model:opts.pko?"Malmuth-Harville + capture de prime":"Malmuth-Harville",
      params:opts.pko||opts.icm,
      /* §22/§58 — la STRATÉGIE est bien re-solvée par CFR, mais le modèle de prime
         reste une estimation (prime propre partiellement modélisée, `realization`
         paramétrée et non calculée) : jamais « solve PKO complet ». */
      bounty:opts.pko?{...tourneyUtility.bountySwing,model:ResultSource.PKO_ESTIMATE}:null,
      baseEq:tourneyUtility.base,icmCalls:tourneyUtility.calls,
      /* Gains plats → les jetons n'ont aucune valeur en $ → utilité identiquement
         nulle → stratégie uniforme dénuée de sens. À ne PAS présenter comme un solve. */
      degenerate:tourneyUtility.degenerate,
      degenerateNote:tourneyUtility.degenerate
        ?"structure de gains plate et aucune prime : les jetons n'ont pas de valeur, la stratégie renvoyée est uniforme et ne signifie rien"
        :null,
    }:{strategic:false},
    /* §8/§2 — la solution porte-t-elle sur la range COMPLÈTE ? L'UI doit le dire. */
    abstraction:{
      exact:rH.exact&&rV.exact,
      hero:{kept:rH.kept,total:rH.total,classesKept:rH.classesKept,classesTotal:rH.classesTotal,classesDropped:rH.classesDropped,method:rH.method},
      vill:{kept:rV.kept,total:rV.total,classesKept:rV.classesKept,classesTotal:rV.classesTotal,classesDropped:rV.classesDropped,method:rV.method},
    },
    solveId,seed,
  };
  /* ── `noStore` : NE PAS entrer en bibliothèque ────────────────────────────
     La Solution Library garde jusqu'à 500 solutions COMPLÈTES en mémoire, tables
     de stratégie comprises. C'est un bon compromis pour des solves d'analyse,
     que l'on relit. Ce n'en est pas un pour les micro-solves d'évaluation de
     l'Adaptive Sizing Engine : il en enchaîne dix à quarante par spot, dont
     aucun n'est une solution (§13 — « ne pas considérer les micro-solves de
     sélection comme équivalents à la solution finale »). Les conserver a fait
     tomber le banc d'essai à court de tas dès le dixième spot.
     L'appelant qui produit du jetable le déclare. */
  if(!opts.noStore)storeSolution(solveId,out);
  return out;
}

/* ── SOLVED NODE LOCK (§19) — vrai re-solve CFR contre des fréquences verrouillées.
   locks = [{path:["B"], freqs:{F:0.7,C:0.3}}] : chemin d'actions depuis la racine,
   fréquences imposées au nœud atteint ; tout le reste de l'arbre re-solve.
   ≠ Quick Node Lock (HEURISTIC_ESTIMATE) : ici provenance CFR_SOLVE + nodeLocked. ── */
export function solveNodeLocked(heroFreqs,villFreqs,board,locks,opts={}){
  const out=solveMultiStreet(heroFreqs,villFreqs,board,{...opts,locks});
  return{...out,nodeLocked:true,locks};
}

/* ── EXPLOIT SOLVER (§20) : GTO SOLUTION → PLAYER MODEL → NODE LOCK → RE-SOLVE.
   Les profils sont des MODÈLES DE JOUEUR (tendances estimées → HEURISTIC) ; la
   stratégie d'exploit, elle, est réellement RE-SOLVÉE par CFR contre ces verrous.
   Tendances : réponse face à une mise (F/C/R) + comportement après check (X/B). ── */
/* Les profils vivent désormais dans core/exploitProfiles.js — PFASE et son
   Web Worker doivent les lire sans embarquer la bibliothèque de solutions.
   Ré-export : une seule source de vérité, aucun appelant à changer. */
export { EXPLOIT_PROFILES, locksForProfile, validateProfile } from "./core/exploitProfiles.js";
import { EXPLOIT_PROFILES } from "./core/exploitProfiles.js";
export function solveExploit(profileId,heroFreqs,villFreqs,board,opts={}){
  const prof=EXPLOIT_PROFILES[profileId];
  if(!prof)return{source:ResultSource.NO_SOLUTION,result:null,convergence:null,solveId:null,experimental:true};
  const locks=[
    {match:"villFacingBet",freqs:prof.vsBet},
    {match:"villAfterCheck",freqs:prof.afterCheck},
  ];
  const out=solveMultiStreet(heroFreqs,villFreqs,board,{...opts,locks});
  return{...out,exploit:{profile:profileId,label:prof.label,model:ResultSource.HEURISTIC_ESTIMATE,locks}};
}

/* ── ICM (§21) : équité de tournoi Malmuth-Harville EXACTE + risk premium.
   Provenance ICM_ESTIMATE — le calcul est exact mais ce n'est PAS un solve ICM
   complet (§21/§58 : jamais « EXACT ICM SOLVE »). ── */
export function computeICM({stacks,payouts,heroIdx=0,riskChips,villIdx}={}){
  if(!stacks||!stacks.length||!payouts)return{source:ResultSource.NO_SOLUTION,eq:null};
  const {eq,finishProb}=icmEquity(stacks,payouts);
  const rp=riskChips?icmRiskPremium(stacks,payouts,heroIdx,riskChips,villIdx):null;
  return{
    source:ResultSource.ICM_ESTIMATE,model:"Malmuth-Harville",
    eq,finishProb:finishProb.map(r=>Array.from(r)),
    heroEq:eq[heroIdx],riskPremium:rp?rp.riskPremium:null,evNeutralEquity:rp?rp.evNeutralEquity:null,
  };
}
/* ── PKO (§22) : valeur chips + bounty. Provenance PKO_ESTIMATE. ── */
export function computePKO(params={}){
  const v=pkoValue(params);
  return{source:ResultSource.PKO_ESTIMATE,...v};
}

/* ── PUSH/FOLD PRÉFLOP (§11) — la PREMIÈRE zone préflop réellement calculée.
   Jusqu'ici tout le préflop était heuristique (buildSolverFreqs) et le CFR y était
   désactivé (§40, sous-jeu postflop). Le push/fold tapis court échappe à cette
   limite : tout all-in va à l'abattage, donc aucune EV postflop à estimer.
   Provenance EXACT_CALCULATION et RangeSource.SOLVER_GENERATED — ces ranges ne
   sont PAS des estimations.
   Réserves à afficher : heads-up uniquement, chip-EV pur (aucune contrainte ICM,
   bien que l'utilité §21 existe), précision bornée par le bruit de la matrice. ── */
const _pfCache=new Map();
const _pfLimits={
  headsUpOnly:true,
  chipEvOnly:true,   // aucune contrainte ICM — ne pas présenter comme bulle
  note:"heads-up, chip-EV pur (sans ICM), précision bornée par la matrice d'équité",
};
export function solvePreflopPushFold(effStackBb,opts={}){
  const S=Math.round((effStackBb||0)*10)/10;
  if(!(S>0))return{source:ResultSource.NO_SOLUTION,sbJam:null,bbCall:null};

  /* Table PRÉ-CALCULÉE hors ligne à 20000 itérations (exploitabilité max
     0.000256 bb) pour les tapis entiers 1..25bb. Le solve live coûterait ~6 s et
     gèlerait l'UI ; ici c'est un lookup instantané ET plus précis. Repli sur le
     solve live pour tout tapis non tabulé (fractionnaire, ou hors 1..25). */
  const whole=Math.round(S);
  const tabled=(!opts.force&&Math.abs(S-whole)<1e-9&&PF_RANGES.depths[whole])?PF_RANGES.depths[whole]:null;
  const key=S+"|"+(tabled?"lib":(opts.iters||"live"));
  if(!opts.force&&_pfCache.has(key))return _pfCache.get(key);

  let sbJamFreq,bbCallFreq,jamPct,callPct,exp,iters,provenance;
  if(tabled){
    const toDist=(arr)=>Float64Array.from(arr,x=>x/1000);
    sbJamFreq=toDist(tabled.jam);bbCallFreq=toDist(tabled.call);
    jamPct=tabled.jamPct;callPct=tabled.callPct;
    exp={sb:tabled.exp.sb,bb:tabled.exp.bb};
    iters=PF_RANGES.iters;provenance="library";
  }else{
    const sol=solvePushFold(S,opts);
    sbJamFreq=sol.sbJam;bbCallFreq=sol.bbCall;
    jamPct=Math.round(pfRangePct(sol.sbJam)*10)/10;
    callPct=Math.round(pfRangePct(sol.bbCall)*10)/10;
    const e=pfExploitability(sol.sbJam,sol.bbCall,S);
    exp={sb:e.sbGain,bb:e.bbGain};
    iters=sol.iters;provenance="live";
  }
  const out={
    source:ResultSource.EXACT_CALCULATION,
    rangeSource:RangeSource.SOLVER_GENERATED,
    stack:S,iters,precompiled:provenance==="library",
    sbJam:pfToFreqs(sbJamFreq),bbCall:pfToFreqs(bbCallFreq),
    sbJamPct:jamPct,bbCallPct:callPct,
    // Même rôle que NashConv : ≈0 des deux côtés ⟺ équilibre atteint.
    exploitability:exp,
    matrix:PF_MATRIX_META,
    limits:_pfLimits,
  };
  _pfCache.set(key,out);
  return out;
}
export { PF_HANDS, PF_MATRIX_META };

/* ── Bibliothèque pré-solvée (§16) — adossée au Solution Storage. ── */
export function getPresolvedSolution(solveId){
  const s=getSolution(solveId);
  return s?{...s,source:ResultSource.PRESOLVED_LIBRARY}:null;
}
export function getClosestSolution(solveId){
  const m=getClosest(solveId);
  return m?{...m.solution,source:ResultSource.PRESOLVED_LIBRARY,exactMatch:m.exact}:null;
}
export { librarySize };
/* Persistance de la bibliothèque (§16 · roadmap §11). hydrateLibrary() doit être
   appelé une fois au montage du solveur : il remonte en mémoire les solves des
   sessions précédentes, qui redeviennent alors des PRESOLVED_LIBRARY immédiats. */
export { hydrateLibrary, libraryStatus, persistedCount, clearLibrary };

/* Accès bas-niveau exposé pour les cas simples (équité brute sans provenance). */
export { monteCarloEquity, monteCarloEquityDetailed };
