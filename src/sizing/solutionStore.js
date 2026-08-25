/* ══════════════════════════════════════════════════════════════════════════
   PFASE · SOLUTION STORE (Mission §17, §20, §28, §63, §80, §88, §89)

   Le magasin de solutions VÉRIFIÉES. Distinct de `solver/library.js`, qui reste
   le cache de solves BRUTS (tables CFR vivantes) : ici on ne stocke que des
   PFSolution plain-data, normalisées et versionnées.

   ── NORMALISATION (§28) ────────────────────────────────────────────────────
   Un même état de jeu porte jusqu'à quatre solutions (FULL / ADVANCED / SIMPLE
   / SINGLE). Dupliquer l'état — ranges 169 classes × 2, joueurs, historique —
   quatre fois serait un gaspillage et, pire, une source d'incohérence (quatre
   copies qui peuvent diverger). L'état vit donc une fois, dans `states`, et les
   solutions le référencent par `gameStateHash` :

        GAME STATE (1 enregistrement)
        ├── FULL
        ├── ADVANCED
        ├── SIMPLE
        └── SINGLE

   ── INVALIDATION (§80) ─────────────────────────────────────────────────────
   Le hash canonique inclut les trois versions : une solution d'un moteur
   antérieur porte un hash différent et ne peut donc PAS être servie à la place
   d'une solution courante. En plus de cela, `getSolution` vérifie explicitement
   les versions et refuse de servir une entrée périmée — deux verrous, parce que
   celui qui saute en silence est le pire.

   ── PERSISTANCE (§88) ──────────────────────────────────────────────────────
   IndexedDB (base `pfase`), avec le même parti pris que `solver/persist.js` :
   la persistance est une OPTIMISATION, jamais un chemin critique. Un échec
   disque n'empêche jamais un solve. Hors navigateur (Node/tests), tout dégrade
   en mémoire.

   L'API de lecture est SYNCHRONE (le Trainer lit pendant le rendu) ; l'écriture
   part en tâche de fond.
   ══════════════════════════════════════════════════════════════════════════ */

import { solutionId as makeSolutionId } from "./canonicalHash.js";
import { validateSolution, isCurrentEngine, stalenessOf, SolutionProvenance } from "./solutionSchema.js";
import { SIZING_COMPLEXITIES, SOLUTION_SCHEMA_VERSION } from "./config.js";
import { registerHook, noteEvent } from "./debugInspector.js";

const DB_NAME = "pfase";
const DB_VERSION = 1;
const STORE_SOL = "solutions";
const STORE_STATE = "states";

const MAX_MEMORY = 400;      // solutions en mémoire (LRU)
const MAX_PERSISTED = 300;   // solutions sur disque

/* ══════════════════════════════════════════════════════════════════════════
   L'ÉTAT DU MAGASIN VIT SUR globalThis, PAS DANS LE MODULE (§95)

   Un magasin à état de module suppose qu'il n'existe qu'une copie du module.
   Cette supposition est fausse plus souvent qu'il n'y paraît :

     · en développement, Vite sert les dépendances invalidées avec un horodatage
       (`solutionStore.js?t=1787664993378`). C'est une URL différente, donc un
       MODULE différent, avec ses propres Map et son propre `storeStatus` ;
     · un import dynamique, un Worker mal configuré ou un rechargement à chaud
       produisent le même effet.

   Le symptôme observé est instructif parce qu'il n'a rien d'une erreur : après un
   rechargement, l'application appelait bien `hydrateStore()` — mais sur SA copie.
   Le magasin que lisaient le Trainer et le Replayer restait vide, sans exception,
   sans avertissement, et la solution « n'existait pas ». Le §95 avait été écrit
   pour DÉTECTER ce cas ; il fallait aussi cesser d'y être vulnérable.

   Les structures sont donc ancrées sur `globalThis` sous une clé versionnée :
   toutes les copies du module partagent le même magasin. La clé porte la version
   du schéma pour qu'un futur changement de forme ne se greffe pas sur l'ancien
   état, ce qui serait pire que le problème d'origine.
   ══════════════════════════════════════════════════════════════════════════ */
