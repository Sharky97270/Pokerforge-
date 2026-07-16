// Échelles alignées sur les tokens du script multi-table V1 (§6) :
// --pf-scale-2t:0.78 · --pf-scale-3t-top:0.66 · --pf-scale-4t:0.58
export const CHIP_TABLE_MODE_SCALE = {
  "1T": 1,
  "2T": 0.78,
  "3T": 0.66,
  "4T": 0.58,
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

// Répartit `total` jetons en un nombre de piles agréable, SANS perdre de jeton
// (la somme des piles == total). Garantit la cohérence hauteur ↔ montant.
function splitChipPiles(total, maxPiles) {
  const t = Math.max(1, Math.round(total));
  const piles = Math.max(1, Math.min(maxPiles, Math.ceil(t / 3)));
  const base = Math.floor(t / piles);
  const rem = t - base * piles;
  return Array.from({ length: piles }, (_, i) => Math.max(1, base + (i < rem ? 1 : 0)));
}

// Hauteur de pile fonction du MONTANT misé : plus la mise est grande, plus la
// pile est haute (barème logarithmique borné, monotone). Ainsi le nombre de
// jetons affichés est toujours cohérent avec la taille de la mise, et la
// dénomination (couleur/valeur du jeton) suit les paliers standards.
function stackTypeFor(amount, isAllIn) {
  if (isAllIn || amount >= 80) return "allin";
  if (amount <= 1.75) return "blind";
  if (amount <= 4.5) return "short";
  if (amount <= 12) return "medium";
  if (amount <= 60) return "large";
  return "monster";
}

export function getChipStackVisualAmount(amountBB = 0, tableMode = "1T", isAllIn = false) {
  const amount = Math.max(0, Number(amountBB) || 0);
  const t = String(tableMode || "1T");
  const dense = t === "3T" || t === "4T";

  // Dénomination (palier standard) — aligne la couleur/valeur du jeton sur le
  // montant, cohérente avec chipDenominationForAmount() utilisé par <Chip/>.
  const denomination =
    amount <= 0.75 ? 0.5 :
    amount <= 1.75 ? 1 :
    amount <= 2.75 ? 2.5 :
    amount <= 3.5 ? 3 :
    amount <= 4.5 ? 4 :
    amount <= 12 ? 5 :
    amount <= 60 ? 25 : 100;

  if (amount <= 0) {
    return { amount, denomination, visibleChips: 0, pileCount: 0, piles: [], stackType: stackTypeFor(0, false) };
  }

  const cap = dense ? 5 : 8;
  let visibleChips = isAllIn ? cap : Math.round(1.8 * Math.log(1 + amount) + 0.4);
  visibleChips = Math.max(1, Math.min(cap, visibleChips));
  // Tables denses : on compresse un peu la hauteur pour rester lisible.
  if (dense && !isAllIn) visibleChips = Math.max(1, Math.min(cap, Math.ceil(visibleChips * 0.7)));

  const piles = splitChipPiles(visibleChips, dense ? 2 : 4);
  return { amount, denomination, visibleChips, pileCount: piles.length, piles, stackType: stackTypeFor(amount, isAllIn) };
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
