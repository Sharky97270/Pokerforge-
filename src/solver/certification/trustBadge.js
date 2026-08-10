/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER — CERTIFICATION · BADGE DE CONFIANCE (§12)

   PRINCIPE : LE MAILLON LE PLUS FAIBLE.
   Un résultat n'est jamais meilleur que le plus faible des maillons qui l'ont produit.
   Le badge n'est donc PAS décidé par le moteur — ce serait noter une chaîne par son
   maillon le plus solide, exactement l'erreur que cet audit corrige :

       « moteur CFR vérifié » + ranges devinées  →  résultat EXPÉRIMENTAL
       (un solve exact sur les mauvaises ranges reste une réponse exacte
        à la mauvaise question)

   Le badge retourné indique TOUJOURS quel maillon l'a plafonné (`weakestLink`), pour
   qu'on sache quoi améliorer plutôt que de deviner.

   COULEURS : volontairement distinctes de celles des actions poker (Fold/Call/Bet/
   Raise). Confondre « ce résultat est fiable » et « cette action est un call » est le
   genre d'ambiguïté qui fait prendre une couleur pour un conseil.

   MODULE PUR : aucune dépendance, aucun accès au DOM.
════════════════════════════════════════════════════════════════════════════ */
import {
  VerificationStatus, RangeProvenance, ExactnessLevel, GuaranteeLabel,
} from "./types.js";

export const TrustBadge = {
  VERIFIED: "verified",          // calcul exhaustif ET entrées vérifiées
  CONVERGED: "converged",        // approximation CFR sous le seuil retenu
  ESTIMATED: "estimated",        // Monte-Carlo avec intervalle de confiance
  EXPERIMENTAL: "experimental",  // entrées heuristiques ou modèle en validation
  UNVERIFIED: "unverified",      // preuve insuffisante ou absente
};

/* Rang de sévérité : plus c'est haut, plus c'est faible. Sert à ne retenir que le
   pire maillon. */
const RANK = {
  verified: 0, converged: 1, estimated: 2, experimental: 3, unverified: 4,
};

/* Palette de CONFIANCE — aucune de ces couleurs n'est utilisée pour Fold/Call/Bet/
   Raise dans l'application (§12). */
export const TRUST_BADGE_META = {
  verified: {
    label: "Vérifié", short: "VÉRIFIÉ", color: "#3DDC97",
    desc: "Calcul exhaustif et entrées vérifiées.",
  },
  converged: {
    label: "Convergé", short: "CONVERGÉ", color: "#4FA8FF",
    desc: "Approximation CFR sous le seuil de convergence retenu.",
  },
  estimated: {
    label: "Estimé", short: "ESTIMÉ", color: "#C9A227",
    desc: "Estimation par échantillonnage, assortie d'un intervalle de confiance.",
  },
  experimental: {
    label: "Expérimental", short: "EXPÉR.", color: "#B084F5",
    desc: "Entrées heuristiques ou modèle encore en cours de validation.",
  },
  unverified: {
    label: "Non vérifié", short: "NON VÉR.", color: "#8A93A6",
    desc: "Preuve insuffisante ou validation absente.",
  },
};

const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

/* ── Maillon 1 : le MOTEUR ── */
function fromCalculation(calc) {
  if (!calc) return { badge: TrustBadge.UNVERIFIED, reason: "aucune provenance de calcul fournie" };
  switch (calc.verificationStatus) {
    case VerificationStatus.VERIFIED:
      return { badge: TrustBadge.VERIFIED, reason: `moteur ${calc.engine} vérifié` };
    case VerificationStatus.BENCHMARKED:
      return { badge: TrustBadge.CONVERGED, reason: `moteur ${calc.engine} comparé à des références` };
    case VerificationStatus.EXPERIMENTAL:
      return { badge: TrustBadge.EXPERIMENTAL, reason: `moteur ${calc.engine} expérimental` };
    default:
      return { badge: TrustBadge.UNVERIFIED, reason: `moteur ${calc.engine} non vérifié` };
  }
}

/* ── Maillon 2 : les ENTRÉES ──
   Le maillon le plus souvent décisif en pratique : la composition de range pilote
   l'essentiel de la stratégie postflop. */
function fromInputs(inputs) {
  if (!inputs) return { badge: TrustBadge.UNVERIFIED, reason: "provenance des entrées inconnue" };
  switch (inputs.rangeSource) {
    case RangeProvenance.POKERFORGE_VERIFIED:
      return { badge: TrustBadge.VERIFIED, reason: "ranges vérifiées" };
    case RangeProvenance.USER_DEFINED:
    case RangeProvenance.IMPORTED:
      // L'utilisateur assume ses entrées : on ne les certifie pas, mais on ne les
      // disqualifie pas non plus.
      return { badge: TrustBadge.ESTIMATED, reason: "ranges fournies par l'utilisateur (non certifiées)" };
    case RangeProvenance.POKERFORGE_GENERATED:
      return { badge: TrustBadge.EXPERIMENTAL, reason: "ranges générées, non validées" };
    case RangeProvenance.HEURISTIC:
    default:
      return { badge: TrustBadge.EXPERIMENTAL, reason: "ranges heuristiques" };
  }
}

