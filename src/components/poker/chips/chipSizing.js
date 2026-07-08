export const CHIP_TABLE_MODE_SCALE = {
  "1T": 1,
  "2T": 0.78,
  "3T": 0.64,
  "4T": 0.52,
};

export const CHIP_SIZE_SCALE = {
  auto: 1,
  compact: 0.84,
  normal: 1,
  large: 1.18,
};

export function getChipTableMode(numTables = 1) {
  const n = Math.max(1, Math.min(4, Number(numTables) || 1));
  return `${n}T`;
}

export function getChipTableScale(numTables = 1) {
  return CHIP_TABLE_MODE_SCALE[getChipTableMode(numTables)] || 1;
}

export function getChipSizeScale({ tableMode = "1T", sizeMode = "auto", compact = false } = {}) {
  const tableScale = CHIP_TABLE_MODE_SCALE[tableMode] || 1;
  const modeScale = CHIP_SIZE_SCALE[sizeMode] || 1;
  const compactScale = compact ? 0.88 : 1;
  return Number((tableScale * modeScale * compactScale).toFixed(3));
}

export function getChipStackVisualAmount(amountBB = 0, tableMode = "1T", isAllIn = false) {
  const amount = Math.max(0, Number(amountBB) || 0);
  const t = String(tableMode || "1T");
  const dense = t === "3T" || t === "4T";

  if (isAllIn || amount >= 80) {
    return { amount, denomination: 100, visibleChips: dense ? 4 : 6, pileCount: dense ? 3 : 4, stackType: "allin" };
  }
  if (amount <= 0.75) {
    return { amount, denomination: 0.5, visibleChips: dense ? 1 : 2, pileCount: 1, stackType: "blind" };
  }
  if (amount <= 1.75) {
    return { amount, denomination: 1, visibleChips: dense ? 2 : 3, pileCount: 1, stackType: "blind" };
  }
  if (amount <= 4.5) {
    return { amount, denomination: amount <= 2.75 ? 2.5 : amount <= 3.5 ? 3 : 4, visibleChips: dense ? 2 : 3, pileCount: 1, stackType: "short" };
  }
  if (amount <= 12) {
    return { amount, denomination: 5, visibleChips: dense ? 3 : 4, pileCount: dense ? 1 : 2, stackType: "medium" };
  }
  if (amount <= 60) {
    return { amount, denomination: 25, visibleChips: dense ? 3 : 5, pileCount: dense ? 2 : 3, stackType: "large" };
  }
  return { amount, denomination: 100, visibleChips: dense ? 4 : 6, pileCount: dense ? 3 : 4, stackType: "monster" };
}

export function getChipAnchorPosition(position, tableMode = "1T") {
  const mode = String(tableMode || "1T");
  const base = {
    UTG: { x: 30, y: 49 },
    HJ: { x: 38, y: 31 },
    CO: { x: 58, y: 31 },
    BTN: { x: 70, y: 49 },
    SB: { x: 60, y: 69 },
    BB: { x: 41, y: 69 },
  };
  const compact = {
    UTG: { x: 31, y: 48 },
    HJ: { x: 39, y: 32 },
    CO: { x: 57, y: 32 },
    BTN: { x: 69, y: 48 },
    SB: { x: 59, y: 67 },
    BB: { x: 42, y: 67 },
  };
  return (mode === "3T" || mode === "4T" ? compact : base)[position] || base.BTN;
}
