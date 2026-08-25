/* ══════════════════════════════════════════════════════════════════════════
   PFASE · OPTIMISEUR DYNAMIQUE (Mission §9, §10, §12, §13, §14, §15, §16, §62)

   LE CŒUR DU SYSTÈME. Ce module répond à une question, et une seule :

     « Parmi ces sizings candidats, lequel — ou quel sous-ensemble — conserve le
       plus d'EV une fois l'arbre réellement résolu ? »

   Le pipeline, tel que §13 l'impose :

     génération des candidats
            ↓
     arbre de RÉFÉRENCE (tous les candidats) → EV_reference
            ↓
     étage 1 : chaque candidat SEUL → classement individuel
            ↓
     étage 2 : sous-ensembles formés sur la liste courte → EV_subset
            ↓
     perte d'EV = EV_reference − EV_subset,  sélection = argmin(perte)
            ↓
     (le SOLVE FINAL est fait ailleurs — §13 — car un micro-solve de sélection
      n'est PAS la solution)

   TROIS GARDE-FOUS D'HONNÊTETÉ, qui distinguent ce module d'une simulation :

   1. NOMBRES ALÉATOIRES COMMUNS. Tous les sous-arbres partagent la graine de
      `evaluationConfig.seed`. Sans cela, comparer deux EV échantillonnées sur
      des runouts différents reviendrait à comparer du bruit (mesuré : ±0.13 bb
      d'écart entre graines sur un flop, pour des pertes d'EV recherchées de
      l'ordre de 0.03 bb).

   2. PLANCHER DE BRUIT MESURÉ. La référence est re-solvée à d'autres graines ;
      l'écart observé donne le plancher en deçà duquel une perte d'EV n'est PAS
      distinguable. Le résultat porte `distinguishable:false` plutôt qu'un chiffre
      d'apparence précise.

   3. AUCUN REPLI. Si la référence échoue, l'optimisation échoue. On ne retombe
      jamais sur « le premier candidat » ni sur une règle écrite à la main.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  BettingTreeMode, SizingComplexity, SolveStatus, complexityLimits,
  DEFAULT_EVALUATION_CONFIG, DEFAULT_COMBINATION_BUDGET, DEFAULT_NOISE_PROBE_SEEDS,
  DEFAULT_MAX_ACCEPTABLE_EV_LOSS, withDefaults, debugEnabled,
} from "./config.js";
import { generateSizingCandidates, materializeUserCandidates } from "./candidateGenerator.js";
import { planStageOne, planStageTwo, referenceEntry, combinatorialSize, subsetId } from "./combinationPlanner.js";
import { solveTreeSpec, SolveCancelled } from "./solverAdapter.js";
import { simplificationMetrics, selectUnderTolerance } from "./metrics.js";
import { gameStateHash, evaluationKey } from "./canonicalHash.js";
import { EPS } from "./config.js";
import { roundEv } from "./sizingSpec.js";

/* Facteur appliqué à la dérive de convergence pour en faire un plancher de
   mesure lorsque NashConv est indisponible (board incomplet). La dérive mesure
   le dernier pas ; la distance restante en vaut plusieurs. 2 est un choix
   CONSERVATEUR et DÉCLARÉ, pas une constante magique — quand NashConv existe,
   c'est lui qui prime, et il est exact. */
export const DRIFT_SAFETY_FACTOR = 2;

/* Cache d'évaluation (§20, premier étage). Volontairement injectable : les tests
   doivent pouvoir partir d'un cache vide, et le Worker a le sien. */
