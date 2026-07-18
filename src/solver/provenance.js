/* ══════════════════════════════════════════════════════════════════════════
   POKERFORGE — SHARKSOLVER CORE · PROVENANCE DES RÉSULTATS
   Cahier des charges §6 (ResultSource), §11/§37 (RangeSource), §46 (panneau
   SOURCE DU RÉSULTAT), §52 (légende), §58 (interdits).

   RÈGLE ABSOLUE (§2) : « LE SOLVER CALCULE. L'IA EXPLIQUE. »
   Une heuristique ne doit JAMAIS être présentée comme un calcul GTO exact,
   un Monte-Carlo comme une énumération exacte, un Quick Node Lock comme un
   Solved Node Lock, un ICM/PKO estimé comme un solve exact.

   Le code couleur de PROVENANCE (ce fichier) est VOLONTAIREMENT DISTINCT du code
   couleur d'ACTION poker (Check/Bet/Raise/Fold). Ne jamais les confondre (§52/§58).
   Couleurs alignées sur la légende de la maquette validée.
════════════════════════════════════════════════════════════════════════════ */

/* ── Provenance d'un RÉSULTAT stratégique (fréquence, EV, équité…) ── */
export const ResultSource = {
  EXACT_CALCULATION: "EXACT_CALCULATION",       // énumération exhaustive, déterministe
  CFR_SOLVE: "CFR_SOLVE",                        // stratégie résolue par CFR+
  PRESOLVED_LIBRARY: "PRESOLVED_LIBRARY",        // solution pré-solvée chargée
  NUMERICAL_APPROXIMATION: "NUMERICAL_APPROXIMATION", // Monte-Carlo / sampling
  HEURISTIC_ESTIMATE: "HEURISTIC_ESTIMATE",      // estimation codée à la main
  AI_EXPLANATION: "AI_EXPLANATION",              // texte pédagogique (ne change aucun chiffre)
  NO_SOLUTION: "NO_SOLUTION",                    // aucune solution fiable
};

/* Métadonnées d'affichage. `color` = couleur de PROVENANCE (≠ couleur d'action). */
export const RESULT_SOURCE_META = {
  EXACT_CALCULATION:       { label: "Calcul exact",    short: "EXACT",  color: "#10D87A", glow: "rgba(16,216,122,.35)",  desc: "Énumération exhaustive — résultat déterministe, sans échantillonnage." },
  CFR_SOLVE:               { label: "CFR Solve",       short: "CFR",    color: "#34B4FF", glow: "rgba(52,180,255,.35)",  desc: "Stratégie résolue par CFR+ (regret matching, moyennage pondéré)." },
  PRESOLVED_LIBRARY:       { label: "Bibliothèque",    short: "LIB",    color: "#9B5CFF", glow: "rgba(155,92,255,.35)",  desc: "Solution pré-solvée chargée depuis la Shark Solution Library." },
  NUMERICAL_APPROXIMATION: { label: "Approximation",   short: "APPROX", color: "#FFB020", glow: "rgba(255,176,32,.35)",  desc: "Estimation numérique (Monte-Carlo) — comporte une marge d'erreur." },
  HEURISTIC_ESTIMATE:      { label: "Heuristique",     short: "HEUR",   color: "#FF5D6C", glow: "rgba(255,93,108,.32)",  desc: "Estimation heuristique — ce n'est PAS un solve GTO calculé." },
  AI_EXPLANATION:          { label: "Explication IA",  short: "IA",     color: "#8AA0C0", glow: "rgba(138,160,192,.3)",  desc: "Analyse pédagogique — n'invente ni ne modifie aucune valeur mathématique." },
  NO_SOLUTION:             { label: "Pas de solution", short: "—",      color: "#6A7690", glow: "rgba(106,118,144,.25)", desc: "Aucune solution fiable disponible pour ce spot." },
};

/* Ordre de la légende de provenance (bas d'écran, §52). */
export const RESULT_SOURCE_LEGEND = [
  ResultSource.EXACT_CALCULATION,
  ResultSource.CFR_SOLVE,
  ResultSource.NUMERICAL_APPROXIMATION,
  ResultSource.HEURISTIC_ESTIMATE,
  ResultSource.AI_EXPLANATION,
];

/* ── Provenance d'une RANGE (§11/§37) ── */
export const RangeSource = {
  PRESOLVED: "PRESOLVED",
  USER_DEFINED: "USER_DEFINED",
  IMPORTED: "IMPORTED",
  SOLVER_GENERATED: "SOLVER_GENERATED",
  HEURISTIC: "HEURISTIC",
};

export const RANGE_SOURCE_META = {
  PRESOLVED:        { label: "Pré-solvé",   short: "LIB",  color: "#9B5CFF" },
  USER_DEFINED:     { label: "Utilisateur", short: "USER", color: "#34B4FF" },
  IMPORTED:         { label: "Importé",     short: "IMP",  color: "#FFB020" },
  SOLVER_GENERATED: { label: "Solver",      short: "CFR",  color: "#10D87A" },
  HEURISTIC:        { label: "Heuristique", short: "HEUR", color: "#FF5D6C" },
};

/* ── Helpers ── */
export function resultMeta(src) {
  return RESULT_SOURCE_META[src] || RESULT_SOURCE_META.NO_SOLUTION;
}
export function rangeMeta(src) {
  return RANGE_SOURCE_META[src] || RANGE_SOURCE_META.HEURISTIC;
}

/* Vrai si la provenance correspond à un calcul fiable (≠ heuristique / no-solution).
   Sert à décider si l'on peut afficher « GTO » sans mentir. */
export function isCalculated(src) {
  return src === ResultSource.EXACT_CALCULATION
    || src === ResultSource.CFR_SOLVE
    || src === ResultSource.PRESOLVED_LIBRARY;
}
