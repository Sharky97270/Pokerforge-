/* ══════════════════════════════════════════════════════════════════════════
   PFASE · SCHÉMA DE SOLUTION ET PROVENANCE (Mission §17, §18, §21, §22, §55, §80)

   Une PFSolution est un objet PLAIN DATA, clonable (structured clone), qui
   contient TOUT ce qu'il faut pour :
     · rejouer la solution sans le solveur (Trainer, Replayer, Coach) ;
     · savoir d'où elle vient et à quel point elle est fiable (§18) ;
     · savoir si le moteur qui l'a produite est encore le moteur courant (§80) ;
     · la reproduire à l'identique (graine, config, hash canonique — §19).

   RÈGLE §18 : la provenance n'est pas un badge décoratif. `APPROXIMATION` ne
   peut JAMAIS porter la mention « GTO vérifié ». Le champ est donc calculé, pas
   choisi : `deriveProvenance` le dérive du chemin qui a produit la solution.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  SIZING_ENGINE_VERSION, SOLUTION_SCHEMA_VERSION, SOLVER_VERSION,
  SolveStatus, EvaluationModel, statusYieldsStrategy,
} from "./config.js";
import { specKey, specLabel } from "./sizingSpec.js";

/* ── PROVENANCE (§18) ────────────────────────────────────────────────────── */
export const SolutionProvenance = Object.freeze({
  POKERFORGE_SOLVER: "POKERFORGE_SOLVER",   // résolue ici, maintenant, par SharkSolver
  POKERFORGE_DATABASE: "POKERFORGE_DATABASE", // relue depuis le Solution Store
  VERIFIED_IMPORT: "VERIFIED_IMPORT",       // importée d'une source vérifiée (§84)
  APPROXIMATION: "APPROXIMATION",           // estimation — JAMAIS un badge GTO
});

export const PROVENANCE_META = Object.freeze({
  POKERFORGE_SOLVER: { badge: "PF SOLVED", label: "Résolu par PokerForge", color: "#34B4FF", gtoClaim: true },
  POKERFORGE_DATABASE: { badge: "PF VERIFIED DB", label: "Bibliothèque PokerForge", color: "#9B5CFF", gtoClaim: true },
  VERIFIED_IMPORT: { badge: "IMPORTED SOLUTION", label: "Solution importée vérifiée", color: "#10D87A", gtoClaim: true },
  APPROXIMATION: { badge: "APPROXIMATE", label: "Approximation — non résolue", color: "#FF5D6C", gtoClaim: false },
});

/* Une solution peut-elle être présentée comme une stratégie calculée ?
   Deux conditions CUMULATIVES : une provenance qui l'autorise, ET un statut qui
   a réellement produit une stratégie. Une provenance « solveur » sur un solve
   FAILED ne vaut rien. */
export function mayClaimSolved(solution) {
  if (!solution) return false;
  const meta = PROVENANCE_META[solution.source];
  return !!(meta && meta.gtoClaim && statusYieldsStrategy(solution.status));
}

/* La provenance est DÉRIVÉE, jamais passée à la main. */
export function deriveProvenance({ solvedNow, fromStore, imported, approximate }) {
  if (approximate) return SolutionProvenance.APPROXIMATION;
  if (imported) return SolutionProvenance.VERIFIED_IMPORT;
  if (fromStore) return SolutionProvenance.POKERFORGE_DATABASE;
  if (solvedNow) return SolutionProvenance.POKERFORGE_SOLVER;
  return SolutionProvenance.APPROXIMATION;
}

const specSummary = (specs) => (specs || []).map(s => ({ key: specKey(s), label: specLabel(s), spec: s }));

/* ══════════════════════════════════════════════════════════════════════════
   buildSolution — assemble une PFSolution conforme au §17.
   ══════════════════════════════════════════════════════════════════════════ */
