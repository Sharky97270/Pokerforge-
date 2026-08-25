/* ══════════════════════════════════════════════════════════════════════════
   PFASE · CE QUE LE MOTEUR SAIT FAIRE, CAPACITÉ PAR CAPACITÉ (§7 · §56 · §77)

   Jusqu'ici une seule question était posée à l'état — « le moteur sait-il le
   traiter ? » — et une seule réponse rendue. Sur un spot à trois joueurs, cette
   réponse était « non », et le motif disait : le moteur ne construit qu'un arbre
   heads-up.

   C'était vrai, et c'était trompeur. PokerForge sait parfaitement construire et
   régler un pot à trois joueurs : `potDistribution.js` empile les paliers,
   attribue main pot et side pots, rend la mise non suivie, gère les joueurs
   couchés qui ont contribué, et conserve les jetons au demi-blind près. Le
   Trainer joue des coups multiway avec side pots depuis longtemps.

   Ce que PokerForge ne sait PAS faire, c'est RÉSOUDRE la stratégie de ce spot :
   `buildPostflopTree` a deux camps, `solveTree` a deux tables de regret.

   Ces deux choses n'ont aucune raison d'être annoncées ensemble. Répondre « non »
   à tout laisse croire que le moteur ne sait pas compter un side pot ; répondre
   « oui » à tout laisserait croire qu'il en connaît la stratégie. On répond donc
   capacité par capacité, et chaque réponse porte son motif.

   ── RÈGLE QUI NE DOIT PAS BOUGER ────────────────────────────────────────────
   Un niveau n'est jamais choisi : il est DÉRIVÉ de l'état. Aucun appelant ne
   peut promouvoir `UNSUPPORTED` en `SUPPORTED`, et `EXACT` ne se dit que d'un
   calcul dont l'exactitude est vérifiée par un test.
   ══════════════════════════════════════════════════════════════════════════ */

/* Du plus fort au plus faible. L'ordre compte : `weakestOf` s'en sert. */
export const CapabilityLevel = Object.freeze({
  /* Le résultat est exact au sens arithmétique, pas approché. */
  EXACT: "EXACT",
  /* Le moteur traite le cas, avec la précision qu'il annonce par ailleurs. */
  SUPPORTED: "SUPPORTED",
  /* Il en traite une partie, et dit laquelle. */
  PARTIAL: "PARTIAL",
  /* Il ne le traite pas. Aucun résultat ne doit être produit. */
  UNSUPPORTED: "UNSUPPORTED",
});

