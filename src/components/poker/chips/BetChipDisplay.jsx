import React from "react";
import ChipStack from "./ChipStack.jsx";
import { getChipStackVisualAmount, getChipTableMode } from "./chipSizing.js";

export default function BetChipDisplay({
  label,
  amount = 0,
  type = "bet",
  compact = false,
  kind = "villain",
  themeKey = "neon_modern",
  colorKey = "blue",
  sizeMode = "auto",
  tableMode = 1,
  style,
}) {
  const tableModeKey = typeof tableMode === "string" ? tableMode : getChipTableMode(tableMode);
  const visual = getChipStackVisualAmount(amount, tableModeKey, String(type).toLowerCase() === "allin");
  const pileCount = amount > 0 ? Math.max(1, Math.min(4, visual.pileCount)) : 0;
  const chipsPerPile = Math.max(1, Math.min(5, visual.visibleChips));

  return (
    <span
      className={`pf-action-chip-badge pf-chip-badge-v2 pf-action-${type}${compact ? " compact" : ""}`}
      data-table-mode={tableModeKey}
      data-size-mode={sizeMode}
      data-stack-type={visual.stackType}
      style={style}
    >
      {amount > 0 && (
        <span className={`pf-action-chip-piles piles-${pileCount}`}>
          {Array.from({ length: pileCount }).map((_, i) => (
            <ChipStack
              key={i}
              count={Math.max(1, Math.min(5, chipsPerPile - (i % 2)))}
              amount={amount}
              kind={type === "allin" ? "danger" : i % 3 === 1 ? "pot" : kind}
              themeKey={themeKey}
              colorKey={colorKey}
              size={compact ? "small" : "medium"}
              sizeMode={sizeMode}
              tableMode={tableModeKey}
              compact={compact}
            />
          ))}
        </span>
      )}
      <span className="pf-action-chip-copy">
        {label && <strong>{label}</strong>}
        {amount > 0 && <em>{amount}bb</em>}
      </span>
    </span>
  );
}
