/* Web Worker CFR postflop — décharge le solve (synchrone, CPU-bound ~1-8s) du thread
   principal pour que l'UI d'entraînement ne gèle pas (pré-solve en arrière-plan).

   CONTRAT : reçoit une requête PLAIN-DATA déjà préparée par le provider
   (`trainerPostflopSolver.js`) — ranges {hand:{r,c,f}}, board en ints, classe de main
   Héros, opts. Renvoie UNIQUEMENT du plain-data : la distribution de la MAIN du Héros
   au nœud racine (par label d'action), NashConv, abstraction. AUCUNE fonction ne
   traverse `postMessage` (les accesseurs avgOf/aggAt sont des closures → structured
   clone les perdrait ; on les CONSOMME ici et on ne sort que des nombres). */
import { solveMultiStreet } from "./api.js";

self.onmessage = (e) => {
  const { id, heroFreqs, villFreqs, board, heroClassKey, opts } = e.data || {};
  try {
    const out = solveMultiStreet(heroFreqs, villFreqs, board, opts || {});
    if (!out || !out.result || !out.result.tree) {
      self.postMessage({ id, ok: false, reason: "no-solution" });
      return;
    }
    const sol = out.result;
    const root = sol.tree;                 // 1re décision Héros sur le flop (X / B0 / B1…)
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
    const na = root.actions.length;
    const agg = new Array(na).fill(0);
    let wsum = 0;
    for (const c of idxs) {
      const w = (sol.wH && sol.wH[c]) || 0;
      const d = sol.avgOf(root, c);        // distribution stratégie de ce combo
      for (let k = 0; k < na; k++) agg[k] += w * d[k];
      wsum += w;
    }
    if (wsum > 0) { for (let k = 0; k < na; k++) agg[k] /= wsum; }
    else { const d = sol.avgOf(root, idxs[0]); for (let k = 0; k < na; k++) agg[k] = d[k]; }

    const distByLabel = {};
    root.actions.forEach((lbl, k) => { distByLabel[lbl] = Math.round(agg[k] * 1000) / 10; });

    self.postMessage({
      id, ok: true,
      distByLabel,
      actions: root.actions.slice(),
      nashConv,
      convNote: out.convergence ? out.convergence.note ?? null : null,
      abstraction: out.abstraction || null,
      source: out.source,
      experimental: out.experimental !== false,
    });
  } catch (err) {
    self.postMessage({ id, ok: false, reason: "error", message: String((err && err.message) || err) });
  }
};
