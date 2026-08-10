/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER — CERTIFICATION · MODÈLE DE PROVENANCE ET D'EXACTITUDE

   POURQUOI CE MODULE
   `provenance.js` répond à « d'où vient ce chiffre ? » avec UNE étiquette. Ce n'est
   pas assez : la confiance réelle d'un résultat est une CHAÎNE —

       fiabilité du moteur × provenance des entrées × convergence
       × incertitude × cadre théorique du jeu

   Un moteur vérifié nourri de ranges heuristiques ne produit PAS un résultat vérifié.
   Ce module sépare donc les maillons pour qu'un badge global puisse être dérivé du
   plus faible d'entre eux (cf. trustBadge.js), au lieu d'être décidé par le seul
   moteur — ce qui reviendrait à noter une chaîne par son maillon le plus solide.

   POURQUOI DU JSDoc ET NON DU TYPESCRIPT
   `src/` est en JavaScript pur (le `tsconfig.json` du dépôt ne couvre que `prisma/`).
   Les typedefs JSDoc donnent l'autocomplétion, la vérification par l'IDE et la
   documentation, sans imposer une conversion du projet.

   MODULE PUR : aucune dépendance, aucun accès au DOM, aucun effet de bord.
   ADDITIF : ne remplace pas `provenance.js`, qui reste la source des badges actuels.
════════════════════════════════════════════════════════════════════════════ */

/* ── Versions de moteur ───────────────────────────────────────────────────
   Une preuve n'a de valeur que rattachée à une version. Ces numéros doivent être
   incrémentés dès qu'un moteur change de comportement numérique — sinon une matrice
   de certification peut décrire un code qui n'existe plus. */
export const ENGINE_VERSIONS = {
  evaluator: "1.0.0",
  equity: "1.0.0",
  push_fold: "1.0.0",
  cfr: "2.0.0",        // v2 = arbre multi-sizing + multi-rue (sous-arbres par carte)
  icm: "1.0.0",
  pko: "0.9.0",        // modèle PokerForge, prime propre non modélisée → < 1.0
};

/* ── Moteurs et méthodes ─────────────────────────────────────────────────── */
export const Engine = {
  EVALUATOR: "evaluator",
  EQUITY: "equity",
  PUSH_FOLD: "push_fold",
  CFR: "cfr",
  ICM: "icm",
  PKO: "pko",
};

export const Method = {
  EXACT_ENUMERATION: "exact_enumeration",   // on parcourt TOUS les cas
  MONTE_CARLO: "monte_carlo",               // on échantillonne
  CFR_PLUS: "cfr_plus",                     // regret matching CFR+
  CLOSED_FORM: "closed_form",               // formule fermée
  RECURSIVE_EXACT: "recursive_exact",       // récursion exhaustive (ex. Malmuth-Harville)
  HEURISTIC: "heuristic",                   // écrit à la main — pas un calcul
};

/* Niveau de vérification d'un MOTEUR (pas d'un résultat particulier). */
export const VerificationStatus = {
  UNVERIFIED: "unverified",       // aucune preuve
  EXPERIMENTAL: "experimental",   // fonctionne, preuve insuffisante
  BENCHMARKED: "benchmarked",     // comparé à des références, écarts mesurés
  VERIFIED: "verified",           // différentiel exhaustif ou preuve analytique
};

/* ── §3 — TAXONOMIE D'EXACTITUDE ──────────────────────────────────────────
   « Exact » sans complément est une affirmation vide : exact PAR RAPPORT À QUOI ?
   Ces niveaux forcent la question. Un push/fold est exact DANS SON MODÈLE (heads-up,
   chip-EV, arbre jam/fold) — pas « exact » en général. */
export const ExactnessLevel = {
  /* Tous les cas ont été parcourus. Aucune approximation d'aucune sorte. */
  FULLY_ENUMERATED: "fully_enumerated",
  /* Les feuilles sont évaluées exactement (abattage complet), mais l'objet retourné
     — typiquement une stratégie — reste une approximation itérative. */
  EXACT_TERMINAL_EVALUATION: "exact_terminal_evaluation",
  /* Approximation itérative dont on mesure la distance à l'équilibre. */
  CONVERGED_APPROXIMATION: "converged_approximation",
  /* Échantillonnage : la valeur a une erreur standard et un intervalle. */
  STATISTICAL_ESTIMATE: "statistical_estimate",
  /* Valeur écrite à la main. Aucun calcul d'équilibre. */
  HEURISTIC_ESTIMATE: "heuristic_estimate",
};

