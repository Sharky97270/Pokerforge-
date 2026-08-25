/* ══════════════════════════════════════════════════════════════════════════
   PFASE · PONT REPLAYER (Mission §49, §50, §51)

   « Intégrer IMMÉDIATEMENT le nouveau système au Replayer. Contrairement à
   certaines implémentations concurrentes initiales, PokerForge doit pouvoir
   comparer une main jouée avec les solutions Single Size dès cette version. »

   Pour chaque décision d'Hero, le rejeu doit montrer :

       Joué :        BET 62%
       Single Size : BET 75%
       Full :        CHECK / 33 / 75 / 150

   puis, ET SEULEMENT SI C'EST CALCULABLE, l'EV jouée, l'EV du meilleur choix et
   leur écart.

   ── §50, LE POINT DÉLICAT ──────────────────────────────────────────────────
   « Si le sizing réel n'existe pas dans l'arbre : NE PAS attribuer directement
   l'EV du sizing le plus proche. »

   C'est la tentation naturelle — 62 % ressemble à 75 %, donc on lui prête son
   EV. Mais l'EV d'un sizing est la valeur d'un SOUS-ARBRE ENTIER : celui de 75 %
   décrit un jeu où le vilain fait face à 75 %, pas à 62 %. Sa fréquence de fold,
   ses relances, tout diffère. Prêter cette EV, c'est fabriquer un chiffre.
   On rend donc `evAvailable:false` et l'on cite le sizing étudié le plus proche
   comme une COMPARAISON, explicitement étiquetée approximative.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { compareAction, getTrainingNode } from "./pfase.js";
import { getSolution } from "./solutionStore.js";
import { solutionId as makeSolutionId } from "./canonicalHash.js";
import { SIZING_COMPLEXITIES } from "./config.js";
import { mayClaimSolved } from "./solutionSchema.js";
import { roundAmount } from "./sizingSpec.js";

/* ══════════════════════════════════════════════════════════════════════════
   compareReplayDecision — le bloc affiché sous une décision du rejeu.

   { gameStateHash, path, handClass, played:{actionType,sizeBb}, levels }
   `levels` : niveaux à confronter, du plus simple au plus complet.
   ══════════════════════════════════════════════════════════════════════════ */
export function compareReplayDecision({
  gameStateHash, path = [], handClass = null, played,
  levels = ["SINGLE", "SIMPLE", "FULL"],
} = {}) {
  if (!gameStateHash) return { ok: false, reason: "état de jeu non identifié" };
  if (!played || !played.actionType) return { ok: false, reason: "action jouée non identifiée" };

  const rows = [];
  for (const complexity of levels) {
    const sol = getSolution(gameStateHash, complexity);
    if (!sol) {
      rows.push({ complexity, available: false, reason: "aucune solution stockée à ce niveau" });
      continue;
    }
    const node = getTrainingNode(sol, path, { handClass });
    if (!node.ok) {
      rows.push({ complexity, available: false, reason: node.reason });
      continue;
    }
    const cmp = compareAction({
      solution: sol, path, handClass,
      actionType: played.actionType, sizeBb: played.sizeBb, sizeIsTotal: true,
    });
    rows.push({
      complexity, available: true,
      solutionId: sol.solutionId,
      badge: sol.provenanceMeta ? sol.provenanceMeta.badge : null,
      mayClaimSolved: mayClaimSolved(sol),
      status: sol.status,
      /* Ce que la solution PROPOSE à ce nœud. */
      actions: node.actions.map(a => ({
        actionType: a.actionType, sizeBb: a.toBb, potFraction: a.potFraction,
        specLabel: a.specLabel, frequency: a.frequency,
      })),
      /* Le meilleur choix selon la solution (fréquence dominante). */
      best: cmp.bestAction ? {
        actionType: cmp.bestAction.actionType, sizeBb: cmp.bestAction.toBb,
        specLabel: cmp.bestAction.specLabel, frequency: cmp.bestAction.frequency,
      } : null,
      /* Le verdict sur l'action réellement jouée. */
      played: { actionType: played.actionType, sizeBb: played.sizeBb == null ? null : roundAmount(played.sizeBb) },
      inTree: cmp.inTree,
      matched: cmp.matched || null,
      verdict: cmp.verdict,
      /* §50 — jamais l'EV du voisin. */
      evAvailable: cmp.evAvailable,
      evNote: cmp.evNote || cmp.reason || null,
      nearestStudied: cmp.nearestStudied || null,
      /* §15 — l'écart d'EV entre sizings, lui, est mesuré. */
      sizingRanking: sol.actionRanking || null,
      simplificationCost: sol.simplificationMetrics ? {
        evLossBb: sol.simplificationMetrics.absoluteEVLoss,
        evLossPotPct: sol.simplificationMetrics.evLossPotPct,
        measurementFloorBb: sol.measurement ? sol.measurement.floor : null,
        distinguishable: sol.distinguishable !== false,
      } : null,
      frequencySource: node.frequencySource,
    });
  }

  const usable = rows.filter(r => r.available);
  return {
    ok: usable.length > 0,
    reason: usable.length ? null : "aucune solution disponible pour cette décision",
    gameStateHash, path, handClass,
    rows,
    /* §51 — le TYPE de solution qui a servi au verdict voyage avec lui : un
       verdict rendu contre un Single Size n'a pas la même portée qu'un verdict
       rendu contre l'arbre complet, et l'historique doit s'en souvenir. */
    verdictSource: usable.length ? {
      complexity: usable[0].complexity,
      solutionId: usable[0].solutionId,
      badge: usable[0].badge,
      mayClaimSolved: usable[0].mayClaimSolved,
    } : null,
  };
}