const _SHARED_KEY = "__pfase_store_v" + SOLUTION_SCHEMA_VERSION + "__";
const _shared = globalThis[_SHARED_KEY] || (globalThis[_SHARED_KEY] = {
  solutions: new Map(),   // solutionId → PFSolution (complète, fusionnée)
  states: new Map(),      // gameStateHash → bloc d'état partagé
  byState: new Map(),     // gameStateHash → Set(complexity)
  status: {
    persistent: false,
    hydrated: false,
    loaded: 0,
    written: 0,
    skipped: 0,
    rejected: 0,
    staleDropped: 0,
    lastError: null,
  },
  hydrating: null,
});

const _solutions = _shared.solutions;
const _states = _shared.states;
const _byState = _shared.byState;

export const storeStatus = _shared.status;

/* ── Champs LOURDS, déportés dans l'enregistrement d'état partagé (§28). ── */
const STATE_FIELDS = [
  "gameType", "format", "tableFormat", "players", "positions", "effectiveStacks",
  "pot", "spr", "street", "board", "actionHistory", "heroRange", "villainRanges",
  "rake", "antes", "blinds", "potType", "evaluationModel", "icmParams", "pkoParams",
  "canonical",
];

function splitSolution(sol) {
  const stateRec = { gameStateHash: sol.gameStateHash };
  const solRec = { ...sol };
  for (const f of STATE_FIELDS) {
    stateRec[f] = sol[f];
    delete solRec[f];
  }
  return { stateRec, solRec };
}
function mergeSolution(solRec, stateRec) {
  if (!solRec) return null;
  return stateRec ? { ...stateRec, ...solRec, gameStateHash: solRec.gameStateHash } : { ...solRec };
}

/* ══════════════════════════════════════════════════════════════════════════
   API SYNCHRONE
   ══════════════════════════════════════════════════════════════════════════ */

/* Enregistre une solution. Retourne { ok, solutionId, problems }.
   Une solution invalide est REFUSÉE — jamais stockée « au cas où » : un magasin
   qui contient des solutions fausses est pire qu'un magasin vide, parce qu'on
   lui fait confiance. */
export function saveSolution(sol) {
  const v = validateSolution(sol);
  if (!v.ok) {
    storeStatus.rejected++;
    storeStatus.lastError = v.problems.join(" · ");
    noteEvent("store-reject", { solutionId: sol && sol.solutionId, problems: v.problems });
    return { ok: false, solutionId: sol && sol.solutionId, problems: v.problems };
  }
  const id = sol.solutionId;
  const { stateRec, solRec } = splitSolution({ ...sol, updatedAt: Date.now() });

  if (_solutions.size >= MAX_MEMORY && !_solutions.has(id)) {
    const lru = _solutions.keys().next().value;
    if (lru !== undefined) removeFromMemory(lru);
  }
  _solutions.delete(id);
  _solutions.set(id, mergeSolution(solRec, stateRec));
  _states.set(sol.gameStateHash, stateRec);
  if (!_byState.has(sol.gameStateHash)) _byState.set(sol.gameStateHash, new Set());
  _byState.get(sol.gameStateHash).add(sol.sizingComplexity);

  _persist(solRec, stateRec);
  noteEvent("store-save", { solutionId: id, complexity: sol.sizingComplexity, size: _solutions.size });
  return { ok: true, solutionId: id, problems: [] };
}

/* Relit une solution par identifiant. Rafraîchit le rang LRU.
   Une solution d'un moteur PÉRIMÉ n'est pas servie : elle est signalée et
   l'appelant re-solve. `allowStale:true` permet de l'inspecter quand même
   (outil de diagnostic), avec `stale` renseigné. */
