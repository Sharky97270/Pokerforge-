import React from "react";
import Chip from "./Chip.jsx";
import { normalizeChipTheme } from "./chipThemes.js";
import { getChipSizeScale, getChipStackVisualAmount, getChipTableMode } from "./chipSizing.js";

const KIND_CLASS = {
  hero: "is-hero",
  villain: "is-villain",
  pot: "is-pot",
  blind: "is-blind",
  danger: "is-danger",
  multiway: "is-multiway",
};

export default function ChipStack({
  count,
  amount = 1,
  kind = "hero",
  themeKey = "neon_modern",
  colorKey = "blue",
  size = "medium",
  sizeMode = "auto",
  tableMode = 1,
  compact = false,
  className = "",
  style,
}) {
  const tableModeKey = typeof tableMode === "string" ? tableMode : getChipTableMode(tableMode);
  const isAllIn = kind === "danger";
  const visual = getChipStackVisualAmount(amount, tableModeKey, isAllIn);
  const chipCount = Math.max(1, Math.min(8, count || visual.visibleChips));
  const sizeScale = getChipSizeScale({ tableMode: tableModeKey, sizeMode, compact });
  const theme = normalizeChipTheme(themeKey);

  return (
    <span
      className={[
        "pf-chip-stack",
        "pf-chip-stack-v2",
        `pf-chip-${size}`,
        KIND_CLASS[kind] || "",
        theme.minimal ? "is-minimal" : "",
        className,
      ].filter(Boolean).join(" ")}
      data-table-mode={tableModeKey}
      data-size-mode={sizeMode}
      data-stack-type={visual.stackType}
      style={{
        "--pf-chip-count": chipCount,
        "--pf-chip-stack-scale": sizeScale,
        ...style,
      }}
    >
      {Array.from({ length: chipCount }).map((_, i) => (
        <Chip
          key={i}
          amount={visual.denomination || amount}
          themeKey={themeKey}
          colorKey={colorKey}
          index={i}
          sizeScale={sizeScale}
        />
      ))}
    </span>
  );
}