export function buildSolution({
  solutionId, gameStateHash, canonical,
  state, heroRange, villainRanges,
  mode, complexity,
  candidates, selectedBetSpecs, selectedRaiseSpecs, referenceBetSpecs, referenceRaiseSpecs,
  treeSpec, strategy, metrics, actionRanking,
  convergence, status, partialReasons, provenance,
  evaluationConfig, finalSolveConfig, instrumentation,
  optimizeFor, noise, plannerReport, solveId, seed,
} = {}) {
  const now = Date.now();
  return {
    /* ── Identité et versions (§17, §80) ── */
    solutionId,
    gameStateHash,
    schemaVersion: SOLUTION_SCHEMA_VERSION,
    sizingEngineVersion: SIZING_ENGINE_VERSION,
    solverVersion: SOLVER_VERSION,
    solverEngine: "sharksolver/core/multistreet (CFR+)",
    /* La chaîne canonique complète — c'est elle qui rend le hash VÉRIFIABLE :
       on peut recalculer le hash et constater qu'il correspond (§19). */
    canonical: canonical || null,

    /* ── État de jeu (§17) ── */
    gameType: state?.gameType || null,
    format: state?.format || null,
    tableFormat: state?.tableFormat || null,
    players: (state?.players || []).map(p => ({
      position: p.position, stack: p.stack,
      committedStreet: p.committedStreet, committedTotal: p.committedTotal,
      folded: p.folded, allIn: p.allIn, isHero: p.isHero,
    })),
    positions: (state?.players || []).map(p => p.position),
    effectiveStacks: state?.effectiveStack ?? null,
    pot: state?.pot ?? null,
    spr: state?.spr ?? null,
    street: state?.street || null,
    board: state?.boardKeys || [],
    actionHistory: state?.actionHistory || [],
    heroRange: heroRange || null,
    villainRanges: villainRanges || [],
    rake: state?.rake || null,
    antes: state?.ante ?? 0,
    blinds: state?.blinds || null,
    potType: derivePotType(state),
    evaluationModel: state?.evaluationModel || EvaluationModel.CHIP_EV,
    icmParams: state?.icmParams || null,
    pkoParams: state?.pkoParams || null,

    /* ── Arbre et sizings (§17) ── */
    sizingMode: mode,
    sizingComplexity: complexity,
    candidateSizes: {
      bets: specSummary((candidates?.bets || []).map(c => c.spec)),
      raises: specSummary((candidates?.raises || []).map(c => c.spec)),
      dropped: candidates?.dropped || [],
    },
    selectedSizes: {
      bets: specSummary(selectedBetSpecs),
      raises: specSummary(selectedRaiseSpecs),
    },
    referenceSizes: {
      bets: specSummary(referenceBetSpecs),
      raises: specSummary(referenceRaiseSpecs),
    },
    bettingTree: treeSpec || null,

    /* ── Stratégie (§17) ── */
    strategy: strategy || null,
    /* `frequencies` est une VUE de la stratégie racine : les consommateurs
       simples (badges, résumés) n'ont pas à traverser l'arbre. */
    frequencies: strategy && strategy.nodes && strategy.nodes[""] ? strategy.nodes[""].aggregate : null,
    ev: metrics ? metrics.simplifiedEV : null,
    optimizeFor: optimizeFor ?? 0,

    /* ── Métriques de simplification (§14) ── */
    simplificationMetrics: metrics || null,
    /* Écart d'EV entre sizings (§15) — pour le Coach. */
    actionRanking: actionRanking || null,
    /* Plancher de mesure : en deçà, aucune différence n'est affirmable (§14/§21). */
    measurement: noise || null,
    planner: plannerReport || null,

    /* ── Convergence et statut (§21, §22) ── */
    convergence: convergence || null,
    accuracy: convergence
      ? {
        exact: convergence.nashConv != null,
        metric: convergence.nashConv != null ? "NashConv (bb)" : null,
        value: convergence.nashConv ?? null,
        note: convergence.note || null,
        iterations: convergence.iterations ?? null,
        sampled: !!convergence.sampled,
      }
      : null,
    status: status || SolveStatus.COMPLETE,
    partialReasons: partialReasons || [],

    /* ── Reproductibilité (§15/§19) ── */
    seed: seed ?? null,
    solveId: solveId ?? null,
    evaluationConfig: evaluationConfig || null,
    finalSolveConfig: finalSolveConfig || null,
    instrumentation: instrumentation || null,

    /* ── Provenance (§18) ── */
    source: provenance || SolutionProvenance.APPROXIMATION,
    provenanceMeta: PROVENANCE_META[provenance || SolutionProvenance.APPROXIMATION],

    createdAt: now,
    updatedAt: now,
  };
}

