import React from "react";
import {
  CHIP_COLOR_OPTIONS,
  CHIP_SIZE_MODES,
  chipThemeOptions,
  chipThemePreviewAsset,
  normalizeChipColor,
  normalizeChipSizeMode,
  normalizeChipTheme,
} from "./chipThemes.js";

export default function ChipThemeSelector({
  chipTheme = "neon_modern",
  chipColor = "blue",
  chipSizeMode = "auto",
  onThemeChange,
  onColorChange,
  onSizeModeChange,
}) {
  const activeTheme = normalizeChipTheme(chipTheme);
  const activeColor = normalizeChipColor(chipColor);
  const activeSize = normalizeChipSizeMode(chipSizeMode);

  return (
    <div className="pf-chip-settings">
      <div className="pf-chip-settings-head">
        <div>
          <div className="pf-chip-settings-kicker">Style de jetons</div>
          <p>Rendu global des jetons du Trainer : mises, blinds, pot et all-in.</p>
        </div>
        <div className="pf-chip-settings-live">
          <img src={chipThemePreviewAsset(activeTheme.id)} alt="" draggable="false" />
          <span style={{ color: activeColor.accent }}>{activeTheme.name}</span>
          <em>{activeSize.name}</em>
        </div>
      </div>

      <div className="pf-chip-section-label">Style de jetons</div>
      <div className="chip-theme-grid chip-theme-grid-v2">
        {chipThemeOptions().map((theme) => {
          const isActive = activeTheme.id === theme.id;
          const preview = chipThemePreviewAsset(theme.id);
          return (
            <button key={theme.id} type="button" className={`chip-theme-card chip-theme-card-v2${isActive ? " active" : ""}`} onClick={() => onThemeChange?.(theme.id)}>
              <span className="chip-theme-preview-v2">
                {preview ? <img src={preview} alt="" draggable="false" /> : <span />}
              </span>
              <strong>{theme.name}</strong>
              <small>{theme.desc}</small>
              {isActive && <em>Actif</em>}
            </button>
          );
        })}
      </div>

      <div className="pf-chip-section-label">Couleur principale</div>
      <div className="pf-chip-color-row">
        {Object.values(CHIP_COLOR_OPTIONS).map((color) => (
          <button
            key={color.id}
            type="button"
            className={`pf-chip-color-btn${activeColor.id === color.id ? " active" : ""}`}
            onClick={() => onColorChange?.(color.id)}
            style={{
              "--pf-chip-primary": color.primary,
              "--pf-chip-accent": color.accent,
              "--pf-chip-glow": color.glow,
            }}
          >
            <i />
            <span>{color.name}</span>
          </button>
        ))}
      </div>

      <div className="pf-chip-section-label">Taille des jetons</div>
      <div className="pf-chip-size-row">
        {Object.values(CHIP_SIZE_MODES).map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`pf-chip-size-btn${activeSize.id === mode.id ? " active" : ""}`}
            onClick={() => onSizeModeChange?.(mode.id)}
          >
            {mode.name}
          </button>
        ))}
      </div>
    </div>
  );
}
