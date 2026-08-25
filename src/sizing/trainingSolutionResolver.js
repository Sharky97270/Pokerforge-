/* ══════════════════════════════════════════════════════════════════════════
   PFASE · TRAINING SOLUTION RESOLVER (Mission §29, §30, §41, §90, §91)

   « Le Trainer ne choisit PAS les sizings. Le Trainer consomme une
   TrainingSolution. » (§29)

   Ce module est le seul chemin autorisé entre un spot d'entraînement et une
   solution. Il répond à trois questions, dans cet ordre :

     1. Existe-t-il une solution VÉRIFIÉE pour cet état exact ?
     2. Sinon, existe-t-il une solution du même état à un AUTRE niveau de
        complexité, que l'on puisse proposer explicitement ?
     3. Sinon : aucune. On le dit (§90), on n'invente rien.

   ── POURQUOI PAS DE « BOARD LE PLUS PROCHE » ───────────────────────────────
   §30 l'interdit explicitement : « Ne pas faire un simple nearest board. » La
   raison est stratégique, pas informatique : deux flops d'apparence voisine
   (A♠7♦2♣ et A♠7♦2♠) n'ont pas la même stratégie, parce que la structure de
   couleur change les tirages, donc les fréquences de mise. Servir l'un pour
   l'autre produirait un entraînement faux — et invisible, puisque l'écran
   afficherait un badge de solution calculée.

   Ce qui EST comparé, en revanche, est vérifié champ par champ, et tout écart
   est rapporté (`compatibility.mismatches`). Une solution approximative reste
   utilisable si l'utilisateur la demande, mais elle porte alors la provenance
   APPROXIMATION et ne peut plus revendiquer de badge calculé (§91).

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { SizingComplexity, SIZING_COMPLEXITIES, SolveStatus, statusYieldsStrategy, EvaluationModel } from "./config.js";
import { gameStateHash } from "./canonicalHash.js";
import { getSolution, solutionFamily, complexitiesFor } from "./solutionStore.js";
import { SolutionProvenance, mayClaimSolved } from "./solutionSchema.js";

/* Résultats possibles — un vocabulaire fermé, pour que l'UI ne bricole pas. */
export const ResolutionOutcome = Object.freeze({
  EXACT: "EXACT",                       // solution du niveau demandé, état exact
  OTHER_COMPLEXITY: "OTHER_COMPLEXITY", // même état, autre niveau (proposé, pas substitué)
  NONE: "NONE",                         // aucune solution — §90
  UNSUPPORTED: "UNSUPPORTED",           // l'état sort du domaine du moteur (§56)
});

/* Ordre de repli entre niveaux : du plus riche au plus simple. On ne « monte »
   jamais tout seul vers un niveau plus complexe que celui demandé sans le dire,
   et on ne descend jamais non plus : les deux sont PROPOSÉS. */
const FALLBACK_ORDER = Object.freeze({
  SINGLE: ["SINGLE", "SIMPLE", "ADVANCED", "FULL"],
  SIMPLE: ["SIMPLE", "ADVANCED", "FULL", "SINGLE"],
  ADVANCED: ["ADVANCED", "FULL", "SIMPLE", "SINGLE"],
  FULL: ["FULL", "ADVANCED", "SIMPLE", "SINGLE"],
});

/* ══════════════════════════════════════════════════════════════════════════
   resolveTrainingSolution

   {
     state,                    // état canonique (gameState.js)
     heroRange, villainRange,  // les ranges du spot — elles entrent dans le hash
     studySpec,                // arbre de candidats de l'étude (même pour les 4 niveaux)
     solverConfig,             // précision du solve final
     complexity,               // niveau demandé
     trainingMode,             // "gto" | "exploit" (§44)
     allowOtherComplexity,     // proposer un autre niveau du même état
   }

   Sortie :
   {
     outcome, solution|null, complexity, requestedComplexity,
     available:[…], compatibility:{ ok, mismatches[] },
     provenance, mayClaimSolved, actions:[…]   // options §90
   }
   ══════════════════════════════════════════════════════════════════════════ */
