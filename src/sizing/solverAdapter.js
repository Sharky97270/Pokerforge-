/* ══════════════════════════════════════════════════════════════════════════
   PFASE · ADAPTATEUR SOLVEUR (Mission §12, §13, §21, §22, §57, §59)

   Le SEUL point de contact entre l'Adaptive Sizing Engine et SharkSolver.
   Il traduit (état canonique + arbre demandé + précision demandée) en un appel
   `solveMultiStreet`, et retourne un résultat plain-data enrichi de :

     · l'EV du joueur optimisé, dans la convention unique de `metrics.js` ;
     · la CONVERGENCE réellement mesurée (jamais fabriquée — §21) ;
     · le STATUT (§22) : COMPLETE / PARTIAL / FAILED / CANCELLED ;
     · l'instrumentation (§57) : durée, cache hit/miss, taille d'arbre.

   Deux règles non négociables :
     1. Un solve échoué renvoie `ok:false`. JAMAIS une stratégie de repli (§22).
     2. Ce que le solveur ne sait pas mesurer n'est pas inventé : sur board
        incomplet, l'exploitabilité est `null` avec sa raison, pas un nombre.

   Module PUR (aucune dépendance React/DOM) — utilisable en Node et en Worker.
   ══════════════════════════════════════════════════════════════════════════ */

import { solveMultiStreet } from "../solver/api.js";
import { treeStats, buildPostflopTree } from "../solver/core/gametree.js";
import { EQ_RANKVAL, EQ_SUITIDX } from "../solver/core/combos.js";
import {
  SolveStatus, EvaluationModel, DEFAULT_EVALUATION_CONFIG, DEFAULT_MEMORY_GUARD,
  withDefaults, debugEnabled,
} from "./config.js";
import { evForPlayer } from "./metrics.js";
import { roundEv } from "./sizingSpec.js";

/* Carte → entier 0..51 du solveur. Accepte {r,s}, "As", ou déjà un entier. */
export function cardToInt(c) {
  if (c == null) return null;
  if (typeof c === "number") return Number.isInteger(c) && c >= 0 && c <= 51 ? c : null;
  let r, s;
  if (typeof c === "string") { r = c[0]; s = c[1]; }
  else { r = c.r; s = c.s; }
  const ri = EQ_RANKVAL.indexOf(String(r || "").toUpperCase());
  const si = EQ_SUITIDX[s];
  return ri < 0 || si == null ? null : ri * 4 + si;
}
export function boardToInts(board) {
  const out = (board || []).map(cardToInt);
  return out.some(x => x == null) ? null : out;
}

/* Erreur d'annulation — distinguée d'un échec de calcul (§59). */
export class SolveCancelled extends Error {
  constructor() { super("solve annulé"); this.name = "SolveCancelled"; }
}
function throwIfAborted(signal) {
  if (signal && signal.aborted) throw new SolveCancelled();
}

/* ══════════════════════════════════════════════════════════════════════════
   solveTreeSpec — résout UN arbre.

   { state, heroRange, villainRange, treeSpec, config, optimizeFor, signal }

   `treeSpec` : { betSpecs[], raiseSpecs[], betSpecsByPlayer?, maxRaisesPerStreet,
                  allowJam, ipProbe, streets }
   `config`   : { maxIterations, maxCombos, evaluationDepth, seed, timeBudgetMs }
   ══════════════════════════════════════════════════════════════════════════ */
