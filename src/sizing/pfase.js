/* ══════════════════════════════════════════════════════════════════════════
   PFASE · API PUBLIQUE (Mission §13, §17, §34, §37, §50, §79, §90)

   L'unique surface que le Solver, le Trainer, le Replayer et le Coach doivent
   connaître. Rien d'autre du dossier `sizing/` n'est destiné à être importé
   directement par un composant.

     optimizeBettingTree(request)   → sélection des sizings (comparaison d'EV)
     solveOptimizedTree(request)    → pipeline complet + SOLVE FINAL + stockage
     getSolution(solutionId)        → relecture
     getTrainingNode(id, path, …)   → un nœud prêt pour des boutons
     compareAction(…)               → verdict sur une action jouée

   ── POURQUOI UN SOLVE FINAL SÉPARÉ (§13) ───────────────────────────────────
   Les micro-solves de sélection sont tronqués : profondeur bornée, abstraction
   de range, itérations réduites. Les prendre pour la solution reviendrait à
   livrer un brouillon. L'arbre retenu est donc RECONSTRUIT et RE-RÉSOLU à la
   précision de production avant d'être stocké.

   ── DEUX EV, DEUX QUESTIONS DIFFÉRENTES ────────────────────────────────────
   `simplificationMetrics` mesure le COÛT de la simplification : arbre restreint
   pour le joueur optimisé, adversaire intact. C'est la seule définition sous
   laquelle « perte d'EV » veut dire quelque chose, et elle est garantie ≥ 0.

   `finalEV` est l'EV de l'arbre simplifié SYMÉTRIQUE — le jeu contre lequel le
   Trainer fera réellement jouer. Ce n'est pas le même jeu que la référence ;
   comparer `finalEV` à `referenceEV` n'aurait pas de sens, et la solution le
   dit (`finalEVComparable:false`) plutôt que de laisser quelqu'un le faire.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  BettingTreeMode, SizingComplexity, SolveStatus, EvaluationModel,
  DEFAULT_FINAL_SOLVE_CONFIG, DEFAULT_EVALUATION_CONFIG, withDefaults,
  adaptiveSizingEnabled, statusYieldsStrategy,
} from "./config.js";
import { normalizeGameState, validateDataQuality, ActionType } from "./gameState.js";
import { gameStateHash, solutionId as makeSolutionId } from "./canonicalHash.js";
import { optimizeBettingTree, createEvaluationCache } from "./dynamicOptimizer.js";
import { solveTreeSpec } from "./solverAdapter.js";
import { extractStreetStrategy, nodeStrategyFor, legalActionsFromNode, pathKey } from "./strategyExtract.js";
import { simplificationMetrics, actionLoss } from "./metrics.js";
import { buildSolution, deriveProvenance, SolutionProvenance, validateSolution, mayClaimSolved } from "./solutionSchema.js";
import { saveSolution, getSolutionById, getSolution as storeGet, solutionFamily, complexitiesFor } from "./solutionStore.js";
import { roundAmount, roundEv, specKey, specLabel } from "./sizingSpec.js";
import { EPS } from "./config.js";

export {
  BettingTreeMode, SizingComplexity, SolveStatus, EvaluationModel,
  SolutionProvenance, ActionType,
  normalizeGameState, validateDataQuality, gameStateHash,
  optimizeBettingTree, createEvaluationCache,
  solutionFamily, complexitiesFor, mayClaimSolved,
};

/* ══════════════════════════════════════════════════════════════════════════
   solveOptimizedTree — LE PIPELINE COMPLET (§13, §108).

   {
     state | stateInput,          // état canonique, ou entrée à normaliser
     heroRange, villainRange,
     mode, complexity,
     userBetSpecs, userRaiseSpecs, candidateProfile,
     evaluationConfig, finalSolveConfig, budget,
     maxAcceptableEVLoss, optimizeFor,
     signal, onProgress, cache, persist
   }
   ══════════════════════════════════════════════════════════════════════════ */
