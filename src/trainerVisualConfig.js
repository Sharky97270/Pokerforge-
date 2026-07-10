export const TRAINER_VISUAL_CONFIG = {
  boardSafeZone: { xMin: 34, xMax: 66, yMin: 24, yMax: 66 },
  actionCollisionZones: {
    withBoard: { xMin: 30, xMax: 70, yMin: 34, yMax: 65 },
    preflop: { xMin: 42, xMax: 58, yMin: 42, yMax: 58 },
  },
  tableGeometry: {
    1: { top: 10, left: 2.4, right: 2.4, bottom: 14, railInset: 7, innerInset: 16 },
    2: { top: 10.8, left: 7.2, right: 7.2, bottom: 13, railInset: 5, innerInset: 12 },
    3: { top: 11, left: 7.4, right: 7.4, bottom: 12.5, railInset: 5, innerInset: 11 },
    4: { top: 11.4, left: 7.6, right: 7.6, bottom: 12.5, railInset: 4, innerInset: 10 },
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
    hero1T: 70,
    villain1T: 64,
    multiMin: 24,
  },
  chipSize: {
    blind: 16,
    bet: 18,
    pot: 22,
    allIn: 24,
  },
  boardSize: {
    oneTable: "1t-board",
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
        HJ: { x: 25.5, y: 20 },
        CO: { x: 74.5, y: 20 },
        BTN: { x: 93, y: 50 },
        SB: { x: 75, y: 77.5 },
        BB: { x: 25, y: 77.5 },
        UTG: { x: 7, y: 50 },
      },
      responsive: {
        mobile: {
          tableGeometry: { top: 3, left: 2.5, right: 2.5, bottom: 6, railInset: 6, innerInset: 15 },
          seatPositions: {
            HJ: { x: 28, y: 15 },
            CO: { x: 72, y: 15 },
            BTN: { x: 91, y: 48 },
            SB: { x: 76.5, y: 78 },
            BB: { x: 23.5, y: 78 },
            UTG: { x: 9, y: 48 },
          },
          anchorOverrides: {
            BB: { blindAnchor: { x: 36.5, y: 71 }, betAnchor: { x: 44, y: 61 }, preflopBetAnchor: { x: 44, y: 61 }, postflopBetAnchor: { x: 43, y: 70 }, actionLabelAnchor: { x: 40, y: 72 } },
            SB: { blindAnchor: { x: 63.5, y: 71 }, betAnchor: { x: 56, y: 61 }, preflopBetAnchor: { x: 56, y: 61 }, postflopBetAnchor: { x: 57, y: 70 }, actionLabelAnchor: { x: 60, y: 72 } },
            HJ: { betAnchor: { x: 34, y: 32 }, preflopBetAnchor: { x: 34, y: 33 }, postflopBetAnchor: { x: 35, y: 30 }, actionLabelAnchor: { x: 38, y: 40 } },
            CO: { betAnchor: { x: 66, y: 32 }, preflopBetAnchor: { x: 66, y: 33 }, postflopBetAnchor: { x: 65, y: 30 }, actionLabelAnchor: { x: 62, y: 40 } },
            UTG: { betAnchor: { x: 24, y: 49 }, preflopBetAnchor: { x: 24, y: 49 }, postflopBetAnchor: { x: 25, y: 52 }, actionLabelAnchor: { x: 28, y: 56 } },
            BTN: { betAnchor: { x: 76, y: 49 }, preflopBetAnchor: { x: 76, y: 49 }, postflopBetAnchor: { x: 75, y: 52 }, dealerAnchor: { x: 82, y: 58 }, actionLabelAnchor: { x: 72, y: 56 } },
          },
        },
      },
      actionPush: { top: 0.16, bottom: 0.24, left: 0.24, right: 0.24, default: 0.24 },
      blindPush: { SB: 0.18, BB: 0.19, default: 0.18 },
      dealerPush: { BTN: 0.15, default: 0.15 },
      actionLabelPush: { top: 0.37, bottom: 0.34, left: 0.33, right: 0.33, default: 0.34 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 34, y: 72.5 }, betAnchor: { x: 44, y: 67.5 }, preflopBetAnchor: { x: 43, y: 66.5 }, postflopBetAnchor: { x: 44, y: 68 }, actionLabelAnchor: { x: 39, y: 70 } },
        SB: { blindAnchor: { x: 66, y: 72.5 }, betAnchor: { x: 56, y: 67.5 }, preflopBetAnchor: { x: 57, y: 66.5 }, postflopBetAnchor: { x: 56, y: 68 }, actionLabelAnchor: { x: 61, y: 70 } },
        HJ: { betAnchor: { x: 38, y: 30 }, preflopBetAnchor: { x: 39, y: 41 }, postflopBetAnchor: { x: 38, y: 30 }, actionLabelAnchor: { x: 40, y: 54 } },
        CO: { betAnchor: { x: 62, y: 30 }, preflopBetAnchor: { x: 61, y: 41 }, postflopBetAnchor: { x: 62, y: 30 }, actionLabelAnchor: { x: 60, y: 54 } },
        UTG: { betAnchor: { x: 23, y: 54 }, actionLabelAnchor: { x: 29, y: 57 } },
        BTN: { betAnchor: { x: 78, y: 54 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 72, y: 57 } },
      },
    },
    2: {
      seatPositions: {
        HJ: { x: 25, y: 20 },
        CO: { x: 75, y: 20 },
        BTN: { x: 90.5, y: 50 },
        SB: { x: 75, y: 79 },
        BB: { x: 25, y: 79 },
        UTG: { x: 9.5, y: 50 },
      },
      actionPush: { top: 0.12, bottom: 0.22, left: 0.21, right: 0.21, default: 0.22 },
      blindPush: { SB: 0.17, BB: 0.18, default: 0.17 },
      dealerPush: { BTN: 0.14, default: 0.14 },
      actionLabelPush: { top: 0.35, bottom: 0.32, left: 0.32, right: 0.32, default: 0.32 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 34, y: 73 }, betAnchor: { x: 44, y: 67.5 }, preflopBetAnchor: { x: 43, y: 66.5 }, postflopBetAnchor: { x: 44, y: 68 }, actionLabelAnchor: { x: 39, y: 71 } },
        SB: { blindAnchor: { x: 66, y: 73 }, betAnchor: { x: 56, y: 67.5 }, preflopBetAnchor: { x: 57, y: 66.5 }, postflopBetAnchor: { x: 56, y: 68 }, actionLabelAnchor: { x: 61, y: 71 } },
        HJ: { betAnchor: { x: 29, y: 42 }, preflopBetAnchor: { x: 31, y: 39 }, postflopBetAnchor: { x: 29, y: 38 }, actionLabelAnchor: { x: 38, y: 54 } },
        CO: { betAnchor: { x: 71, y: 42 }, preflopBetAnchor: { x: 69, y: 39 }, postflopBetAnchor: { x: 71, y: 38 }, actionLabelAnchor: { x: 62, y: 54 } },
        UTG: { betAnchor: { x: 22, y: 52 }, actionLabelAnchor: { x: 27, y: 55 } },
        BTN: { betAnchor: { x: 79, y: 52 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 74, y: 55 } },
      },
      responsive: {
        mobile: {
          tableGeometry: { top: 11, left: 8, right: 8, bottom: 14, railInset: 5, innerInset: 12 },
          seatPositions: {
            HJ: { x: 28, y: 20 },
            CO: { x: 72, y: 20 },
            BTN: { x: 88, y: 50 },
            SB: { x: 72, y: 76 },
            BB: { x: 28, y: 76 },
            UTG: { x: 12, y: 50 },
          },
          anchorOverrides: {
            BB: { blindAnchor: { x: 38, y: 70 }, betAnchor: { x: 43, y: 64 }, preflopBetAnchor: { x: 43, y: 63 }, postflopBetAnchor: { x: 43, y: 65 }, actionLabelAnchor: { x: 39, y: 69 } },
            SB: { blindAnchor: { x: 62, y: 70 }, betAnchor: { x: 57, y: 64 }, preflopBetAnchor: { x: 57, y: 63 }, postflopBetAnchor: { x: 57, y: 65 }, actionLabelAnchor: { x: 61, y: 69 } },
            HJ: { betAnchor: { x: 32, y: 41 }, preflopBetAnchor: { x: 33, y: 39 }, postflopBetAnchor: { x: 32, y: 38 }, actionLabelAnchor: { x: 38, y: 52 } },
            CO: { betAnchor: { x: 68, y: 41 }, preflopBetAnchor: { x: 67, y: 39 }, postflopBetAnchor: { x: 68, y: 38 }, actionLabelAnchor: { x: 62, y: 52 } },
            UTG: { betAnchor: { x: 24, y: 52 }, actionLabelAnchor: { x: 29, y: 55 } },
            BTN: { betAnchor: { x: 76, y: 52 }, dealerAnchor: { x: 76, y: 64 }, actionLabelAnchor: { x: 71, y: 55 } },
          },
        },
      },
    },
    3: {
      seatPositions: {
        HJ: { x: 25, y: 19.5 },
        CO: { x: 75, y: 19.5 },
        BTN: { x: 91, y: 50 },
        SB: { x: 75, y: 79 },
        BB: { x: 25, y: 79 },
        UTG: { x: 9, y: 50 },
      },
      actionPush: { top: 0.1, bottom: 0.2, left: 0.18, right: 0.18, default: 0.2 },
      blindPush: { SB: 0.15, BB: 0.16, default: 0.15 },
      dealerPush: { BTN: 0.13, default: 0.13 },
      actionLabelPush: { top: 0.33, bottom: 0.3, left: 0.3, right: 0.3, default: 0.3 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 34, y: 73 }, betAnchor: { x: 44, y: 67.5 }, preflopBetAnchor: { x: 43, y: 66.5 }, postflopBetAnchor: { x: 44, y: 68 }, actionLabelAnchor: { x: 39, y: 71 } },
        SB: { blindAnchor: { x: 66, y: 73 }, betAnchor: { x: 56, y: 67.5 }, preflopBetAnchor: { x: 57, y: 66.5 }, postflopBetAnchor: { x: 56, y: 68 }, actionLabelAnchor: { x: 61, y: 71 } },
        HJ: { betAnchor: { x: 29, y: 42 }, preflopBetAnchor: { x: 31, y: 39 }, postflopBetAnchor: { x: 29, y: 38 }, actionLabelAnchor: { x: 38, y: 54 } },
        CO: { betAnchor: { x: 71, y: 42 }, preflopBetAnchor: { x: 69, y: 39 }, postflopBetAnchor: { x: 71, y: 38 }, actionLabelAnchor: { x: 62, y: 54 } },
        UTG: { betAnchor: { x: 22, y: 52 }, actionLabelAnchor: { x: 27, y: 55 } },
        BTN: { betAnchor: { x: 79, y: 52 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 74, y: 55 } },
      },
      responsive: {
        mobile: {
          tableGeometry: { top: 12, left: 9, right: 9, bottom: 15, railInset: 5, innerInset: 11 },
          seatPositions: {
            HJ: { x: 29, y: 21 },
            CO: { x: 71, y: 21 },
            BTN: { x: 87, y: 50 },
            SB: { x: 71, y: 75 },
            BB: { x: 29, y: 75 },
            UTG: { x: 13, y: 50 },
          },
          anchorOverrides: {
            BB: { blindAnchor: { x: 38, y: 70 }, betAnchor: { x: 43, y: 64 }, preflopBetAnchor: { x: 43, y: 63 }, postflopBetAnchor: { x: 43, y: 65 }, actionLabelAnchor: { x: 39, y: 69 } },
            SB: { blindAnchor: { x: 62, y: 70 }, betAnchor: { x: 57, y: 64 }, preflopBetAnchor: { x: 57, y: 63 }, postflopBetAnchor: { x: 57, y: 65 }, actionLabelAnchor: { x: 61, y: 69 } },
            HJ: { betAnchor: { x: 32, y: 41 }, preflopBetAnchor: { x: 33, y: 39 }, postflopBetAnchor: { x: 32, y: 38 }, actionLabelAnchor: { x: 38, y: 52 } },
            CO: { betAnchor: { x: 68, y: 41 }, preflopBetAnchor: { x: 67, y: 39 }, postflopBetAnchor: { x: 68, y: 38 }, actionLabelAnchor: { x: 62, y: 52 } },
            UTG: { betAnchor: { x: 24, y: 52 }, actionLabelAnchor: { x: 29, y: 55 } },
            BTN: { betAnchor: { x: 76, y: 52 }, dealerAnchor: { x: 76, y: 64 }, actionLabelAnchor: { x: 71, y: 55 } },
          },
        },
      },
    },
    4: {
      seatPositions: {
        HJ: { x: 25, y: 20 },
        CO: { x: 75, y: 20 },
        BTN: { x: 91, y: 50 },
        SB: { x: 75, y: 78.5 },
        BB: { x: 25, y: 78.5 },
        UTG: { x: 9, y: 50 },
      },
      actionPush: { top: 0.1, bottom: 0.18, left: 0.17, right: 0.17, default: 0.18 },
      blindPush: { SB: 0.14, BB: 0.15, default: 0.14 },
      dealerPush: { BTN: 0.12, default: 0.12 },
      actionLabelPush: { top: 0.31, bottom: 0.29, left: 0.29, right: 0.29, default: 0.29 },
      anchorOverrides: {
        BB: { blindAnchor: { x: 34, y: 72.5 }, betAnchor: { x: 44, y: 67 }, preflopBetAnchor: { x: 43, y: 66 }, postflopBetAnchor: { x: 44, y: 68 }, actionLabelAnchor: { x: 39, y: 70.5 } },
        SB: { blindAnchor: { x: 66, y: 72.5 }, betAnchor: { x: 56, y: 67 }, preflopBetAnchor: { x: 57, y: 66 }, postflopBetAnchor: { x: 56, y: 68 }, actionLabelAnchor: { x: 61, y: 70.5 } },
        HJ: { betAnchor: { x: 29, y: 42 }, preflopBetAnchor: { x: 31, y: 39 }, postflopBetAnchor: { x: 29, y: 38 }, actionLabelAnchor: { x: 38, y: 54 } },
        CO: { betAnchor: { x: 71, y: 42 }, preflopBetAnchor: { x: 69, y: 39 }, postflopBetAnchor: { x: 71, y: 38 }, actionLabelAnchor: { x: 62, y: 54 } },
        UTG: { betAnchor: { x: 22, y: 52 }, actionLabelAnchor: { x: 27, y: 55 } },
        BTN: { betAnchor: { x: 79, y: 52 }, dealerAnchor: { x: 78, y: 65 }, actionLabelAnchor: { x: 74, y: 55 } },
      },
      responsive: {
        mobile: {
          tableGeometry: { top: 12.5, left: 9.5, right: 9.5, bottom: 15.5, railInset: 4, innerInset: 10 },
          seatPositions: {
            HJ: { x: 29, y: 21 },
            CO: { x: 71, y: 21 },
            BTN: { x: 87, y: 50 },
            SB: { x: 71, y: 75 },
            BB: { x: 29, y: 75 },
            UTG: { x: 13, y: 50 },
          },
          anchorOverrides: {
            BB: { blindAnchor: { x: 38, y: 70 }, betAnchor: { x: 43, y: 64 }, preflopBetAnchor: { x: 43, y: 63 }, postflopBetAnchor: { x: 43, y: 65 }, actionLabelAnchor: { x: 39, y: 69 } },
            SB: { blindAnchor: { x: 62, y: 70 }, betAnchor: { x: 57, y: 64 }, preflopBetAnchor: { x: 57, y: 63 }, postflopBetAnchor: { x: 57, y: 65 }, actionLabelAnchor: { x: 61, y: 69 } },
            HJ: { betAnchor: { x: 32, y: 41 }, preflopBetAnchor: { x: 33, y: 39 }, postflopBetAnchor: { x: 32, y: 38 }, actionLabelAnchor: { x: 38, y: 52 } },
            CO: { betAnchor: { x: 68, y: 41 }, preflopBetAnchor: { x: 67, y: 39 }, postflopBetAnchor: { x: 68, y: 38 }, actionLabelAnchor: { x: 62, y: 52 } },
            UTG: { betAnchor: { x: 24, y: 52 }, actionLabelAnchor: { x: 29, y: 55 } },
            BTN: { betAnchor: { x: 76, y: 52 }, dealerAnchor: { x: 76, y: 64 }, actionLabelAnchor: { x: 71, y: 55 } },
          },
        },
      },
    },
  },
};

export function getTrainerVisualLayoutConfig(numTables = 1, viewport = "desktop") {
  const baseMode = TRAINER_VISUAL_CONFIG.layouts[numTables] || TRAINER_VISUAL_CONFIG.layouts[2];
  const responsiveMode = baseMode.responsive?.[viewport] || {};
  const mode = {
    ...baseMode,
    ...responsiveMode,
    seatPositions: responsiveMode.seatPositions || baseMode.seatPositions,
    tableGeometry: responsiveMode.tableGeometry || TRAINER_VISUAL_CONFIG.tableGeometry[numTables] || TRAINER_VISUAL_CONFIG.tableGeometry[2],
  };
  return {
    ...mode,
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
