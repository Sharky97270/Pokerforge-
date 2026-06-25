export const TRAINER_VISUAL_CONFIG = {
  boardSafeZone: { xMin: 34, xMax: 66, yMin: 24, yMax: 66 },
  actionCollisionZones: {
    withBoard: { xMin: 30, xMax: 70, yMin: 34, yMax: 65 },
    preflop: { xMin: 42, xMax: 58, yMin: 42, yMax: 58 },
  },
  tableGeometry: {
    1: { top: 10, left: 6, right: 6, bottom: 12, railInset: 7, innerInset: 16 },
    2: { top: 10.8, left: 7.2, right: 7.2, bottom: 12, railInset: 5, innerInset: 12 },
    3: { top: 11, left: 7.4, right: 7.4, bottom: 11.5, railInset: 5, innerInset: 11 },
    4: { top: 11.4, left: 7.6, right: 7.6, bottom: 11.5, railInset: 4, innerInset: 10 },
  },
  boardPosition: {
    1: { x: 50, y: 54 },
    2: { x: 50, y: 54 },
    3: { x: 50, y: 54 },
    4: { x: 50, y: 54 },
  },
  tableScale: {
    desktop: 1,
    laptop: 0.96,
    tablet: 0.9,
    mobile: 0.82,
  },
  avatarSize: {
    hero1T: 66,
    villain1T: 58,
    multiMin: 24,
  },
  chipSize: {
    blind: 16,
    bet: 18,
    pot: 22,
    allIn: 24,
  },
  boardSize: {
    oneTable: "lg",
    twoTables: "md",
    threeTables: "sm",
    fourTables: "xs",
  },
  potPosition: {
    1: { preflop: { x: 50, y: 50 }, postflop: { x: 50, y: 29 } },
    2: { preflop: { x: 50, y: 50 }, postflop: { x: 50, y: 29 } },
    3: { preflop: { x: 50, y: 50 }, postflop: { x: 50, y: 29 } },
    4: { preflop: { x: 50, y: 50 }, postflop: { x: 50, y: 29 } },
  },
  anchorSafety: {
    minBetBlindGap: 10,
    minBetCardsGap: 12,
    minBetSeatGap: 10,
  },
  chipValueBands: [
    { id: "forced", max: 1.5 },
    { id: "small", max: 5 },
    { id: "medium", max: 15 },
    { id: "large", max: 40 },
    { id: "monster", max: Infinity },
  ],
  layouts: {
    1: {
      seatPositions: {
        HJ: { x: 33.5, y: 20.5 },
        CO: { x: 66.5, y: 20.5 },
        BTN: { x: 89.5, y: 52 },
        SB: { x: 67.5, y: 80 },
        BB: { x: 32.5, y: 80 },
        UTG: { x: 10.5, y: 52 },
      },
      actionPush: { top: 0.16, bottom: 0.24, left: 0.24, right: 0.24, default: 0.24 },
      blindPush: { SB: 0.18, BB: 0.19, default: 0.18 },
      dealerPush: { BTN: 0.15, default: 0.15 },
      actionLabelPush: { top: 0.37, bottom: 0.34, left: 0.33, right: 0.33, default: 0.34 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 46, y: 79 }, betAnchor: { x: 45, y: 68 }, preflopBetAnchor: { x: 45, y: 67 }, postflopBetAnchor: { x: 45, y: 69 }, actionLabelAnchor: { x: 42, y: 88 } },
        SB: { blindAnchor: { x: 54, y: 79 }, betAnchor: { x: 55, y: 68 }, preflopBetAnchor: { x: 55, y: 67 }, postflopBetAnchor: { x: 55, y: 69 }, actionLabelAnchor: { x: 58, y: 88 } },
        HJ: { betAnchor: { x: 29, y: 42 }, preflopBetAnchor: { x: 31, y: 39 }, postflopBetAnchor: { x: 29, y: 38 }, actionLabelAnchor: { x: 38, y: 54 } },
        CO: { betAnchor: { x: 71, y: 42 }, preflopBetAnchor: { x: 69, y: 39 }, postflopBetAnchor: { x: 71, y: 38 }, actionLabelAnchor: { x: 62, y: 54 } },
        UTG: { betAnchor: { x: 23, y: 54 }, actionLabelAnchor: { x: 29, y: 57 } },
        BTN: { betAnchor: { x: 78, y: 54 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 72, y: 57 } },
      },
    },
    2: {
      seatPositions: {
        HJ: { x: 31, y: 17.5 },
        CO: { x: 69, y: 17.5 },
        BTN: { x: 90.5, y: 50 },
        SB: { x: 71.5, y: 82 },
        BB: { x: 28.5, y: 82 },
        UTG: { x: 9.5, y: 50 },
      },
      actionPush: { top: 0.12, bottom: 0.22, left: 0.21, right: 0.21, default: 0.22 },
      blindPush: { SB: 0.17, BB: 0.18, default: 0.17 },
      dealerPush: { BTN: 0.14, default: 0.14 },
      actionLabelPush: { top: 0.35, bottom: 0.32, left: 0.32, right: 0.32, default: 0.32 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 46, y: 80 }, betAnchor: { x: 45, y: 68 }, preflopBetAnchor: { x: 45, y: 67 }, postflopBetAnchor: { x: 45, y: 69 }, actionLabelAnchor: { x: 42, y: 81 } },
        SB: { blindAnchor: { x: 54, y: 80 }, betAnchor: { x: 55, y: 68 }, preflopBetAnchor: { x: 55, y: 67 }, postflopBetAnchor: { x: 55, y: 69 }, actionLabelAnchor: { x: 58, y: 81 } },
        HJ: { betAnchor: { x: 29, y: 42 }, preflopBetAnchor: { x: 31, y: 39 }, postflopBetAnchor: { x: 29, y: 38 }, actionLabelAnchor: { x: 38, y: 54 } },
        CO: { betAnchor: { x: 71, y: 42 }, preflopBetAnchor: { x: 69, y: 39 }, postflopBetAnchor: { x: 71, y: 38 }, actionLabelAnchor: { x: 62, y: 54 } },
        UTG: { betAnchor: { x: 22, y: 52 }, actionLabelAnchor: { x: 27, y: 55 } },
        BTN: { betAnchor: { x: 79, y: 52 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 74, y: 55 } },
      },
    },
    3: {
      seatPositions: {
        HJ: { x: 31, y: 18.5 },
        CO: { x: 69, y: 18.5 },
        BTN: { x: 90.5, y: 50 },
        SB: { x: 71.5, y: 81 },
        BB: { x: 28.5, y: 81 },
        UTG: { x: 9.5, y: 50 },
      },
      actionPush: { top: 0.1, bottom: 0.2, left: 0.18, right: 0.18, default: 0.2 },
      blindPush: { SB: 0.15, BB: 0.16, default: 0.15 },
      dealerPush: { BTN: 0.13, default: 0.13 },
      actionLabelPush: { top: 0.33, bottom: 0.3, left: 0.3, right: 0.3, default: 0.3 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 46, y: 79 }, betAnchor: { x: 45, y: 68 }, preflopBetAnchor: { x: 45, y: 67 }, postflopBetAnchor: { x: 45, y: 69 }, actionLabelAnchor: { x: 42, y: 80 } },
        SB: { blindAnchor: { x: 54, y: 79 }, betAnchor: { x: 55, y: 68 }, preflopBetAnchor: { x: 55, y: 67 }, postflopBetAnchor: { x: 55, y: 69 }, actionLabelAnchor: { x: 58, y: 80 } },
        HJ: { betAnchor: { x: 29, y: 42 }, preflopBetAnchor: { x: 31, y: 39 }, postflopBetAnchor: { x: 29, y: 38 }, actionLabelAnchor: { x: 38, y: 54 } },
        CO: { betAnchor: { x: 71, y: 42 }, preflopBetAnchor: { x: 69, y: 39 }, postflopBetAnchor: { x: 71, y: 38 }, actionLabelAnchor: { x: 62, y: 54 } },
        UTG: { betAnchor: { x: 22, y: 52 }, actionLabelAnchor: { x: 27, y: 55 } },
        BTN: { betAnchor: { x: 79, y: 52 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 74, y: 55 } },
      },
    },
    4: {
      seatPositions: {
        HJ: { x: 31, y: 20.5 },
        CO: { x: 69, y: 20.5 },
        BTN: { x: 90.5, y: 50 },
        SB: { x: 70.5, y: 80 },
        BB: { x: 29.5, y: 80 },
        UTG: { x: 9.5, y: 50 },
      },
      actionPush: { top: 0.1, bottom: 0.18, left: 0.17, right: 0.17, default: 0.18 },
      blindPush: { SB: 0.14, BB: 0.15, default: 0.14 },
      dealerPush: { BTN: 0.12, default: 0.12 },
      actionLabelPush: { top: 0.31, bottom: 0.29, left: 0.29, right: 0.29, default: 0.29 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 46, y: 79 }, betAnchor: { x: 45, y: 68 }, preflopBetAnchor: { x: 45, y: 67 }, postflopBetAnchor: { x: 45, y: 69 }, actionLabelAnchor: { x: 42, y: 79 } },
        SB: { blindAnchor: { x: 54, y: 79 }, betAnchor: { x: 55, y: 68 }, preflopBetAnchor: { x: 55, y: 67 }, postflopBetAnchor: { x: 55, y: 69 }, actionLabelAnchor: { x: 58, y: 79 } },
        HJ: { betAnchor: { x: 29, y: 42 }, preflopBetAnchor: { x: 31, y: 39 }, postflopBetAnchor: { x: 29, y: 38 }, actionLabelAnchor: { x: 38, y: 54 } },
        CO: { betAnchor: { x: 71, y: 42 }, preflopBetAnchor: { x: 69, y: 39 }, postflopBetAnchor: { x: 71, y: 38 }, actionLabelAnchor: { x: 62, y: 54 } },
        UTG: { betAnchor: { x: 22, y: 52 }, actionLabelAnchor: { x: 27, y: 55 } },
        BTN: { betAnchor: { x: 79, y: 52 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 74, y: 55 } },
      },
    },
  },
};

