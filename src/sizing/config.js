/* ══════════════════════════════════════════════════════════════════════════
   PFASE · CONFIGURATION CENTRALE (Mission §5, §11, §12, §16, §80, §94)

   POURQUOI CE FICHIER EXISTE
   La mission interdit explicitement de disperser les limites de complexité dans
   le code (« Ne pas disperser ces limites dans le code. Centraliser la
   configuration. » §5). Toute borne, tout epsilon, toute version vit ici et
   nulle part ailleurs. Un module qui écrirait `maxBetSizes = 2` en dur serait
   un bug par construction.

   Ce module est PUR : aucune dépendance, importable depuis un Web Worker comme
   depuis Node.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── VERSIONS (§80) ────────────────────────────────────────────────────────
   Trois versions distinctes, parce qu'elles changent pour trois raisons
   différentes :
     · sizingEngineVersion   — l'algorithme de sélection des sizings a changé
     · solverVersion         — le moteur qui produit les EV a changé
     · solutionSchemaVersion — la FORME de l'objet stocké a changé
   Les trois entrent dans le hash canonique (§19) : une solution produite par un
   moteur antérieur ne peut donc pas être servie en silence à la place d'une
   solution courante. C'est le manque qui existait dans `library.js`. */
export const SIZING_ENGINE_VERSION = "1.0.0";
export const SOLUTION_SCHEMA_VERSION = 1;
/* Le cœur CFR n'exposait aucune version. On en déclare une ici, à incrémenter
   dès qu'un changement de `core/cfr.js`, `core/multistreet.js` ou
   `core/gametree.js` modifie les EV produites. */
export const SOLVER_VERSION = "sharksolver-core-2.1.0";

/* ── EPSILONS (§94) ────────────────────────────────────────────────────────
   Jamais de comparaison de flottants par égalité stricte. Un seul jeu de
   tolérances, nommées par ce qu'elles comparent. */
export const EPS = Object.freeze({
  /* montants en bb : deux montants distants de moins d'un millième de blinde
     sont le même montant (le pas de mise le plus fin du Trainer est 0.5bb) */
  amount: 1e-3,
  /* fractions de pot : 0.3333 et 0.3334 sont le même sizing */
  fraction: 1e-4,
  /* EV en bb : en deçà, deux sous-arbres sont réputés équivalents. Calibré sur
     le bruit du CFR échantillonné, pas sur la précision machine. */
  ev: 1e-4,
  /* fréquences (0..1) : contrôle de normalisation (§93) */
  freq: 1e-6,
  /* comparaison numérique générale */
  num: 1e-9,
});

/* ── NIVEAUX DE COMPLEXITÉ (§5) ────────────────────────────────────────────
   `FULL` ne porte pas de limite : l'arbre est celui fourni par l'utilisateur ou
   le preset, et aucune simplification automatique n'est imposée. On l'exprime
   par `null` plutôt que par un grand nombre — un plafond de 999 serait une
   limite déguisée. */
export const SizingComplexity = Object.freeze({
  SINGLE: "SINGLE",
  SIMPLE: "SIMPLE",
  ADVANCED: "ADVANCED",
  FULL: "FULL",
});
export const SIZING_COMPLEXITIES = Object.freeze(["SINGLE", "SIMPLE", "ADVANCED", "FULL"]);

export const COMPLEXITY_LIMITS = Object.freeze({
  SINGLE: Object.freeze({ maxBetSizes: 1, maxRaiseSizes: 1, label: "Single Size",
    desc: "Un seul sizing de mise par nœud — optimisé pour CE nœud, pas une constante globale." }),
  SIMPLE: Object.freeze({ maxBetSizes: 2, maxRaiseSizes: 1, label: "Simple",
    desc: "Jusqu'à 2 sizings de mise et 1 sizing de relance." }),
  ADVANCED: Object.freeze({ maxBetSizes: 3, maxRaiseSizes: 2, label: "Advanced",
    desc: "Jusqu'à 3 sizings de mise et 2 sizings de relance." }),
  FULL: Object.freeze({ maxBetSizes: null, maxRaiseSizes: null, label: "Full",
    desc: "Arbre fourni intégralement — aucune simplification automatique imposée." }),
});

/* Limites effectives d'un niveau. `null` = non borné (FULL). */
export function complexityLimits(complexity) {
  return COMPLEXITY_LIMITS[complexity] || COMPLEXITY_LIMITS.FULL;
}

