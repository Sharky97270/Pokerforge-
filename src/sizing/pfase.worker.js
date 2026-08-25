/* ══════════════════════════════════════════════════════════════════════════
   PFASE · WEB WORKER (Mission §58, §59, §22, §57)

   Un solve d'optimisation enchaîne 10 à 40 solves CFR : de l'ordre de 30 s de
   calcul CPU-bound synchrone. Sur le thread principal, l'onglet serait gelé —
   pas « lent » : gelé, sans rendu ni clic possible.

   CONTRAT : entrée et sortie strictement PLAIN-DATA. Aucune fonction ne
   traverse `postMessage` (le structured clone les refuse). Les ranges, l'état de
   jeu et la PFSolution le sont par construction ; c'est précisément pourquoi
   `strategyExtract` produit des données et non des accesseurs.

   PROGRESSION : le worker publie `{type:"progress"}` à chaque étape. C'est ce
   qui permet à l'UI d'afficher OPTIMIZING_SIZINGS puis FINAL_SOLVE (§22) au
   lieu d'un sablier opaque.

   ANNULATION (§59) : un solve CFR est une boucle synchrone ; tant qu'elle
   tourne, le worker ne lit plus ses messages. L'annulation coopérative agit
   donc ENTRE deux solves (le drapeau est testé à chaque itération de
   l'optimiseur). Pour une annulation immédiate, le client termine le worker —
   voir `pfaseClient.js`.
   ══════════════════════════════════════════════════════════════════════════ */

import { solveOptimizedTree, solveSolutionFamily } from "./pfase.js";
import { hydrateStore } from "./solutionStore.js";
import { createEvaluationCache } from "./dynamicOptimizer.js";

/* Le worker a sa propre mémoire : sans hydratation, le Solution Store y repart
   vide à chaque démarrage et l'on re-solve des spots déjà connus. Idempotent,
   ne rejette jamais. */
let _hydrated = null;
const ensureHydrated = () => (_hydrated ||= hydrateStore().catch(() => 0));

/* Cache d'évaluation PARTAGÉ entre les requêtes du worker : deux spots proches
   (même état, complexité différente) réutilisent les micro-solves. */
const sharedCache = createEvaluationCache();

/* Drapeaux d'annulation coopérative, par identifiant de requête. */
const cancelled = new Set();
const signalFor = (id) => ({ get aborted() { return cancelled.has(id); } });

self.onmessage = async (e) => {
  const msg = e.data || {};
  const { id, type } = msg;

  if (type === "cancel") {
    cancelled.add(msg.targetId);
    return;
  }

  try {
    await ensureHydrated();
    const onProgress = (p) => {
      try { self.postMessage({ id, type: "progress", ...p }); } catch { /* le rendu n'est pas critique */ }
    };
    const request = {
      ...msg.request,
      signal: signalFor(id),
      onProgress,
      cache: msg.freshCache ? createEvaluationCache() : sharedCache,
    };

    let out;
    if (type === "solveFamily") out = solveSolutionFamily(request);
    else out = solveOptimizedTree(request);

    /* On ne renvoie JAMAIS l'objet solve brut (`finalSolve.solution` porte des
       Float64Array et des closures) : seule la PFSolution plain-data sort. */
    self.postMessage({ id, type: "result", result: sanitize(out) });
  } catch (err) {
    self.postMessage({
      id, type: "result",
      result: { ok: false, status: "FAILED", reason: String((err && err.message) || err) },
    });
  } finally {
    cancelled.delete(id);
  }
};

/* Retire tout ce qui n'est pas clonable ou utile côté principal. L'optimisation
   est résumée : ses `evaluations` portent des specs et des métriques (plain),
   mais pas les solutions CFR. */
function sanitize(out) {
  if (!out || typeof out !== "object") return out;
  const clean = { ...out };
  delete clean.finalSolve;
  if (clean.optimization) {
    const o = clean.optimization;
    clean.optimization = {
      ok: o.ok, status: o.status, mode: o.mode, complexity: o.complexity, reason: o.reason,
      candidates: o.candidates ? {
        bets: (o.candidates.bets || []).map(stripCandidate),
        raises: (o.candidates.raises || []).map(stripCandidate),
        dropped: o.candidates.dropped || [],
      } : null,
      reference: o.reference ? { ev: o.reference.ev, betKeys: o.reference.entry.betKeys, raiseKeys: o.reference.entry.raiseKeys } : null,
      ranking: (o.ranking || []).map(stripEvaluation),
      evaluations: (o.evaluations || []).map(stripEvaluation),
      selected: o.selected ? {
        betKeys: o.selected.betKeys, raiseKeys: o.selected.raiseKeys,
        ev: o.selected.ev, metrics: o.selected.metrics,
        complexityCost: o.selected.complexityCost, distinguishable: o.selected.distinguishable,
      } : null,
      noise: o.noise, planner: o.planner, tolerance: o.tolerance,
      instrumentation: o.instrumentation,
    };
  }
  if (Array.isArray(clean.results)) {
    clean.results = clean.results.map(r => ({ complexity: r.complexity, ok: r.ok, status: r.status, reason: r.reason, solution: r.solution || null }));
  }
  return clean;
}
const stripCandidate = (c) => ({ key: c.key, label: c.label, spec: c.spec, amountBb: c.amountBb, additionalBb: c.additionalBb, potFraction: c.potFraction, allIn: c.allIn, source: c.source });
const stripEvaluation = (e) => ({
  id: e.id, stage: e.stage, dimension: e.dimension,
  betKeys: e.betKeys, raiseKeys: e.raiseKeys,
  ok: e.ok, reason: e.reason, ev: e.ev, metrics: e.metrics,
  distinguishable: e.distinguishable, status: e.status,
  cacheHit: e.cacheHit, solveMs: e.solveMs,
});
