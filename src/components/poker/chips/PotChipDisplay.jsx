import React from "react";
import ChipStack from "./ChipStack.jsx";

function potPileProfile(value = 0) {
  const amount = Math.max(0, Number(value) || 0);
  const pileCount =
    amount <= 2 ? 1 :
    amount <= 8 ? 2 :
    amount <= 25 ? 3 :
    amount <= 80 ? 4 :
    amount <= 160 ? 5 : 6;
  const denoms =
    amount <= 2 ? [0.5, 1] :
    amount <= 8 ? [1, 2.5, 5] :
    amount <= 25 ? [2.5, 5, 25] :
    amount <= 80 ? [5, 25, 100] :
    [25, 100, 5];

  return Array.from({ length: pileCount }, (_, index) => {
    const intensity = Math.max(1, Math.round(Math.log2(amount + 2)));
    const chips = Math.max(1, Math.min(7, intensity - Math.floor(index / 2) + (index % 2)));
    return {
      chips,
      denom: denoms[index % denoms.length],
      x: (index - (pileCount - 1) / 2) * 7,
      y: index % 2 === 0 ? 0 : -3,
    };
  });
}

export function PotChipStack({
  value = 0,
  compact = false,
  themeKey = "neon_modern",
  colorKey = "blue",
  sizeMode = "auto",
  tableMode = 1,
}) {
  const piles = potPileProfile(value);
  const numericMode = Math.max(1, Math.min(4, Number(tableMode) || 1));
  const size = compact || numericMode >= 3 ? "small" : numericMode === 2 ? "medium" : "large";

  return (
    <span className={`pf-pot-chip-cluster piles-${piles.length}${compact ? " compact" : ""}`}>
      {piles.map((pile, index) => (
        <ChipStack
          key={`${pile.denom}-${index}`}
          count={pile.chips}
          amount={pile.denom}
          kind="pot"
          themeKey={themeKey}
          colorKey={colorKey}
          size={size}
          sizeMode={sizeMode}
          tableMode={tableMode}
          compact={compact}
          style={{
            "--pf-pot-pile-x": `${pile.x}px`,
            "--pf-pot-pile-y": `${pile.y}px`,
            "--pf-pot-pile-z": index,
          }}
        />
      ))}
    </span>
  );
}

export function PotChipDisplay({
  value = 0,
  compact = false,
  themeKey = "neon_modern",
  colorKey = "blue",
  sizeMode = "auto",
  tableMode = 1,
}) {
  return (
    <span className={`pf-pot-chip-stack pf-pot-chip-stack-v2${compact ? " compact" : ""}`}>
      <PotChipStack
        value={value}
        compact={compact}
        themeKey={themeKey}
        colorKey={colorKey}
        sizeMode={sizeMode}
        tableMode={tableMode}
      />
    </span>
  );
}

export function BlindChipDisplay({
  amount = 1,
  label = "BB",
  compact = false,
  themeKey = "neon_modern",
  colorKey = "blue",
  sizeMode = "auto",
  tableMode = 1,
  style,
}) {
  return (
    <span className={`pf-blind-stack pf-blind-stack-v2${compact ? " compact" : ""}`} style={style}>
      <ChipStack
        amount={amount}
        kind="blind"
        themeKey={themeKey}
        colorKey={colorKey}
        size={compact ? "small" : "medium"}
        sizeMode={sizeMode}
        tableMode={tableMode}
        compact={compact}
      />
      <strong>{amount}bb</strong>
      <em>{label}</em>
    </span>
  );
}
