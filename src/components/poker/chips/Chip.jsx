import React from "react";
import { chipAssetUrl, chipDenominationForAmount, chipThemeStyleVars } from "./chipThemes.js";

export default function Chip({
  amount = 1,
  themeKey = "neon_modern",
  colorKey = "blue",
  index = 0,
  sizeScale = 1,
  className = "",
  style,
}) {
  const denom = chipDenominationForAmount(amount);
  const assetUrl = chipAssetUrl(themeKey, amount);
  const vars = {
    ...chipThemeStyleVars(themeKey, colorKey),
    "--pf-chip-i": index,
    "--pf-chip-scale": sizeScale,
    ...style,
  };

  return (
    <i className={`pf-chip-token ${className}`} style={vars} aria-hidden="true">
      {assetUrl ? (
        <img className="pf-chip-token-img" src={assetUrl} alt="" draggable="false" />
      ) : (
        <b className="pf-chip-token-fallback">{denom.label}</b>
      )}
    </i>
  );
}
