/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER · SOLUTION STORAGE + SHARK SOLUTION LIBRARY (§15, §16)
   Stockage des solves par identifiant → « spot déjà résolu ? chargement immédiat ».
   V1 : cache en mémoire (Map). L'architecture est prête pour une vraie bibliothèque
   pré-solvée persistée : chaque solution garde ses métadonnées (SolveID, board, pot,
   sizing, itérations, convergence, provenance…), et l'accès passe par la Solver API.

   Flux (§16) :
     Spot demandé → solution exacte disponible ? OUI → chargement immédiat
                                                 NON → solution proche ? (stub V1)
                                                       NON → solve à la demande
════════════════════════════════════════════════════════════════════════════ */

const _store=new Map();        // solveId → solution complète (avec métadonnées)
const MAX_ENTRIES=500;         // borne mémoire simple (LRU grossier)

/* Enregistre (ou remplace) une solution. Retourne le solveId. */
export function storeSolution(solveId,solution){
  if(!solveId)return null;
  if(_store.size>=MAX_ENTRIES&&!_store.has(solveId)){
    // éviction FIFO grossière : retire la plus ancienne entrée insérée
    const oldest=_store.keys().next().value;
    if(oldest!==undefined)_store.delete(oldest);
  }
  _store.set(solveId,{...solution,solveId,savedAt:Date.now()});
  return solveId;
}
/* Solution EXACTE si présente (sinon null). */
export function getSolution(solveId){ return solveId&&_store.has(solveId)?_store.get(solveId):null; }
export function hasSolution(solveId){ return !!solveId&&_store.has(solveId); }

/* Solution « proche » — V1 : match EXACT uniquement. Le fuzzy (board de même
   texture, stacks voisins…) viendra avec la vraie bibliothèque pré-solvée (§16).
   Renvoie {solution, exact} pour que l'appelant sache la nature du match. */
export function getClosest(solveId){
  const s=getSolution(solveId);
  return s?{solution:s,exact:true}:null;
}

export function librarySize(){ return _store.size; }
export function clearLibrary(){ _store.clear(); }