export function solveTreeSpec({
  state, heroRange, villainRange, treeSpec = {}, config, optimizeFor = 0, signal,
} = {}) {
  const t0 = now();
  const cfg = withDefaults(DEFAULT_EVALUATION_CONFIG, config);
  try {
    throwIfAborted(signal);
    if (!state) return failure("état de jeu absent", t0);
    if (!heroRange || !villainRange) return failure("ranges manquantes", t0);

    const board = boardToInts(state.board);
    if (!board) return failure("board illisible", t0);
    if (board.length < 3) return failure("PFASE résout le postflop : board d'au moins 3 cartes requis", t0);

    /* Profondeur d'évaluation (§12). `evaluationDepth` BORNE le nombre de rues
       de mise construites. Une évaluation tronquée reste une évaluation valide
       — à condition d'être annoncée, ce que fait `depthLimited`. */
    const fullDepth = state.streetsRemaining;
    let depth = cfg.evaluationDepth == null ? fullDepth : Math.max(1, Math.min(cfg.evaluationDepth, fullDepth));
    let maxCombos = cfg.maxCombos;
    const guardNotes = [];

    /* ── GARDE-FOU MÉMOIRE ────────────────────────────────────────────────
       Le coût est estimé AVANT le solve. Un dépassement dégrade la précision
       (profondeur d'abord, abstraction ensuite) et le DIT ; il ne laisse jamais
       l'onglet tomber à court de mémoire. */
    const guard = withDefaults(DEFAULT_MEMORY_GUARD, cfg.memoryGuard);
    if (guard.enabled) {
      const budget = guard.maxEstimatedBytes;
      for (;;) {
        const est = estimateSolveMemory({ state, treeSpec, depth, maxCombos, iterations: cfg.maxIterations });
        if (est.bytes <= budget) break;
        if (depth > 1) {
          guardNotes.push(`profondeur ramenée de ${depth} à ${depth - 1} rue(s) — coût mémoire estimé ${mb(est.bytes)} > budget ${mb(budget)}`);
          depth -= 1;
          continue;
        }
        if (maxCombos > 60) {
          const next = Math.max(60, Math.floor(maxCombos / 2));
          guardNotes.push(`plafond de combos ramené de ${maxCombos} à ${next} — coût mémoire estimé ${mb(est.bytes)} > budget ${mb(budget)}`);
          maxCombos = next;
          continue;
        }
        return failure(`coût mémoire estimé ${mb(est.bytes)} au-delà du budget ${mb(budget)} même à la précision minimale — arbre trop large pour ce moteur (voir LIMITATIONS.md)`, t0);
      }
    }
    const depthLimited = depth < fullDepth;

    const opts = {
      startPot: state.pot,
      effStack: state.effectiveStack,
      streets: depth,
      iters: cfg.maxIterations,
      maxCombos,
      maxRaisesPerStreet: treeSpec.maxRaisesPerStreet ?? 1,
      ipProbe: treeSpec.ipProbe !== false,
      minBet: state.minBet,
      bb: state.blinds.bb,
      ...(cfg.seed != null ? { seed: cfg.seed } : {}),
      ...(treeSpec.betSpecsByPlayer
        ? { betSizesByPlayer: treeSpec.betSpecsByPlayer, betSizes: treeSpec.betSpecs || treeSpec.betSpecsByPlayer[0] }
        : { betSizes: treeSpec.betSpecs || [] }),
      ...(treeSpec.raiseSpecs && treeSpec.raiseSpecs.length ? { raiseSizes: treeSpec.raiseSpecs } : {}),
      ...(treeSpec.raiseSpecsByPlayer ? { raiseSizesByPlayer: treeSpec.raiseSpecsByPlayer } : {}),
      ...(treeSpec.allowJam ? { allowJam: true } : {}),
      /* §21/§55 — le modèle d'évaluation entre dans le SOLVE, pas seulement dans
         l'affichage. Une solution ChipEV ne peut pas être re-badgée ICM (§55). */
      ...(state.evaluationModel === EvaluationModel.ICM && state.icmParams ? { icm: state.icmParams } : {}),
      ...(state.evaluationModel === EvaluationModel.PKO && state.pkoParams ? { pko: state.pkoParams } : {}),
    };
    if (!opts.betSizes || !opts.betSizes.length) return failure("arbre sans aucun sizing de mise", t0);

    throwIfAborted(signal);
    const out = solveMultiStreet(heroRange, villainRange, board, opts);
    throwIfAborted(signal);

    if (!out || !out.result || !out.result.tree) return failure(out && out.source === "NO_SOLUTION" ? "aucune solution (ranges vides ou board invalide)" : "solve sans résultat", t0);

    const sol = out.result;
    const ev = evForPlayer(sol, optimizeFor);
    if (ev == null) {
      return failure(
        optimizeFor === 1
          ? "EV du joueur 1 indisponible sous utilité non zéro-somme (ICM/PKO) — voir LIMITATIONS.md"
          : "EV indisponible",
        t0
      );
    }

    const stats = treeStats(sol.tree);
    const elapsedMs = Math.round(now() - t0);
    /* PARTIAL : la solution existe mais la précision demandée n'a pas été
       atteinte (profondeur bornée, ou budget temps dépassé). L'appelant DOIT
       l'annoncer — d'où le champ `partialReasons`. */
    const partialReasons = [];
    if (depthLimited) partialReasons.push(`profondeur d'évaluation bornée à ${depth} rue(s) sur ${fullDepth}`);
    if (out.abstraction && out.abstraction.exact === false) partialReasons.push("range abstraite (classes de mains supprimées par le plafond de combos)");
    for (const g of guardNotes) partialReasons.push(g);
    if (cfg.timeBudgetMs && elapsedMs > cfg.timeBudgetMs) partialReasons.push(`budget temps dépassé (${elapsedMs} ms > ${cfg.timeBudgetMs} ms)`);

    const res = {
      ok: true,
      status: partialReasons.length ? SolveStatus.PARTIAL : SolveStatus.COMPLETE,
      partialReasons,
      ev: roundEv(ev),
      optimizeFor,
      solution: sol,
      solveId: out.solveId,
      seed: out.seed,
      source: out.source,
      fromLibrary: !!out.fromLibrary,
      experimental: out.experimental !== false,
      /* §21 — convergence RÉELLE. `nashConv` n'est disponible que sur board
         complet ; ailleurs `note` dit pourquoi, et rien n'est fabriqué. */
      convergence: {
        iterations: sol.iters ?? cfg.maxIterations,
        elapsedMs,
        nashConv: out.convergence ? (out.convergence.nashConv ?? null) : null,
        note: out.convergence ? (out.convergence.note ?? null) : null,
        sampled: !!sol.sampled,
        tolerance: cfg.convergenceTarget ?? null,
        seed: out.seed ?? null,
        completed: true,
      },
      equilibriumScope: out.equilibriumScope || null,
      mayClaimNashApproximation: !!out.mayClaimNashApproximation,
      abstraction: out.abstraction || null,
      icm: out.icm || { strategic: false },
      /* §57 — instrumentation */
      instrumentation: {
        elapsedMs, cacheHit: !!out.fromLibrary,
        treeNodes: stats.total, treeDecisions: stats.decision, treeDepth: stats.maxDepth,
        iterations: sol.iters ?? cfg.maxIterations, maxCombos, guardNotes,
        depth, fullDepth, depthLimited,
      },
    };
    if (debugEnabled()) {
      // eslint-disable-next-line no-console
      console.debug("[PFASE] solveTreeSpec", { ev: res.ev, ms: elapsedMs, nodes: stats.total, cache: res.fromLibrary, id: out.solveId });
    }
    return res;
  } catch (e) {
    if (e instanceof SolveCancelled) {
      return { ok: false, status: SolveStatus.CANCELLED, reason: "annulé par l'utilisateur", ev: null, elapsedMs: Math.round(now() - t0) };
    }
    return failure(String((e && e.message) || e), t0);
  }
}

