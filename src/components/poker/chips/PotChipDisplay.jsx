import React from "react";
import ChipStack from "./ChipStack.jsx";

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
      <ChipStack
        amount={value}
        kind="pot"
        themeKey={themeKey}
        colorKey={colorKey}
        size={compact ? "medium" : "large"}
        sizeMode={sizeMode}
        tableMode={tableMode}
        compact={compact}
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