export function getSolutionById(id, { allowStale = false } = {}) {
  if (!id || !_solutions.has(id)) return null;
  const sol = _solutions.get(id);
  _solutions.delete(id); _solutions.set(id, sol);   // LRU
  if (!isCurrentEngine(sol)) {
    const stale = stalenessOf(sol);
    if (!allowStale) { storeStatus.staleDropped++; return null; }
    return { ...sol, stale, isStale: true };
  }
  return { ...sol, isStale: false, source: SolutionProvenance.POKERFORGE_DATABASE,
    provenanceMeta: sol.provenanceMeta };
}

/* Solution d'un état pour un niveau de complexité donné. */
export function getSolution(gameStateHash, complexity, opts) {
  return getSolutionById(makeSolutionId(gameStateHash, complexity), opts);
}

/* Tous les niveaux disponibles pour un état, du plus simple au plus complet. */
export function complexitiesFor(gameStateHash) {
  const set = _byState.get(gameStateHash);
  if (!set) return [];
  return SIZING_COMPLEXITIES.filter(c => set.has(c) && getSolution(gameStateHash, c));
}

/* Toutes les solutions d'un état — c'est CE tableau que l'écran « FULL /
   ADVANCED / SIMPLE / SINGLE » de §110 consomme. */
export function solutionFamily(gameStateHash) {
  return complexitiesFor(gameStateHash).map(c => getSolution(gameStateHash, c)).filter(Boolean);
}

export function hasSolution(gameStateHash, complexity) {
  return !!getSolution(gameStateHash, complexity);
}

export function deleteSolution(id) {
  const existed = _solutions.has(id);
  removeFromMemory(id);
  _persistDelete(id);
  return existed;
}

export function storeSize() { return _solutions.size; }

export function clearStore() {
  _solutions.clear(); _states.clear(); _byState.clear();
  storeStatus.loaded = 0; storeStatus.written = 0; storeStatus.skipped = 0;
  storeStatus.rejected = 0; storeStatus.staleDropped = 0;
  /* L hydratation aussi : sans cela, un test qui vide le magasin puis demande une
     relecture recevrait la promesse déjà résolue de la relecture précédente, et
     n obtiendrait jamais les entrées qu il vient d écrire en base. */
  storeStatus.hydrated = false;
  _shared.hydrating = null;
  _persistClear();
}

function removeFromMemory(id) {
  const sol = _solutions.get(id);
  _solutions.delete(id);
  if (sol && _byState.has(sol.gameStateHash)) {
    const set = _byState.get(sol.gameStateHash);
    set.delete(sol.sizingComplexity);
    if (!set.size) { _byState.delete(sol.gameStateHash); _states.delete(sol.gameStateHash); }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PERSISTANCE (IndexedDB) — best effort, jamais bloquante.
   ══════════════════════════════════════════════════════════════════════════ */
let _dbPromise = null, _unavailable = false;

export function persistenceAvailable() {
  if (_unavailable) return false;
  try { return typeof indexedDB !== "undefined" && indexedDB !== null; } catch { return false; }
}

function openDb() {
  if (!persistenceAvailable()) return Promise.resolve(null);
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch { _unavailable = true; return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SOL)) {
        const os = db.createObjectStore(STORE_SOL, { keyPath: "solutionId" });
        os.createIndex("gameStateHash", "gameStateHash");
        os.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: "gameStateHash" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _unavailable = true; resolve(null); };
    req.onblocked = () => { _unavailable = true; resolve(null); };
  });
  return _dbPromise;
}

async function _persist(solRec, stateRec) {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise((resolve) => {
      const tx = db.transaction([STORE_SOL, STORE_STATE], "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      tx.objectStore(STORE_STATE).put(stateRec);
      tx.objectStore(STORE_SOL).put(solRec);
    });
    storeStatus.written++;
    storeStatus.persistent = true;
    if (storeStatus.written % 25 === 0) await _prune(MAX_PERSISTED);
  } catch (e) {
    storeStatus.skipped++;
    storeStatus.lastError = String((e && e.message) || e);
  }
}