function failure(reason, t0) {
  return { ok: false, status: SolveStatus.FAILED, reason, ev: null, elapsedMs: Math.round(now() - t0) };
}
const mb = (b) => `${Math.round(b / (1024 * 1024))} Mo`;

/* ══════════════════════════════════════════════════════════════════════════
   estimateSolveMemory — coût mémoire AVANT le solve.

   `core/multistreet.js` indexe regrets et stratégie cumulée par
   (nœud de décision, cartes de board révélées depuis le board initial). À la
   street s du sous-arbre, la clé compte s cartes : le nombre de contextes
   distincts vaut donc min(itérations, nombre de préfixes possibles). Au-delà de
   la première rue, c'est le nombre d'itérations qui borne — chaque itération
   échantillonne un runout neuf.

     octets ≈ Σ_{nœuds de décision} contextes(street) × combos × actions × 8 × 2
                                                                            └ regret + stratégie

   Estimation VOLONTAIREMENT majorante : mieux vaut dégrader une précision qu'on
   aurait pu se permettre que faire tomber un onglet. Construire l'arbre coûte
   quelques millisecondes — négligeable devant un solve.
   ══════════════════════════════════════════════════════════════════════════ */
export function estimateSolveMemory({ state, treeSpec = {}, depth, maxCombos, iterations }) {
  const tree = buildPostflopTree({
    startPot: state.pot,
    effStack: state.effectiveStack,
    streets: depth,
    maxRaisesPerStreet: treeSpec.maxRaisesPerStreet ?? 1,
    ipProbe: treeSpec.ipProbe !== false,
    minBet: state.minBet,
    bb: state.blinds.bb,
    ...(treeSpec.betSpecsByPlayer
      ? { betSizesByPlayer: treeSpec.betSpecsByPlayer, betSizes: treeSpec.betSpecs || treeSpec.betSpecsByPlayer[0] }
      : { betSizes: treeSpec.betSpecs || [] }),
    ...(treeSpec.raiseSpecs && treeSpec.raiseSpecs.length ? { raiseSizes: treeSpec.raiseSpecs } : {}),
    ...(treeSpec.raiseSpecsByPlayer ? { raiseSizesByPlayer: treeSpec.raiseSpecsByPlayer } : {}),
    ...(treeSpec.allowJam ? { allowJam: true } : {}),
  });
  const boardLen = (state.board || []).length;
  /* Préfixes possibles à la street s : arrangements de s cartes parmi celles
     qui restent. Borné par les itérations, qui échantillonnent. */
  const prefixes = (s) => {
    if (s <= 0) return 1;
    let n = 1;
    for (let i = 0; i < s; i++) n *= Math.max(1, 52 - boardLen - i);
    return n;
  };
  let bytes = 0, decisions = 0, maxContexts = 0;
  (function walk(n) {
    if (!n) return;
    if (n.kind === "decision") {
      decisions++;
      const ctxs = Math.min(iterations, prefixes(n.street));
      maxContexts = Math.max(maxContexts, ctxs);
      bytes += ctxs * maxCombos * n.actions.length * 8 * 2;
      for (const a of n.actions) walk(n.children[a]);
      return;
    }
    if (n.kind === "chance") walk(n.next);
  })(tree);
  return { bytes, decisions, maxContexts, nodes: treeStats(tree).total };
}
function now() {
  try { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }
  catch { return Date.now(); }
}

