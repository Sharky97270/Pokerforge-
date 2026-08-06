/* Web Worker CFR postflop — décharge le solve (synchrone, CPU-bound ~1-8s) du thread
   principal pour que l'UI d'entraînement ne gèle pas (pré-solve en arrière-plan).

   CONTRAT : reçoit une requête PLAIN-DATA déjà préparée par le provider
   (`trainerPostflopSolver.js`) — ranges {hand:{r,c,f}}, board en ints, classe de main
   Héros, opts. Renvoie UNIQUEMENT du plain-data : la distribution de la MAIN du Héros
   au nœud racine (par label d'action), NashConv, abstraction. AUCUNE fonction ne
   traverse `postMessage` (les accesseurs avgOf/aggAt sont des closures → structured
   clone les perdrait ; on les CONSOMME ici et on ne sort que des nombres). */
import { solveMultiStreet, hydrateLibrary } from "./api.js";

/* PERSISTANCE DES SOLVES — le worker a sa PROPRE mémoire : la Solution Library y repart
   vide à chaque démarrage (rechargement de page, worker recyclé). L'écriture sur disque
   marchait déjà (IndexedDB est disponible dans un worker), mais sans hydratation le cache
   n'était jamais RELU → on re-solvait un spot déjà calculé. On hydrate donc une fois,
   avant le premier solve. Idempotent et ne rejette jamais : en cas d'échec on solve
   normalement, on perd juste le cache. */
let _hydrated = null;
const ensureHydrated = () => (_hydrated ||= hydrateLibrary().catch(() => 0));

self.onmessage = async (e) => {
  const { id, heroFreqs, villFreqs, board, heroClassKey, opts } = e.data || {};
  try {
    await ensureHydrated();
    const t0 = (self.performance || Date).now();
    const out = solveMultiStreet(heroFreqs, villFreqs, board, opts || {});
    const solveMs = Math.round((self.performance || Date).now() - t0);
    if (!out || !out.result || !out.result.tree) {
      self.postMessage({ id, ok: false, reason: "no-solution" });
      return;
    }
    const sol = out.result;
    // Nœud cible : racine (hero-leads : X/B0/B1) OU, pour un spot FACE-À-UNE-MISE, on
    // navigue le nodePath (ex. ["X","B"] = hero check → villain bet → nœud Héros F/C/R).
    let node = sol.tree;
    const nodePath = (opts && opts.nodePath) || null;
    if (nodePath) {
      for (const lbl of nodePath) {
        node = node && node.children ? node.children[lbl] : null;
        if (!node) break;
      }
      if (!node || node.kind !== "decision") {
        self.postMessage({ id, ok: false, reason: "node-path-miss" });
        return;
      }
    }
    // Index des combos de la CLASSE de main du Héros (reduceRange ne garde qu'un
    // représentant par classe → on lit la classe, pas le combo exact).
    const idxs = [];
    for (let i = 0; i < sol.heroList.length; i++) {
      if (sol.heroList[i].key === heroClassKey) idxs.push(i);
    }
    const nashConv = out.convergence ? out.convergence.nashConv ?? null : null;
    if (!idxs.length) {
      self.postMessage({ id, ok: false, reason: "hand-not-in-range", nashConv });
      return;
    }
    const na = node.actions.length;
    const agg = new Array(na).fill(0);
    let wsum = 0;
    for (const c of idxs) {
      const w = (sol.wH && sol.wH[c]) || 0;
      const d = sol.avgOf(node, c);        // distribution stratégie de ce combo au NŒUD cible
      for (let k = 0; k < na; k++) agg[k] += w * d[k];
      wsum += w;
    }
    if (wsum > 0) { for (let k = 0; k < na; k++) agg[k] /= wsum; }
    else { const d = sol.avgOf(node, idxs[0]); for (let k = 0; k < na; k++) agg[k] = d[k]; }

    const distByLabel = {};
    node.actions.forEach((lbl, k) => { distByLabel[lbl] = Math.round(agg[k] * 1000) / 10; });

    self.postMessage({
      id, ok: true,
      distByLabel,
      actions: node.actions.slice(),
      nashConv,
      convNote: out.convergence ? out.convergence.note ?? null : null,
      abstraction: out.abstraction || null,
      source: out.source,
      experimental: out.experimental !== false,
      // Le solve venait-il de la bibliothèque (mémoire ou disque) ? Sert à vérifier la
      // persistance et à distinguer « recalculé » de « rechargé » côté UI.
      fromLibrary: !!out.fromLibrary,
      solveMs,
    });
  } catch (err) {
    self.postMessage({ id, ok: false, reason: "error", message: String((err && err.message) || err) });
  }
};
