/* ══════════════════════════════════════════════════════════════════════════
   PFASE · DEBUG INSPECTOR (Mission §95, §57)

   « En développement seulement, ajouter un inspector capable d'afficher :
     gameStateHash · solutionId · nodeId · sizingMode · candidates ·
     selectedSizes · EV · EVLoss · cache status · solver status.
     Très utile pour comprendre les erreurs Trainer. »

   Deux usages, et le second est celui qui a justifié d'écrire ce fichier :

   1. COMPRENDRE une solution servie au Trainer, sans lire le code.
   2. DIAGNOSTIQUER les problèmes d'INSTANCE DE MODULE. Le magasin de solutions
      est un module à état ; si deux copies coexistent (bundle principal contre
      import dynamique, ou rechargement à chaud de Vite), l'une enregistre et
      l'autre lit — et la solution « disparaît » sans le moindre message
      d'erreur. C'est exactement ce qui s'est produit en QA navigateur, et c'est
      indétectable sans un point d'observation ancré dans le module lui-même.

   L'inspecteur s'enregistre sur `globalThis.__PFASE__` et expose l'IDENTITÉ de
   l'instance (`instanceId`) : deux instances rendent deux identifiants.

   Actif en développement uniquement (drapeau `pf_sizing_debug` ou
   `__PF_FLAGS__.sizingDebug`), MAIS l'enregistrement de l'instance a lieu
   toujours — il ne coûte rien et rend le diagnostic possible en production.
   ══════════════════════════════════════════════════════════════════════════ */

import { debugEnabled, SIZING_ENGINE_VERSION, SOLVER_VERSION, SOLUTION_SCHEMA_VERSION } from "./config.js";

/* Identité de CETTE instance de module. Deux copies chargées → deux ids. */
export const INSTANCE_ID = `pfase-${Math.random().toString(36).slice(2, 10)}`;

const state = {
  instanceId: INSTANCE_ID,
  versions: { sizing: SIZING_ENGINE_VERSION, solver: SOLVER_VERSION, schema: SOLUTION_SCHEMA_VERSION },
  lastSolve: null,
  lastSolutionId: null,
  lastError: null,
  events: [],          // journal borné des faits marquants
  hooks: {},           // fonctions fournies par les modules (magasin, etc.)
};

const MAX_EVENTS = 60;

/* Journalise un fait. Toujours actif : le journal est borné et sert de boîte
   noire quand un problème n'est reproductible qu'une fois. */
export function noteEvent(kind, detail) {
  state.events.push({ t: Date.now(), kind, detail });
  if (state.events.length > MAX_EVENTS) state.events.shift();
  if (debugEnabled()) {
    // eslint-disable-next-line no-console
    console.debug(`[PFASE] ${kind}`, detail);
  }
}

/* Les modules à état publient leurs accesseurs ici plutôt que d'être importés
   dynamiquement par l'inspecteur — c'est ce qui garantit qu'on observe LEUR
   instance, et pas une copie. */
export function registerHook(name, fn) { state.hooks[name] = fn; }

export function recordSolve({ ok, status, reason, solution, optimization, elapsedMs }) {
  state.lastSolve = {
    at: Date.now(), ok, status, reason: reason || null, elapsedMs: elapsedMs ?? null,
    solutionId: solution ? solution.solutionId : null,
    gameStateHash: solution ? solution.gameStateHash : null,
    sizingMode: solution ? solution.sizingMode : null,
    complexity: solution ? solution.sizingComplexity : null,
    candidates: solution ? {
      bets: (solution.candidateSizes?.bets || []).map(b => b.label),
      raises: (solution.candidateSizes?.raises || []).map(b => b.label),
      dropped: (solution.candidateSizes?.dropped || []).length,
    } : null,
    selectedSizes: solution ? {
      bets: (solution.selectedSizes?.bets || []).map(b => b.label),
      raises: (solution.selectedSizes?.raises || []).map(b => b.label),
    } : null,
    ev: solution && solution.simplificationMetrics ? solution.simplificationMetrics.simplifiedEV : null,
    referenceEV: solution && solution.simplificationMetrics ? solution.simplificationMetrics.referenceEV : null,
    evLoss: solution && solution.simplificationMetrics ? solution.simplificationMetrics.absoluteEVLoss : null,
    measurementFloor: solution && solution.measurement ? solution.measurement.floor : null,
    distinguishable: solution ? solution.distinguishable !== false : null,
    accuracy: solution ? solution.accuracy : null,
    partialReasons: solution ? solution.partialReasons : null,
    cache: optimization && optimization.instrumentation ? {
      hits: optimization.instrumentation.cacheHits,
      misses: optimization.instrumentation.cacheMisses,
      solves: optimization.instrumentation.solveCount,
    } : null,
  };
  if (solution) state.lastSolutionId = solution.solutionId;
  noteEvent(ok ? "solve-ok" : "solve-fail", { status, solutionId: state.lastSolutionId, reason });
}