export function resolveTrainingSolution({
  state, heroRange, villainRange, studySpec, solverConfig,
  complexity = SizingComplexity.SIMPLE,
  trainingMode = "gto",
  allowOtherComplexity = true,
} = {}) {
  const requested = SIZING_COMPLEXITIES.includes(complexity) ? complexity : SizingComplexity.SIMPLE;

  /* ── Domaine du moteur (§56) — une solution HU n'est PAS une vérité 3-way ── */
  const support = supportCheck(state);
  if (!support.ok) {
    return {
      outcome: ResolutionOutcome.UNSUPPORTED,
      solution: null, complexity: requested, requestedComplexity: requested,
      available: [], compatibility: { ok: false, mismatches: support.reasons },
      provenance: null, mayClaimSolved: false,
      reason: support.reasons[0],
      actions: offeredActions({ canSolve: false }),
    };
  }

  const { hash } = gameStateHash({
    state, heroRange, villainRanges: [villainRange],
    treeSpec: studySpec, solverConfig,
  });

  const available = complexitiesFor(hash);
  const exact = getSolution(hash, requested);
  if (exact && usable(exact)) {
    const compat = compatibilityReport(exact, { state, trainingMode });
    return {
      outcome: ResolutionOutcome.EXACT,
      solution: exact, gameStateHash: hash,
      complexity: requested, requestedComplexity: requested,
      available, compatibility: compat,
      provenance: exact.source, mayClaimSolved: mayClaimSolved(exact) && compat.ok,
      actions: [],
    };
  }

  if (allowOtherComplexity) {
    for (const c of (FALLBACK_ORDER[requested] || SIZING_COMPLEXITIES)) {
      if (c === requested) continue;
      const alt = getSolution(hash, c);
      if (alt && usable(alt)) {
        const compat = compatibilityReport(alt, { state, trainingMode });
        return {
          outcome: ResolutionOutcome.OTHER_COMPLEXITY,
          solution: alt, gameStateHash: hash,
          complexity: c, requestedComplexity: requested,
          available, compatibility: compat,
          provenance: alt.source, mayClaimSolved: mayClaimSolved(alt) && compat.ok,
          /* Le niveau servi n'est PAS celui demandé : on le dit, on ne le
             substitue pas en silence. L'écran doit afficher le niveau réel. */
          reason: `aucune solution ${requested} pour cet état — solution ${c} disponible pour le MÊME état`,
          actions: offeredActions({ canSolve: true, requested }),
        };
      }
    }
  }

  return {
    outcome: ResolutionOutcome.NONE,
    solution: null, gameStateHash: hash,
    complexity: requested, requestedComplexity: requested,
    available, compatibility: { ok: false, mismatches: ["aucune solution stockée pour cet état"] },
    provenance: null, mayClaimSolved: false,
    reason: "No verified solution available",
    actions: offeredActions({ canSolve: true, requested }),
  };
}

/* §90 — quand il n'y a pas de solution, on propose des SUITES, pas un repli. */
function offeredActions({ canSolve, requested }) {
  const out = [];
  if (canSolve) out.push({ id: "SOLVE_SPOT", label: "Résoudre ce spot", detail: requested ? `produire la solution ${requested}` : null });
  out.push({ id: "APPROXIMATE_TRAINING", label: "Entraînement approximatif", detail: "source APPROXIMATE — jamais présentée comme GTO (§91)" });
  out.push({ id: "CHANGE_SETTINGS", label: "Changer les réglages", detail: "autre niveau de complexité, autre spot" });
  return out;
}

function usable(sol) {
  return !!sol && statusYieldsStrategy(sol.status) && !!sol.strategy && !!sol.strategy.nodes;
}

/* Le moteur sait-il RÉELLEMENT traiter cet état ? (§56) */
function supportCheck(state) {
  const reasons = [];
  if (!state) return { ok: false, reasons: ["état de jeu absent"] };
  const live = (state.players || []).filter(p => !p.folded);
  if (live.length !== 2) {
    reasons.push(`le moteur ne construit qu'un arbre heads-up — ${live.length} joueurs encore dans le coup (une solution HU ne sert PAS de vérité pour un spot multiway)`);
  }
  if (state.street === "PREFLOP") {
    reasons.push("PFASE résout le postflop ; le préflop passe par le moteur push/fold et les charts");
  }
  return { ok: reasons.length === 0, reasons };
}