/* ── MODES DE BETTING TREE (§4) ────────────────────────────────────────────
   FIXED     : l'arbre fourni est résolu tel quel, aucun sizing n'est supprimé.
   DYNAMIC   : l'utilisateur fournit les candidats + les plafonds ; le moteur
               cherche la meilleure combinaison par comparaison d'EV.
   AUTOMATIC : le moteur choisit AUSSI les candidats (profil de génération) et
               le nombre de sizings, dans les bornes de la complexité.
   SINGLE    : cas particulier de DYNAMIC avec maxBetSizes = 1. */
export const BettingTreeMode = Object.freeze({
  FIXED: "FIXED",
  DYNAMIC: "DYNAMIC",
  AUTOMATIC: "AUTOMATIC",
  SINGLE: "SINGLE",
});
export const BETTING_TREE_MODES = Object.freeze(["AUTOMATIC", "DYNAMIC", "SINGLE", "FIXED"]);

export const BETTING_TREE_MODE_META = Object.freeze({
  AUTOMATIC: { label: "Automatic", desc: "PokerForge choisit les candidats ET les sizings retenus." },
  DYNAMIC: { label: "Dynamic", desc: "Vous fournissez les candidats ; PokerForge choisit les meilleurs." },
  SINGLE: { label: "Single Size", desc: "Un seul sizing par nœud, sélectionné par comparaison d'EV." },
  FIXED: { label: "Fixed", desc: "Votre arbre est résolu tel quel — aucun sizing supprimé." },
});

/* Complexités compatibles avec un mode (§23 : « Selon compatibilité du mode »). */
export function complexitiesFor(mode) {
  if (mode === BettingTreeMode.FIXED) return ["FULL"];
  if (mode === BettingTreeMode.SINGLE) return ["SINGLE"];
  return ["SINGLE", "SIMPLE", "ADVANCED", "FULL"];
}

/* ── BUDGET COMBINATOIRE (§11) ─────────────────────────────────────────────
   Le nombre de sous-arbres explose vite : C(9,3) = 84 sous-ensembles de bets,
   multipliés par les sous-ensembles de raises. Ces bornes sont des GARDE-FOUS
   opérationnels, pas des vérités mathématiques — elles sont donc configurables
   et le résultat porte la trace de leur activation (`planner.truncated`). */
export const DEFAULT_COMBINATION_BUDGET = Object.freeze({
  /* nb max de candidats de mise retenus avant génération des sous-ensembles */
  maxCandidates: 12,
  /* nb max de sous-ensembles de mise réellement évalués */
  maxBetSubsets: 64,
  /* nb max de sous-ensembles de relance réellement évalués */
  maxRaiseSubsets: 16,
  /* nb max de solves d'évaluation (bets × raises + référence) */
  maxEvaluations: 96,
  /* budget temps global de la phase d'évaluation ; null = illimité */
  timeBudgetMs: null,
});

/* ── ÉVALUATION (§12) ──────────────────────────────────────────────────────
   Une comparaison rapide et une solution complète ne sont PAS équivalentes. La
   config d'évaluation est donc explicite et VOYAGE AVEC LE RÉSULTAT : l'UI doit
   pouvoir dire « ces EV de sélection ont été mesurées à 120 itérations ». */
export const DEFAULT_EVALUATION_CONFIG = Object.freeze({
  /* profondeur en rues des sous-arbres d'évaluation. null = profondeur réelle
     du spot (flop → 3 rues). Une valeur < profondeur réelle produit une
     évaluation TRONQUÉE, signalée comme telle. */
  evaluationDepth: null,
  /* itérations CFR de la phase de comparaison — point de DÉPART : l'escalade
     de convergence (dynamicOptimizer) monte tant que la dérive de l'EV de
     référence dépasse la cible. */
  maxIterations: 200,
  /* plafond de l'escalade — au-delà, on garde la meilleure mesure obtenue et on
     rapporte la dérive résiduelle comme plancher de mesure. */
  maxIterationsCeiling: 1600,
  autoEscalate: true,
  /* plafond de combos (abstraction de range) de la phase de comparaison */
  maxCombos: 140,
  /* Dérive d'EV tolérée entre N et 2N itérations, en bb. 0.02 : il faut être
     plus précis que les pertes d'EV qu'on cherche à mesurer (de l'ordre de
     0.03 bb), sinon la sélection mesure sa propre erreur de convergence. */
  convergenceTarget: 0.02,
  /* ── BUDGET TEMPS (§11/§12) ─────────────────────────────────────────────
     Il ne s'agit pas d'un confort. Mesuré au navigateur sur un flop à ranges
     complètes : l'optimisation dépassait 180 s sans jamais rendre la main, ce
     qui, du point de vue de l'utilisateur, est indiscernable d'un blocage.
     Le budget arrête l'exploration, rend la MEILLEURE solution mesurée jusque-là,
     et l'annonce en PARTIAL avec le nombre de sous-arbres non évalués — jamais
     en prétendant avoir tout comparé. */
  timeBudgetMs: 45000,
  /* ── NOMBRES ALÉATOIRES COMMUNS (CRN) ─────────────────────────────────
     TOUS les sous-arbres d'une même optimisation sont résolus avec CETTE
     graine. Ce n'est pas un détail d'implémentation : sur board incomplet, les
     runouts sont échantillonnés, et l'EV absolue bouge de plusieurs dixièmes de
     bb d'une graine à l'autre. Mesuré sur un flop AsTh4c, 120 itérations :
       graine 1 → 33% : −0.221 | 75% : −0.370 | 150% : −0.386
       graine 3 → 33% : −0.145 | 75% : −0.311 | 150% : −0.253
     Les EV absolues varient de 0.13 bb, mais le CLASSEMENT ne bouge pas, parce
     que les trois arbres voient exactement les mêmes runouts. Comparer des
     arbres résolus sur des runouts différents reviendrait à mesurer du bruit.
     Voir ALGORITHM.md § « Variance et comparaison appariée ». */
  seed: 20260825,
});