export function solveOptimizedTree(request = {}) {
  const t0 = Date.now();
  const progress = (phase, d) => { try { request.onProgress && request.onProgress({ phase, ...d }); } catch { /* l'UI ne casse pas le moteur */ } };

  if (!adaptiveSizingEnabled()) {
    return { ok: false, status: SolveStatus.FAILED, reason: `moteur désactivé par le drapeau « adaptiveSizingEngine »` };
  }

  /* ── 1. ÉTAT CANONIQUE ─────────────────────────────────────────────────── */
  let state = request.state || null;
  if (!state) {
    const n = normalizeGameState(request.stateInput || {});
    if (!n.ok) return { ok: false, status: SolveStatus.FAILED, reason: "état de jeu invalide", problems: n.errors };
    state = n.state;
  }
  const { heroRange, villainRange } = request;
  const quality = validateDataQuality({ state, heroRange, villainRanges: [villainRange] });
  if (quality.length) {
    return { ok: false, status: SolveStatus.FAILED, reason: "qualité de donnée insuffisante", problems: quality };
  }

  const mode = request.mode || BettingTreeMode.AUTOMATIC;
  const complexity = mode === BettingTreeMode.SINGLE ? SizingComplexity.SINGLE
    : mode === BettingTreeMode.FIXED ? SizingComplexity.FULL
      : (request.complexity || SizingComplexity.SIMPLE);
  const optimizeFor = request.optimizeFor ?? 0;
  const evalCfg = withDefaults(DEFAULT_EVALUATION_CONFIG, request.evaluationConfig);
  const finalCfg = withDefaults(DEFAULT_FINAL_SOLVE_CONFIG, request.finalSolveConfig);

  /* ── 2. SÉLECTION DES SIZINGS (§9/§10) ─────────────────────────────────── */
  progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "sélection" });
  const opt = optimizeBettingTree({
    state, heroRange, villainRange, mode, complexity,
    userBetSpecs: request.userBetSpecs, userRaiseSpecs: request.userRaiseSpecs,
    candidateProfile: request.candidateProfile, budget: request.budget,
    evaluationConfig: evalCfg, optimizeFor,
    maxAcceptableEVLoss: request.maxAcceptableEVLoss,
    restrictPlayers: request.restrictPlayers,
    cache: request.cache, signal: request.signal, onProgress: request.onProgress,
    ...(request.solveFn ? { solveFn: request.solveFn } : {}),
  });
  if (!opt.ok) {
    return { ok: false, status: opt.status, reason: opt.reason, optimization: opt, elapsedMs: Date.now() - t0 };
  }

  /* ── 3. ARBRE FINAL + SOLVE FINAL (§13) ────────────────────────────────
     L'arbre final est SYMÉTRIQUE : les deux camps jouent les sizings retenus.
     C'est le jeu contre lequel le Trainer entraînera — d'où l'importance de ne
     PAS réutiliser l'arbre asymétrique de la phase de sélection. */
  progress(SolveStatus.FINAL_SOLVE, { step: "solve final" });
  const finalTreeSpec = {
    betSpecs: opt.selected.entry.betSpecs,
    raiseSpecs: opt.selected.entry.raiseSpecs,
    maxRaisesPerStreet: request.maxRaisesPerStreet ?? 1,
    ipProbe: request.ipProbe !== false,
    allowJam: opt.selected.entry.betSpecs.some(s => s.type === "jam")
      || opt.selected.entry.raiseSpecs.some(s => s.type === "jam"),
  };
  const finalSolve = (request.solveFn || solveTreeSpec)({
    state, heroRange, villainRange, treeSpec: finalTreeSpec,
    config: finalCfg, optimizeFor, signal: request.signal,
  });
  if (!finalSolve.ok) {
    return {
      ok: false, status: finalSolve.status,
      reason: `solve final échoué : ${finalSolve.reason}`,
      optimization: opt, elapsedMs: Date.now() - t0,
    };
  }

  /* ── 4. EXTRACTION DE STRATÉGIE ────────────────────────────────────────── */
  const strategy = extractStreetStrategy(finalSolve.solution);
  if (!strategy || !strategy.nodeCount) {
    return { ok: false, status: SolveStatus.FAILED, reason: "stratégie inexploitable après le solve final", optimization: opt };
  }

  /* ── 5. ÉCART D'EV ENTRE SIZINGS (§15) ─────────────────────────────────
     Sémantique EXACTE, à ne pas confondre avec « l'EV de l'action au nœud » :
     c'est l'EV du joueur optimisé S'IL SE LIMITAIT À CE SEUL SIZING, mesurée à
     l'étage 1, face à un adversaire disposant de tout l'arbre. C'est cette
     grandeur-là qui répond à « 33 % est proche, 150 % sacrifie davantage ». */
  const singleEvByKey = {};
  for (const e of opt.evaluations) {
    if (e.stage === 1 && e.dimension === "bet" && e.ok) singleEvByKey[e.betKeys[0]] = e.ev;
  }
  const ranking = actionLoss(singleEvByKey);

  /* ── 6. ASSEMBLAGE (§17/§18) ───────────────────────────────────────────── */
  /* ── LE HASH IDENTIFIE L'ÉTUDE, PAS LA SIMPLIFICATION (§28) ────────────
     « GAME STATE ├── FULL ├── ADVANCED ├── SIMPLE └── SINGLE » : les quatre
     niveaux doivent se ranger SOUS LE MÊME état. Si le hash incluait l'arbre
     RETENU (qui diffère par construction d'un niveau à l'autre), chaque niveau
     obtiendrait un hash distinct et la famille n'existerait jamais — on aurait
     quatre états isolés au lieu d'un état à quatre solutions.
     Le hash porte donc l'ENSEMBLE DES CANDIDATS explorés (identique pour les
     quatre) ; c'est `solutionId = hash#COMPLEXITY` qui les distingue. */
  const studySpec = {
    mode,
    betSizes: opt.reference.entry.betSpecs,
    raiseSizes: opt.reference.entry.raiseSpecs,
    maxRaisesPerStreet: finalTreeSpec.maxRaisesPerStreet,
    /* `allowJam` doit décrire l'ÉTUDE (les candidats explorés), pas la
       sélection : le jam figure parmi les candidats de tous les niveaux, mais
       n'est retenu que par certains. Le dériver de la sélection donnait un hash
       différent à FULL (qui retient le jam) et à SINGLE (qui ne le retient pas)
       — les deux sortaient alors de la famille l'un de l'autre. */
    allowJam: opt.reference.entry.betSpecs.some(s => s.type === "jam")
      || opt.reference.entry.raiseSpecs.some(s => s.type === "jam"),
    ipProbe: finalTreeSpec.ipProbe,
    streets: state.streetsRemaining,
  };
  const treeSpecForHash = {
    ...studySpec, complexity,
    /* L'arbre RÉELLEMENT résolu, conservé dans la solution (§17 « bettingTree »). */
    selectedBetSizes: finalTreeSpec.betSpecs,
    selectedRaiseSizes: finalTreeSpec.raiseSpecs,
  };
  const gh = gameStateHash({
    state, heroRange, villainRanges: [villainRange],
    treeSpec: studySpec, solverConfig: finalCfg,
  });
  const solId = makeSolutionId(gh.hash, complexity);

  const status = (opt.status === SolveStatus.PARTIAL || finalSolve.status === SolveStatus.PARTIAL)
    ? SolveStatus.PARTIAL : SolveStatus.COMPLETE;
  const partialReasons = [
    ...(finalSolve.partialReasons || []),
    ...(opt.reference.solve.partialReasons || []).map(r => `sélection : ${r}`),
  ];

  const solution = buildSolution({
    solutionId: solId, gameStateHash: gh.hash, canonical: gh.canonical,
    state, heroRange, villainRanges: [villainRange],
    mode, complexity,
    candidates: opt.candidates,
    selectedBetSpecs: opt.selected.entry.betSpecs,
    selectedRaiseSpecs: opt.selected.entry.raiseSpecs,
    referenceBetSpecs: opt.reference.entry.betSpecs,
    referenceRaiseSpecs: opt.reference.entry.raiseSpecs,
    treeSpec: treeSpecForHash,
    strategy,
    metrics: opt.selected.metrics,
    actionRanking: ranking,
    convergence: finalSolve.convergence,
    status, partialReasons,
    provenance: deriveProvenance({ solvedNow: true }),
    evaluationConfig: evalCfg, finalSolveConfig: finalCfg,
    instrumentation: { optimization: opt.instrumentation, finalSolve: finalSolve.instrumentation, totalMs: Date.now() - t0 },
    optimizeFor, noise: opt.noise, plannerReport: opt.planner,
    solveId: finalSolve.solveId, seed: finalSolve.seed,
  });

  /* Les deux EV, nommées, avec l'avertissement qui empêche de les confondre. */
  solution.finalEV = finalSolve.ev;
  solution.finalEVComparable = false;
  solution.finalEVNote = "EV de l'arbre simplifié SYMÉTRIQUE (les deux camps jouent les sizings retenus). Ce n'est pas le même jeu que l'arbre de référence : ne pas la comparer à `simplificationMetrics.referenceEV`. Le coût de la simplification est mesuré séparément, adversaire intact.";
  solution.equilibriumScope = finalSolve.equilibriumScope || null;
  solution.mayClaimNashApproximation = !!finalSolve.mayClaimNashApproximation;
  solution.abstraction = finalSolve.abstraction || null;
  solution.distinguishable = opt.selected.distinguishable;
  solution.tolerance = opt.tolerance;

  const v = validateSolution(solution);
  if (!v.ok) {
    return { ok: false, status: SolveStatus.FAILED, reason: "solution produite invalide", problems: v.problems, solution, optimization: opt };
  }
  if (request.persist !== false) saveSolution(solution);

  progress(status, { step: "terminé" });
  return {
    ok: true, status, solution, optimization: opt, finalSolve,
    elapsedMs: Date.now() - t0,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   solveSolutionFamily (§28, §110) — les quatre niveaux d'un même état.

   C'est l'écran final que la mission décrit :

       FULL     Check · 25 · 75 · 150      EV 18.420 bb
       SIMPLE   Check · 25 · 150           EV 18.411 bb   perte 0.009
       SINGLE   Check · 25                 EV 18.392 bb   perte 0.028

   Un CACHE D'ÉVALUATION PARTAGÉ traverse les quatre appels : les candidats et
   les micro-solves de l'étage 1 sont identiques d'un niveau à l'autre, donc
   calculés UNE fois. Sans ce partage, la famille coûterait quatre fois le prix
   d'un niveau ; avec, elle en coûte à peine plus qu'un et demi.
   ══════════════════════════════════════════════════════════════════════════ */
export function solveSolutionFamily(request = {}) {
  const levels = request.levels || [SizingComplexity.FULL, SizingComplexity.ADVANCED, SizingComplexity.SIMPLE, SizingComplexity.SINGLE];
  const cache = request.cache || createEvaluationCache();
  const results = [];
  let hash = null;
  for (const complexity of levels) {
    if (request.signal && request.signal.aborted) {
      return { ok: false, status: SolveStatus.CANCELLED, reason: "famille annulée", results, gameStateHash: hash };
    }
    const r = solveOptimizedTree({
      ...request,
      mode: request.mode || BettingTreeMode.AUTOMATIC,
      complexity,
      cache,
    });
    results.push({ complexity, ok: r.ok, status: r.status, reason: r.reason, solution: r.solution || null });
    if (r.ok && r.solution) hash = r.solution.gameStateHash;
  }
  const okCount = results.filter(r => r.ok).length;
  return {
    ok: okCount > 0,
    status: okCount === results.length ? SolveStatus.COMPLETE : okCount ? SolveStatus.PARTIAL : SolveStatus.FAILED,
    gameStateHash: hash,
    results,
    family: hash ? describeFamily(hash) : [],
    cacheStats: { hits: cache.stats.hits, misses: cache.stats.misses, size: cache.size() },
  };
}

/* ── Relecture ─────────────────────────────────────────────────────────── */
export function getSolution(solutionId, opts) { return getSolutionById(solutionId, opts); }
export function getSolutionFor(hash, complexity, opts) { return storeGet(hash, complexity, opts); }

/* ══════════════════════════════════════════════════════════════════════════
   getTrainingNode (§29/§31/§32/§33/§71)

   Rend le nœud demandé sous une forme directement consommable par des boutons.
   Les actions rendues sont EXACTEMENT celles de la solution — jamais une liste
   augmentée d'options « classiques ».
   ══════════════════════════════════════════════════════════════════════════ */
export function getTrainingNode(solutionOrId, path = [], { handClass = null } = {}) {
  const sol = typeof solutionOrId === "string" ? getSolutionById(solutionOrId) : solutionOrId;
  if (!sol) return { ok: false, reason: "solution introuvable" };
  if (!statusYieldsStrategy(sol.status)) {
    return { ok: false, reason: `solution de statut ${sol.status} — aucune stratégie exploitable` };
  }
  const entry = nodeStrategyFor(sol.strategy, path, handClass);
  if (!entry) {
    return {
      ok: false,
      reason: sol.strategy && sol.strategy.coversStreetsAhead === false && (path || []).length
        ? "nœud absent : cette solution ne couvre que la rue courante — re-résoudre au nouvel état (§38/§39)"
        : "nœud absent de la solution",
    };
  }
  const actions = legalActionsFromNode(entry.node).map(a => ({
    ...a,
    frequency: entry.freqs[a.label] ?? 0,
  }));
  return {
    ok: true,
    solutionId: sol.solutionId,
    path: path.slice(),
    pathKey: pathKey(path),
    player: entry.node.player,
    potBb: entry.node.potBb,
    toCallBb: entry.node.toCallBb,
    actions,
    frequencySource: entry.source,      // "hand-class" | "range-aggregate"
    frequencyNote: entry.note || null,
    provenance: sol.source,
    provenanceMeta: sol.provenanceMeta,
    status: sol.status,
    partialReasons: sol.partialReasons,
    complexity: sol.sizingComplexity,
    mode: sol.sizingMode,
    measurement: sol.measurement || null,
  };
}

/* Échantillonne une action selon les fréquences du nœud (§43).
   `rng` est INJECTABLE : les tests exigent des séquences reproductibles (§68).
   On échantillonne réellement — choisir systématiquement l'action majoritaire
   produirait un Vilain déterministe, donc exploitable, donc faux. */
export function sampleAction(node, rng = Math.random) {
  if (!node || !node.actions || !node.actions.length) return null;
  const total = node.actions.reduce((a, x) => a + Math.max(0, x.frequency || 0), 0);
  if (total <= 0) return node.actions[0];
  let r = rng() * total;
  for (const a of node.actions) {
    r -= Math.max(0, a.frequency || 0);
    if (r <= 0) return a;
  }
  return node.actions[node.actions.length - 1];
}

/* ══════════════════════════════════════════════════════════════════════════
   compareAction (§34, §37, §50) — le VERDICT.

   Trois règles, chacune corrigeant un défaut nommé par la mission :

   §37  Le type et la taille sont DEUX grandeurs. Un CALL n'est jamais qualifié
        de BET, même si les deux engagent des jetons.

   §34  Aucune conversion implicite. Une mise de 68 % n'est pas « arrondie » à
        75 % pour trouver une fréquence. Sans règle explicite, l'action est
        déclarée hors de l'arbre.

   §50  Hors de l'arbre, on n'attribue PAS l'EV du sizing le plus proche. On dit
        « EV exacte indisponible », et l'on peut MENTIONNER le sizing étudié le
        plus proche — clairement étiqueté comme comparaison approximative.
   ══════════════════════════════════════════════════════════════════════════ */
export function compareAction({
  solution, path = [], handClass = null,
  actionType, sizeBb = null, sizeIsTotal = true,
  matchToleranceBb = 0.01,
} = {}) {
  const node = getTrainingNode(solution, path, { handClass });
  if (!node.ok) return { ok: false, reason: node.reason };

  const type = String(actionType || "").toUpperCase();
  if (!Object.values(ActionType).includes(type)) {
    return { ok: false, reason: `type d'action inconnu : « ${actionType} »` };
  }

  /* Candidats du MÊME TYPE — la taille ne se compare qu'à type égal (§37). */
  const sameType = node.actions.filter(a => a.actionType === type);
  const sized = type === ActionType.BET || type === ActionType.RAISE || type === ActionType.ALL_IN;

  if (!sameType.length) {
    return {
      ok: true, inTree: false, node,
      played: { actionType: type, sizeBb },
      verdict: "hors-arbre",
      evAvailable: false,
      reason: `l'action ${type} n'existe pas à ce nœud de la solution`,
      bestAction: bestOf(node),
    };
  }

  if (!sized) {
    const match = sameType[0];
    return verdictFor(node, match, { actionType: type, sizeBb: match.toBb });
  }

  if (sizeBb == null) {
    /* Une action dimensionnée sans montant n'est pas comparable : on le dit au
       lieu de choisir un montant à sa place. */
    return { ok: true, inTree: false, node, played: { actionType: type, sizeBb: null },
      verdict: "montant manquant", evAvailable: false,
      reason: "action dimensionnée reçue sans montant — comparaison impossible",
      bestAction: bestOf(node) };
  }

  const target = roundAmount(sizeBb);
  const field = sizeIsTotal ? "toBb" : "additionalBb";
  const exact = sameType.find(a => Math.abs(a[field] - target) <= matchToleranceBb);
  if (exact) return verdictFor(node, exact, { actionType: type, sizeBb: target });

  /* §50 — le plus proche est CITÉ, jamais SUBSTITUÉ. */
  const nearest = sameType.reduce((m, a) =>
    Math.abs(a[field] - target) < Math.abs(m[field] - target) ? a : m, sameType[0]);
  return {
    ok: true, inTree: false, node,
    played: { actionType: type, sizeBb: target },
    verdict: "sizing non étudié",
    evAvailable: false,
    reason: `le sizing joué (${target}bb) n'existe pas dans l'arbre résolu — EV exacte indisponible`,
    nearestStudied: {
      label: nearest.label, actionType: nearest.actionType,
      toBb: nearest.toBb, additionalBb: nearest.additionalBb,
      potFraction: nearest.potFraction, frequency: nearest.frequency,
      approximate: true,
      note: "comparaison APPROXIMATIVE : ce sizing a été étudié, celui qui a été joué ne l'a pas été. Sa fréquence ne s'applique pas au sizing joué.",
    },
    bestAction: bestOf(node),
  };
}

function verdictFor(node, match, played) {
  const best = bestOf(node);
  const freq = match.frequency ?? 0;
  return {
    ok: true, inTree: true, node, played,
    matched: {
      label: match.label, actionType: match.actionType,
      toBb: match.toBb, additionalBb: match.additionalBb,
      potFraction: match.potFraction, specLabel: match.specLabel,
      frequency: roundEv(freq),
    },
    bestAction: best,
    /* Un verdict de FRÉQUENCE, pas d'EV : à un nœud, l'EV par action n'est pas
       extraite de la solution stockée (elle exigerait de conserver les valeurs
       contrefactuelles). On le dit plutôt que d'en fabriquer une. */
    evAvailable: false,
    evNote: "L'EV par action à ce nœud n'est pas conservée dans la solution. L'écart d'EV entre SIZINGS est disponible dans `actionRanking` (mesuré à la sélection).",
    verdict: freq >= 0.05 ? (best && match.label === best.label ? "action majoritaire" : "action de la solution") : "action rare dans la solution",
    frequencySource: node.frequencySource,
  };
}
function bestOf(node) {
  if (!node.actions || !node.actions.length) return null;
  return node.actions.reduce((m, a) => ((a.frequency ?? 0) > (m.frequency ?? 0) ? a : m), node.actions[0]);
}

/* Résumé lisible d'une solution — ce que l'UI affiche en une ligne (§18/§36). */
export function describeSolution(sol) {
  if (!sol) return null;
  return {
    solutionId: sol.solutionId,
    badge: sol.provenanceMeta ? sol.provenanceMeta.badge : "—",
    mayClaimSolved: mayClaimSolved(sol),
    mode: sol.sizingMode, complexity: sol.sizingComplexity,
    street: sol.street, board: (sol.board || []).join(" "),
    pot: sol.pot, spr: sol.spr,
    selected: (sol.selectedSizes?.bets || []).map(b => b.label).join(" · ") || "—",
    reference: (sol.referenceSizes?.bets || []).map(b => b.label).join(" · ") || "—",
    evLossBb: sol.simplificationMetrics ? sol.simplificationMetrics.absoluteEVLoss : null,
    evLossPotPct: sol.simplificationMetrics ? sol.simplificationMetrics.evLossPotPct : null,
    distinguishable: sol.distinguishable,
    measurementFloor: sol.measurement ? sol.measurement.floor : null,
    status: sol.status,
    partialReasons: sol.partialReasons || [],
    accuracy: sol.accuracy || null,
    evaluationModel: sol.evaluationModel,
  };
}

/* Familles de solutions d'un même état (§28/§110) — FULL → SINGLE, avec ce que
   chaque simplification coûte réellement. */
export function describeFamily(hash) {
  return solutionFamily(hash).map(describeSolution);
}
