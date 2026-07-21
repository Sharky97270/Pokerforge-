/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER · COUCHE DE PERSISTANCE (§16)
   Adaptateur IndexedDB minimal pour la Solution Library. Aucune dépendance.

   POURQUOI IndexedDB et PAS localStorage :
     1. VOLUME — une solution multi-rue porte ses tables de stratégie (Float64Array
        par combo × action × contexte de runout) : ordre du Mo. localStorage plafonne
        vers 5 Mo TOUT ESPACE CONFONDU et ne stocke que des chaînes (→ JSON, qui
        détruit les typed arrays). IndexedDB utilise le structured clone : les
        Float64Array et les Map survivent tels quels.
     2. CLOUD — cloud.js synchronise AUTOMATIQUEMENT vers Supabase toute clé
        localStorage préfixée `pf_` (cf. shouldSync). Persister des solves là-bas
        enverrait des mégaoctets de tables CFR sur le réseau à chaque écriture.
        IndexedDB est hors de ce mécanisme : les solves restent locaux, ce qui est
        le bon défaut (ce sont des données recalculables, pas des données utilisateur).

   Hors navigateur (Node : validate.mjs, benchmark.mjs) il n'y a pas d'indexedDB :
   toutes les fonctions dégradent en no-op et la bibliothèque reste en mémoire.
════════════════════════════════════════════════════════════════════════════ */

const DB_NAME="sharksolver";      // volontairement NON préfixé pf_ (cf. supra)
const DB_VERSION=1;
const STORE="solutions";

/* IndexedDB peut exister mais être INUTILISABLE (mode privé Safari, stockage
   bloqué par la politique du navigateur). On ne teste donc pas seulement la
   présence de l'objet : on garde la promesse d'ouverture et on laisse chaque
   appelant absorber l'échec. */
let _dbPromise=null;
let _unavailable=false;

export function persistenceAvailable(){
  if(_unavailable)return false;
  try{ return typeof indexedDB!=="undefined"&&indexedDB!==null; }catch{ return false; }
}

function openDb(){
  if(!persistenceAvailable())return Promise.resolve(null);
  if(_dbPromise)return _dbPromise;
  _dbPromise=new Promise((resolve)=>{
    let req;
    try{ req=indexedDB.open(DB_NAME,DB_VERSION); }
    catch{ _unavailable=true; return resolve(null); }
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const os=db.createObjectStore(STORE,{keyPath:"solveId"});
        os.createIndex("lastUsed","lastUsed");   // éviction LRU côté disque
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{ _unavailable=true; resolve(null); };
    req.onblocked=()=>{ _unavailable=true; resolve(null); };
  });
  return _dbPromise;
}

function tx(db,mode){
  const t=db.transaction(STORE,mode);
  return t.objectStore(STORE);
}
/* Enveloppe une IDBRequest en promesse. Ne rejette JAMAIS : la persistance est un
   OPTIMISATION, jamais un chemin critique — un échec disque ne doit pas casser un
   solve. On renvoie `fallback` et l'appelant continue en mémoire. */
function wrap(req,fallback=null){
  return new Promise((resolve)=>{
    try{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>resolve(fallback);
    }catch{ resolve(fallback); }
  });
}

/* Écrit (ou remplace) un enregistrement. Retourne true si réellement persisté.
   Deux échecs sont ATTENDUS et traités distinctement par l'appelant :
     - DataCloneError  → la charge contient du non-clonable (fonction) : bug de
                         sérialisation côté appelant, jamais réessayer tel quel ;
     - QuotaExceededError → disque plein : l'appelant élague puis peut réessayer. */
export async function persistPut(record){
  const db=await openDb();
  if(!db)return false;
  try{
    const ok=await new Promise((resolve)=>{
      let req;
      try{ req=tx(db,"readwrite").put(record); }
      catch(e){ return resolve({ok:false,err:e}); }
      req.onsuccess=()=>resolve({ok:true});
      req.onerror=()=>resolve({ok:false,err:req.error});
      req.transaction.onabort=()=>resolve({ok:false,err:req.transaction.error});
    });
    if(ok.ok)return true;
    const name=ok.err&&ok.err.name;
    if(name==="QuotaExceededError")return "quota";
    if(name==="DataCloneError")return "unclonable";
    return false;
  }catch{ return false; }
}

/* Les N enregistrements les plus RÉCEMMENT UTILISÉS (lastUsed décroissant). */
export async function persistLoadRecent(limit=200){
  const db=await openDb();
  if(!db)return [];
  return new Promise((resolve)=>{
    const out=[];
    let req;
    try{ req=tx(db,"readonly").index("lastUsed").openCursor(null,"prev"); }
    catch{ return resolve([]); }
    req.onsuccess=()=>{
      const cur=req.result;
      if(!cur||out.length>=limit)return resolve(out);
      out.push(cur.value);
      cur.continue();
    };
    req.onerror=()=>resolve(out);
  });
}

/* Supprime les enregistrements les plus ANCIENNEMENT utilisés au-delà de `keep`.
   Retourne le nombre supprimé. */
export async function persistPrune(keep=200){
  const db=await openDb();
  if(!db)return 0;
  const total=await wrap(tx(db,"readonly").count(),0);
  if(total<=keep)return 0;
  let toDrop=total-keep,dropped=0;
  return new Promise((resolve)=>{
    let req;
    try{ req=tx(db,"readwrite").index("lastUsed").openCursor(null,"next"); }
    catch{ return resolve(0); }
    req.onsuccess=()=>{
      const cur=req.result;
      if(!cur||dropped>=toDrop)return resolve(dropped);
      cur.delete();dropped++;
      cur.continue();
    };
    req.onerror=()=>resolve(dropped);
  });
}

export async function persistDelete(solveId){
  const db=await openDb();
  if(!db)return false;
  return (await wrap(tx(db,"readwrite").delete(solveId),false))!==false;
}

export async function persistClear(){
  const db=await openDb();
  if(!db)return false;
  return (await wrap(tx(db,"readwrite").clear(),false))!==false;
}

export async function persistCount(){
  const db=await openDb();
  if(!db)return 0;
  return await wrap(tx(db,"readonly").count(),0)||0;
}
