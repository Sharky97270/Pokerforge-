/* ══════════════════════════════════════════════════════════════════════════
   PFASE · PONT TRAINER (Mission §29, §31, §32, §33, §34, §36, §37, §42, §71, §90)

   Traduit dans les deux sens entre le vocabulaire du Trainer (`spot`, `acts`,
   `handLedger`) et celui de PFASE (`GameState`, `PFSolution`, `TrainingNode`).

   ── LE SENS DU FLUX EST INVERSÉ PAR RAPPORT À L'EXISTANT ───────────────────
   Aujourd'hui, le générateur de spots écrit les boutons (`acts:[{id:"BET33",
   l:"Cbet 33%"}]`) et le solveur est ensuite invité à produire des fréquences
   SUR CET ARBRE IMPOSÉ. §29 renverse l'ordre : la solution décide des actions,
   l'écran les affiche.

   Ce module produit donc des `acts` au FORMAT EXACT que le Trainer sait déjà
   rendre — id, libellé, montant — mais dérivés de la solution. Aucun composant
   n'est redessiné (§70) ; seule la SOURCE des boutons change.

   ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
   Il ne fabrique jamais d'action absente de la solution (§71), n'arrondit jamais
   un sizing joué vers un sizing étudié (§34), et ne produit rien du tout quand
   il n'y a pas de solution (§90) — il rend alors l'état « aucune solution
   vérifiée » que l'écran doit afficher tel quel.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { normalizeGameState, ActionType } from "./gameState.js";
import { getTrainingNode, compareAction, sampleAction } from "./pfase.js";
import { resolveTrainingSolution, ResolutionOutcome } from "./trainingSolutionResolver.js";
import { EvaluationModel, EPS } from "./config.js";
import { roundAmount } from "./sizingSpec.js";

/* ── Identifiants d'action côté Trainer ────────────────────────────────────
   Le Trainer reconnaît FOLD / CHECK / CALL / RAISE / ALLIN et une famille
   BETxx. On conserve ce vocabulaire pour ne rien casser, mais l'identifiant est
   désormais DÉRIVÉ du montant réel, pas d'une étiquette de template. C'est le
   défaut C6 déjà corrigé côté Trainer, appliqué ici à la source. */
export function trainerActionId(action, index) {
  switch (action.actionType) {
    case ActionType.FOLD: return "FOLD";
    case ActionType.CHECK: return "CHECK";
    case ActionType.CALL: return "CALL";
    case ActionType.ALL_IN: return "ALLIN";
    case ActionType.RAISE: return index > 0 ? `RAISE${index}` : "RAISE";
    case ActionType.BET: default: {
      const pct = action.potFraction != null ? Math.round(action.potFraction * 100) : null;
      return pct != null ? `BET${pct}` : `BET${index}`;
    }
  }
}