/* ── PLANCHER DE BRUIT (§14/§21) ───────────────────────────────────────────
   Sur board incomplet, l'EV est échantillonnée. Une perte d'EV plus petite que
   le bruit de mesure n'est pas une perte mesurée : c'est du bruit. On sonde
   donc la référence à plusieurs graines pour ESTIMER ce plancher, et toute
   perte en deçà est rapportée comme « non distinguable » plutôt que comme un
   nombre précis. 0 = pas de sondage (board complet : le solve est exact). */
export const DEFAULT_NOISE_PROBE_SEEDS = 2;

/* ── GARDE-FOU MÉMOIRE ─────────────────────────────────────────────────────
   Le solveur multi-rue indexe ses tables de regret par (nœud, runout observé).
   Sur un flop à 3 rues de mise, le nombre de contextes croît avec les
   itérations et la mémoire explose : mesuré, 120 itérations × 1993 nœuds ×
   140 combos font tomber Node à court de tas (OOM) — dans un onglet, c'est un
   plantage. Le coût est donc ESTIMÉ avant le solve, et la profondeur dégradée
   plutôt que de risquer le crash. La dégradation est signalée, jamais tue. */
export const DEFAULT_MEMORY_GUARD = Object.freeze({
  maxEstimatedBytes: 384 * 1024 * 1024,
  enabled: true,
});

/* Configuration du SOLVE FINAL (§13) — volontairement plus riche que
   l'évaluation : les micro-solves de sélection ne sont pas la solution. */
export const DEFAULT_FINAL_SOLVE_CONFIG = Object.freeze({
  /* Seul le solve FINAL entre en bibliothèque : c'est lui qui EST une solution.
     Les micro-solves d'évaluation sont jetables (§13). */
  persistSolve: true,
  maxIterations: 400,
  maxCombos: 200,
  evaluationDepth: null,
  convergenceTarget: 0.02,
  timeBudgetMs: null,
  seed: 20260825,
});

/* ── TOLÉRANCE À LA SIMPLIFICATION (§16) ───────────────────────────────────
   Permet le futur mode « complexité minimale sous perte d'EV X ». null = aucune
   contrainte (on retient le meilleur sous-ensemble du niveau demandé). */
export const DEFAULT_MAX_ACCEPTABLE_EV_LOSS = null;
export const EV_LOSS_PRESETS = Object.freeze([0.01, 0.02, 0.03, 0.05, 0.10]);

/* ── POLITIQUE D'ARRONDI (§73) ─────────────────────────────────────────────
   Un seul endroit décide de la précision des montants. Trois grandeurs, trois
   précisions, parce qu'elles ne servent pas à la même chose :
     · `amountBb`   ce qui est engagé (affiché, comparé, débité)
     · `fraction`   la fraction de pot (identité d'un sizing candidat)
     · `ev`         les EV et pertes d'EV
   `betStepBb` est le pas de mise de la table ; 0 = pas de quantification (le
   solveur travaille en continu). Le Trainer, lui, impose 0.5bb. */
export const DEFAULT_ROUNDING = Object.freeze({
  amountDecimals: 3,
  fractionDecimals: 4,
  evDecimals: 4,
  betStepBb: 0,
});

/* ── ÉTATS D'UN SOLVE (§22) ────────────────────────────────────────────────
   Un solve échoué ne renvoie JAMAIS une stratégie approximative en silence. */
export const SolveStatus = Object.freeze({
  QUEUED: "QUEUED",
  SOLVING: "SOLVING",
  OPTIMIZING_SIZINGS: "OPTIMIZING_SIZINGS",
  FINAL_SOLVE: "FINAL_SOLVE",
  COMPLETE: "COMPLETE",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});
