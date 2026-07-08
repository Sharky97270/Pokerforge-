// PokerForge — façade compatible pour jetons, mises, pot et blinds du Trainer.
// La logique poker reste dans le trainer ; ce fichier ne fait que rendre le visuel.
import React from "react";
import { roundBb } from "../../utils/format.js";
import {
  BetChipDisplay,
  BlindChipDisplay,
  CHIP_COLOR_OPTIONS,
  CHIP_SIZE_MODES,
  CHIP_THEMES,
  ChipStack as PokerChipStack,
  ChipThemeSelector,
  PotChipDisplay,
  chipThemeOptions,
  normalizeChipColor,
  normalizeChipSizeMode,
  normalizeChipTheme,
} from "../poker/chips/index.js";

export {
  CHIP_COLOR_OPTIONS,
  CHIP_SIZE_MODES,
  CHIP_THEMES,
  ChipThemeSelector,
  chipThemeOptions,
  normalizeChipColor,
  normalizeChipSizeMode,
  normalizeChipTheme,
};

export function chipValueBand(amount = 0) {
  const n = Number(amount) || 0;
  if (n <= 1.5) return "forced";
  if (n <= 5) return "small";
  if (n <= 16) return "medium";
  if (n <= 60) return "large";
  return "monster";
}

export function chipPalette(kind = "hero", themeKey = "neon_modern", amount = 0, colorKey = "blue") {
  const theme = normalizeChipTheme(themeKey);
  const color = normalizeChipColor(colorKey);
  return {
    kind,
    amount,
    cols: theme.cols,
    edge: theme.edge,
    glow: color.glow || theme.glow,
  };
}

export function ChipStack({
  count = 3,
  kind = "hero",
  themeKey = "neon_modern",
  colorKey = "blue",
  amount = 0,
  size = "medium",
  sizeMode = "auto",
  tableMode = 1,
  compact = false,
  className = "",
  style,
}) {
  return (
    <PokerChipStack
      count={count}
      kind={kind}
      themeKey={themeKey}
      colorKey={colorKey}
      amount={amount}
      size={size}
      sizeMode={sizeMode}
      tableMode={tableMode}
      compact={compact}
      className={className}
      style={style}
    />
  );
}

export function ChipStackLarge(props) { return <ChipStack {...props} size="large" />; }
export function ChipStackMedium(props) { return <ChipStack {...props} size="medium" />; }
export function ChipStackSmall(props) { return <ChipStack {...props} size="small" />; }

export function actionVisualType(type = "BET") {
  const t = String(type || "BET").toUpperCase();
  if (t === "FOLD") return "fold";
  if (t === "CALL") return "call";
  if (t === "CHECK" || t === "CHECK_BACK") return "check";
  if (t === "3BET" || t === "4BET" || t === "5BET" || t === "RAISE") return "raise";
  if (t === "ALLIN" || t === "SHOVE" || t === "PUSH" || t === "RESHOVE" || t === "JAM") return "allin";
  if (t === "OPEN") return "open";
  return "bet";
}

export function ActionBetBadge({
  label,
  amount,
  type = "BET",
  compact = false,
  kind = "villain",
  themeKey = "neon_modern",
  colorKey = "blue",
  sizeMode = "auto",
  tableMode = 1,
  style,
}) {
  const visual = actionVisualType(type);
  return (
    <BetChipDisplay
      label={label}
      amount={amount}
      type={visual}
      compact={compact}
      kind={kind}
      themeKey={themeKey}
      colorKey={colorKey}
      sizeMode={sizeMode}
      tableMode={tableMode}
      style={style}
    />
  );
}

export function BetBadge(props) { return <ActionBetBadge {...props} type="BET" />; }
export function CallBadge(props) { return <ActionBetBadge {...props} type="CALL" />; }
export function RaiseBadge(props) { return <ActionBetBadge {...props} type="RAISE" />; }
export function OpenBadge(props) { return <ActionBetBadge {...props} type="OPEN" />; }
export function AllInBadge(props) { return <ActionBetBadge {...props} type="ALLIN" kind="danger" />; }
export function CheckBadge(props) { return <ActionBetBadge {...props} type="CHECK" kind="blind" />; }

export function BlindBadge(props) {
  return <BlindChipDisplay {...props} />;
}
export function BlindChipStack(props) { return <BlindBadge {...props} />; }

export function TrainingPotStack({ value = 0, compact = false, themeKey = "neon_modern", colorKey = "blue", sizeMode = "auto", tableMode = 1 }) {
  return <PotChipDisplay value={value} compact={compact} themeKey={themeKey} colorKey={colorKey} sizeMode={sizeMode} tableMode={tableMode} />;
}

export function PotDisplay({ value = 0, compact = false, style, themeKey = "neon_modern", colorKey = "blue", sizeMode = "auto", tableMode = 1 }) {
  return (
    <div className={`pf-pot-readout${compact ? " compact" : ""}`} style={style}>
      <TrainingPotStack value={value} compact={compact} themeKey={themeKey} colorKey={colorKey} sizeMode={sizeMode} tableMode={tableMode} />
      <span className="pf-pot-label">POT</span>
      <span className="pf-pot-value">{value}bb</span>
    </div>
  );
}

export function BetSizingBadge({ label, type = "bet", compact = false, style }) {
  const cls = type === "FOLD" ? "action-fold" : type === "CALL" ? "action-call" : type === "CHECK" || type === "CHECK_BACK" ? "action-check" : type === "RAISE" || type === "3BET" || type === "4BET" || type === "5BET" ? "action-raise" : type === "ALLIN" ? "action-allin" : "action-bet";
  return <span className={`seat-action-badge ${cls}${compact ? " compact" : ""}`} style={style}>{label}</span>;
}

export function SeatActionZone({
  x,
  y,
  amount = 0,
  label = "",
  type = "BET",
  compact = false,
  kind = "villain",
  themeKey = "neon_modern",
  colorKey = "blue",
  sizeMode = "auto",
  tableMode = 1,
  className = "",
  style,
}) {
  if (!(amount > 0)) return null;
  const props = { label, amount: roundBb(amount), type, compact, kind, themeKey, colorKey, sizeMode, tableMode };
  const visual = actionVisualType(type);
  return (
    <div className={`pf-seat-action-zone ${className}`} style={{ left: `${x}%`, top: `${y}%`, ...style }}>
      {visual === "call" ? <CallBadge {...props} /> : visual === "raise" ? <RaiseBadge {...props} /> : visual === "open" ? <OpenBadge {...props} /> : visual === "allin" ? <AllInBadge {...props} /> : <BetBadge {...props} />}
    </div>
  );
}

export function PlayerSeat({ pos, mode = "1T", className = "", style, children }) {
  return <div className={`pf-player-seat ${className}`} data-seat={pos} data-mode={mode} style={style}>{children}</div>;
}

export function PlayerSeatZone({ zone, className = "", style, children }) {
  return <div className={`pf-player-seat-zone ${className}`} data-zone={zone} style={style}>{children}</div>;
}
