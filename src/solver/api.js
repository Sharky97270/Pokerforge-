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
