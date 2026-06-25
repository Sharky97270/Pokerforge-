const VALID_POSITIONS = new Set(["UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB", "EP"]);
const DEFAULT_BLINDS = { SB: 0.5, BB: 1 };

export function roundTrainerBb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export function parseTrainerBb(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const text = String(value).replace(",", ".");
  const bb = text.match(/(-?\d+(?:\.\d+)?)\s*bb\b/i);
  if (bb) return parseFloat(bb[1]);
  if (/%/.test(text)) return 0;
  const plain = text.match(/-?\d+(?:\.\d+)?/);
  return plain ? parseFloat(plain[0]) : 0;
}

function rawActionText(rawAction) {
  if (typeof rawAction === "string") return rawAction;
  return [
    rawAction?.id,
    rawAction?.action,
    rawAction?.l,
    rawAction?.label,
    rawAction?.s,
  ].filter(Boolean).join(" ");
}

function rawActionId(rawAction) {
  return (rawAction?.id || rawAction?.action || rawAction || "").toString().toUpperCase();
}

function pctSizingFromId(actionId) {
  if (actionId === "BET33") return 0.33;
  if (actionId === "BET50") return 0.5;
  if (actionId === "BET75") return 0.75;
  if (actionId === "BET100") return 1;
  return null;
}

function explicitAmount(rawAction, { potBefore = 0, callAmount = 0, fallbackAmount = 0, stack = 0 } = {}) {
  const direct = rawAction?.committedAmount ?? rawAction?.displayAmount ?? rawAction?.amountBb ?? rawAction?.amount;
  if (Number.isFinite(Number(direct)) && Number(direct) > 0) return roundTrainerBb(direct);

  const labelAmount = parseTrainerBb(rawAction?.l || rawAction?.label);
  if (labelAmount > 0) return roundTrainerBb(labelAmount);

  const sizingAmount = parseTrainerBb(rawAction?.s);
  if (sizingAmount > 0) return roundTrainerBb(sizingAmount);

  const actionId = rawActionId(rawAction);
  if (actionId === "CALL" && Number(callAmount) > 0) return roundTrainerBb(callAmount);

  const pct = pctSizingFromId(actionId);
  if (pct && Number(potBefore) > 0) return roundTrainerBb(Number(potBefore) * pct);

  if (actionId === "ALLIN" && Number(stack) > 0) return roundTrainerBb(stack);
  if (Number(fallbackAmount) > 0) return roundTrainerBb(fallbackAmount);
  return 0;
}

function baseActionType(rawAction) {
  const id = rawActionId(rawAction);
  const text = rawActionText(rawAction).toUpperCase();
  if (id === "FOLD" || text.includes("FOLD")) return "FOLD";
  if (id === "CHECK_BACK" || id === "CHECK" || text.includes("CHECK")) return "CHECK";
  if (id === "CALL") return "CALL";
  if (id === "ALLIN" || /\b(PUSH|SHOVE|RESHOVE|JAM|ALL-?IN)\b/.test(text)) return "ALLIN";
  if (text.includes("5-BET") || text.includes("5BET")) return "5BET";
  if (text.includes("4-BET") || text.includes("4BET")) return "4BET";
  if (text.includes("3-BET") || text.includes("3BET")) return "3BET";
  if (id === "RAISE" || text.includes("RAISE")) return "RAISE";
  if (id === "BET33" || id === "BET50" || id === "BET75" || id === "BET100" || id === "BET") return "BET";
  return id || "ACTION";
}

function normalizeType(rawAction, amount, { currentBetToCall = 0, street = "Preflop" } = {}) {
  const base = baseActionType(rawAction);
  const text = rawActionText(rawAction).toUpperCase();
  const isPreflop = /^pre/i.test(street || "");
  if (base === "FOLD" || base === "CHECK" || base === "ALLIN") return base;
  if (base === "3BET" || base === "4BET" || base === "5BET") return base;
  if (base === "CALL") return "CALL";

  if (currentBetToCall <= 0) {
    if (amount <= 0) return "CHECK";
    if (isPreflop && /\bOPEN\b/.test(text)) return "OPEN";
    return base === "RAISE" && isPreflop ? "OPEN" : "BET";
  }

  if (amount <= 0) return "FOLD";
  if (amount <= currentBetToCall + 0.05) return "CALL";
  if (isPreflop) {
    if (text.includes("5-BET") || text.includes("5BET")) return "5BET";
    if (text.includes("4-BET") || text.includes("4BET")) return "4BET";
    if (text.includes("3-BET") || text.includes("3BET")) return "3BET";
  }
  return "RAISE";
}