/* Type de pot, DÉRIVÉ de l'historique d'actions — jamais deviné d'après la
   taille du pot seule (l'heuristique « pot ≥ 12bb ⇒ 3-bet » de
   `trainerPostflopSolver.potKind` se trompe dès que les blindes changent). */
export function derivePotType(state) {
  const hist = state?.actionHistory || [];
  const raises = hist.filter(a => a.actionType === "RAISE" || a.actionType === "BET").length;
  if (!hist.length) return "UNKNOWN";
  if (raises >= 4) return "5BP";
  if (raises === 3) return "4BP";
  if (raises === 2) return "3BP";
  if (raises === 1) return "SRP";
  return "LIMP";
}

/* ══════════════════════════════════════════════════════════════════════════
   validateSolution — refuse une solution incohérente AVANT stockage (§92).
   Retourne { ok, problems }. Une solution invalide n'est jamais servie.
   ══════════════════════════════════════════════════════════════════════════ */
export function validateSolution(sol) {
  const problems = [];
  if (!sol) return { ok: false, problems: ["solution absente"] };
  if (!sol.solutionId) problems.push("solutionId manquant");
  if (!sol.gameStateHash) problems.push("gameStateHash manquant");
  if (sol.schemaVersion !== SOLUTION_SCHEMA_VERSION) problems.push(`schemaVersion ${sol.schemaVersion} ≠ ${SOLUTION_SCHEMA_VERSION}`);
  if (!Object.values(SolutionProvenance).includes(sol.source)) problems.push(`provenance inconnue : ${sol.source}`);
  if (!Object.values(SolveStatus).includes(sol.status)) problems.push(`statut inconnu : ${sol.status}`);
  if (statusYieldsStrategy(sol.status)) {
    if (!sol.strategy || !sol.strategy.nodes || !Object.keys(sol.strategy.nodes).length) {
      problems.push("statut annonce une stratégie mais `strategy` est vide");
    }
    if (!sol.selectedSizes || !sol.selectedSizes.bets || !sol.selectedSizes.bets.length) {
      problems.push("aucun sizing retenu alors que le statut annonce une solution");
    }
  }
  /* §93 — les distributions doivent sommer à 1. Une solution qui ne le fait pas
     n'est pas « presque bonne » : elle est fausse. */
  if (sol.strategy && sol.strategy.nodes) {
    for (const [path, n] of Object.entries(sol.strategy.nodes)) {
      if (n.normalization && !n.normalization.ok) {
        problems.push(`nœud « ${path || "racine"} » : ${n.normalization.problems.join(", ")}`);
      }
    }
  }
  /* §55 — un modèle d'évaluation sans ses paramètres est un badge mensonger. */
  if (sol.evaluationModel === EvaluationModel.ICM && !sol.icmParams) problems.push("badge ICM sans paramètres ICM");
  if (sol.evaluationModel === EvaluationModel.PKO && !sol.pkoParams) problems.push("badge PKO sans paramètres PKO");
  return { ok: problems.length === 0, problems };
}

/* Une solution est-elle produite par le moteur COURANT ? (§80)
   Sert à l'invalidation : une solution d'un moteur antérieur est relue mais
   marquée périmée — jamais servie comme si elle était à jour. */
export function isCurrentEngine(sol) {
  return !!sol
    && sol.schemaVersion === SOLUTION_SCHEMA_VERSION
    && sol.sizingEngineVersion === SIZING_ENGINE_VERSION
    && sol.solverVersion === SOLVER_VERSION;
}
export function stalenessOf(sol) {
  if (!sol) return ["solution absente"];
  const out = [];
  if (sol.schemaVersion !== SOLUTION_SCHEMA_VERSION) out.push(`schéma ${sol.schemaVersion} → ${SOLUTION_SCHEMA_VERSION}`);
  if (sol.sizingEngineVersion !== SIZING_ENGINE_VERSION) out.push(`moteur de sizing ${sol.sizingEngineVersion} → ${SIZING_ENGINE_VERSION}`);
  if (sol.solverVersion !== SOLVER_VERSION) out.push(`solveur ${sol.solverVersion} → ${SOLVER_VERSION}`);
  return out;
}