export function createEvaluationCache() {
  const map = new Map();
  return {
    get: (k) => map.get(k) || null,
    set: (k, v) => { map.set(k, v); return v; },
    has: (k) => map.has(k),
    size: () => map.size,
    clear: () => map.clear(),
    stats: { hits: 0, misses: 0 },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   optimizeBettingTree
   ══════════════════════════════════════════════════════════════════════════ */
export function optimizeBettingTree({
  state, heroRange, villainRange,
  mode = BettingTreeMode.AUTOMATIC,
  complexity = SizingComplexity.SIMPLE,
  /* modes FIXED / DYNAMIC : candidats fournis par l'utilisateur */
  userBetSpecs = null, userRaiseSpecs = null,
  candidateProfile: profile = "standard",
  budget, evaluationConfig, optimizeFor = 0,
  maxAcceptableEVLoss = DEFAULT_MAX_ACCEPTABLE_EV_LOSS,
  /* ── DÉFINITION DE LA PERTE D'EV — le choix le plus important du module ──
     "optimized" (DÉFAUT) : seul le joueur optimisé voit ses sizings restreints ;
        l'adversaire garde l'arbre de référence. C'est la définition RIGOUREUSE
        du coût d'une simplification — « que perds-je à me limiter à ces tailles,
        face à un adversaire qui, lui, dispose de tout ? » — et elle garantit
        mathématiquement une perte ≥ 0 : dans un jeu à somme nulle, restreindre
        l'ensemble d'actions d'un joueur ne peut pas augmenter la valeur du jeu
        pour lui.
     "both" : les deux camps sont simplifiés. Le jeu CHANGE des deux côtés, la
        perte peut devenir négative, et l'on ne mesure plus le coût de sa propre
        simplification mais l'effet net de deux simplifications. Disponible, mais
        jamais par défaut : mesuré sur un river réel, ce réglage rendait TOUTES
        les pertes négatives (−0.15 à −0.19 bb), ce qui aurait fait annoncer
        qu'un Single Size bat le solve complet. Voir ALGORITHM.md. */
  restrictPlayers = "optimized",
  noiseProbeSeeds = DEFAULT_NOISE_PROBE_SEEDS,
  cache = null, signal, onProgress,
  /* Solveur INJECTABLE (§61). Les tests doivent pouvoir fournir des EV connues
     pour vérifier la LOGIQUE DE SÉLECTION indépendamment du CFR : si l'on ne
     teste la sélection qu'à travers un vrai solve, on ne sait jamais si un
     mauvais choix vient de l'algorithme ou du bruit du solveur. Défaut =
     le vrai solveur. */
  solveFn = solveTreeSpec,
} = {}) {
  const t0 = Date.now();
  const cfg = withDefaults(DEFAULT_EVALUATION_CONFIG, evaluationConfig);
  const bud = withDefaults(DEFAULT_COMBINATION_BUDGET, budget);
  const evalCache = cache || createEvaluationCache();
  const progress = (phase, detail) => { try { onProgress && onProgress({ phase, ...detail }); } catch { /* l'UI ne doit jamais casser le moteur */ } };

  if (!state) return fail("état de jeu absent", t0);

  /* Mode SINGLE : la complexité n'est pas négociable (§4/§5). */
  const effComplexity = mode === BettingTreeMode.SINGLE ? SizingComplexity.SINGLE
    : mode === BettingTreeMode.FIXED ? SizingComplexity.FULL
      : complexity;

  /* ── 1. CANDIDATS ─────────────────────────────────────────────────────── */
  progress(SolveStatus.QUEUED, { step: "candidats" });
  let cand;
  if (mode === BettingTreeMode.AUTOMATIC || (!userBetSpecs && !userRaiseSpecs)) {
    cand = generateSizingCandidates({ state, profile, budget: bud });
  } else {
    cand = materializeUserCandidates({ state, betSpecs: userBetSpecs || [], raiseSpecs: userRaiseSpecs || [] });
  }
  if (!cand.bets.length) return fail("aucun sizing de mise jouable dans cet état", t0, { candidates: cand });

  const baseHash = gameStateHash({ state, heroRange, villainRanges: [villainRange] }).hash;
  const solves = [];
  /* Configuration EFFECTIVE : elle peut monter en précision si la référence
     n'est pas assez convergée (voir « escalade de convergence » plus bas). */
  let effCfg = { ...cfg };
  /* ══ POURQUOI L'ÉVALUATION NE CONSERVE PAS LES SOLUTIONS ══════════════════
     Un résultat de `solveTreeSpec` porte `solution`, qui contient les tables de
     regret et de stratégie du CFR : des Float64Array indexés par (nœud, runout,
     combo, action). Sur un flop, c'est plusieurs centaines de mégaoctets par
     solve. L'optimiseur en enchaîne dix à quarante, et le cache les gardait
     TOUS — le banc d'essai (§83) est tombé à court de tas au dixième spot.

     Or la phase de sélection n'a besoin que de NOMBRES : l'EV, le statut, la
     convergence, la durée. La solution complète n'est nécessaire qu'au SOLVE
     FINAL, qui a lieu ailleurs (pfase.js) et une seule fois. On ne mémorise donc
     que l'essentiel, et l'objet lourd devient collectable immédiatement.

     `sampled` est extrait avant l'oubli : c'est lui qui décide s'il faut sonder
     le bruit d'échantillonnage. */
  const slim = (r) => ({
    ok: r.ok, ev: r.ev, reason: r.reason, status: r.status,
    partialReasons: r.partialReasons || [],
    convergence: r.convergence || null,
    instrumentation: r.instrumentation ? {
      elapsedMs: r.instrumentation.elapsedMs, treeNodes: r.instrumentation.treeNodes,
      iterations: r.instrumentation.iterations, maxCombos: r.instrumentation.maxCombos,
      depth: r.instrumentation.depth, depthLimited: r.instrumentation.depthLimited,
      guardNotes: r.instrumentation.guardNotes || [],
    } : null,
    elapsedMs: r.elapsedMs ?? (r.instrumentation ? r.instrumentation.elapsedMs : null),
    /* Un booléen à la place de tout l'objet solution. */
    sampled: !!(r.solution && r.solution.sampled),
    solution: null,
  });
  const runSolve = (treeSpec, cfgOverride, tag) => {
    const c = cfgOverride ? { ...effCfg, ...cfgOverride } : effCfg;
    const key = evaluationKey(baseHash, treeSpec, c);
    const hit = evalCache.get(key);
    if (hit) { evalCache.stats.hits++; return { ...hit, cacheHit: true }; }
    evalCache.stats.misses++;
    const full = solveFn({ state, heroRange, villainRange, treeSpec, config: c, optimizeFor, signal });
    const r = slim(full);
    solves.push({ tag, ok: r.ok, ms: r.instrumentation ? r.instrumentation.elapsedMs : r.elapsedMs, ev: r.ev });
    evalCache.set(key, r);
    return r;
  };

  /* ── BUDGET TEMPS, À DEUX ÉTAGES ────────────────────────────────────────
     L'étage 1 (chaque candidat évalué seul) est le MINIMUM VITAL : sans lui, il
     n'y a aucun classement, donc rien à sélectionner. Le couper revient à ne
     rien rendre du tout — c'est ce qui s'est produit au premier essai en
     navigateur sur un flop : le budget était consommé par la référence et son
     escalade de convergence, l'étage 1 était intégralement sauté, et
     l'optimisation échouait au lieu de rendre un résultat partiel.
     Le budget nominal borne donc l'étage 2 (les sous-ensembles, qui affinent) ;
     un plafond DUR, plus large, protège l'étage 1 contre les cas extrêmes. */
  const budgetMs = cfg.timeBudgetMs;
  const hardBudgetMs = budgetMs == null ? null : budgetMs * 4;
  const budgetSpent = () => budgetMs != null && Date.now() - t0 > budgetMs;
  const hardBudgetSpent = () => hardBudgetMs != null && Date.now() - t0 > hardBudgetMs;
  const budgetNotes = [];

  try {
    /* ── 2. ARBRE DE RÉFÉRENCE (§9) ─────────────────────────────────────── */
    progress(SolveStatus.SOLVING, { step: "référence" });
    const refEntry = referenceEntry({ betCandidates: cand.bets, raiseCandidates: cand.raises });
    const refSpec = entryToTreeSpec(refEntry, { restrictPlayers: "both", state });
    let refSolve = runSolve(refSpec, null, "reference");
    if (!refSolve.ok) {
      return fail(`arbre de référence non résolu : ${refSolve.reason}`, t0, { candidates: cand, referenceSolve: refSolve });
    }

    /* ── 2 bis. ESCALADE DE CONVERGENCE ──────────────────────────────────
       LE PIÈGE QUE CE BLOC DÉSAMORCE. Le CFR converge d'autant plus lentement
       que le nœud offre d'actions. L'arbre de référence (tous les candidats) est
       donc SYSTÉMATIQUEMENT moins convergé qu'un sous-arbre à un seul sizing, au
       même nombre d'itérations. Mesuré sur un river réel :

         itérations   référence   « 33 % seul » (restreint côté Hero)
            150        −0.548          −0.495      → perte −0.053  (négative !)
            400        −0.493          −0.471      → perte −0.022  (négative)
           1000        −0.471          −0.463      → perte −0.008
           2500        −0.463          −0.461      → perte −0.002  (≈ 0, correct)

       À 150 itérations, le moteur aurait « prouvé » qu'un Single Size bat le
       solve complet. Ce n'est pas une propriété du poker : c'est un artefact de
       convergence. On mesure donc la DÉRIVE de l'EV de référence entre N et 2N
       itérations, et on monte en précision tant qu'elle dépasse la cible.

       Cette dérive sert aussi de PLANCHER DE MESURE : aucune perte plus petite
       qu'elle ne peut être affirmée. */
    let drift = null, escalations = 0;
    const target = effCfg.convergenceTarget ?? 0.05;
    const ceiling = effCfg.maxIterationsCeiling ?? (effCfg.maxIterations * 8);
    const autoEscalate = effCfg.autoEscalate !== false;
    /* MESURER la dérive et AGIR dessus sont deux décisions distinctes.
       `convergenceProbe:false` coupe la mesure (utile quand le solveur est une
       fixture exacte : la sonde ne mesurerait rien et coûterait un solve).
       `autoEscalate:false` garde la mesure — donc le plancher honnête — mais
       laisse la précision demandée telle quelle. Les confondre revenait à
       doubler en silence la précision que l'appelant avait choisie. */
    const wantProbe = effCfg.convergenceProbe !== false;
    /* CRITÈRE D'ARRÊT — le meilleur disponible, et il n'est pas toujours le même :
         board complet  → NashConv, qui BORNE l'écart à l'équilibre (exact) ;
         board incomplet → la dérive d'EV entre N et 2N, faute de mieux.
       Viser la dérive quand NashConv existe reviendrait à ignorer une mesure
       rigoureuse au profit d'une extrapolation. */
    const errorOf = (solve, d) => {
      const nc = solve && solve.convergence ? solve.convergence.nashConv : null;
      return nc != null ? nc : (d == null ? null : d * DRIFT_SAFETY_FACTOR);
    };
    while (wantProbe) {
      if (signal && signal.aborted) throw new SolveCancelled();
      const doubled = runSolve(refSpec, { maxIterations: effCfg.maxIterations * 2 }, "convergence-probe");
      if (!doubled.ok) break;
      drift = Math.abs(doubled.ev - refSolve.ev);
      if (!autoEscalate) break;                       // mesuré, mais on n'escalade pas
      if (budgetSpent()) { budgetNotes.push("escalade de convergence arrêtée par le budget temps"); break; }
      /* On adopte la mesure la plus précise : elle est strictement meilleure. */
      effCfg = { ...effCfg, maxIterations: effCfg.maxIterations * 2 };
      refSolve = doubled;
      escalations++;
      const err = errorOf(refSolve, drift);
      if (err == null || err <= target || effCfg.maxIterations * 2 > ceiling) break;
      progress(SolveStatus.SOLVING, { step: "convergence", iterations: effCfg.maxIterations, drift, exploitability: refSolve.convergence ? refSolve.convergence.nashConv : null });
    }
    const referenceEV = refSolve.ev;

    /* ── 2 ter. PLANCHER DE BRUIT D'ÉCHANTILLONNAGE (§14/§21) ────────────
       Sur board complet il n'y a pas d'échantillonnage de runouts : le solve est
       exact et ce plancher-là vaut 0. Sinon on re-solve la référence à d'autres
       graines et l'on prend l'écart observé. */
    const sampled = !!refSolve.sampled;
    const probes = [];
    if (sampled && noiseProbeSeeds > 0) {
      progress(SolveStatus.SOLVING, { step: "plancher de bruit" });
      for (let i = 1; i <= noiseProbeSeeds; i++) {
        const p = runSolve(refSpec, { seed: (effCfg.seed || 0) + i * 7919 }, "noise-probe");
        if (p.ok) probes.push(p.ev);
      }
    }
    const seedNoise = probes.length ? Math.max(...probes.map(v => Math.abs(v - referenceEV))) : 0;

    /* ── LE PLANCHER DE MESURE, ET POURQUOI LA DÉRIVE NE SUFFIT PAS ────────
       La dérive entre N et 2N itérations mesure le DERNIER pas de convergence,
       pas la distance restante à l'équilibre. Pour une convergence en 1/√T, la
       somme des pas restants vaut plusieurs fois le dernier : mesuré sur un
       river à ranges réduites, la dérive annonçait 0.003 bb là où l'écart réel
       à l'équilibre valait ~0.011 bb — et une perte d'EV négative de 0.011 était
       alors déclarée « distinguable », c'est-à-dire qu'un Single Size battait le
       solve complet. Faux, et exactement le genre d'affirmation que §0 interdit.

       Sur BOARD COMPLET, on dispose de mieux qu'une extrapolation : NashConv est
       calculable exactement, et dans un jeu à somme nulle il BORNE l'écart entre
       l'EV d'un profil et la valeur du jeu. L'erreur sur une DIFFÉRENCE d'EV est
       donc bornée par la somme des deux NashConv (référence + sous-arbre) — c'est
       le plancher rigoureux, appliqué par évaluation dans `makeEvaluation`.

       Hors board complet, NashConv est indisponible ; on retombe sur la dérive
       assortie d'un facteur de sécurité déclaré. */
    const refNashConv = refSolve.convergence ? refSolve.convergence.nashConv : null;
    const noiseFloor = roundEv(Math.max(
      seedNoise,
      drift == null ? 0 : drift * DRIFT_SAFETY_FACTOR,
      refNashConv == null ? 0 : refNashConv,
    ));

    /* ── 3. AUCUNE SIMPLIFICATION À FAIRE (§4/§5) ─────────────────────────
       Deux cas distincts mènent au même endroit :
         · mode FIXED — « Le moteur ne supprime aucun sizing. Il résout l'arbre
           fourni. » (§4)
         · complexité FULL — « Arbre fourni entièrement par l'utilisateur ou le
           preset. Pas de simplification automatique obligatoire. » (§5)
       Dans les deux cas, la solution EST l'arbre de référence, et sa perte d'EV
       vaut zéro par définition : elle ne simplifie rien. Sans ce court-circuit,
       le niveau FULL retenait le meilleur sous-ensemble mesuré et livrait donc
       une simplification là où l'utilisateur en demandait précisément l'absence. */
    if (mode === BettingTreeMode.FIXED || effComplexity === SizingComplexity.FULL) {
      const metrics = simplificationMetrics({ referenceEV, simplifiedEV: referenceEV, pot: state.pot });
      return {
        ok: true, status: refSolve.status, mode, complexity: effComplexity,
        candidates: cand,
        reference: { entry: refEntry, treeSpec: refSpec, ev: referenceEV, solve: refSolve },
        evaluations: [],
        selected: {
          entry: refEntry, treeSpec: refSpec, betKeys: refEntry.betKeys, raiseKeys: refEntry.raiseKeys,
          ev: referenceEV, metrics, complexityCost: refEntry.betKeys.length + refEntry.raiseKeys.length,
          distinguishable: true,
        },
        noise: { floor: noiseFloor, seedNoise: roundEv(seedNoise), convergenceDrift: drift==null?null:roundEv(drift), escalations, iterations: effCfg.maxIterations, probes, sampled },
        planner: { entries: 0, pruned: [], truncated: false, note: mode === BettingTreeMode.FIXED ? "mode FIXED — l'arbre fourni est résolu tel quel, aucun sous-ensemble n'est évalué." : "complexité FULL — aucune simplification automatique ; l'arbre complet des candidats est retenu." },
        tolerance: { requested: maxAcceptableEVLoss, satisfied: true, note: "aucune simplification — perte d'EV nulle par définition" },
        instrumentation: instrumentation(t0, solves, evalCache, cand, effComplexity, effCfg),
      };
    }

    /* ── 4. ÉTAGE 1 — chaque candidat SEUL (§10) ─────────────────────────── */
    progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 1" });
    const stage1 = planStageOne({ betCandidates: cand.bets, raiseCandidates: cand.raises });
    const evaluations = [];
    const evByBetKey = new Map(), evByRaiseKey = new Map();
    let stage1Skipped = 0;
    for (const entry of stage1) {
      if (signal && signal.aborted) throw new SolveCancelled();
      if (hardBudgetSpent()) { stage1Skipped++; continue; }
      const spec = entryToTreeSpec(entry, { restrictPlayers, state, reference: refEntry });
      const r = runSolve(spec, null, "stage1");
      const rec = makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor, refNashConv);
      evaluations.push(rec);
      if (!r.ok) continue;
      if (entry.dimension === "bet") evByBetKey.set(entry.betKeys[0], r.ev);
      else if (entry.dimension === "raise") evByRaiseKey.set(entry.raiseKeys[0], r.ev);
      progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 1", done: evaluations.length, total: stage1.length });
    }

    const rankedBetKeys = [...evByBetKey.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const rankedRaiseKeys = [...evByRaiseKey.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

    /* ── 5. ÉTAGE 2 — sous-ensembles (§10) ──────────────────────────────── */
    const lim = complexityLimits(effComplexity);
    let plan = { entries: [], pruned: [], truncated: false, shortlist: { bets: rankedBetKeys, raises: rankedRaiseKeys }, limits: { maxBetSizes: lim.maxBetSizes, maxRaiseSizes: lim.maxRaiseSizes } };
    const needsSubsets = (lim.maxBetSizes == null || lim.maxBetSizes > 1) || (cand.raises.length && (lim.maxRaiseSizes == null || lim.maxRaiseSizes > 1));
    if (needsSubsets) {
      progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 2" });
      plan = planStageTwo({
        betCandidates: cand.bets, raiseCandidates: cand.raises,
        rankedBetKeys, rankedRaiseKeys, complexity: effComplexity, budget: bud,
      });
      let stage2Skipped = 0;
      for (const entry of plan.entries) {
        if (signal && signal.aborted) throw new SolveCancelled();
        if (evaluations.some(e => e.id === entry.id)) continue;   // déjà mesuré à l'étage 1
        if (budgetSpent()) { stage2Skipped++; continue; }
        const spec = entryToTreeSpec(entry, { restrictPlayers, state, reference: refEntry });
        const r = runSolve(spec, null, "stage2");
        evaluations.push(makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor, refNashConv));
        progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 2", done: evaluations.length, total: stage1.length + plan.entries.length });
      }
      if (stage2Skipped) budgetNotes.push(`${stage2Skipped} sous-ensemble(s) non évalué(s) : budget temps de ${budgetMs} ms atteint`);
    }
    if (stage1Skipped) budgetNotes.push(`${stage1Skipped} candidat(s) non évalué(s) seuls : plafond temps dur de ${hardBudgetMs} ms atteint`);

    /* ── 6. SÉLECTION (§9/§10/§16) ───────────────────────────────────────
       On ne retient QUE les sous-ensembles conformes au niveau de complexité :
       l'étage 1 a produit des évaluations à 1 sizing utiles au classement, mais
       aussi des évaluations « toutes les mises / une relance » qui ne sont pas
       des candidats de sélection. */
    const eligible = evaluations.filter(e =>
      e.ok
      && (lim.maxBetSizes == null || e.betKeys.length <= lim.maxBetSizes)
      && (lim.maxRaiseSizes == null || e.raiseKeys.length <= lim.maxRaiseSizes)
    );
    if (!eligible.length) {
      /* Message PRÉCIS : « rien n'a pu être résolu » et « le temps a manqué avant
         la première comparaison » appellent des gestes différents de l'utilisateur. */
      const raison = stage1Skipped
        ? `budget temps épuisé avant toute comparaison (${stage1Skipped} candidat(s) non évalués) — augmentez le budget, réduisez le nombre de candidats, ou baissez la précision d'évaluation`
        : "aucun sous-arbre conforme au niveau de complexité n'a pu être résolu";
      return fail(raison, t0, {
        candidates: cand,
        reference: { entry: refEntry, treeSpec: refSpec, ev: referenceEV, solve: refSolve },
        evaluations, budgetNotes,
      });
    }
    const choice = selectUnderTolerance(
      eligible.map(e => ({ ...e, complexityCost: e.betKeys.length + e.raiseKeys.length })),
      maxAcceptableEVLoss,
      { tieToleranceBb: noiseFloor }
    );
    const sel = choice.selected;

    return {
      ok: true,
      /* Une exploration tronquée par le budget n'est PAS complète : le dire est
         la seule façon d'empêcher qu'on lise « meilleur sizing » là où il faut
         lire « meilleur des sizings qu'on a eu le temps de comparer ». */
      status: (refSolve.status === SolveStatus.PARTIAL || budgetNotes.length) ? SolveStatus.PARTIAL : SolveStatus.COMPLETE,
      budgetNotes,
      mode, complexity: effComplexity,
      candidates: cand,
      reference: { entry: refEntry, treeSpec: refSpec, ev: referenceEV, solve: refSolve },
      evaluations,
      selected: {
        entry: sel.entry, treeSpec: sel.treeSpec,
        betKeys: sel.betKeys, raiseKeys: sel.raiseKeys,
        betSpecs: sel.entry.betSpecs, raiseSpecs: sel.entry.raiseSpecs,
        ev: sel.ev, metrics: sel.metrics,
        complexityCost: sel.betKeys.length + sel.raiseKeys.length,
        distinguishable: sel.distinguishable,
      },
      /* Classement complet, trié par perte croissante — c'est CE tableau que
         l'UI et le Coach lisent (§15). */
      ranking: eligible.slice().sort((a, b) => a.metrics.absoluteEVLoss - b.metrics.absoluteEVLoss),
      noise: { floor: noiseFloor, seedNoise: roundEv(seedNoise), convergenceDrift: drift==null?null:roundEv(drift), escalations, iterations: effCfg.maxIterations, probes, sampled },
      planner: {
        stage1: stage1.length, stage2: plan.entries.length,
        pruned: plan.pruned, truncated: plan.truncated, shortlist: plan.shortlist,
        theoretical: combinatorialSize({ nBets: cand.bets.length, nRaises: cand.raises.length, complexity: effComplexity }),
      },
      tolerance: { requested: maxAcceptableEVLoss, satisfied: choice.satisfied, note: choice.note },
      instrumentation: instrumentation(t0, solves, evalCache, cand, effComplexity, effCfg),
    };
  } catch (e) {
    if (e instanceof SolveCancelled) {
      return { ok: false, status: SolveStatus.CANCELLED, reason: "optimisation annulée", elapsedMs: Date.now() - t0 };
    }
    return fail(String((e && e.message) || e), t0);
  }
}

/* ── Traduction d'une entrée de plan en arbre concret ───────────────────── */
function entryToTreeSpec(entry, { restrictPlayers, state, reference }) {
  const base = {
    betSpecs: entry.betSpecs,
    raiseSpecs: entry.raiseSpecs,
    maxRaisesPerStreet: 1,
    ipProbe: true,
    allowJam: entry.betSpecs.some(s => s.type === "jam") || entry.raiseSpecs.some(s => s.type === "jam"),
  };
  if (restrictPlayers !== "optimized" || !reference) return base;
  /* Restriction ASYMÉTRIQUE : le joueur optimisé (0 = Hero/OOP) voit le
     sous-ensemble, l'adversaire garde l'arbre de référence. C'est le seul
     réglage sous lequel la perte d'EV est mathématiquement garantie ≥ 0.
     Les RELANCES sont restreintes de la même façon : sans cela, restreindre les
     relances d'Hero restreindrait aussi celles du Vilain et l'on retomberait
     dans le cas symétrique. */
  const opt = 0, opp = 1;
  return {
    ...base,
    betSpecsByPlayer: { [opt]: entry.betSpecs, [opp]: reference.betSpecs },
    raiseSpecs: reference.raiseSpecs,
    ...(reference.raiseSpecs && reference.raiseSpecs.length
      ? { raiseSpecsByPlayer: { [opt]: entry.raiseSpecs, [opp]: reference.raiseSpecs } }
      : {}),
    allowJam: base.allowJam || reference.betSpecs.some(s => s.type === "jam"),
  };
}

function makeEvaluation(entry, treeSpec, solve, referenceEV, pot, noiseFloor, refNashConv) {
  const ok = !!solve.ok;
  const metrics = ok
    ? simplificationMetrics({ referenceEV, simplifiedEV: solve.ev, pot })
    : simplificationMetrics({ referenceEV, simplifiedEV: null, pot });
  /* Plancher PROPRE à cette évaluation quand l'exploitabilité des deux arbres
     est mesurable : |Δ mesuré − Δ vrai| ≤ NashConv(réf) + NashConv(sous-arbre).
     Sinon, le plancher global (dérive + bruit d'échantillonnage). */
  const evalNashConv = solve.convergence ? solve.convergence.nashConv : null;
  const measurementFloor = (ok && refNashConv != null && evalNashConv != null)
    ? roundEv(Math.max(noiseFloor, refNashConv + evalNashConv))
    : noiseFloor;
  /* La perte est-elle plus grande que le bruit de mesure ? Sinon on ne peut PAS
     affirmer qu'un sizing est meilleur qu'un autre — on le dit (§14/§21). */
  const distinguishable = ok && (measurementFloor <= EPS.ev || Math.abs(metrics.absoluteEVLoss) > measurementFloor);
  return {
    id: entry.id, stage: entry.stage, dimension: entry.dimension,
    betKeys: entry.betKeys, raiseKeys: entry.raiseKeys,
    entry, treeSpec,
    ok, reason: ok ? null : solve.reason,
    ev: ok ? solve.ev : null,
    metrics, distinguishable, measurementFloor,
    nashConv: evalNashConv,
    status: solve.status,
    partialReasons: solve.partialReasons || [],
    cacheHit: !!solve.cacheHit,
    solveMs: solve.instrumentation ? solve.instrumentation.elapsedMs : (solve.elapsedMs ?? null),
  };
}

function instrumentation(t0, solves, cache, cand, complexity, effCfg) {
  const ms = Date.now() - t0;
  const okSolves = solves.filter(s => s.ok);
  return {
    totalMs: ms,
    solveCount: solves.length,
    solveOk: okSolves.length,
    solveFailed: solves.length - okSolves.length,
    solveMsTotal: solves.reduce((a, s) => a + (s.ms || 0), 0),
    cacheHits: cache.stats.hits, cacheMisses: cache.stats.misses, cacheSize: cache.size(),
    betCandidates: cand.bets.length, raiseCandidates: cand.raises.length,
    droppedCandidates: (cand.dropped || []).length,
    complexity,
    effectiveIterations: effCfg ? effCfg.maxIterations : null,
    effectiveMaxCombos: effCfg ? effCfg.maxCombos : null,
    effectiveSeed: effCfg ? effCfg.seed : null,
  };
}

function fail(reason, t0, extra = {}) {
  if (debugEnabled()) {
    // eslint-disable-next-line no-console
    console.debug("[PFASE] optimizeBettingTree FAILED:", reason);
  }
  return { ok: false, status: SolveStatus.FAILED, reason, elapsedMs: Date.now() - t0, ...extra };
}

export { subsetId };
