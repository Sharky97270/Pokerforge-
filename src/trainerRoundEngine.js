export const TRAINER_STREETS = {
  PREFLOP: "PREFLOP",
  FLOP: "FLOP",
  TURN: "TURN",
  RIVER: "RIVER",
  SHOWDOWN: "SHOWDOWN",
  HAND_COMPLETE: "HAND_COMPLETE",
};

const STREET_ORDER = [
  TRAINER_STREETS.PREFLOP,
  TRAINER_STREETS.FLOP,
  TRAINER_STREETS.TURN,
  TRAINER_STREETS.RIVER,
  TRAINER_STREETS.SHOWDOWN,
];

export const TRAINER_POSTFLOP_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];

const TRAINER_BOARD_LENGTHS = {
  [TRAINER_STREETS.PREFLOP]: 0,
  [TRAINER_STREETS.FLOP]: 3,
  [TRAINER_STREETS.TURN]: 4,
  [TRAINER_STREETS.RIVER]: 5,
  [TRAINER_STREETS.SHOWDOWN]: 5,
  [TRAINER_STREETS.HAND_COMPLETE]: 0,
};

const FALLBACK_BOARD = ["As", "Kd", "7c", "2h", "9s"];

export function normalizeTrainerStreet(street) {
  const s = String(street || "").toUpperCase();
  if (s.startsWith("PRE")) return TRAINER_STREETS.PREFLOP;
  if (s.startsWith("FLOP")) return TRAINER_STREETS.FLOP;
  if (s.startsWith("TURN")) return TRAINER_STREETS.TURN;
  if (s.startsWith("RIVER")) return TRAINER_STREETS.RIVER;
  if (s.startsWith("SHOW")) return TRAINER_STREETS.SHOWDOWN;
  if (s.startsWith("DONE") || s.startsWith("HAND")) return TRAINER_STREETS.HAND_COMPLETE;
  return TRAINER_STREETS.PREFLOP;
}

export function nextTrainerStreet(street) {
  const current = normalizeTrainerStreet(street);
  const idx = STREET_ORDER.indexOf(current);
  return idx >= 0 && idx < STREET_ORDER.length - 1
    ? STREET_ORDER[idx + 1]
    : TRAINER_STREETS.HAND_COMPLETE;
}

export function normalizeTrainerActionType(action) {
  const id = (action?.id || action?.action || action || "").toString().toUpperCase();
  if (id === "BET33" || id === "BET50" || id === "BET75" || id === "BET100") return "BET";
  if (id === "CHECK_BACK") return "CHECK";
  if (id === "3BET") return "3BET";
  if (id === "4BET") return "4BET";
  if (id === "ALLIN") return "ALLIN";
  return id || "ACTION";
}

