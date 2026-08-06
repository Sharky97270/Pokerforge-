/* Client du Worker CFR postflop (thread principal). Promisifie les requêtes, gère un
   timeout de sécurité, et DÉGRADE proprement si les Web Workers sont indisponibles
   (ex. build standalone fichier unique) → le Trainer garde alors sa solution
   heuristique. Un seul worker partagé, requêtes multiplexées par id. */

let _worker = null;
let _seq = 0;
let _broken = false;
const _pending = new Map();

function makeWorker() {
  if (_broken) return null;
  if (_worker) return _worker;
  if (typeof Worker === "undefined") { _broken = true; return null; }
  try {
    _worker = new Worker(new URL("./cfrPostflop.worker.js", import.meta.url), { type: "module" });
    _worker.onmessage = (e) => {
      const d = e.data || {};
      const p = _pending.get(d.id);
      if (p) { _pending.delete(d.id); p(d); }
    };
    _worker.onerror = () => {
      // Le worker a explosé (import cassé, etc.) → on abandonne le CFR, fallback heuristique.
      _broken = true;
      for (const [, resolve] of _pending) resolve({ ok: false, reason: "worker-error" });
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

export function isCfrWorkerAvailable() {
  return !_broken && typeof Worker !== "undefined";
}

/* Envoie une requête de solve au worker. Résout TOUJOURS (jamais de rejet) avec soit
   {ok:true, distByLabel, ...} soit {ok:false, reason}. À l'appelant de retomber sur
   l'heuristique quand ok=false. */
export function solvePostflopAsync(req, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const w = makeWorker();
    if (!w) { resolve({ ok: false, reason: "no-worker" }); return; }
    const id = ++_seq;
    const to = setTimeout(() => {
      if (_pending.has(id)) { _pending.delete(id); resolve({ ok: false, reason: "timeout" }); }
    }, timeoutMs);
    _pending.set(id, (d) => { clearTimeout(to); resolve(d); });
    try { w.postMessage({ ...req, id }); }
    catch { clearTimeout(to); _pending.delete(id); resolve({ ok: false, reason: "post-failed" }); }
  });
}