/* Libellés destinés à l'affichage. Chacun DIT ce qui est exact — jamais « exact » seul. */
export const EXACTNESS_META = {
  fully_enumerated: {
    label: "Énumération exhaustive",
    claim: "Tous les cas parcourus — aucun échantillonnage.",
  },
  exact_terminal_evaluation: {
    label: "Évaluation terminale exacte",
    claim: "Abattages évalués exactement ; la stratégie reste une approximation convergée.",
  },
  converged_approximation: {
    label: "Approximation convergée",
    claim: "Approximation itérative, distance à l'équilibre mesurée.",
  },
  statistical_estimate: {
    label: "Estimation statistique",
    claim: "Échantillonnage — comporte une erreur standard.",
  },
  heuristic_estimate: {
    label: "Estimation heuristique",
    claim: "Valeur écrite à la main — ce n'est pas un calcul d'équilibre.",
  },
};

/* Cadres théoriques : ce que la théorie des jeux AUTORISE à revendiquer. */
export const TheoreticalScope = {
  TWO_PLAYER_ZERO_SUM: "two_player_zero_sum",
  MULTIPLAYER: "multiplayer",
  NON_ZERO_SUM: "non_zero_sum",
  MODEL_DEPENDENT: "model_dependent",
};

export const GuaranteeLabel = {
  NASH_APPROXIMATION_SUPPORTED: "nash_approximation_supported",
  CONVERGED_STRATEGY_NO_FULL_NASH_GUARANTEE: "converged_strategy_no_full_nash_guarantee",
};

/* ── Provenance des ENTRÉES (§2) ─────────────────────────────────────────── */
export const RangeProvenance = {
  POKERFORGE_VERIFIED: "pokerforge_verified",
  POKERFORGE_GENERATED: "pokerforge_generated",
  USER_DEFINED: "user_defined",
  IMPORTED: "imported",
  HEURISTIC: "heuristic",
};

/* ── TYPEDEFS ─────────────────────────────────────────────────────────────
 * @typedef {Object} CalculationProvenance
 * @property {string} engine            Engine.*
 * @property {string} engineVersion     ENGINE_VERSIONS[engine]
 * @property {string} method            Method.*
 * @property {string} verificationStatus VerificationStatus.*
 * @property {string} [calculatedAt]    ISO 8601
 *
 * @typedef {Object} InputProvenance
 * @property {string}  rangeSource      RangeProvenance.*
 * @property {string}  [rangeId]
 * @property {string}  [rangeVersion]
 * @property {string}  [sourceLabel]
 * @property {boolean} verified         Les entrées ont-elles été validées ?
 *
 * @typedef {Object} ConvergenceEvidence
 * @property {string}  metric           "nash_conv"|"exploitability"|"average_regret"|"strategy_delta"|"not_applicable"
 * @property {number}  [value]
 * @property {string}  [unit]           ex. "bb"
 * @property {number}  [iterations]
 * @property {string}  [stoppingReason]
 * @property {number}  [threshold]      Seuil d'acceptation retenu
 *
 * @typedef {Object} UncertaintyEvidence
 * @property {string}  method           "none_exact"|"monte_carlo_confidence_interval"|"numerical_tolerance"
 * @property {number}  [sampleCount]
 * @property {number}  [seed]
 * @property {number}  [standardError]
 * @property {number}  [confidenceLevel]
 * @property {number}  [lowerBound]
 * @property {number}  [upperBound]
 *
 * @typedef {Object} EquilibriumScope
 * @property {number}  playerCount
 * @property {boolean} zeroSum
 * @property {string}  theoreticalScope TheoreticalScope.*
 * @property {string}  guaranteeLabel   GuaranteeLabel.*
 */

/* ── Constructeurs ───────────────────────────────────────────────────────── */

/** @returns {CalculationProvenance} */
export function makeCalculationProvenance({ engine, method, verificationStatus, calculatedAt } = {}) {
  return {
    engine: engine || Engine.EQUITY,
    engineVersion: ENGINE_VERSIONS[engine] || "0.0.0",
    method: method || Method.HEURISTIC,
    verificationStatus: verificationStatus || VerificationStatus.UNVERIFIED,
    calculatedAt: calculatedAt || new Date().toISOString(),
  };
}

/** @returns {InputProvenance} */
export function makeInputProvenance({ rangeSource, rangeId, rangeVersion, sourceLabel } = {}) {
  const src = rangeSource || RangeProvenance.HEURISTIC;
  return {
    rangeSource: src,
    rangeId, rangeVersion, sourceLabel,
    // « vérifié » ne se déclare pas : il découle de la source. Une range heuristique
    // ou générée ne peut pas s'auto-proclamer vérifiée.
    verified: src === RangeProvenance.POKERFORGE_VERIFIED,
  };
}

