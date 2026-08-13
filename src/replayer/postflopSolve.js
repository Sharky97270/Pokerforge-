/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : PONT VERS LE SOLVEUR CFR POSTFLOP

   Le Replayer ne disposait jusqu'ici que d'UNE surface réellement calculée :
   le push/fold préflop heads-up ≤ 30bb. Tout le postflop retombait sur le
   moteur heuristique. Le CFR multi-street existe pourtant déjà dans le
   projet (`solveMultiStreet`, consommé par le Trainer via un Web Worker) :
   ce module le rend accessible au rejeu.

   Rôle strictement limité à la TRADUCTION :
     snapshot du Replayer → spot au format attendu par le provider Trainer
     → requête worker ; puis résultat worker → bloc plain-data consommable
     par decisionAnalysis. Aucun solve ici (il vit dans le worker), aucune
     dépendance React → module PUR, testable en Node.

   ── PÉRIMÈTRE VOLONTAIREMENT ÉTROIT ──
   L'arbre résolu modélise « Hero check → Villain bet → Hero F/C/R » ou
   « Hero ouvre : Check/Bet ». On n'accepte donc QUE les nœuds qui
   correspondent réellement à ce modèle :
     • heads-up strict (2 joueurs encore dans le coup) ;
     • Hero n'a encore rien investi sur la street ;
     • au plus UNE agression adverse sur la street.
   Un check-raise ou un 3-bet postflop sort du modèle : on refuse plutôt que
   de présenter comme « calculée » une stratégie issue d'un autre arbre.
═══════════════════════════════════════════════════════════════ */
import { isSolvablePostflop, buildPostflopSolveRequest, mapWorkerResultToStrategy } from "../trainerPostflopSolver.js";

const rb = v => Math.round(v * 100) / 100;
const AGGRESSIVE = ["bet", "raise", "allin"];
const BETTING = ["fold", "check", "call", "bet", "raise", "allin"];

/* Provenance publiée par ce pont — distincte du solveur exact (§8/§16). */
export const CFR_PROVENANCE = "cfr-experimental";

/**
 * Construit le « spot » (format provider Trainer) correspondant à la décision
 * Hero de l'étape `step`, ou null si l'étape sort du modèle résolu.
 */
export function buildReplayerPostflopSpot(hand, snaps, step) {
  if (!hand || !Array.isArray(snaps) || step == null || step <= 0) return null;
  const ev = hand.events?.[step];
  if (!ev || ev.playerId !== hand.heroId || !BETTING.includes(ev.type)) return null;

  const street = String(ev.street || "").toLowerCase();
  if (!/^(flop|turn|river)$/.test(street)) return null;

  // État JUSTE AVANT la décision : c'est lui qui décrit le nœud à résoudre.
  const prev = snaps[step - 1];
  if (!prev) return null;

  const live = prev.players.filter(p => !p.folded);
  if (live.length !== 2) return null;                        // heads-up strict
  const hero = live.find(p => p.isHero);
  const vil = live.find(p => !p.isHero);
  if (!hero || !vil) return null;
  if (hero.allIn || vil.allIn) return null;                  // plus de décision à résoudre
  if (!Array.isArray(hero.hole) || hero.hole.length !== 2) return null;

  const board = prev.board || [];
  const need = { flop: 3, turn: 4, river: 5 }[street];
  if (board.length !== need) return null;

  // Hero ne doit rien avoir investi sur cette street : l'arbre part d'un nœud
  // vierge (Hero n'a pas encore agi). Sinon on serait dans une branche
  // check-raise / 3-bet postflop, non modélisée.
  if ((hero.committed || 0) > 0.0001) return null;

  // Agressions adverses sur cette street, avant l'action de Hero.
  const streetEvents = hand.events.slice(0, step).filter(e => e.street === street);
  const vilAggr = streetEvents.filter(e => e.playerId === vil.id && AGGRESSIVE.includes(e.type));
  if (vilAggr.length > 1) return null;                       // re-relance : hors modèle

  const toCall = rb(Math.max(0, (vil.committed || 0) - (hero.committed || 0)));
  const mode = toCall > 0 ? "facing" : "leads";
  if (mode === "leads" && (vil.committed || 0) > 0.0001) return null;   // incohérence
  if (mode === "facing" && vilAggr.length !== 1) return null;           // mise non identifiée

  const pot = rb(prev.potTotal || 0);
  if (!(pot > 0)) return null;
  const stack = rb(hero.stack || 0);
  if (!(stack > 0)) return null;

  // Boutons synthétiques : le provider en déduit les labels d'action de l'arbre
  // et, pour une mise, la fraction de pot. On reprend le sizing RÉELLEMENT joué
  // quand Hero mise, pour que la fréquence renvoyée porte sur SON sizing.
  let acts;
  if (mode === "facing") {
    acts = [{ id: "FOLD", l: "Fold" }, { id: "CALL", l: "Call" }, { id: "RAISE", l: "Raise" }];
  } else {
    const betPot = pot - (hero.committed || 0);
    const played = AGGRESSIVE.includes(ev.type) && ev.amount > 0 && betPot > 0
      ? Math.round((ev.amount / betPot) * 100) : 66;
    const pct = Math.max(20, Math.min(150, played));
    acts = [{ id: "CHECK", l: "Check" }, { id: "BET", l: `Bet ${pct}%` }];
  }

  /* Type de pot : le modèle Replayer connaît déjà la réponse (nombre de
     relances préflop → potType). On la transmet explicitement plutôt que de
     laisser le provider la deviner à partir de la taille du pot. */
  const actionHistory = /^(3Bet|4Bet\+)$/.test(hand.potType || "")
    ? [{ actionType: hand.potType === "3Bet" ? "3BET" : "4BET", label: hand.potType }]
    : [];

  return {
    street, board,
    hand: hero.hole,
    hpos: hero.pos, vpos: vil.pos,
    stack, pot, toCall, bb: 1,
    acts, actionHistory,
    multiway: false, villains: [vil.pos],
    _mode: mode, _step: step,
  };
}

