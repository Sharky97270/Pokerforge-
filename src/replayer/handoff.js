/* ═══════════════════════════════════════════════════════════════
   PokerForge — Passerelle Replayer → Trainer / Coach AI (§30/§31/§32)

   Le Replayer publie ici le CONTEXTE STRUCTURÉ d'une main analysée
   (HandState, package solveur, analyse IA, concepts, observations) pour
   que les autres modules reprennent le travail sans re-parser du texte.

   Le contrat existant des callbacks (`onGoCoach(raw)`, `onGoTrainer(seed)`)
   n'est PAS modifié : la passerelle est un canal additif. Un consommateur
   qui l'ignore continue de fonctionner exactement comme avant.

   Portée volontairement courte : sessionStorage (l'onglet en cours), jamais
   d'envoi réseau — c'est un transfert intra-application.
═══════════════════════════════════════════════════════════════ */

const KEY = "pf_rep_handoff";
let _mem = null;

/**
 * Publie le contexte d'analyse de la main courante.
 * @param {object} ctx { handId, handState, solverData, analysis, concepts, observations, spot }
 */
export function publishAnalysisContext(ctx) {
  if (!ctx || !ctx.handId) return null;
  const payload = { ...ctx, publishedAt: Date.now() };
  _mem = payload;
  try { sessionStorage.setItem(KEY, JSON.stringify(payload)); } catch { /* quota / mode privé */ }
  return payload;
}

/**
 * Lit le contexte publié. `handId` optionnel : si fourni, ne renvoie le
 * contexte que s'il correspond bien à cette main (pas de contexte périmé).
 */
export function readAnalysisContext(handId = null) {
  let p = _mem;
  if (!p) {
    try { p = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { p = null; }
  }
  if (!p) return null;
  if (handId && String(p.handId) !== String(handId)) return null;
  // Un contexte de plus de 2 h n'a plus de sens dans une session de travail.
  if (p.publishedAt && Date.now() - p.publishedAt > 2 * 3600 * 1000) return null;
  return p;
}

export function clearAnalysisContext() {
  _mem = null;
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
}

/**
 * Contexte compact destiné au LLM (Coach AI) — uniquement des données
 * stratégiques, jamais de hand history brute ni d'identifiant de compte (§27).
 */
export function toCoachContext(ctx) {
  if (!ctx) return null;
  const sd = ctx.solverData || {};
  return {
    source: "replayer",
    spot: ctx.spot || null,
    format: ctx.handState?.format || null,
    heroPosition: ctx.handState?.hero?.position || null,
    board: ctx.handState?.board || null,
    solver: {
      level: sd.level ?? null,
      levelLabel: sd.levelLabel ?? null,
      status: sd.status ?? null,
      totalEvLossBB: sd.totalEvLossBB ?? null,
      errorCount: sd.errorCount ?? null,
      equity: sd.equity ? { value: sd.equity.value, source: sd.equity.source } : null,
      target: sd.target
        ? { street: sd.target.street, played: sd.target.playedLabel,
            recommended: sd.target.recommendedLabel, evLossBB: sd.target.evLossBB,
            strategy: sd.target.strategy, source: sd.target.source }
        : null,
    },
    verdict: ctx.analysis?.verdict || null,
    concepts: ctx.concepts || [],
    observations: (ctx.observations || []).map(o => o.text).slice(0, 6),
  };
}