export function trainerActionDisplayVerb(actionType, rawAction = null) {
  const raw = rawActionText(rawAction).toUpperCase();
  if (actionType === "ALLIN") {
    if (raw.includes("PUSH")) return "Push";
    if (raw.includes("RESHOVE")) return "Reshove";
    return "Shove";
  }
  return {
    FOLD: "Fold",
    CHECK: "Check",
    CALL: raw.includes("ALL-IN") || raw.includes("ALL IN") ? "Call all-in" : "Call",
    BET: "Bet",
    OPEN: "Open",
    RAISE: "Raise",
    "3BET": "3-bet",
    "4BET": "4-bet",
    "5BET": "5-bet",
    WIN: "Wins",
  }[actionType] || String(actionType || "Action");
}

/* Classe CSS du badge d'action — source unique pour garantir que la couleur
   correspond toujours au type réel (call=call, raise=raise, all-in=allin…). */
export function trainerActionCssClass(actionType) {
  const t = String(actionType || "").toUpperCase();
  if (t === "FOLD") return "action-fold";
  if (t === "CALL" || t === "CALL_ALLIN") return "action-call";
  if (t === "CHECK" || t === "CHECK_BACK") return "action-check";
  if (t === "RAISE" || t === "3BET" || t === "4BET" || t === "5BET") return "action-raise";
  if (t === "ALLIN" || t === "JAM" || t === "SHOVE" || t === "PUSH") return "action-allin";
  return "action-bet";
}

export function trainerChipPileCount(amount = 0, isAllIn = false) {
  const n = Number(amount) || 0;
  if (isAllIn || n >= 20) return 4;
  if (n >= 8.5) return 3;
  if (n >= 2.5) return 2;
  if (n > 0) return 1;
  return 0;
}

export function normalizeTrainerActionEvent({
  rawAction,
  action,
  actorSeat,
  actorId,
  playerId,
  street = "Preflop",
  potBefore = 0,
  currentBetToCall,
  callAmount,
  amountToCallBeforeAction,
  stack,
  defaultAmount,
  streetContributions = {},
} = {}) {
  const source = rawAction ?? action ?? {};
  const stackBb = roundTrainerBb(parseTrainerBb(stack) || stack || 0);
  const toCall = roundTrainerBb(amountToCallBeforeAction ?? currentBetToCall ?? callAmount ?? 0);
  let committedAmount = explicitAmount(source, {
    potBefore,
    callAmount: toCall,
    fallbackAmount: defaultAmount,
    stack: stackBb,
  });
  const rawBase = baseActionType(source);
  if (rawBase === "FOLD" || rawBase === "CHECK" || rawBase === "WIN") committedAmount = 0;

  const rawText = rawActionText(source).toUpperCase();
  const allInByLabel = /\b(PUSH|SHOVE|RESHOVE|JAM|ALL-?IN)\b/.test(rawText);
  const isAllIn = rawBase === "ALLIN" || allInByLabel || (stackBb > 0 && committedAmount >= stackBb - 0.05);
  const actionType = normalizeType(source, committedAmount, { currentBetToCall: toCall, street });
  const contributes = !["FOLD", "CHECK", "WIN"].includes(actionType) && committedAmount > 0;
  const priorContribution = roundTrainerBb(streetContributions?.[actorSeat] || 0);
  const totalStreetContributionAfterAction = contributes
    ? roundTrainerBb(Math.max(committedAmount, priorContribution + committedAmount))
    : priorContribution;
  const remainingStackAfterAction = stackBb > 0 ? Math.max(0, roundTrainerBb(stackBb - committedAmount)) : null;
  const resultingPot = roundTrainerBb((Number(potBefore) || 0) + (contributes ? committedAmount : 0));
  const verb = trainerActionDisplayVerb(actionType, source);
  const displayAmount = roundTrainerBb(committedAmount);
  const displayLabel = displayAmount > 0 ? `${verb} ${displayAmount}bb` : verb;

  return {
    actorSeat,
    actorId,
    playerId,
    street,
    actionType,
    rawActionType: rawBase,
    committedAmount: displayAmount,
    amountToCallBeforeAction: toCall,
    totalStreetContributionAfterAction,
    remainingStackAfterAction,
    resultingPot,
    isAllIn,
    displayLabel,
    displayAmount,
    contributes,
    rawLabel: source?.l || source?.label || source?.s || rawBase,
  };
}