/* Libellé lisible — dérivé du MONTANT, jamais d'un identifiant (§C6/§34). */
export function trainerActionLabel(action) {
  const bb = fmt(action.toBb);
  switch (action.actionType) {
    case ActionType.FOLD: return "Fold";
    case ActionType.CHECK: return "Check";
    case ActionType.CALL: return `Call ${fmt(action.additionalBb)}bb`;
    case ActionType.ALL_IN: return `Tapis ${bb}bb`;
    case ActionType.RAISE: return `Relancer à ${bb}bb`;
    case ActionType.BET: default: {
      const pct = action.potFraction != null ? Math.round(action.potFraction * 100) : null;
      return pct != null ? `Bet ${pct}% · ${bb}bb` : `Bet ${bb}bb`;
    }
  }
}
const fmt = (v) => {
  const n = roundAmount(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
};

/* ══════════════════════════════════════════════════════════════════════════
   spotToGameState — spot Trainer + ledger → état canonique PFASE.

   Le LEDGER est la source des tapis et du pot : c'est lui qui, côté Trainer, a
   déjà été rendu cohérent (une seule comptabilité de main). On ne recalcule
   rien ici — on traduit.
   ══════════════════════════════════════════════════════════════════════════ */
export function spotToGameState(spot, ledger, opts = {}) {
  if (!spot) return { ok: false, errors: ["spot absent"], state: null };
  const seats = (ledger && ledger.seats) || {};
  const positions = Object.keys(seats);
  const heroPos = spot.hpos;

  /* Sans ledger utilisable, on construit un état minimal heads-up à partir du
     spot. C'est le cas des spots de template, pour lesquels le Trainer n'a pas
     encore ouvert de main complète. */
  const players = positions.length
    ? positions.map(p => ({
      id: p, position: p,
      stack: num(seats[p].remaining),
      committedStreet: num(seats[p].street),
      committedTotal: num(seats[p].total),
      folded: !!seats[p].folded,
      allIn: !!seats[p].allIn,
      isHero: p === heroPos,
    }))
    : [
      { id: heroPos || "HERO", position: heroPos || "HERO", stack: parseStack(spot.stack), committedStreet: 0, isHero: true },
      { id: spot.vpos || "VILL", position: spot.vpos || "VILL", stack: parseStack(spot.stack), committedStreet: 0 },
    ];

  const streetContrib = players.reduce((a, p) => a + p.committedStreet, 0);
  const potTotal = ledger && Number.isFinite(Number(ledger.pot)) ? Number(ledger.pot) : num(spot.pot);
  const deadPot = Math.max(0, roundAmount(potTotal - streetContrib));

  return normalizeGameState({
    gameType: opts.gameType || (String(spot.fmt || "").toLowerCase().includes("tourn") ? "TOURNAMENT" : "CASH"),
    format: opts.format || spot.fmt || null,
    street: spot.street,
    board: Array.isArray(spot.board) ? spot.board : [],
    blinds: opts.blinds || { sb: 0.5, bb: 1 },
    ante: opts.ante || 0,
    minBet: opts.minBet || 1,
    rake: opts.rake || null,
    players,
    actorId: heroPos || (players.find(p => p.isHero) || players[0]).id,
    deadPot,
    lastRaiseIncrement: opts.lastRaiseIncrement,
    actionHistory: normalizeHistory(spot),
    evaluationModel: opts.evaluationModel || EvaluationModel.CHIP_EV,
    icmParams: opts.icmParams || null,
    pkoParams: opts.pkoParams || null,
  });
}

function normalizeHistory(spot) {
  const raw = Array.isArray(spot.actionHistory) ? spot.actionHistory
    : Array.isArray(spot.preActions) ? spot.preActions : [];
  return raw.map(a => {
    const t = String(a?.actionType || a?.action || a?.type || a?.id || "").toUpperCase();
    /* §37 — traduction EXPLICITE vers les types stricts. Les libellés du Trainer
       (« 3-bet », « squeeze », « open ») sont tous des RAISE ; les confondre avec
       des BET produirait un type de pot faux. */
    const actionType =
      /FOLD/.test(t) ? ActionType.FOLD
        : /CHECK/.test(t) ? ActionType.CHECK
          : /CALL/.test(t) ? ActionType.CALL
            : /ALL.?IN|SHOVE|JAM|PUSH/.test(t) ? ActionType.ALL_IN
              : /RAISE|3BET|4BET|5BET|SQUEEZE|OPEN|ISO/.test(t) ? ActionType.RAISE
                : ActionType.BET;
    return { street: a?.street, position: a?.position, actionType, size: a?.amountBb ?? a?.amount ?? a?.size ?? 0 };
  });
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function parseStack(stack) {
  const n = Number(String(stack ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 100;
}

/* ══════════════════════════════════════════════════════════════════════════
   solutionActsForSpot — LE POINT CENTRAL (§31, §32, §33, §71).

   Rend les `acts` que le Trainer doit afficher, dérivés de la solution active.

   Single Size → CHECK + un seul BET.
   Simple      → CHECK + deux BET, issus du MÊME arbre optimisé.
   Full        → toutes les actions de la solution.

   Aucun ajout, aucune suppression : la liste est celle du nœud.
   ══════════════════════════════════════════════════════════════════════════ */
export function solutionActsForSpot({ solution, path = [], handClass = null } = {}) {
  const node = getTrainingNode(solution, path, { handClass });
  if (!node.ok) {
    return { ok: false, reason: node.reason, acts: [], node: null };
  }
  const acts = node.actions.map((a, i) => {
    const id = trainerActionId(a, i);
    return {
      id,
      l: trainerActionLabel(a),
      s: `${fmt(a.toBb)}bb`,
      /* Grandeurs EXPLOITABLES par le moteur du Trainer — il ne relit jamais le
         libellé pour retrouver un montant (défaut C4/C6 déjà corrigé). */
      amountBb: a.toBb,
      additionalBb: a.additionalBb,
      actionType: a.actionType,
      potFraction: a.potFraction,
      solverLabel: a.label,
      specKey: a.specKey,
      specLabel: a.specLabel,
    };
  });

  /* §36 — le retour d'entraînement a besoin des fréquences ET de leur source. */
  const freq = {};
  node.actions.forEach((a, i) => { freq[trainerActionId(a, i)] = Math.round((a.frequency || 0) * 1000) / 10; });
  let okIdx = 0, best = -1;
  node.actions.forEach((a, i) => { if ((a.frequency || 0) > best) { best = a.frequency || 0; okIdx = i; } });

  return {
    ok: true,
    acts, freq, ok_index: okIdx,
    node,
    /* Ce que l'écran doit afficher AVEC les boutons (§18/§91). */
    provenance: node.provenance,
    provenanceMeta: node.provenanceMeta,
    complexity: node.complexity,
    mode: node.mode,
    status: node.status,
    partialReasons: node.partialReasons,
    frequencySource: node.frequencySource,
    frequencyNote: node.frequencyNote,
    measurement: node.measurement,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   trainerVerdict (§34, §36, §37) — le retour après la décision d'Hero.

   Rend, quand — et seulement quand — l'information existe :
     action Hero · action de la solution · sizing retenu · fréquence · EV · perte
   ══════════════════════════════════════════════════════════════════════════ */
export function trainerVerdict({ solution, path = [], handClass = null, heroAction } = {}) {
  if (!heroAction) return { ok: false, reason: "aucune action Hero" };
  const cmp = compareAction({
    solution, path, handClass,
    actionType: heroAction.actionType,
    sizeBb: heroAction.toBb ?? heroAction.amountBb ?? null,
    sizeIsTotal: true,
  });
  if (!cmp.ok) return { ok: false, reason: cmp.reason };

  const sol = typeof solution === "string" ? null : solution;
  const ranking = sol && sol.actionRanking ? sol.actionRanking : null;

  return {
    ok: true,
    /* §37 — le type et la taille restent DEUX champs distincts jusqu'au bout. */
    heroAction: { actionType: heroAction.actionType, sizeBb: heroAction.toBb ?? heroAction.amountBb ?? null },
    solutionAction: cmp.bestAction ? {
      actionType: cmp.bestAction.actionType,
      sizeBb: cmp.bestAction.toBb,
      specLabel: cmp.bestAction.specLabel,
      frequency: cmp.bestAction.frequency,
    } : null,
    inTree: cmp.inTree,
    matched: cmp.matched || null,
    nearestStudied: cmp.nearestStudied || null,
    verdict: cmp.verdict,
    /* §36 — « uniquement lorsque ces informations sont disponibles ». */
    /* §36/§49 — EV jouée · EV la meilleure · écart. Absentes tant que
       `evAvailable` est faux : aucun consommateur ne doit fabriquer un nombre. */
    evAvailable: cmp.evAvailable,
    evPlayedBb: cmp.evPlayedBb ?? null,
    evBestBb: cmp.evBestBb ?? null,
    evLossBb: cmp.evLossBb ?? null,
    evBestLabel: cmp.evBestSpecLabel || cmp.evBestLabel || null,
    evExact: cmp.evExact ?? null,
    evSource: cmp.evSource || null,
    evIsRangeWide: !!cmp.evIsRangeWide,
    /* L'écart tient-il dans le résidu d'indifférence du nœud ? Si oui, ce
       n'est PAS une erreur : à l'équilibre les actions mixées se valent. */
    evEquilibriumResidualBb: cmp.evEquilibriumResidualBb ?? null,
    evLossBelowNoise: cmp.evLossBelowNoise ?? null,
    evNote: cmp.evNote || cmp.reason || null,
    /* §15 — l'écart d'EV entre SIZINGS, lui, est mesuré et disponible. */
    sizingRanking: ranking,
    evLossOfSolution: sol && sol.simplificationMetrics ? sol.simplificationMetrics.absoluteEVLoss : null,
    evLossDistinguishable: sol ? sol.distinguishable !== false : null,
    frequencySource: cmp.frequencySource,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   villainActionFromSolution (§43, §68)

   « Les actions Villain doivent provenir de la stratégie du nœud. Échantillonner
   correctement. Ne pas choisir systématiquement l'action majoritaire. »

   `rng` est injectable : le mode déterministe de QA (§68) fournit un générateur
   seedé, et la séquence devient rejouable à l'identique.
   ══════════════════════════════════════════════════════════════════════════ */
export function villainActionFromSolution({ solution, path = [], handClass = null, rng = Math.random } = {}) {
  const node = getTrainingNode(solution, path, { handClass });
  if (!node.ok) return { ok: false, reason: node.reason };
  const a = sampleAction(node, rng);
  if (!a) return { ok: false, reason: "aucune action au nœud" };
  return {
    ok: true,
    actionType: a.actionType,
    toBb: a.toBb, additionalBb: a.additionalBb,
    potFraction: a.potFraction, specLabel: a.specLabel,
    frequency: a.frequency,
    label: trainerActionLabel(a),
    /* La distribution complète voyage : le Coach doit pouvoir dire « il misait
       36 % du temps » et non « il a misé ». */
    distribution: node.actions.map(x => ({ actionType: x.actionType, toBb: x.toBb, frequency: x.frequency })),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   spotFromSolution (§87) — LE CHEMIN « SOLVER → TRAINER ».

   « Le Trainer est terminé uniquement si une solution produite dans SharkSolver
   peut être immédiatement saved / loaded / opened / trained against SANS
   RECOPIER MANUELLEMENT SES SIZINGS. » (§87)

   Le sens du flux compte. Chercher, depuis un spot du Trainer, une solution qui
   lui corresponde suppose que le Trainer sache reconstruire les MÊMES ranges et
   les MÊMES paramètres d'étude que le solveur — coïncidence qui n'arrive jamais
   (les ranges du Trainer sont heuristiques, celles du solveur sont éditées).

   On construit donc le spot À PARTIR de la solution : board, pot, tapis,
   positions, actions et fréquences en sortent tous, et rien n'est recopié à la
   main. C'est aussi ce qui rend l'entraînement HONNÊTE — le spot joué est
   exactement celui qui a été résolu.
   ══════════════════════════════════════════════════════════════════════════ */

const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
/* "As" → {r:"A", s:"♠"} : la représentation de carte du Trainer. */
export function cardKeyToTrainerCard(key) {
  if (typeof key !== "string" || key.length < 2) return null;
  const r = key[0].toUpperCase();
  const s = SUIT_SYMBOL[key[1]];
  return "23456789TJQKA".includes(r) && s ? { r, s } : null;
}

/* Deux cartes concrètes pour une classe ("AKs", "QQ", "T9o"), en évitant le board. */
export function dealHandForClass(classKey, boardKeys = [], rng = Math.random) {
  if (typeof classKey !== "string" || classKey.length < 2) return null;
  const suits = ["s", "h", "d", "c"];
  const used = new Set(boardKeys.map(k => String(k).toLowerCase()));
  const free = (r, s) => !used.has((r + s).toLowerCase());
  const r1 = classKey[0].toUpperCase(), r2 = classKey[1].toUpperCase();
  const suited = /s$/i.test(classKey) && r1 !== r2;
  const pair = r1 === r2;

  const order = suits.slice().sort(() => (rng() < 0.5 ? -1 : 1));   // varie les couleurs
  if (pair) {
    for (const a of order) for (const b of order) {
      if (a === b) continue;
      if (free(r1, a) && free(r2, b)) return [cardKeyToTrainerCard(r1 + a), cardKeyToTrainerCard(r2 + b)];
    }
    return null;
  }
  if (suited) {
    for (const a of order) if (free(r1, a) && free(r2, a)) return [cardKeyToTrainerCard(r1 + a), cardKeyToTrainerCard(r2 + a)];
    return null;
  }
  for (const a of order) for (const b of order) {
    if (a === b) continue;
    if (free(r1, a) && free(r2, b)) return [cardKeyToTrainerCard(r1 + a), cardKeyToTrainerCard(r2 + b)];
  }
  return null;
}

/* Construit un spot Trainer complet à partir d'une PFSolution.
   Retourne { ok, spot, reason }. */
export function spotFromSolution(solution, { handClass = null, path = [], rng = Math.random, id = null } = {}) {
  if (!solution) return { ok: false, reason: "solution absente" };
  const acts = solutionActsForSpot({ solution, path, handClass });
  if (!acts.ok) return { ok: false, reason: acts.reason };

  /* Classe de main : celle demandée si elle est dans la solution, sinon une
     classe TIRÉE parmi celles réellement solvées — jamais une main hors range,
     qui n'aurait aucune fréquence associée. */
  const classes = (solution.strategy && solution.strategy.classes) || [];
  const chosen = handClass && classes.includes(handClass)
    ? handClass
    : (classes.length ? classes[Math.min(classes.length - 1, Math.floor(rng() * classes.length))] : null);
  if (!chosen) return { ok: false, reason: "la solution ne porte aucune classe de main" };

  const board = (solution.board || []).map(cardKeyToTrainerCard).filter(Boolean);
  const hand = dealHandForClass(chosen, solution.board || [], rng);
  if (!hand || hand.some(c => !c)) return { ok: false, reason: `impossible de distribuer ${chosen} sans collision avec le board` };

  /* Les fréquences de LA MAIN choisie, pas de la range. */
  const forHand = solutionActsForSpot({ solution, path, handClass: chosen });
  const useActs = forHand.ok ? forHand : acts;

  const hero = (solution.players || []).find(p => p.isHero) || {};
  const vill = (solution.players || []).find(p => !p.isHero) || {};
  const node = useActs.node;

  const spot = {
    id: id || `pfase-${solution.solutionId}`,
    cat: solution.street === "FLOP" ? "Flop" : solution.street === "TURN" ? "Turn" : solution.street === "RIVER" ? "River" : "Postflop",
    street: solution.street === "FLOP" ? "Flop" : solution.street === "TURN" ? "Turn" : "River",
    hpos: hero.position || (solution.positions || [])[0] || "BB",
    vpos: vill.position || (solution.positions || [])[1] || "BTN",
    stack: `${solution.effectiveStacks}bb`,
    pot: solution.pot,
    toCall: node ? node.toCallBb : 0,
    hand, board,
    acts: useActs.acts,
    freq: useActs.freq,
    ok: useActs.ok_index,
    best: useActs.acts[useActs.ok_index] ? useActs.acts[useActs.ok_index].l : null,
    ev: {},                       // §36/L4 — l'EV par action n'existe pas : on ne l'invente pas
    expl: explanationFor(solution, useActs, chosen),
    detail: detailFor(solution, useActs),
    leaks: [],
    diff: 3,

    /* ── Provenance, au format que l'écran du Trainer sait déjà afficher ── */
    strategySource: "solver",
    strategyProvenance: "pfase",
    strategyNote: noteFor(solution),
    strategyScope: null,
    strategyLimits: solution.partialReasons || [],
    strategyEngine: { name: "PFASE", version: solution.sizingEngineVersion, exact: solution.status === "COMPLETE", label: "⚖️ Adaptive Sizing" },
    strategyConfidence: solution.status === "COMPLETE" ? "exact" : "documented",
    strategyPayoutModel: solution.evaluationModel,
    strategyFallbackReason: null,

    /* ── Traçabilité : le spot SAIT de quelle solution il vient (§51/§87) ── */
    pfase: {
      solutionId: solution.solutionId,
      gameStateHash: solution.gameStateHash,
      complexity: solution.sizingComplexity,
      mode: solution.sizingMode,
      handClass: chosen,
      path: path.slice(),
      selected: (solution.selectedSizes?.bets || []).map(b => b.label),
      reference: (solution.referenceSizes?.bets || []).map(b => b.label),
      evLossBb: solution.simplificationMetrics ? solution.simplificationMetrics.absoluteEVLoss : null,
      measurementFloorBb: solution.measurement ? solution.measurement.floor : null,
      distinguishable: solution.distinguishable !== false,
      frequencySource: useActs.frequencySource,
      badge: solution.provenanceMeta ? solution.provenanceMeta.badge : null,
      status: solution.status,
      /* ── ÉQUILIBRE OU EXPLOIT (§45/§46) ────────────────────────────────
         Le Trainer doit pouvoir nommer ce contre quoi le joueur s'entraîne. Une
         séance d'exploitation d'un Calling Station est un exercice légitime et
         utile — mais présentée comme « la solution », elle enseignerait comme
         équilibre une stratégie qui se fait détruire par un adversaire correct.
         Le badge doit donc changer, pas seulement une ligne de détail. */
      strategyKind: solution.strategyKind || "EQUILIBRIUM",
      exploitLabel: solution.exploit ? solution.exploit.label : null,
      exploitProfileId: solution.exploit ? solution.exploit.profileId : null,
      exploitModelNote: solution.exploit ? solution.exploit.modelNote : null,
    },
  };
  return { ok: true, spot, handClass: chosen };
}

function noteFor(sol) {
  const sizes = (sol.selectedSizes?.bets || []).map(b => b.label).join(" · ") || "—";
  const ref = (sol.referenceSizes?.bets || []).map(b => b.label).join(" · ");
  const loss = sol.simplificationMetrics ? sol.simplificationMetrics.absoluteEVLoss : null;
  const floor = sol.measurement ? sol.measurement.floor : null;
  const dist = sol.distinguishable !== false;
  let s = `Adaptive Sizing — niveau ${sol.sizingComplexity}, sizing retenu ${sizes} (comparé à ${ref}).`;
  if (loss != null) {
    s += dist
      ? ` Perte d'EV mesurée : ${loss} bb.`
      : ` Perte d'EV ${loss} bb, sous le plancher de mesure (${floor} bb) : non distinguable du bruit.`;
  }
  if (sol.status === "PARTIAL") s += ` Réserves : ${(sol.partialReasons || []).join(" · ")}.`;
  return s;
}
function explanationFor(sol, acts, handClass) {
  const best = acts.acts[acts.ok_index];
  if (!best) return "Solution disponible.";
  const f = acts.freq[best.id];
  return `${best.l} — ${f}% avec ${handClass} dans la solution ${sol.sizingComplexity}.`;
}
function detailFor(sol, acts) {
  const out = [];
  const sizes = (sol.selectedSizes?.bets || []).map(b => b.label).join(" · ");
  out.push({ i: "⚖️", t: `<strong>Sizings retenus</strong> : ${sizes || "—"} — sélectionnés par comparaison d'EV, pas proposés d'avance.` });
  if (sol.actionRanking && sol.actionRanking.actions.length > 1) {
    const r = sol.actionRanking.actions.map(a => `${a.displayLabel} ${a.delta === 0 ? "(référence)" : a.delta + " bb"}`).join(" · ");
    out.push({ i: "📊", t: `<strong>Écart d'EV entre sizings</strong> : ${r}.` });
  }
  if (sol.accuracy) {
    out.push({ i: "🎯", t: sol.accuracy.exact
      ? `<strong>Exploitabilité</strong> ${sol.accuracy.value} bb (NashConv exact, ${sol.accuracy.iterations} itérations).`
      : `<strong>Exploitabilité</strong> indisponible — ${sol.accuracy.note || "runouts échantillonnés"}.` });
  }
  const freqs = acts.acts.map(a => `${a.l} ${acts.freq[a.id]}%`).join(" · ");
  out.push({ i: "🧮", t: `<strong>Fréquences</strong> (${acts.frequencySource === "hand-class" ? "cette main" : "range entière"}) : ${freqs}.` });
  return out;
}

/* Générateur pseudo-aléatoire SEEDÉ (§68) — même graine, même partie. */
export function seededRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   prepareTrainerSpot — l'enchaînement complet, tel que §29 l'impose :

     Trainer → request solution → Solution Resolver → verified strategy
             → legal actions → Trainer UI

   Rend soit des actions vérifiées, soit un état « aucune solution » explicite
   avec ses options (§90). Jamais d'actions fabriquées.
   ══════════════════════════════════════════════════════════════════════════ */
export function prepareTrainerSpot({
  spot, ledger, complexity, trainingMode = "gto",
  studySpec, solverConfig, handClass = null, path = [], stateOpts,
} = {}) {
  const g = spotToGameState(spot, ledger, stateOpts || {});
  if (!g.ok) {
    return { ok: false, outcome: "INVALID_STATE", reason: g.errors[0], problems: g.errors, acts: [] };
  }
  const res = resolveTrainingSolution({
    state: g.state,
    heroRange: spot.heroRange || null,
    villainRange: spot.villainRange || null,
    studySpec, solverConfig, complexity, trainingMode,
  });
  if (res.outcome === ResolutionOutcome.NONE || res.outcome === ResolutionOutcome.UNSUPPORTED) {
    return {
      ok: false, outcome: res.outcome, reason: res.reason,
      /* §90 — le message EXACT que l'écran doit montrer, et les suites offertes. */
      message: "No verified solution available",
      offeredActions: res.actions,
      available: res.available,
      state: g.state, acts: [],
    };
  }
  const acts = solutionActsForSpot({ solution: res.solution, path, handClass });
  if (!acts.ok) {
    return { ok: false, outcome: "NODE_MISSING", reason: acts.reason, state: g.state, acts: [] };
  }
  return {
    ok: true, outcome: res.outcome,
    state: g.state,
    solution: res.solution,
    solutionId: res.solution.solutionId,
    complexity: res.complexity,
    requestedComplexity: res.requestedComplexity,
    complexityDowngraded: res.outcome === ResolutionOutcome.OTHER_COMPLEXITY,
    downgradeReason: res.reason || null,
    compatibility: res.compatibility,
    mayClaimSolved: res.mayClaimSolved,
    ...acts,
  };
}


/* ══════════════════════════════════════════════════════════════════════════
   spotsFromSolutions — UNE TABLE PAR SOLUTION (§67, §69, §104, §108)

   L'entraînement contre une solution PFASE était mono-table par construction :
   une solution décrit UN état de jeu, donc UN spot, donc une table. Ce n'était
   pas un oubli, mais ce n'était pas non plus une fatalité — il suffit de
   plusieurs solutions.

   Deux usages, et le second est le plus intéressant :

     · plusieurs SPOTS différents (quatre boards résolus séparément), pour du
       multitabling ordinaire ;
     · les quatre NIVEAUX du même état (FULL / ADVANCED / SIMPLE / SINGLE), joués
       côte à côte. Le §110 décrit cette famille ; la jouer simultanément est la
       seule façon de SENTIR ce qu'une simplification coûte, au lieu de lire un
       chiffre de perte d'EV sous un plancher de mesure.

   Chaque table reste isolée : sa solution, ses sizings, sa provenance. Rien
   n'est partagé entre elles — c'est précisément ce que la QA multitable doit
   vérifier, et le genre de contamination qu'un état global ferait passer
   inaperçue.
   ══════════════════════════════════════════════════════════════════════════ */
export function spotsFromSolutions(solutions, { handClass = null, rng = Math.random, max = 4 } = {}) {
  const list = (Array.isArray(solutions) ? solutions : [solutions]).filter(Boolean);
  if (!list.length) return { ok: false, reason: "aucune solution fournie" };
  const spots = [], refus = [];
  for (const sol of list.slice(0, max)) {
    const built = spotFromSolution(sol, { handClass, rng });
    if (built.ok) spots.push(built.spot);
    else refus.push({ solutionId: sol.solutionId || null, reason: built.reason });
  }
  if (!spots.length) return { ok: false, reason: "aucune solution exploitable", refus };
  /* Les refus sont RENDUS, pas avalés : trois tables sur quatre, c'est trois
     tables sur quatre — et l'utilisateur doit savoir laquelle manque. */
  return { ok: true, spots, refus, tables: spots.length };
}