/* Résumé en une ligne par niveau, exactement dans la forme du §49. */
export function formatReplayComparison(cmp) {
  if (!cmp || !cmp.ok) return [`Aucune comparaison disponible${cmp && cmp.reason ? ` — ${cmp.reason}` : ""}`];
  const out = [];
  const first = cmp.rows.find(r => r.available);
  if (first) {
    out.push(`Joué : ${first.played.actionType}${first.played.sizeBb != null ? ` ${first.played.sizeBb}bb` : ""}`);
  }
  for (const r of cmp.rows) {
    if (!r.available) { out.push(`${r.complexity} : indisponible — ${r.reason}`); continue; }
    const actions = r.actions.map(a => a.specLabel || a.actionType).join(" / ");
    out.push(`${r.complexity} : ${actions}`);
  }
  const withEv = cmp.rows.find(r => r.available && r.evAvailable);
  if (!withEv) {
    out.push("EV exacte indisponible — l'EV par action n'est pas conservée dans les solutions stockées.");
    const near = cmp.rows.find(r => r.available && r.nearestStudied);
    if (near) out.push(`Sizing étudié le plus proche : ${near.nearestStudied.specLabel || near.nearestStudied.toBb + "bb"} (comparaison approximative — sa fréquence ne s'applique pas au sizing joué).`);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   §51 — ANALYSE D'HISTORIQUE : le pipeline HH doit pouvoir DEMANDER un niveau
   et CONSERVER celui qui a servi à chaque verdict.
   ══════════════════════════════════════════════════════════════════════════ */
export function analyzeHandHistory({ decisions = [], complexity = "SIMPLE" } = {}) {
  const wanted = SIZING_COMPLEXITIES.includes(complexity) ? complexity : "SIMPLE";
  const results = decisions.map((d, i) => {
    const cmp = compareReplayDecision({
      gameStateHash: d.gameStateHash, path: d.path, handClass: d.handClass,
      played: d.played, levels: [wanted],
    });
    return {
      index: i, street: d.street || null,
      requestedComplexity: wanted,
      ...cmp,
      /* Le verdict n'existe que s'il y a une solution ; sinon on le dit. */
      resolved: cmp.ok,
    };
  });
  const resolved = results.filter(r => r.resolved);
  return {
    complexity: wanted,
    total: results.length,
    resolved: resolved.length,
    unresolved: results.length - resolved.length,
    results,
    /* Agrégat honnête : on ne rapporte de statistique que sur ce qui a été
       réellement comparé. Un taux calculé sur un dénominateur incomplet est
       une des façons les plus discrètes de mentir avec des chiffres. */
    coverageNote: results.length
      ? `${resolved.length}/${results.length} décisions comparées à une solution ${wanted} ; les autres n'ont pas de solution stockée et ne comptent dans aucune statistique.`
      : "aucune décision fournie",
  };
}