/* ══════════════════════════════════════════════════════════════════════════
   nodeActionEV — EV de CHAQUE action d'un nœud, pour le joueur qui y agit.

   Sert à `actionLoss` (§15) : « 75 % est retenu, 33 % est proche, 150 %
   sacrifie davantage. » Ces écarts doivent être MESURÉS.

   Méthode : on relit la table de stratégie moyenne du nœud pour la classe de
   main demandée (ou pour la range entière si aucune n'est donnée), puis on
   pondère l'EV de chaque sous-arbre par les reaches. `solveTree` ne conserve pas
   les valeurs contrefactuelles par action après convergence ; on les recalcule
   donc par une traversée de meilleure réponse partielle — exacte sur board
   complet, échantillonnée sinon (et signalée comme telle).

   Quand la valeur n'est pas calculable, on rend `null`. Jamais un substitut.
   ══════════════════════════════════════════════════════════════════════════ */
export function nodeActionFrequencies(solution, node, { comboIndexes = null, runoutKey = "" } = {}) {
  if (!solution || !node || node.kind !== "decision" || typeof solution.avgOf !== "function") return null;
  const isHero = node.player === 0;
  const list = isHero ? solution.heroList : solution.villList;
  const weights = isHero ? solution.wH : solution.wV;
  if (!list || !weights) return null;
  const idxs = comboIndexes && comboIndexes.length ? comboIndexes : list.map((_, i) => i);
  const na = node.actions.length;
  const agg = new Array(na).fill(0);
  let wsum = 0;
  for (const c of idxs) {
    const w = weights[c] || 0;
    const d = solution.avgOf(node, c, runoutKey);
    for (let k = 0; k < na; k++) agg[k] += w * d[k];
    wsum += w;
  }
  if (wsum <= 0) return null;
  const out = {};
  node.actions.forEach((lbl, k) => { out[lbl] = agg[k] / wsum; });
  return out;
}

/* Index des combos d'une CLASSE de main ("AKs") dans la liste d'un joueur.
   `reduceRange` ne conserve qu'un représentant par classe : on lit la classe. */
export function comboIndexesForClass(solution, classKey, player = 0) {
  const list = player === 0 ? solution?.heroList : solution?.villList;
  if (!list || !classKey) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) if (list[i].key === classKey) out.push(i);
  return out;
}

/* Descend l'arbre selon un chemin de labels, en traversant les nœuds chance. */
export function nodeAtPath(tree, path = []) {
  let n = tree;
  for (const step of path) {
    while (n && n.kind === "chance") n = n.next;
    if (!n || !n.children || !n.children[step]) return null;
    n = n.children[step];
  }
  while (n && n.kind === "chance") n = n.next;
  return n || null;
}
