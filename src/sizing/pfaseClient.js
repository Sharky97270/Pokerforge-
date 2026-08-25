/* ══════════════════════════════════════════════════════════════════════════
   PFASE · CLIENT DU WORKER (Mission §58, §59, §22, §90)

   Promisifie les requêtes au Worker, relaie la progression, et DÉGRADE
   proprement quand les Web Workers sont indisponibles (build standalone en
   fichier unique, environnement de test).

   ── LA DÉGRADATION EST UNE DÉCISION, PAS UN ACCIDENT ───────────────────────
   Sans Worker, deux options : calculer sur le thread principal (l'onglet gèle
   30 s) ou refuser. On refuse par défaut (`allowMainThread:false`) et on rend
   un échec EXPLICITE, que l'UI transforme en « Résoudre le spot » manuel (§90).
   L'appelant qui accepte le gel — un script Node, un test — passe
   `allowMainThread:true`.

   ── ANNULATION (§59) ───────────────────────────────────────────────────────
   Deux niveaux, parce qu'un seul ne suffit pas :
     1. COOPÉRATIF — un message `cancel` pose un drapeau que l'optimiseur teste
        entre deux solves. Propre : le worker survit, son cache reste chaud.
     2. TERMINAISON — si le solve en cours ne rend pas la main dans le délai de
        grâce, le worker est terminé et recréé. Brutal, mais c'est la seule
        façon d'interrompre une boucle CFR synchrone déjà lancée.
   ══════════════════════════════════════════════════════════════════════════ */

import { SolveStatus } from "./config.js";

let _worker = null;
let _seq = 0;
let _broken = false;
const _pending = new Map();      // id → { resolve, onProgress }

/* Délai laissé à l'annulation coopérative avant de terminer le worker. */
export const CANCEL_GRACE_MS = 1500;

function makeWorker() {
  if (_broken) return null;
  if (_worker) return _worker;
  if (typeof Worker === "undefined") { _broken = true; return null; }
  try {
    _worker = new Worker(new URL("./pfase.worker.js", import.meta.url), { type: "module" });
    _worker.onmessage = (e) => {
      const d = e.data || {};
      const p = _pending.get(d.id);
      if (!p) return;
      if (d.type === "progress") { try { p.onProgress && p.onProgress(d); } catch { /* noop */ } return; }
      _pending.delete(d.id);
      p.resolve(d.result);
    };
    _worker.onerror = () => {
      _broken = true;
      for (const [, p] of _pending) p.resolve({ ok: false, status: SolveStatus.FAILED, reason: "worker PFASE en erreur" });
      _pending.clear();
      try { _worker && _worker.terminate(); } catch { /* noop */ }
      _worker = null;
    };
  } catch {
    _broken = true;
    _worker = null;
  }
  return _worker;
}

export function isWorkerAvailable() { return !_broken && typeof Worker !== "undefined"; }

/* Recrée le worker après une terminaison. Le cache d'évaluation repart vide ;
   le Solution Store, lui, survit sur disque et sera ré-hydraté. */
function resetWorker() {
  try { _worker && _worker.terminate(); } catch { /* noop */ }
  _worker = null;
  _broken = false;
  for (const [, p] of _pending) p.resolve({ ok: false, status: SolveStatus.CANCELLED, reason: "worker PFASE terminé" });
  _pending.clear();
}

/* ══════════════════════════════════════════════════════════════════════════
   solveAsync — rend { promise, cancel }.
   `promise` résout TOUJOURS (jamais de rejet) avec le résultat PFASE.
   ══════════════════════════════════════════════════════════════════════════ */
export function solveAsync(request, { onProgress, family = false, allowMainThread = false, freshCache = false } = {}) {
  const w = makeWorker();
  if (!w) {
    if (!allowMainThread) {
      return {
        promise: Promise.resolve({
          ok: false, status: SolveStatus.FAILED,
          reason: "Web Worker indisponible — le calcul gèlerait l'interface. Lancez le solve manuellement ou activez `allowMainThread`.",
          workerUnavailable: true,
        }),
        cancel: () => {},
      };
    }
    /* Repli THREAD PRINCIPAL, demandé explicitement. Import dynamique : le code
       du moteur n'est pas chargé tant qu'on n'en a pas besoin. */
    let aborted = false;
    const promise = import("./pfase.js").then(m => {
      const fn = family ? m.solveSolutionFamily : m.solveOptimizedTree;
      return fn({ ...request, onProgress, signal: { get aborted() { return aborted; } } });
    });
    return { promise, cancel: () => { aborted = true; } };
  }

  const id = ++_seq;
  let settled = false;
  const promise = new Promise((resolve) => {
    _pending.set(id, {
      resolve: (r) => { settled = true; resolve(r); },
      onProgress,
    });
    try {
      w.postMessage({ id, type: family ? "solveFamily" : "solve", request: stripFunctions(request), freshCache });
    } catch (err) {
      _pending.delete(id);
      settled = true;
      resolve({ ok: false, status: SolveStatus.FAILED, reason: `envoi au worker impossible : ${String((err && err.message) || err)}` });
    }
  });

  const cancel = () => {
    if (settled) return;
    try { w.postMessage({ id: ++_seq, type: "cancel", targetId: id }); } catch { /* noop */ }
    setTimeout(() => {
      if (!settled && _pending.has(id)) resetWorker();
    }, CANCEL_GRACE_MS);
  };

  return { promise, cancel };
}

/* Le structured clone refuse les fonctions : `onProgress`, `signal` et `cache`
   ne traversent pas. On les retire ICI plutôt que de laisser postMessage lever
   une DataCloneError opaque au premier appel. */
function stripFunctions(req) {
  const out = {};
  for (const [k, v] of Object.entries(req || {})) {
    if (typeof v === "function") continue;
    if (k === "signal" || k === "onProgress" || k === "cache") continue;
    out[k] = v;
  }
  return out;
}

/* Arrête proprement le worker (démontage d'un onglet, changement de spot). */
export function shutdownWorker() { resetWorker(); }
