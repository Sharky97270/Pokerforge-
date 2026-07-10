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
  // Piles à somme constante : le nombre TOTAL de jetons = visual.visibleChips,
  // donc cohérent avec le montant misé (pas de multiplication pile × jetons).
  const piles = amount > 0 ? visual.piles : [];

  return (
    <span
      className={`pf-action-chip-badge pf-chip-badge-v2 pf-action-${type}${compact ? " compact" : ""}`}
      data-table-mode={tableModeKey}
      data-size-mode={sizeMode}
      data-stack-type={visual.stackType}
      style={style}
    >
      {amount > 0 && (
        <span className={`pf-action-chip-piles piles-${piles.length}`}>
          {piles.map((chipCount, i) => (
            <ChipStack
              key={i}
              count={chipCount}
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