function boardCountForStreet(street) {
  const s = String(street || "Preflop").toLowerCase();
  if (s === "flop") return 3;
  if (s === "turn") return 4;
  if (s === "river") return 5;
  return 0;
}

export function validateSpotConsistency(spot, ctx = {}, options = {}) {
  const errors = [];
  const street = spot?.street || "Preflop";
  const board = Array.isArray(spot?.board) ? spot.board : [];
  const stackBb = parseTrainerBb(spot?.stack);
  const toCall = Number(spot?.toCall) || 0;
  const acts = Array.isArray(spot?.acts) ? spot.acts : [];

  if (!spot) errors.push("spot missing");
  if (spot?.hpos && !VALID_POSITIONS.has(spot.hpos)) errors.push(`invalid hero position ${spot.hpos}`);
  if (spot?.vpos && !VALID_POSITIONS.has(spot.vpos)) errors.push(`invalid villain position ${spot.vpos}`);
  if (!spot?.hpos) errors.push("hero missing");
  if (!spot?.vpos && options.requireVillain !== false) errors.push("villain missing");
  if (spot?.hpos && spot?.vpos && spot.hpos === spot.vpos) errors.push("hero and villain share a seat");
  if (!(stackBb > 0)) errors.push("effective stack invalid");
  if ((Number(spot?.pot) || 0) < 0) errors.push("pot negative");
  if (toCall < 0) errors.push("toCall negative");
  if (!acts.length) errors.push("hero actions missing");

  const expectedBoard = boardCountForStreet(street);
  if (board.length !== expectedBoard) errors.push(`street ${street} requires ${expectedBoard} board cards`);

  const isPreflop = /^pre/i.test(street);
  const hasFacing = !!ctx?.facing || toCall > 0;
  for (const rawAction of acts) {
    const actionId = baseActionType(rawAction);
    const label = rawActionText(rawAction);
    const isLimp = isPreflop && actionId === "CALL" && toCall === 0 && /limp/i.test(label);
    if (actionId === "CALL" && toCall <= 0 && !isLimp) errors.push("call without current bet");
    if ((actionId === "BET" || actionId === "OPEN") && toCall > 0) errors.push("bet while facing a bet");
    if ((actionId === "RAISE" || actionId === "3BET" || actionId === "4BET" || actionId === "5BET") && !hasFacing && !/\bopen\b/i.test(label)) {
      errors.push("raise without previous bet");
    }
    const event = normalizeTrainerActionEvent({
      rawAction,
      actorSeat: spot?.hpos,
      street,
      potBefore: Number(spot?.pot) || 0,
      amountToCallBeforeAction: toCall,
      stack: stackBb,
      defaultAmount: 0,
    });
    if (event.committedAmount > stackBb + 0.05) errors.push("action exceeds stack");
    if (!event.isAllIn && event.committedAmount > stackBb + 0.05) errors.push("non all-in action exceeds stack");
    if (event.isAllIn && event.remainingStackAfterAction !== null && event.remainingStackAfterAction > 0.05 && event.committedAmount >= stackBb - 0.05) {
      errors.push("all-in leaves impossible stack");
    }
    if (event.actionType === "RAISE" && toCall > 0 && event.committedAmount <= toCall + 0.05) errors.push("raise not above call");
  }

  if (isPreflop) {
    if (DEFAULT_BLINDS.SB !== 0.5) errors.push("SB blind invalid");
    if (DEFAULT_BLINDS.BB !== 1) errors.push("BB blind invalid");
  }

  return {
    ok: errors.length === 0,
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    reason: errors[0] || null,
    snapshot: {
      spotId: spot?.id,
      street,
      hpos: spot?.hpos,
      vpos: spot?.vpos,
      stack: spot?.stack,
      pot: spot?.pot,
      toCall: spot?.toCall,
      facing: ctx?.facing || null,
      actions: acts.map((a) => rawActionText(a)),
    },
  };
}