/**
 * Étape → requête worker prête à poster, ou null si non résoluble.
 * @returns {{spot, request, actsMap, meta}|null}
 */
export function buildReplayerCfrRequest(hand, snaps, step) {
  const spot = buildReplayerPostflopSpot(hand, snaps, step);
  if (!spot) return null;
  if (!isSolvablePostflop(spot)) return null;
  const built = buildPostflopSolveRequest(spot);
  if (!built) return null;
  return { spot, request: built.request, actsMap: built.actsMap, meta: built.meta };
}

/* Bouton du spot → famille d'action canonique de decisionAnalysis. */
const ACT_OF_ID = { CHECK: "CHECK", BET: "BET", FOLD: "FOLD", CALL: "CALL", RAISE: "RAISE" };
const LABEL_OF_ID = { CHECK: "Check", BET: "Bet", FOLD: "Fold", CALL: "Call", RAISE: "Raise" };

/**
 * Résultat worker → bloc PLAIN-DATA consommé par decisionAnalysis via
 * `ctx.cfr[step]`. Volontairement sans fonction ni classe : il traverse un
 * état React et doit rester sérialisable.
 *
 * IMPORTANT — aucune EV n'est produite. Le worker ne renvoie que des
 * FRÉQUENCES d'équilibre ; inventer une EV en bb à partir d'un écart de
 * fréquence reviendrait exactement à ce que ce projet s'interdit. Le bloc
 * porte donc `metric:"frequency"` et l'UI parle d'écart à l'optimum, pas
 * d'EV perdue.
 */
export function cfrResultToBlock(workerRes, built) {
  if (!workerRes || !workerRes.ok || !built) return null;
  const strat = mapWorkerResultToStrategy(workerRes, built.spot, built.actsMap, built.meta);
  if (!strat || !strat.solved) return null;

  const freqByAction = {};
  for (const a of built.spot.acts || []) {
    const act = ACT_OF_ID[a.id];
    if (!act) continue;
    const f = strat.freq?.[a.id];
    if (typeof f === "number") freqByAction[act] = rb(f);
  }
  if (!Object.keys(freqByAction).length) return null;

  let bestAction = null, best = -1;
  for (const [act, f] of Object.entries(freqByAction)) if (f > best) { best = f; bestAction = act; }

  return {
    step: built.spot._step,
    mode: built.spot._mode,
    street: built.meta?.street || built.spot.street,
    freqByAction,
    labels: Object.fromEntries(Object.keys(freqByAction).map(a => [a, LABEL_OF_ID[a] || a])),
    bestAction,
    source: "solver",
    provenance: CFR_PROVENANCE,
    metric: "frequency",
    exact: built.meta?.street === "river" && workerRes.nashConv != null,
    nashConv: workerRes.nashConv ?? null,
    fromLibrary: !!workerRes.fromLibrary,
    solveMs: workerRes.solveMs ?? null,
    note: strat.note,
    heroClassKey: built.meta?.heroClassKey || null,
    potKind: built.meta?.potKind || null,
  };
}

/**
 * Toutes les étapes du rejeu où une décision Hero est résoluble par le CFR.
 * Sert au pré-solve : on sait à l'avance ce qui vaut la peine d'être calculé.
 */
export function solvableSteps(hand, snaps) {
  const out = [];
  if (!hand || !Array.isArray(snaps)) return out;
  for (let i = 0; i < snaps.length; i++) {
    if (buildReplayerCfrRequest(hand, snaps, i)) out.push(i);
  }
  return out;
}
