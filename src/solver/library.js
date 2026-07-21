/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER · SOLUTION STORAGE + SHARK SOLUTION LIBRARY (§15, §16)
   Stockage des solves par identifiant → « spot déjà résolu ? chargement immédiat ».

   V2 — PERSISTANCE (roadmap §11). Deux étages :
     · MÉMOIRE  : Map, cache chaud, accès SYNCHRONE. L'API publique reste synchrone
                  (getSolution/hasSolution) — aucun appelant n'a été modifié.
     · DISQUE   : IndexedDB, écriture en TRAVERSÉE (write-through) et asynchrone.
                  Alimente la mémoire au démarrage via hydrateLibrary().

   Pourquoi cet étagement plutôt qu'une API async de bout en bout : solveSubgame et
   solveMultiStreet sont synchrones et appelés pendant le rendu. Les passer en async
   aurait contaminé toute la chaîne (API → UI → Coach) pour un gain nul : le cache
   chaud répond en mémoire, le disque ne sert qu'à survivre au rechargement de page.

   Éviction : LRU RÉEL (et non plus FIFO d'insertion). Une solution relue remonte en
   tête ; ce sont les solutions réellement inutilisées qui partent en premier.

   Flux (§16) :
     Spot demandé → solution exacte disponible ? OUI → chargement immédiat
                                                 NON → solution proche ? (stub V1)
                                                       NON → solve à la demande
════════════════════════════════════════════════════════════════════════════ */
import { rehydrateTreeSolution } from "./core/multistreet.js";
import {
  persistenceAvailable, persistPut, persistLoadRecent,
  persistPrune, persistDelete, persistClear, persistCount,
} from "./persist.js";

const _store=new Map();        // solveId → solution complète (avec métadonnées)
const MAX_ENTRIES=500;         // borne mémoire (LRU)
const MAX_PERSISTED=200;       // borne disque — les solves sont RECALCULABLES,
                               // inutile d'y consacrer un quota illimité
const HYDRATE_LIMIT=200;       // remontées en mémoire au démarrage

/* État observable — sert au panneau bibliothèque et au diagnostic. */
export const libraryStatus={
  persistent:false,   // la persistance est-elle réellement opérationnelle ?
  hydrated:false,     // hydrateLibrary() a-t-il terminé ?
  loaded:0,           // entrées remontées du disque
  written:0,          // écritures disque réussies depuis le démarrage
  skipped:0,          // solutions non persistables (charge non clonable)
  lastError:null,
};

/* ── SÉRIALISATION ─────────────────────────────────────────────────────────
   Une solution multi-rue porte des ACCESSEURS (avgOf/aggAt/ctxCount) : des
   fonctions, que le structured clone d'IndexedDB refuse (DataCloneError). On ne
   persiste donc que les données, et on RECONSTRUIT les accesseurs à la relecture
   via rehydrateTreeSolution — même implémentation que le solve frais, donc lecture
   identique. Les solutions 1-rue (solveRiverCFR) sont déjà des données pures. */
const _isFn=(v)=>typeof v==="function";
function _stripFns(obj){
  if(!obj||typeof obj!=="object")return obj;
  const out={};
  for(const k of Object.keys(obj)){ if(!_isFn(obj[k]))out[k]=obj[k]; }
  return out;
}
/* Une solution est « arborescente » ssi son résultat porte les tables de stratégie.
   C'est le marqueur qui commande la réhydratation au rechargement. */
const _isTreeSolution=(sol)=>!!(sol&&sol.result&&sol.result.strat);

function _toRecord(solveId,solution){
  const rec=_stripFns(solution);
  rec.result=_stripFns(solution.result);
  return {
    solveId,
    kind:_isTreeSolution(solution)?"tree":"plain",
    savedAt:solution.savedAt||Date.now(),
    lastUsed:Date.now(),
    payload:rec,
  };
}
/* Inverse de _toRecord. Retourne null si l'enregistrement est inexploitable —
   on préfère un cache manquant (qui provoque un re-solve honnête) à une solution
   silencieusement amputée de ses accesseurs, qui afficherait des fréquences
   uniformes 1/na comme si c'était de la stratégie (§2). */
function _fromRecord(rec){
  if(!rec||!rec.payload)return null;
  const sol=rec.payload;
  if(rec.kind==="tree"){
    const r=rehydrateTreeSolution(sol.result);
    if(!r)return null;
    sol.result=r;
  }
  return sol;
}

/* ── ÉCRITURE DISQUE (asynchrone, best-effort) ────────────────────────────── */
async function _persist(solveId,solution){
  if(!persistenceAvailable())return;
  let record;
  try{ record=_toRecord(solveId,solution); }
  catch(e){ libraryStatus.lastError=String(e&&e.message||e); return; }

  let res=await persistPut(record);
  if(res==="quota"){
    // Disque plein : on élague agressivement puis on retente UNE fois.
    await persistPrune(Math.floor(MAX_PERSISTED/2));
    res=await persistPut(record);
  }
  if(res===true){
    libraryStatus.written++;
    libraryStatus.persistent=true;
    // Élagage amorti : on ne compte pas à chaque écriture.
    if(libraryStatus.written%25===0)await persistPrune(MAX_PERSISTED);
  }else if(res==="unclonable"){
    libraryStatus.skipped++;
    libraryStatus.lastError="solution non clonable — conservée en mémoire seulement";
  }else{
    libraryStatus.skipped++;
  }
}

/* ── API PUBLIQUE (synchrone, inchangée) ──────────────────────────────────── */

/* Enregistre (ou remplace) une solution. Retourne le solveId.
   L'écriture disque part en tâche de fond : storeSolution NE BLOQUE PAS le solve. */
export function storeSolution(solveId,solution){
  if(!solveId)return null;
  if(_store.size>=MAX_ENTRIES&&!_store.has(solveId)){
    // éviction LRU : la première clé est la moins récemment utilisée
    const lru=_store.keys().next().value;
    if(lru!==undefined)_store.delete(lru);
  }
  const stored={...solution,solveId,savedAt:Date.now()};
  _store.delete(solveId);          // réinsertion → place en fin (= plus récent)
  _store.set(solveId,stored);
  _persist(solveId,stored);        // volontairement non attendu
  return solveId;
}

/* Solution EXACTE si présente (sinon null). Rafraîchit le rang LRU. */
export function getSolution(solveId){
  if(!solveId||!_store.has(solveId))return null;
  const s=_store.get(solveId);
  _store.delete(solveId);_store.set(solveId,s);   // remonte en tête de LRU
  return s;
}
export function hasSolution(solveId){ return !!solveId&&_store.has(solveId); }

/* Solution « proche » — V1 : match EXACT uniquement. Le fuzzy (board de même
   texture, stacks voisins…) viendra avec la vraie bibliothèque pré-solvée (§16).
   Renvoie {solution, exact} pour que l'appelant sache la nature du match. */
export function getClosest(solveId){
  const s=getSolution(solveId);
  return s?{solution:s,exact:true}:null;
}

export function librarySize(){ return _store.size; }

/* Vide mémoire ET disque. Le disque part en tâche de fond. */
export function clearLibrary(){
  _store.clear();
  libraryStatus.loaded=0;libraryStatus.written=0;libraryStatus.skipped=0;
  if(persistenceAvailable())persistClear();
}

/* ── HYDRATATION ──────────────────────────────────────────────────────────── */

/* Remonte en mémoire les solutions persistées les plus récemment utilisées.
   À appeler UNE FOIS au démarrage de l'app, avant le premier solve.
   Idempotent, ne rejette jamais. Retourne le nombre d'entrées chargées. */
let _hydrating=null;
export function hydrateLibrary(){
  if(_hydrating)return _hydrating;
  _hydrating=(async()=>{
    if(!persistenceAvailable()){ libraryStatus.hydrated=true; return 0; }
    let n=0;
    try{
      const recs=await persistLoadRecent(HYDRATE_LIMIT);
      // recs arrive du plus récent au plus ancien ; on insère à l'envers pour que
      // l'ordre d'itération de la Map reflète le vrai rang LRU (ancien → récent).
      for(let i=recs.length-1;i>=0;i--){
        const rec=recs[i];
        const sol=_fromRecord(rec);
        if(!sol){ await persistDelete(rec.solveId); continue; }  // purge l'illisible
        if(_store.has(rec.solveId))continue;   // une solution fraîche prime
        _store.set(rec.solveId,sol);n++;
      }
      libraryStatus.persistent=true;
    }catch(e){ libraryStatus.lastError=String(e&&e.message||e); }
    libraryStatus.loaded=n;
    libraryStatus.hydrated=true;
    return n;
  })();
  return _hydrating;
}

/* Nombre de solutions réellement sur disque (0 si pas de persistance). */
export async function persistedCount(){ return persistenceAvailable()?await persistCount():0; }
