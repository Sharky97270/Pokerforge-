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
  const runSolve = (treeSpec, cfgOverride, tag) => {
    const c = cfgOverride ? { ...effCfg, ...cfgOverride } : effCfg;
    const key = evaluationKey(baseHash, treeSpec, c);
    const hit = evalCache.get(key);
    if (hit) { evalCache.stats.hits++; return { ...hit, cacheHit: true }; }
    evalCache.stats.misses++;
    const r = solveTreeSpec({ state, heroRange, villainRange, treeSpec, config: c, optimizeFor, signal });
    solves.push({ tag, ok: r.ok, ms: r.instrumentation ? r.instrumentation.elapsedMs : r.elapsedMs, ev: r.ev });
    evalCache.set(key, r);
    return r;
  };

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
    for (;;) {
      if (signal && signal.aborted) throw new SolveCancelled();
      const doubled = runSolve(refSpec, { maxIterations: effCfg.maxIterations * 2 }, "convergence-probe");
      if (!doubled.ok) break;
      drift = Math.abs(doubled.ev - refSolve.ev);
      if (!autoEscalate || drift <= target || effCfg.maxIterations * 2 > ceiling) {
        /* On adopte la mesure la plus précise disponible comme référence : elle
           est strictement meilleure que celle qu'on remplace. */
        effCfg = { ...effCfg, maxIterations: effCfg.maxIterations * 2 };
        refSolve = doubled;
        escalations++;
        break;
      }
      effCfg = { ...effCfg, maxIterations: effCfg.maxIterations * 2 };
      refSolve = doubled;
      escalations++;
      progress(SolveStatus.SOLVING, { step: "convergence", iterations: effCfg.maxIterations, drift });
    }
    const referenceEV = refSolve.ev;

    /* ── 2 ter. PLANCHER DE BRUIT D'ÉCHANTILLONNAGE (§14/§21) ────────────
       Sur board complet il n'y a pas d'échantillonnage de runouts : le solve est
       exact et ce plancher-là vaut 0. Sinon on re-solve la référence à d'autres
       graines et l'on prend l'écart observé. */
    const sampled = !!(refSolve.solution && refSolve.solution.sampled);
    const probes = [];
    if (sampled && noiseProbeSeeds > 0) {
      progress(SolveStatus.SOLVING, { step: "plancher de bruit" });
      for (let i = 1; i <= noiseProbeSeeds; i++) {
        const p = runSolve(refSpec, { seed: (effCfg.seed || 0) + i * 7919 }, "noise-probe");
        if (p.ok) probes.push(p.ev);
      }
    }
    const seedNoise = probes.length ? Math.max(...probes.map(v => Math.abs(v - referenceEV))) : 0;
    /* Le plancher de mesure est le PIRE des deux : on ne peut pas être plus
       précis que la moins bonne de ses sources d'incertitude. */
    const noiseFloor = roundEv(Math.max(seedNoise, drift == null ? 0 : drift));

    /* ── 3. MODE FIXED : aucun sizing n'est supprimé (§4) ────────────────── */
    if (mode === BettingTreeMode.FIXED) {
      const metrics = simplificationMetrics({ referenceEV, simplifiedEV: referenceEV, pot: state.pot });
      return {
        ok: true, status: refSolve.status, mode, complexity: SizingComplexity.FULL,
        candidates: cand,
        reference: { entry: refEntry, treeSpec: refSpec, ev: referenceEV, solve: refSolve },
        evaluations: [],
        selected: {
          entry: refEntry, treeSpec: refSpec, betKeys: refEntry.betKeys, raiseKeys: refEntry.raiseKeys,
          ev: referenceEV, metrics, complexityCost: refEntry.betKeys.length + refEntry.raiseKeys.length,
          distinguishable: true,
        },
        noise: { floor: noiseFloor, seedNoise: roundEv(seedNoise), convergenceDrift: drift==null?null:roundEv(drift), escalations, iterations: effCfg.maxIterations, probes, sampled },
        planner: { entries: 0, pruned: [], truncated: false, note: "mode FIXED — l'arbre fourni est résolu tel quel, aucun sous-ensemble n'est évalué." },
        tolerance: { requested: maxAcceptableEVLoss, satisfied: true, note: "mode FIXED — pas de simplification" },
        instrumentation: instrumentation(t0, solves, evalCache, cand, effComplexity, effCfg),
      };
    }

    /* ── 4. ÉTAGE 1 — chaque candidat SEUL (§10) ─────────────────────────── */
    progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 1" });
    const stage1 = planStageOne({ betCandidates: cand.bets, raiseCandidates: cand.raises });
    const evaluations = [];
    const evByBetKey = new Map(), evByRaiseKey = new Map();
    for (const entry of stage1) {
      if (signal && signal.aborted) throw new SolveCancelled();
      const spec = entryToTreeSpec(entry, { restrictPlayers, state, reference: refEntry });
      const r = runSolve(spec, null, "stage1");
      const rec = makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor);
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
      for (const entry of plan.entries) {
        if (signal && signal.aborted) throw new SolveCancelled();
        if (evaluations.some(e => e.id === entry.id)) continue;   // déjà mesuré à l'étage 1
        const spec = entryToTreeSpec(entry, { restrictPlayers, state, reference: refEntry });
        const r = runSolve(spec, null, "stage2");
        evaluations.push(makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor));
        progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 2", done: evaluations.length, total: stage1.length + plan.entries.length });
      }
    }

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
      return fail("aucun sous-arbre conforme au niveau de complexité n'a pu être résolu", t0,
        { candidates: cand, reference: { ev: referenceEV, solve: refSolve }, evaluations });
    }
    const choice = selectUnderTolerance(
      eligible.map(e => ({ ...e, complexityCost: e.betKeys.length + e.raiseKeys.length })),
      maxAcceptableEVLoss
    );
    const sel = choice.selected;

    return {
      ok: true,
      status: refSolve.status === SolveStatus.PARTIAL ? SolveStatus.PARTIAL : SolveStatus.COMPLETE,
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

function makeEvaluation(entry, treeSpec, solve, referenceEV, pot, noiseFloor) {
  const ok = !!solve.ok;
  const metrics = ok
    ? simplificationMetrics({ referenceEV, simplifiedEV: solve.ev, pot })
    : simplificationMetrics({ referenceEV, simplifiedEV: null, pot });
  /* La perte est-elle plus grande que le bruit de mesure ? Sinon on ne peut PAS
     affirmer qu'un sizing est meilleur qu'un autre — on le dit (§14/§21). */
  const distinguishable = ok && (noiseFloor <= EPS.ev || Math.abs(metrics.absoluteEVLoss) > noiseFloor);
  return {
    id: entry.id, stage: entry.stage, dimension: entry.dimension,
    betKeys: entry.betKeys, raiseKeys: entry.raiseKeys,
    entry, treeSpec,
    ok, reason: ok ? null : solve.reason,
    ev: ok ? solve.ev : null,
    metrics, distinguishable,
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
