/* ══════════════════════════════════════════════════════════════════════════
   trainerDiagnostics.js — TRACE DE RÉSOLUTION DES SOLUTIONS (Lot 3)

   POURQUOI
   Avant ce module, rien ne permettait de répondre à la question « d'où vient le
   nombre affiché ? » autrement qu'en relisant le code. Un badge « solveur »
   apparaissait à l'écran sans qu'on puisse vérifier quel spot avait été envoyé,
   quel modèle avait répondu, ni pourquoi un autre spot était retombé sur
   l'heuristique. Une intégration qu'on ne peut pas tracer n'est pas une
   intégration prouvée.

   CE QUE ÇA FAIT
   Un tampon circulaire borné (aucune fuite mémoire) qui enregistre, pour chaque
   spot résolu : identifiant de main, identifiant de table, empreinte de l'état,
   source retenue, périmètre, motif de repli, durée, et cache hit/miss.
   Publié sur `window.__pfTrainerDiag` pour l'inspection et pour les audits
   automatisés — c'est ce qui rend le Lot 7 vérifiable sans lire l'écran.

   L'enregistrement est volontairement TOUJOURS actif : il coûte un objet par
   main et c'est la seule façon d'auditer un build de production. Seul
   l'AFFICHAGE du panneau de diagnostic est réservé au développement.
   ══════════════════════════════════════════════════════════════════════════ */

const MAX_ENTRIES = 240;
const ring = [];

/* FNV-1a 32 bits — empreinte stable et lisible d'un état de décision. Sert à
   repérer deux tables qui afficheraient le même état, ou un état qui change
   sans que la main change. */
export function stateHash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const cardStr = c => (c && c.r ? `${c.r}${c.s}` : "?");

/* Empreinte de l'ÉTAT DE DÉCISION, pas du spot entier : on ne veut pas qu'un
   champ d'affichage fasse changer le hash. */
export function spotStateFingerprint(spot) {
  if (!spot) return "";
  return [
    spot.street, spot.hpos, spot.vpos, spot.fmt, spot.stack,
    spot.pot, spot.toCall,
    (spot.hand || []).map(cardStr).join(""),
    (spot.board || []).map(cardStr).join(""),
    (spot.acts || []).map(a => a?.id).join(","),
  ].join("|");
}

/* Enregistre la résolution d'un spot. `result` est la sortie de
   `resolveSpotStrategy` (ou le spot déjà tamponné par `applySolverStrategy`). */
export function recordSolutionDiag(spot, extra = {}) {
  if (!spot) return null;
  const fp = spotStateFingerprint(spot);
  const entry = {
    ts: Date.now(),
    handId: spot.id ?? null,
    tableId: extra.tableId ?? null,
    stateHash: stateHash(fp),
    source: spot.strategySource ?? extra.source ?? "unavailable",
    provenance: spot.strategyProvenance ?? extra.provenance ?? null,
    scope: spot.strategyScope ?? extra.scope ?? null,
    limits: spot.strategyLimits ?? extra.limits ?? [],
    /* Motif du repli — première limite quand la solution N'A PAS été calculée.
       C'est le champ qui manquait : un « heuristique » muet n'apprend rien. */
    fallbackReason: (spot.strategySource === "solver" || spot.strategySource === "chart")
      ? null : ((spot.strategyLimits || [])[0] ?? null),
    solveId: extra.solveId ?? (spot.solverMeta ? `pf:${spot.solverMeta.stack}bb:${spot.solverMeta.hand}:${spot.solverMeta.facing ? "call" : "jam"}` : null),
    durationMs: extra.durationMs ?? null,
    cacheHit: extra.cacheHit ?? null,
    note: spot.strategyNote ?? null,
  };
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring.splice(0, ring.length - MAX_ENTRIES);
  publish();
  return entry;
}

export function trainerDiagEntries() { return ring.slice(); }
export function clearTrainerDiag() { ring.length = 0; pauseRing.length = 0; publish(); }

/* ──────────────────────────────────────────────────────────────────────────
   Trace des décisions de PAUSE (Lot 4 bis).

   Chaque décision d'Hero y est consignée avec la règle en vigueur, la classe de
   verdict obtenue et le fait qu'une pause ait été déclenchée ou non. C'est ce
   qui permet à l'audit d'affirmer « la table s'est arrêtée quand elle devait, et
   seulement quand elle devait » plutôt que de constater qu'un bandeau existe.
   ────────────────────────────────────────────────────────────────────────── */
const pauseRing = [];
const MAX_PAUSE_ENTRIES = 400;

export function recordPauseDiag(entry) {
  pauseRing.push({ ts: Date.now(), ...entry });
  if (pauseRing.length > MAX_PAUSE_ENTRIES) pauseRing.splice(0, pauseRing.length - MAX_PAUSE_ENTRIES);
  publish();
  return entry;
}
export function trainerPauseDiagEntries() { return pauseRing.slice(); }
export function trainerPauseDiagSummary() {
  const parPolitique = {}, parClasse = {};
  let doublons = 0;
  for (const e of pauseRing) {
    const k = e.policy || "?";
    parPolitique[k] = parPolitique[k] || { decisions: 0, pauses: 0 };
    parPolitique[k].decisions++;
    if (e.paused) parPolitique[k].pauses++;
    parClasse[e.verdictClass] = (parClasse[e.verdictClass] || 0) + 1;
    if (e.duplicate) doublons++;
  }
  return { total: pauseRing.length, parPolitique, parClasse, doublons };
}

/* Vue agrégée : combien de spots par source, et quels motifs de repli
   reviennent. C'est le tableau « moteurs réellement utilisés par type de
   spot » demandé en livrable, calculé sur les mains réellement jouées. */
export function trainerDiagSummary() {
  const bySource = {}, byFallback = {}, byScope = {};
  for (const e of ring) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    if (e.fallbackReason) byFallback[e.fallbackReason] = (byFallback[e.fallbackReason] || 0) + 1;
    const k = `${e.scope?.street || "?"}·${e.scope?.players ?? "?"}j·${e.scope?.payout || "?"}`;
    byScope[k] = (byScope[k] || 0) + 1;
  }
  return { total: ring.length, bySource, byFallback, byScope };
}

/* Une incohérence de provenance est une FAUTE, pas une statistique : le badge
   « solveur » ne doit jamais coexister avec un périmètre hors domaine. Cette
   fonction est ce que l'audit assert. */
export function trainerDiagViolations() {
  const out = [];
  for (const e of ring) {
    if (e.source !== "solver") continue;
    const sc = e.scope || {};
    if (sc.players !== 2) out.push({ ...e, violation: `badge solveur avec ${sc.players} joueurs (modèle heads-up)` });
    else if (sc.payout !== "chipEV") out.push({ ...e, violation: `badge solveur avec barème ${sc.payout} (modèle chip-EV)` });
    else if (sc.street !== "preflop") out.push({ ...e, violation: `badge solveur en ${sc.street} (modèle préflop)` });
    else if (!(sc.livePositions || []).includes("SB") || !(sc.livePositions || []).includes("BB"))
      out.push({ ...e, violation: `badge solveur hors structure SB/BB (${(sc.livePositions || []).join(" vs ")})` });
  }
  return out;
}

function publish() {
  if (typeof window === "undefined") return;
  window.__pfTrainerDiag = {
    entries: trainerDiagEntries,
    summary: trainerDiagSummary,
    violations: trainerDiagViolations,
    pauses: trainerPauseDiagEntries,
    pauseSummary: trainerPauseDiagSummary,
    clear: clearTrainerDiag,
  };
}
publish();