/* ── Maillon 3 : la CONVERGENCE ──
   Sans seuil, une valeur de convergence ne prouve rien : on exige donc `threshold`.
   Une convergence annoncée sans critère d'acceptation est traitée comme non prouvée. */
function fromConvergence(conv) {
  if (!conv || conv.metric === "not_applicable") return null;   // maillon absent → neutre
  if (typeof conv.value !== "number" || !Number.isFinite(conv.value)) {
    return { badge: TrustBadge.UNVERIFIED, reason: "convergence non mesurée" };
  }
  if (typeof conv.threshold !== "number") {
    return { badge: TrustBadge.EXPERIMENTAL, reason: "convergence mesurée sans seuil d'acceptation" };
  }
  return conv.value <= conv.threshold
    ? { badge: TrustBadge.CONVERGED, reason: `${conv.metric} ${conv.value} ≤ seuil ${conv.threshold}` }
    : { badge: TrustBadge.EXPERIMENTAL, reason: `${conv.metric} ${conv.value} > seuil ${conv.threshold} — non convergé` };
}

/* ── Maillon 4 : l'INCERTITUDE ──
   Un Monte-Carlo sans intervalle de confiance ne permet pas de dire à quel point on
   sait : il plafonne donc plus bas qu'un Monte-Carlo instrumenté. */
function fromUncertainty(unc) {
  if (!unc || unc.method === "none_exact") return null;         // maillon absent → neutre
  if (unc.method === "monte_carlo_confidence_interval") {
    const hasCI = typeof unc.lowerBound === "number" && typeof unc.upperBound === "number";
    return hasCI
      ? { badge: TrustBadge.ESTIMATED, reason: `échantillonnage (n=${unc.sampleCount ?? "?"}) avec intervalle de confiance` }
      : { badge: TrustBadge.EXPERIMENTAL, reason: "échantillonnage sans intervalle de confiance" };
  }
  if (unc.method === "numerical_tolerance") {
    return { badge: TrustBadge.CONVERGED, reason: "tolérance numérique documentée" };
  }
  return null;
}

/* ── Maillon 5 : le CADRE THÉORIQUE ──
   Ne dégrade PAS le badge en soi : un résultat multijoueur peut être parfaitement
   calculé. Il interdit en revanche la revendication d'équilibre de Nash, portée par
   `mayClaimNashApproximation`. C'est une distinction à conserver : « bien calculé »
   et « c'est un équilibre » sont deux affirmations différentes. */
function scopeNote(scope) {
  if (!scope) return null;
  return scope.guaranteeLabel === GuaranteeLabel.NASH_APPROXIMATION_SUPPORTED
    ? null
    : `cadre ${scope.theoreticalScope} — stratégie convergée dans le modèle, sans garantie d'équilibre de Nash`;
}

/**
 * Dérive le badge global depuis le maillon le plus faible de la chaîne.
 * @returns {{badge:string, label:string, color:string, weakestLink:string,
 *            reason:string, links:Array, mayClaimNash:boolean, scopeNote:(string|null)}}
 */
export function deriveSolverTrustBadge({
  calculation, inputs, convergence, uncertainty, equilibriumScope, exactness,
} = {}) {
  const links = [
    { link: "engine", ...fromCalculation(calculation) },
    { link: "inputs", ...fromInputs(inputs) },
  ];
  const c = fromConvergence(convergence); if (c) links.push({ link: "convergence", ...c });
  const u = fromUncertainty(uncertainty); if (u) links.push({ link: "uncertainty", ...u });

  // Une exactitude explicitement heuristique plafonne, quoi qu'en disent les autres.
  if (exactness === ExactnessLevel.HEURISTIC_ESTIMATE) {
    links.push({ link: "exactness", badge: TrustBadge.EXPERIMENTAL, reason: "valeur heuristique, non calculée" });
  }

  let badge = TrustBadge.VERIFIED;
  for (const l of links) badge = worse(badge, l.badge);
  const weakest = links.find(l => l.badge === badge) || links[0];

  const meta = TRUST_BADGE_META[badge];
  return {
    badge,
    label: meta.label,
    color: meta.color,
    weakestLink: weakest.link,
    reason: weakest.reason,
    links,
    mayClaimNash: !!equilibriumScope && equilibriumScope.guaranteeLabel === GuaranteeLabel.NASH_APPROXIMATION_SUPPORTED,
    scopeNote: scopeNote(equilibriumScope),
  };
}