async function _persistDelete(id) {
  const db = await openDb();
  if (!db) return;
  try { db.transaction(STORE_SOL, "readwrite").objectStore(STORE_SOL).delete(id); } catch { /* noop */ }
}
async function _persistClear() {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction([STORE_SOL, STORE_STATE], "readwrite");
    tx.objectStore(STORE_SOL).clear();
    tx.objectStore(STORE_STATE).clear();
  } catch { /* noop */ }
}
async function _prune(keep) {
  const db = await openDb();
  if (!db) return 0;
  return new Promise((resolve) => {
    let dropped = 0;
    try {
      const os = db.transaction(STORE_SOL, "readwrite").objectStore(STORE_SOL);
      const countReq = os.count();
      countReq.onsuccess = () => {
        const total = countReq.result || 0;
        if (total <= keep) return resolve(0);
        const toDrop = total - keep;
        const cur = os.index("updatedAt").openCursor(null, "next");
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c || dropped >= toDrop) return resolve(dropped);
          c.delete(); dropped++; c.continue();
        };
        cur.onerror = () => resolve(dropped);
      };
      countReq.onerror = () => resolve(0);
    } catch { resolve(0); }
  });
}

/* ── HYDRATATION (§88/§89) ────────────────────────────────────────────────
   À appeler UNE FOIS au démarrage. Remonte les solutions récentes ; PURGE au
   passage celles produites par un moteur périmé — les garder ferait grossir la
   base d'entrées qu'on refuserait de servir de toute façon. */
export function hydrateStore({ limit = 300 } = {}) {
  /* Partagée entre toutes les copies du module : deux instances qui hydratent
     en parallèle liraient la même base et se marcheraient dessus. */
  if (_shared.hydrating) return _shared.hydrating;
  _shared.hydrating = (async () => {
    if (!persistenceAvailable()) { storeStatus.hydrated = true; return 0; }
    let n = 0;
    try {
      const db = await openDb();
      if (!db) { storeStatus.hydrated = true; return 0; }
      const states = await readAll(db, STORE_STATE);
      for (const st of states) _states.set(st.gameStateHash, st);
      const sols = await readAll(db, STORE_SOL, limit);
      for (const rec of sols) {
        const merged = mergeSolution(rec, _states.get(rec.gameStateHash));
        if (!merged) continue;
        if (!isCurrentEngine(merged)) { storeStatus.staleDropped++; _persistDelete(rec.solutionId); continue; }
        const v = validateSolution(merged);
        if (!v.ok) { storeStatus.rejected++; _persistDelete(rec.solutionId); continue; }
        _solutions.set(merged.solutionId, merged);
        if (!_byState.has(merged.gameStateHash)) _byState.set(merged.gameStateHash, new Set());
        _byState.get(merged.gameStateHash).add(merged.sizingComplexity);
        n++;
      }
      storeStatus.persistent = true;
    } catch (e) {
      storeStatus.lastError = String((e && e.message) || e);
    }
    storeStatus.loaded = n;
    storeStatus.hydrated = true;
    return n;
  })();
  return _shared.hydrating;
}

function readAll(db, store, limit) {
  return new Promise((resolve) => {
    const out = [];
    try {
      const req = db.transaction(store, "readonly").objectStore(store).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c || (limit && out.length >= limit)) return resolve(out);
        out.push(c.value); c.continue();
      };
      req.onerror = () => resolve(out);
    } catch { resolve(out); }
  });
}

/* Diagnostic (§95/§106) — ce que le magasin contient réellement. */
export function inspectStore() {
  const byComplexity = {};
  for (const sol of _solutions.values()) {
    byComplexity[sol.sizingComplexity] = (byComplexity[sol.sizingComplexity] || 0) + 1;
  }
  return {
    solutions: _solutions.size,
    states: _states.size,
    byComplexity,
    status: { ...storeStatus },
  };
}


/* ── §95 — l'inspecteur observe CETTE instance ─────────────────────────────
   Les accesseurs sont PUBLIÉS plutôt qu'importés par l'inspecteur : c'est ce
   qui garantit qu'on lit le magasin réellement utilisé par l'application, et
   non une seconde copie du module. */
registerHook("store", inspectStore);
registerHook("getSolution", getSolutionById);