export function getTrainerVisualLayoutConfig(numTables = 1) {
  const mode = TRAINER_VISUAL_CONFIG.layouts[numTables] || TRAINER_VISUAL_CONFIG.layouts[2];
  return {
    ...mode,
    tableGeometry: TRAINER_VISUAL_CONFIG.tableGeometry[numTables] || TRAINER_VISUAL_CONFIG.tableGeometry[2],
    boardPosition: TRAINER_VISUAL_CONFIG.boardPosition[numTables] || TRAINER_VISUAL_CONFIG.boardPosition[2],
    potPosition: TRAINER_VISUAL_CONFIG.potPosition[numTables] || TRAINER_VISUAL_CONFIG.potPosition[2],
  };
}

export function trainerBoardCollisionZone(hasBoard = false) {
  return hasBoard
    ? TRAINER_VISUAL_CONFIG.actionCollisionZones.withBoard
    : TRAINER_VISUAL_CONFIG.actionCollisionZones.preflop;
}

export function trainerChipValueBand(amount = 0) {
  const n = Number(amount) || 0;
  return TRAINER_VISUAL_CONFIG.chipValueBands.find((band) => n <= band.max)?.id || "monster";
}

export function trainerTableGeometry(numTables = 1) {
  return TRAINER_VISUAL_CONFIG.tableGeometry[numTables] || TRAINER_VISUAL_CONFIG.tableGeometry[2];
}

export function trainerBoardPosition(numTables = 1) {
  return TRAINER_VISUAL_CONFIG.boardPosition[numTables] || TRAINER_VISUAL_CONFIG.boardPosition[2];
}

export function trainerPotPosition(numTables = 1, hasBoard = false) {
  const mode = TRAINER_VISUAL_CONFIG.potPosition[numTables] || TRAINER_VISUAL_CONFIG.potPosition[2];
  return hasBoard ? mode.postflop : mode.preflop;
}