export const TERMINAL_STATUSES = Object.freeze(["COMPLETE", "PARTIAL", "FAILED", "CANCELLED"]);
/* Seul COMPLETE autorise à présenter la solution sans réserve. PARTIAL est
   utilisable mais doit être annoncé ; les autres ne produisent aucune stratégie. */
export function statusYieldsStrategy(status) {
  return status === SolveStatus.COMPLETE || status === SolveStatus.PARTIAL;
}

/* ── MODÈLE D'ÉVALUATION (§55) ─────────────────────────────────────────────
   Une solution ChipEV ne peut jamais être re-badgée ICM. */
export const EvaluationModel = Object.freeze({
  CHIP_EV: "CHIP_EV",
  ICM: "ICM",
  PKO: "PKO",
});

/* ── CONFIGURATION DE TABLE (§56) ──────────────────────────────────────────
   Un mode n'est activable que si le moteur le supporte RÉELLEMENT. `supported`
   n'est pas un souhait : c'est ce que `core/gametree.js` sait construire. */
export const TableFormat = Object.freeze({ HU: "HU", THREE_WAY: "3WAY", MULTIWAY: "MULTIWAY" });
export const TABLE_FORMAT_SUPPORT = Object.freeze({
  HU: { supported: true, note: "Arbre postflop heads-up — seul format résolu par le moteur." },
  "3WAY": { supported: false, note: "Le Game Tree Engine ne construit pas d'arbre à 3 joueurs. Une solution HU ne sert PAS de vérité pour un spot 3-way." },
  MULTIWAY: { supported: false, note: "Non supporté par le moteur — voir LIMITATIONS.md." },
});

/* ── PROFIL DE CANDIDATS PAR DÉFAUT (§8) ───────────────────────────────────
   Ce ne sont PAS des recommandations : ce sont des ACTIONS CANDIDATES à
   évaluer. Aucune de ces valeurs n'est « la bonne taille » avant qu'un solve
   ne l'ait montré. */
export const DEFAULT_CANDIDATE_PROFILE = Object.freeze({
  /* fractions de pot proposées à l'évaluation, postflop */
  potFractions: Object.freeze([0.20, 0.25, 0.33, 0.50, 0.66, 0.75, 1.00, 1.25, 1.50, 2.00]),
  /* multiples de la mise affrontée, pour les relances */
  raiseMultiples: Object.freeze([2.0, 2.2, 2.5, 3.0, 3.5]),
  /* multiples de la grosse blinde, pour les ouvertures préflop */
  openMultiples: Object.freeze([2.0, 2.2, 2.5, 3.0, 3.5, 4.0]),
  /* sizing géométrique amenant au tapis en N rues */
  geometric: true,
  /* action all-in explicite */
  jam: true,
});

/* ── FEATURE FLAG (§81) ────────────────────────────────────────────────────
   Le flag sert au DÉPLOIEMENT, pas à masquer du code inachevé. Il est lu ici et
   nulle part ailleurs. Par défaut activé ; désactivable par
   `localStorage.pf_flag_adaptiveSizingEngine = "0"` ou
   `globalThis.__PF_FLAGS__.adaptiveSizingEngine = false`. */
export const FEATURE_FLAG = "adaptiveSizingEngine";
export function adaptiveSizingEnabled() {
  try {
    const g = globalThis && globalThis.__PF_FLAGS__;
    if (g && Object.prototype.hasOwnProperty.call(g, FEATURE_FLAG)) return !!g[FEATURE_FLAG];
  } catch { /* environnement sans globalThis exploitable */ }
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem("pf_flag_" + FEATURE_FLAG);
      if (v === "0" || v === "false") return false;
      if (v === "1" || v === "true") return true;
    }
  } catch { /* stockage bloqué */ }
  return true;
}

/* ── INSTRUMENTATION (§57) ─────────────────────────────────────────────────
   Traces en développement, silence en production. Le test de « développement »
   ne dépend pas d'un bundler : il regarde un drapeau explicite. */
export function debugEnabled() {
  try {
    const g = globalThis && globalThis.__PF_FLAGS__;
    if (g && g.sizingDebug) return true;
  } catch { /* noop */ }
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem("pf_sizing_debug") === "1";
  } catch { /* noop */ }
  return false;
}

/* Fusionne une config partielle sur un défaut gelé, sans muter le défaut. */
export function withDefaults(defaults, override) {
  if (!override) return { ...defaults };
  const out = { ...defaults };
  for (const k of Object.keys(override)) if (override[k] !== undefined) out[k] = override[k];
  return out;
}