/* ── §3 — CLASSIFICATION ──────────────────────────────────────────────────
   Traduit (moteur, méthode, contexte) en niveau d'exactitude, en appliquant les
   règles du cahier des charges. `boardComplete` distingue le cas rivière — seul cas
   où le CFR évalue ses feuilles exactement (plus aucun runout à échantillonner).

   @returns {{level:string, label:string, claim:string, qualifier:(string|undefined)}} */
export function classifyExactness({ engine, method, boardComplete = false, model } = {}) {
  const wrap = (level, qualifier) => ({
    level,
    label: EXACTNESS_META[level].label,
    claim: EXACTNESS_META[level].claim,
    qualifier,
  });

  if (method === Method.HEURISTIC) return wrap(ExactnessLevel.HEURISTIC_ESTIMATE);
  if (method === Method.MONTE_CARLO) return wrap(ExactnessLevel.STATISTICAL_ESTIMATE);

  if (engine === Engine.CFR) {
    // Le showdown est exact sur board complet, mais la STRATÉGIE reste approchée :
    // les deux faits coexistent et doivent être dits ensemble.
    return boardComplete
      ? wrap(ExactnessLevel.EXACT_TERMINAL_EVALUATION,
             "abattages exacts ; stratégie en approximation convergée")
      : wrap(ExactnessLevel.CONVERGED_APPROXIMATION,
             "runouts échantillonnés ; exploitabilité exacte indisponible");
  }

  if (engine === Engine.PUSH_FOLD) {
    // Exact — mais DANS un modèle précis. Sans ce complément, l'affirmation dépasse
    // ce qui est démontré (heads-up, chip-EV, arbre jam/fold uniquement).
    return wrap(ExactnessLevel.FULLY_ENUMERATED,
                `exact dans le modèle spécifié (${model || "heads-up, chip-EV, arbre jam/fold"})`);
  }

  if (method === Method.EXACT_ENUMERATION) return wrap(ExactnessLevel.FULLY_ENUMERATED);
  if (method === Method.RECURSIVE_EXACT) {
    return wrap(ExactnessLevel.FULLY_ENUMERATED,
                "exact dans le modèle (Malmuth-Harville : ordre de sortie proportionnel aux tapis)");
  }
  if (method === Method.CLOSED_FORM) return wrap(ExactnessLevel.FULLY_ENUMERATED);
  return wrap(ExactnessLevel.HEURISTIC_ESTIMATE);
}

/* ── §5 — CADRE THÉORIQUE ─────────────────────────────────────────────────
   FAIT MATHÉMATIQUE : NashConv = brEV(Héros) + brEV(Vilain) est une identité qui
   SUPPOSE la somme nulle. À 3 joueurs et plus sous ICM, les jetons transférés
   déplacent l'équité de joueurs absents du coup : le jeu n'est plus à somme nulle et
   la métrique perd son sens. À exactement 2 joueurs, la somme des équités est
   constante et la métrique reste valide.
   @returns {EquilibriumScope} */
export function deriveEquilibriumScope({ playerCount = 2, utilityKind = "chip" } = {}) {
  const twoPlayer = playerCount === 2;
  // Un solve ICM/PKO à 2 joueurs RESTE à somme nulle : c'est le nombre de joueurs
  // qui décide, pas le mode de calcul de l'utilité.
  const zeroSum = twoPlayer;
  let scope;
  if (twoPlayer) scope = utilityKind === "chip" ? TheoreticalScope.TWO_PLAYER_ZERO_SUM : TheoreticalScope.MODEL_DEPENDENT;
  else scope = utilityKind === "chip" ? TheoreticalScope.MULTIPLAYER : TheoreticalScope.NON_ZERO_SUM;
  return {
    playerCount, zeroSum, theoreticalScope: scope,
    guaranteeLabel: zeroSum
      ? GuaranteeLabel.NASH_APPROXIMATION_SUPPORTED
      : GuaranteeLabel.CONVERGED_STRATEGY_NO_FULL_NASH_GUARANTEE,
  };
}

/* Un cadre autorise-t-il à parler d'équilibre de Nash approché ? */
export function mayClaimNashApproximation(scope) {
  return !!scope && scope.guaranteeLabel === GuaranteeLabel.NASH_APPROXIMATION_SUPPORTED;
}
