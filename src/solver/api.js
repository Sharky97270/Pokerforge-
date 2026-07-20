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
import { ResultSource } from "./provenance.js";
import { computeEquity as _equity, monteCarloEquity } from "./core/equity.js";
import { solveRiverCFR } from "./core/cfr.js";
import { solveTree, nashConv } from "./core/multistreet.js";
import { rangeComboList } from "./core/combos.js";
import { icmEquity, icmRiskPremium, pkoValue } from "./core/icm.js";
import { storeSolution, getSolution, getClosest, librarySize } from "./library.js";

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
  const iters=opts.iters||400,maxCombos=opts.maxCombos||50;
  // Signature complète du solve (ranges réelles incluses) → seed + SolveID déterministes.
  const sig=_freqSig(heroFreqs)+"#"+_freqSig(villFreqs)+"#"+(board||[]).join(",")+"#"+potBb+"#"+betFrac+"#"+iters+"#"+maxCombos;
  const seed=opts.seed!=null?opts.seed:_hashSeed(sig);
  const solveId=makeSolveId(sig+"#"+seed);
  // §16 : solution déjà en bibliothèque → chargement IMMÉDIAT (provenance PRESOLVED_LIBRARY).
  if(!opts.force){
    const cached=getSolution(solveId);
    if(cached)return{...cached,source:ResultSource.PRESOLVED_LIBRARY,fromLibrary:true};
  }
  const result=solveRiverCFR(heroFreqs,villFreqs,board,potBb,betFrac,{...opts,seed});
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
  const maxCombos=opts.maxCombos||100;
  const cap=(freqs)=>rangeComboList(freqs).filter(e=>!board.includes(e.cards[0])&&!board.includes(e.cards[1])).slice(0,maxCombos);
  const H=cap(heroFreqs),V=cap(villFreqs);
  if(!H.length||!V.length||board.length<3)return{source:ResultSource.NO_SOLUTION,result:null,convergence:null,solveId:null,experimental:true};
  const nStreets=opts.streets??(6-board.length-1);          // flop→3, turn→2, river→1
  const sig="ms1|"+_freqSig(heroFreqs)+"#"+_freqSig(villFreqs)+"#"+board.join(",")+"#"+(opts.startPot||6)+"#"+(opts.betFrac||opts.betSizes||0.66)+"#"+(opts.iters||200)+"#"+maxCombos+"#"+nStreets+"#"+(opts.locks?JSON.stringify(opts.locks):"");
  const seed=opts.seed!=null?opts.seed:_hashSeed(sig);
  const solveId=makeSolveId(sig+"#"+seed);
  if(!opts.force){
    const cached=getSolution(solveId);
    if(cached)return{...cached,source:ResultSource.PRESOLVED_LIBRARY,fromLibrary:true};
  }
  const sol=solveTree(H,V,board,{...opts,streets:nStreets,seed,iters:opts.iters||200});
  const nc=sol.sampled?null:nashConv(sol);
  const out={
    source:ResultSource.CFR_SOLVE,experimental:true,fromLibrary:false,
    result:sol,
    convergence:nc==null?{nashConv:null,note:"board incomplet — exploitabilité exacte indisponible (runouts échantillonnés)"}:{nashConv:nc},
    solveId,seed,
  };
  storeSolution(solveId,out);
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
export const EXPLOIT_PROFILES={
  nit:            {label:"Nit",             vsBet:{F:0.62,C:0.33,R:0.05}, afterCheck:{X:0.75,B:0.25}},
  tag:            {label:"TAG",             vsBet:{F:0.45,C:0.45,R:0.10}, afterCheck:{X:0.55,B:0.45}},
  lag:            {label:"LAG",             vsBet:{F:0.30,C:0.50,R:0.20}, afterCheck:{X:0.40,B:0.60}},
  calling_station:{label:"Calling Station", vsBet:{F:0.12,C:0.83,R:0.05}, afterCheck:{X:0.60,B:0.40}},
  fish:           {label:"Fish",            vsBet:{F:0.20,C:0.75,R:0.05}, afterCheck:{X:0.65,B:0.35}},
  aggro_reg:      {label:"Aggro Reg",       vsBet:{F:0.35,C:0.45,R:0.20}, afterCheck:{X:0.45,B:0.55}},
  maniac:         {label:"Maniac",          vsBet:{F:0.25,C:0.35,R:0.40}, afterCheck:{X:0.30,B:0.70}},
  reg:            {label:"Reg",             vsBet:{F:0.42,C:0.48,R:0.10}, afterCheck:{X:0.50,B:0.50}},
};
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

/* Accès bas-niveau exposé pour les cas simples (équité brute sans provenance). */
export { monteCarloEquity };