/* ══════════════════════════════════════════════════════════════════════════
   compatibilityReport (§30) — la solution décrit-elle CE spot ?

   Le hash garantit déjà l'identité de l'état ; ce rapport couvre ce que le hash
   ne peut pas couvrir : le mode d'entraînement (§44) et le modèle d'évaluation
   (§55), qui vivent à côté de la solution et non dedans.
   ══════════════════════════════════════════════════════════════════════════ */
export function compatibilityReport(sol, { state, trainingMode = "gto" } = {}) {
  const mismatches = [];
  if (!sol) return { ok: false, mismatches: ["solution absente"] };

  if (state) {
    if (sol.street !== state.street) mismatches.push(`rue : solution ${sol.street}, spot ${state.street}`);
    const solBoard = (sol.board || []).join("");
    const spotBoard = (state.boardKeys || []).join("");
    if (solBoard !== spotBoard) mismatches.push(`board : solution ${solBoard}, spot ${spotBoard}`);
    if (Math.abs((sol.pot ?? 0) - (state.pot ?? 0)) > 1e-3) mismatches.push(`pot : solution ${sol.pot}, spot ${state.pot}`);
    if (Math.abs((sol.effectiveStacks ?? 0) - (state.effectiveStack ?? 0)) > 1e-3) {
      mismatches.push(`tapis effectif : solution ${sol.effectiveStacks}, spot ${state.effectiveStack}`);
    }
    if (sol.evaluationModel !== state.evaluationModel) {
      mismatches.push(`modèle d'évaluation : solution ${sol.evaluationModel}, spot ${state.evaluationModel} — une solution ChipEV n'est jamais re-badgée ICM (§55)`);
    }
  }

  /* §44 — GTO et Exploit sont deux solutions DISTINCTES, sous le même label ce
     serait un mensonge. Une solution d'exploit porte `exploit` ; l'absence de ce
     champ vaut GTO. */
  const solMode = sol.exploit ? "exploit" : "gto";
  if (solMode !== trainingMode) {
    mismatches.push(`mode : solution ${solMode}, entraînement ${trainingMode} — les sizings exploitants ne remplacent pas les sizings GTO sous le même label (§44)`);
  }

  return { ok: mismatches.length === 0, mismatches };
}

/* ══════════════════════════════════════════════════════════════════════════
   describeAvailability — ce que l'écran affiche quand il n'y a rien, ou
   quand plusieurs niveaux coexistent (§28/§110).
   ══════════════════════════════════════════════════════════════════════════ */
export function describeAvailability(hash) {
  const fam = solutionFamily(hash);
  if (!fam.length) return { any: false, levels: [], note: "No verified solution available" };
  return {
    any: true,
    levels: fam.map(s => ({
      complexity: s.sizingComplexity,
      sizings: (s.selectedSizes?.bets || []).map(b => b.label),
      evLossBb: s.simplificationMetrics ? s.simplificationMetrics.absoluteEVLoss : null,
      distinguishable: s.distinguishable !== false,
      status: s.status,
      badge: s.provenanceMeta ? s.provenanceMeta.badge : null,
    })),
    note: null,
  };
}

/* §41 — préréglage pédagogique par défaut selon le nombre de tables.
   « Mais ne pas modifier silencieusement un choix explicitement sauvegardé par
   l'utilisateur. » La fonction rend donc une SUGGESTION, et l'appelant décide :
   elle ne lit ni n'écrit aucune préférence. */
export function suggestedComplexityFor(tableCount, { userChoice = null } = {}) {
  if (userChoice && SIZING_COMPLEXITIES.includes(userChoice)) {
    return { complexity: userChoice, suggested: false, reason: "choix explicite de l'utilisateur — respecté tel quel" };
  }
  const n = Number(tableCount) || 1;
  if (n >= 3) {
    return {
      complexity: SizingComplexity.SINGLE, suggested: true,
      reason: `${n} tables : Single Size proposé par défaut (charge de décision réduite). Modifiable à tout moment.`,
    };
  }
  return { complexity: SizingComplexity.SIMPLE, suggested: true, reason: "1 à 2 tables : Simple proposé par défaut." };
}