const RANK = { EXACT: 3, SUPPORTED: 2, PARTIAL: 1, UNSUPPORTED: 0 };
export function weakestOf(...levels) {
  let out = CapabilityLevel.EXACT;
  for (const l of levels) if ((RANK[l] ?? 0) < (RANK[out] ?? 0)) out = l;
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   describeCapabilities — la matrice, pour UN état donné
   ══════════════════════════════════════════════════════════════════════════ */
export function describeCapabilities(state) {
  if (!state) {
    return {
      ok: false,
      reason: "état absent",
      potAccounting: { level: CapabilityLevel.UNSUPPORTED, reason: "état absent" },
      strategicSolving: { level: CapabilityLevel.UNSUPPORTED, reason: "état absent" },
    };
  }
  const live = (state.players || []).filter(p => !p.folded);
  const nLive = live.length;
  const nSeats = (state.players || []).length;
  const preflop = state.street === "PREFLOP";

  /* ── COMPTABILITÉ DU POT ──────────────────────────────────────────────────
     Exacte pour N joueurs. Ce n'est pas une déclaration d'intention : le calcul
     est fait par `potDistribution.js`, et `test-pot-distribution.mjs` (82
     assertions) plus `test-full-hand-multiway.mjs` (78) le vérifient, y compris
     la conservation des jetons et l'éligibilité par palier. */
  /* Une anomalie relevée par l état DÉGRADE la capacité. Sans ce lien, on
     annoncerait EXACT au-dessus d une structure dont l état dit lui-même
     qu elle ne se conserve pas — c est le genre de badge que le §18 interdit. */
  /* Seule une incohérence RÉELLE dégrade. Un écart d'arrondi entre deux
     précisions est mentionné, pas sanctionné : voir `quantized` dans gameState. */
  const anomalie = state.potStructure && state.potStructure.anomaly;
  const arrondi = state.potStructure && state.potStructure.quantized
    ? state.potStructure.quantizationNote : null;
  const potAccounting = anomalie
    ? { level: CapabilityLevel.PARTIAL,
        reason: `structure de pot calculée mais NON CONSERVÉE : ${anomalie}. Le plus souvent, l écart vient de la quantification au demi-blind du module de répartition, plus grossière que la précision de PFASE.`,
        module: "potDistribution.js", anomaly: anomalie,
        sidePots: state.potStructure ? Math.max(0, (state.potStructure.pots || []).length - 1) : 0 }
    : {
        level: CapabilityLevel.EXACT,
        reason: `paliers de contribution, pot principal et side pots calculés pour ${nSeats} siège(s) — conservation des jetons vérifiée` + (arrondi ? ` (${arrondi})` : ""),
        module: "potDistribution.js",
        sidePots: state.potStructure ? Math.max(0, (state.potStructure.pots || []).length - 1) : 0,
      };

  /* ── RÉSOLUTION STRATÉGIQUE ───────────────────────────────────────────────
     Deux camps câblés dans l'arbre et dans les tables de regret. Un troisième
     joueur ne se règle pas : il change la structure. */
  const raisonsStrat = [];
  if (nLive !== 2) {
    raisonsStrat.push(`${nLive} joueurs encore dans le coup — l'arbre CFR a deux camps ; une solution heads-up ne vaut PAS comme vérité sur un spot multiway`);
  }
  if (preflop) {
    raisonsStrat.push("préflop : les montants sont construits mais non classés (l'EV d'une ouverture se réalise après le flop)");
  }
  const strategicSolving = raisonsStrat.length
    ? { level: CapabilityLevel.UNSUPPORTED, reason: raisonsStrat.join(" · "), reasons: raisonsStrat }
    : { level: CapabilityLevel.SUPPORTED, reason: "heads-up postflop : arbre construit et résolu par CFR+", reasons: [] };

  /* ── HORIZON DE VALEUR ────────────────────────────────────────────────────
     Combien de rues de mise le moteur peut porter depuis cet état. Dérivé, pas
     déclaré : c'est `streetsRemaining`, que le garde-fou mémoire peut réduire —
     auquel cas la solution le dit par `depthLimited`. */
  const valuation = {
    level: preflop ? CapabilityLevel.PARTIAL : CapabilityLevel.SUPPORTED,
    streetsAvailable: state.streetsRemaining ?? null,
    reason: preflop
      ? "au préflop, la continuation postflop n'est pas construite : la valeur d'une ouverture ne couvre pas ce qui la suit"
      : `jusqu'à ${state.streetsRemaining} rue(s) de mise valorisées depuis cette rue`,
  };

  /* ── MODÈLE D'ÉVALUATION ──────────────────────────────────────────────── */
  const modele = state.evaluationModel || "CHIP_EV";
  const evaluation = modele === "CHIP_EV"
    ? { level: CapabilityLevel.SUPPORTED, reason: "chip-EV" }
    : modele === "ICM"
      ? { level: CapabilityLevel.SUPPORTED, reason: "utilité ICM Malmuth-Harville injectée dans le CFR — le jeu n'est alors plus à somme nulle, NashConv devient indisponible" }
      : { level: CapabilityLevel.PARTIAL, reason: "PKO : la capture de prime est PARAMÉTRÉE (`realization`), pas modélisée" };

  return {
    ok: true,
    players: { seats: nSeats, live: nLive, heasdsUp: nLive === 2 },
    potAccounting,
    strategicSolving,
    valuation,
    evaluation,
    /* Le maillon faible gouverne ce qu'on a le droit d'annoncer globalement. */
    overall: weakestOf(strategicSolving.level, valuation.level, evaluation.level),
  };
}

/* Résumé d'une ligne par capacité — ce que l'écran doit pouvoir afficher sans
   avoir à interpréter quoi que ce soit. */
export function formatCapabilities(caps) {
  if (!caps || !caps.ok) return [`Capacités indisponibles${caps && caps.reason ? ` — ${caps.reason}` : ""}`];
  return [
    `Comptabilité du pot    : ${caps.potAccounting.level} — ${caps.potAccounting.reason}`,
    `Résolution stratégique : ${caps.strategicSolving.level} — ${caps.strategicSolving.reason}`,
    `Horizon de valeur      : ${caps.valuation.level} — ${caps.valuation.reason}`,
    `Modèle d'évaluation    : ${caps.evaluation.level} — ${caps.evaluation.reason}`,
  ];
}
