/* ══════════════════════════════════════════════════════════════════════════
   spotRecovery.js — SPOT RECOVERY MANAGER (Mission Master §42, Phase 7)

   Rôle : garantir que l'utilisateur n'est JAMAIS bloqué par un spot défectueux
   (§40/§41/§72). Lorsqu'un spot arrive à la table mais devient injouable
   (action légale inexistante, stack incohérent, board invalide, état corrompu,
   solution absente…) :
     1. on enregistre l'erreur (pour debug §65) ;
     2. on marque le spot INVALID / FAILED ;
     3. on N'incrémente PAS le compteur d'erreurs joueur ;
     4. Main suivante reste disponible ;
     5. un nouveau spot peut être généré à la demande.

   Ce module est PUR : il évalue la jouabilité et tient un journal en mémoire.
   La régénération elle-même (qui a besoin du config/générateur) est faite par
   l'appelant, à qui ce module fournit l'assessment et le record.
   ══════════════════════════════════════════════════════════════════════════ */

import { validateSpotConsistency } from "./trainerActionEvent.js";

export const RECOVERY_STATUS = Object.freeze({
  VALID: "VALID",
  INVALID: "INVALID", // rejeté avant/à l'affichage (config incohérente)
  FAILED: "FAILED",   // a échoué en cours de jeu (exception, état corrompu)
});

/* Évalue si un spot est jouable. Retourne {playable, reason, errors}.
   `ctx` = contexte reconstruit (facing…). `options.requireVillain` par défaut
   true (un spot d'entraînement oppose Héro à au moins un Villain). */
export function assessSpot(spot, ctx = {}, options = {}) {
  if (!spot || typeof spot !== "object") {
    return { playable: false, reason: "spot missing", errors: ["spot missing"] };
  }
  const v = validateSpotConsistency(spot, ctx || {}, options);
  return { playable: v.ok, reason: v.reason, errors: v.errors };
}

/* ──────────────────────────────────────────────────────────────────────────
   createSpotRecoveryManager — journal de récupération (une instance par
   TrainingSession). Ne compte JAMAIS d'erreur joueur.
   ────────────────────────────────────────────────────────────────────────── */
export function createSpotRecoveryManager({ maxLog = 200 } = {}) {
  const failures = [];
  const failedIds = new Set();

  function record({ spot, tableId = null, status = RECOVERY_STATUS.FAILED, reason = null, errors = [] } = {}) {
    const spotId = spot?.spotId || spot?.id || null;
    const entry = {
      spotId,
      tableId,
      status,
      reason: reason || errors[0] || "unknown",
      errors: Array.isArray(errors) ? errors : [],
      generationSeed: spot?.generationSeed ?? null,
      at: Date.now(),
    };
    failures.push(entry);
    if (failures.length > maxLog) failures.shift();
    if (spotId != null) failedIds.add(spotId);
    return entry;
  }

  /* Évalue + enregistre si injouable. Retourne l'assessment enrichi de `status`. */
  function guard(spot, ctx = {}, { tableId = null, status = RECOVERY_STATUS.INVALID, options = {} } = {}) {
    const a = assessSpot(spot, ctx, options);
    if (!a.playable) {
      record({ spot, tableId, status, reason: a.reason, errors: a.errors });
    }
    return { ...a, status: a.playable ? RECOVERY_STATUS.VALID : status };
  }

  return {
    record,
    guard,
    assess: assessSpot,
    get failures() { return failures.slice(); },
    hasFailed(spotId) { return failedIds.has(spotId); },
    get count() { return failures.length; },
    clear() { failures.length = 0; failedIds.clear(); },
  };
}