function roundBb(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

function amountFromText(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function normalizeInvested(input) {
  const invested = {};
  if (!input) return invested;
  if (input instanceof Map) {
    input.forEach((amount, position) => {
      if (position) invested[position] = roundBb(amount);
    });
    return invested;
  }
  if (Array.isArray(input)) {
    input.forEach((entry) => {
      const position = entry?.position || entry?.pos || entry?.seat || entry?.actor;
      if (!position) return;
      invested[position] = roundBb(entry?.amountBb ?? entry?.amount ?? entry?.committed ?? 0);
    });
    return invested;
  }
  Object.entries(input || {}).forEach(([position, amount]) => {
    invested[position] = roundBb(amount);
  });
  return invested;
}

function addInvestment(invested, position, amount) {
  if (!position) return;
  const next = roundBb(amount);
  if (!(next > 0)) return;
  invested[position] = Math.max(roundBb(invested[position] || 0), next);
}

function sumInvested(invested) {
  return roundBb(Object.values(invested).reduce((sum, amount) => sum + roundBb(amount), 0));
}

function actionAmount(action, spot, ctx) {
  const actionType = normalizeTrainerActionType(action);
  if (actionType === "FOLD" || actionType === "CHECK" || actionType === "CHECK_BACK" || actionType === "WIN") return 0;
  if (actionType === "CALL") {
    return roundBb(ctx?.facing?.amount ?? action?.amount ?? spot?.toCall ?? amountFromText(action?.s) ?? 0);
  }
  return roundBb(action?.amount ?? amountFromText(action?.l) ?? amountFromText(action?.label) ?? amountFromText(action?.s) ?? 0);
}

function seedStreetInvestments({ invested, spot, ctx, state, street }) {
  const seededInvestments = normalizeInvested(state?.investedThisStreet || ctx?.investedThisStreet);
  Object.entries(seededInvestments).forEach(([position, amount]) => {
    addInvestment(invested, position, amount);
  });
  (ctx?.preActions || []).forEach((entry) => {
    if (normalizeTrainerStreet(entry?.street || spot?.street) !== street) return;
    addInvestment(invested, entry?.position || entry?.pos || entry?.actor, entry?.amountBb ?? entry?.amount ?? entry?.committed ?? 0);
  });
  addInvestment(invested, ctx?.facing?.position, ctx?.facing?.amount);
  addInvestment(invested, spot?.hpos || state?.heroPosition, ctx?.heroCommitted);
}

function collectPlayersInHand({ spot, ctx, state, invested, heroAction }) {
  const folded = new Set([...(state?.foldedPlayers || [])]);
  (ctx?.preActions || []).forEach((entry) => {
    if (normalizeTrainerActionType(entry?.actionType || entry?.action || entry?.act || entry?.id) === "FOLD") {
      folded.add(entry?.position || entry?.pos || entry?.actor);
    }
  });
  if (normalizeTrainerActionType(heroAction) === "FOLD") folded.add(spot?.hpos || state?.heroPosition);

  const candidates = [
    ...(state?.playersInHand || []),
    spot?.hpos,
    spot?.vpos,
    ctx?.facing?.position,
    ...Object.keys(invested),
    ...(ctx?.preActions || []).map((entry) => entry?.position || entry?.pos || entry?.actor),
  ];

  return [...new Set(candidates.filter(Boolean))].filter((position) => !folded.has(position));
}

export function boardLengthForTrainerStreet(street) {
  return TRAINER_BOARD_LENGTHS[normalizeTrainerStreet(street)] ?? 0;
}

export function ensureTrainerBoardLength(board = [], street = TRAINER_STREETS.PREFLOP) {
  const target = boardLengthForTrainerStreet(street);
  const next = Array.isArray(board) ? [...board] : [];
  while (next.length < target) next.push(FALLBACK_BOARD[next.length % FALLBACK_BOARD.length]);
  return next.slice(0, target);
}

export function trainerPostflopFirstPosition(playersInHand = []) {
  const active = [...new Set(playersInHand.filter(Boolean))];
  return TRAINER_POSTFLOP_ORDER.find((position) => active.includes(position)) || active[0] || null;
}

function villainCheckedCurrentStreet(spot, ctx, street) {
  return (ctx?.preActions || []).some((a) => {
    const actionType = normalizeTrainerActionType(a.actionType || a.action || a.act || a.id);
    return a.position === spot?.vpos && normalizeTrainerStreet(a.street || spot?.street) === street && actionType === "CHECK";
  });
}

export function trainerRoundCloseDecision({ spot, ctx, heroAction, autoFull = false, playingFull = false }) {
  const actionType = normalizeTrainerActionType(heroAction);
  const street = normalizeTrainerStreet(spot?.street);
  const facing = ctx?.facing || null;

  if (actionType === "FOLD") {
    return {
      closesRound: true,
      closesHand: true,
      startFullHand: false,
      nextStreet: TRAINER_STREETS.HAND_COMPLETE,
      reason: "hero_fold",
    };
  }

  if (actionType === "ALLIN") {
    return {
      closesRound: false,
      closesHand: false,
      startFullHand: false,
      nextStreet: street,
      reason: "all_in_needs_response",
    };
  }

  if (actionType === "CALL" && facing?.amount > 0) {
    return {
      closesRound: true,
      closesHand: false,
      startFullHand: street === TRAINER_STREETS.PREFLOP && autoFull && !playingFull,
      nextStreet: nextTrainerStreet(street),
      reason: "call_matched_current_bet",
    };
  }

  if ((actionType === "CHECK" || actionType === "CHECK_BACK") && !facing && villainCheckedCurrentStreet(spot, ctx, street)) {
    return {
      closesRound: true,
      closesHand: false,
      startFullHand: false,
      nextStreet: nextTrainerStreet(street),
      reason: "check_back_after_villain_check",
    };
  }

  return {
    closesRound: false,
    closesHand: false,
    startFullHand: false,
    nextStreet: street,
    reason: "action_keeps_round_open",
  };
}

export function resolveTrainerRoundState({
  spot = {},
  ctx = {},
  heroAction = {},
  state = {},
  autoFull = false,
  playingFull = false,
} = {}) {
  const street = normalizeTrainerStreet(state.currentStreet || spot.street);
  const actionType = normalizeTrainerActionType(heroAction);
  const heroPosition = state.heroPosition || spot.hpos || "Hero";
  const investedBefore = {};

  seedStreetInvestments({ invested: investedBefore, spot, ctx, state, street });
  const investedWithHero = { ...investedBefore };
  addInvestment(investedWithHero, heroPosition, actionAmount(heroAction, spot, ctx));

  const decision = trainerRoundCloseDecision({ spot: { ...spot, street }, ctx, heroAction, autoFull, playingFull });
  const playersInHand = collectPlayersInHand({ spot, ctx, state, invested: investedWithHero, heroAction });
  const currentBoard = state.board || spot.board || [];
  const basePot = roundBb(state.potTotal ?? state.pot ?? ctx.potTotal ?? 0);
  const consolidatedPot = decision.closesRound ? roundBb(basePot + sumInvested(investedWithHero)) : basePot;
  const nextStreet = decision.nextStreet;
  const completeBoardStreet = street === TRAINER_STREETS.PREFLOP ? TRAINER_STREETS.PREFLOP : street;
  const nextBoard = decision.closesRound && !decision.closesHand
    ? ensureTrainerBoardLength(currentBoard, nextStreet)
    : ensureTrainerBoardLength(currentBoard, decision.closesHand ? completeBoardStreet : street);
  const nextActor = decision.closesRound && !decision.closesHand && nextStreet !== TRAINER_STREETS.SHOWDOWN
    ? trainerPostflopFirstPosition(playersInHand)
    : null;

  const maxInvested = Object.values(investedWithHero).reduce((max, amount) => Math.max(max, roundBb(amount)), 0);
  const heroInvested = roundBb(investedWithHero[heroPosition] || 0);
  const currentBetToCall = decision.closesRound ? 0 : roundBb(Math.max(0, maxInvested - heroInvested));
  const investedThisHand = {
    ...normalizeInvested(state.investedThisHand),
  };
  Object.entries(investedWithHero).forEach(([position, amount]) => {
    investedThisHand[position] = roundBb((investedThisHand[position] || 0) + roundBb(amount));
  });

  return {
    previousStreet: street,
    currentStreet: decision.closesRound ? nextStreet : street,
    nextStreet,
    board: nextBoard,
    currentActor: nextActor,
    nextActor,
    currentBetToCall,
    lastAggressor: decision.closesRound ? null : (ctx?.facing?.position || state.lastAggressor || null),
    actionQueue: decision.closesRound ? [] : [...(state.actionQueue || [])],
    pendingActions: decision.closesRound ? [] : [...(state.pendingActions || [])],
    hasActedThisRound: decision.closesRound ? {} : { ...(state.hasActedThisRound || {}), [heroPosition]: true },
    investedThisStreet: decision.closesRound ? {} : investedWithHero,
    investedThisHand,
    playersInHand,
    potTotal: consolidatedPot,
    roundComplete: decision.closesRound,
    handComplete: decision.closesHand || nextStreet === TRAINER_STREETS.HAND_COMPLETE,
    showdown: nextStreet === TRAINER_STREETS.SHOWDOWN,
    ghostActionPrevented: decision.reason === "call_matched_current_bet" && decision.closesRound,
    noGhostAction: decision.closesRound ? true : actionType !== "CALL",
    decision,
  };
}