export function recordError(where, err) {
  state.lastError = { at: Date.now(), where, message: String((err && err.message) || err) };
  noteEvent("error", state.lastError);
}

/* L'instantané complet — ce que §95 demande d'afficher. */
export function inspect() {
  const store = state.hooks.store ? safe(state.hooks.store) : null;
  return {
    instanceId: state.instanceId,
    versions: state.versions,
    debugEnabled: debugEnabled(),
    lastSolve: state.lastSolve,
    lastSolutionId: state.lastSolutionId,
    lastError: state.lastError,
    store,
    events: state.events.slice(-20),
  };
}
function safe(fn) { try { return fn(); } catch (e) { return { error: String((e && e.message) || e) }; } }

/* Une solution précise, par identifiant. */
export function inspectSolution(solutionId) {
  if (!state.hooks.getSolution) return { error: "magasin non enregistré dans cette instance" };
  const sol = safe(() => state.hooks.getSolution(solutionId, { allowStale: true }));
  if (!sol) return { error: `solution ${solutionId} absente de l'instance ${state.instanceId}` };
  if (sol.error) return sol;
  return {
    solutionId: sol.solutionId, gameStateHash: sol.gameStateHash,
    isStale: !!sol.isStale, stale: sol.stale || null,
    sizingMode: sol.sizingMode, complexity: sol.sizingComplexity,
    status: sol.status, partialReasons: sol.partialReasons,
    provenance: sol.source,
    candidates: (sol.candidateSizes?.bets || []).map(b => b.label),
    selectedSizes: (sol.selectedSizes?.bets || []).map(b => b.label),
    ev: sol.simplificationMetrics ? sol.simplificationMetrics.simplifiedEV : null,
    evLoss: sol.simplificationMetrics ? sol.simplificationMetrics.absoluteEVLoss : null,
    measurementFloor: sol.measurement ? sol.measurement.floor : null,
    accuracy: sol.accuracy,
    nodes: sol.strategy ? Object.keys(sol.strategy.nodes || {}) : [],
    classes: sol.strategy ? (sol.strategy.classes || []).length : 0,
  };
}

/* Enregistrement global. Fait à l'import du module, sans condition : le coût est
   nul et c'est la seule façon de diagnostiquer un problème d'instance depuis la
   console d'un navigateur. */
try {
  if (typeof globalThis !== "undefined") {
    const existing = globalThis.__PFASE__;
    if (existing && existing.instanceId !== INSTANCE_ID) {
      /* DEUX INSTANCES. C'est presque toujours un bug d'empaquetage, et il rend
         le magasin de solutions incohérent (l'une écrit, l'autre lit). On le
         signale immédiatement plutôt que de laisser chercher. */
      const list = existing.instances || [existing.instanceId];
      list.push(INSTANCE_ID);
      // eslint-disable-next-line no-console
      console.warn(`[PFASE] plusieurs instances du moteur chargées (${list.join(", ")}). Le magasin de solutions ne sera pas partagé entre elles.`);
      globalThis.__PFASE__ = { ...buildApi(), instances: list, multipleInstances: true };
    } else {
      globalThis.__PFASE__ = buildApi();
    }
  }
} catch { /* environnement sans globalThis exploitable */ }

function buildApi() {
  return {
    instanceId: INSTANCE_ID,
    inspect,
    inspectSolution,
    events: () => state.events.slice(),
    versions: state.versions,
  };
}
