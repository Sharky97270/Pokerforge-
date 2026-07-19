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
export function solveSubgame(heroFreqs,villFreqs,board,potBb,betFrac,opts={}){
  // Seed déterministe → CFR reproductible (§15).
  const seed=opts.seed!=null?opts.seed:_hashSeed((board||[]).join(",")+"|"+Object.keys(heroFreqs).join("")+"|"+Object.keys(villFreqs).join("")+"|"+betFrac);
  const result=solveRiverCFR(heroFreqs,villFreqs,board,potBb,betFrac,{...opts,seed});
  if(!result)return{source:ResultSource.NO_SOLUTION,result:null,convergence:null,solveId:null};
  return{
    source:ResultSource.CFR_SOLVE,
    result,
    convergence:{
      stability:result.stability,avgRegret:result.avgRegret,
      exploitBb:result.exploitBb,status:result.convStatus,driftPct:result.driftPct,
    },
    solveId:makeSolveId({board:(board||[]).join(","),potBb,betFrac,iters:opts.iters,maxCombos:opts.maxCombos,nH:result.nH,nV:result.nV}),
  };
}

/* ── Bibliothèque pré-solvée (§16) — architecture future. Stubs honnêtes :
   tant qu'aucune library n'existe, on renvoie null (→ l'appelant solve à la demande). ── */
export function getPresolvedSolution(/* config */){ return null; }
export function getClosestSolution(/* config */){ return null; }

/* Accès bas-niveau exposé pour les cas simples (équité brute sans provenance). */
export { monteCarloEquity };
