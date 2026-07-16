const chipAssetModules = import.meta.glob("../../../assets/chips/png/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});
// Jetons vectoriels Trainer V2 (design system — planche officielle)
const chipSvgModules = import.meta.glob("../../../assets/chips/svg/**/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

export const CHIP_DENOMINATIONS = [
  { key: "0_5bb", label: "0.5", value: 0.5 },
  { key: "1bb", label: "1", value: 1 },
  { key: "2_5bb", label: "2.5", value: 2.5 },
  { key: "3bb", label: "3", value: 3 },
  { key: "4bb", label: "4", value: 4 },
  { key: "5bb", label: "5", value: 5 },
  { key: "25bb", label: "25", value: 25 },
  { key: "100bb", label: "100", value: 100 },
];

export const CHIP_COLOR_OPTIONS = {
  blue: { id: "blue", name: "Bleu", primary: "#1f8bff", accent: "#34d8ff", glow: "rgba(31,139,255,.56)" },
  red: { id: "red", name: "Rouge", primary: "#ff4560", accent: "#ff8a3d", glow: "rgba(255,69,96,.58)" },
  green: { id: "green", name: "Vert", primary: "#10d87a", accent: "#7fffd4", glow: "rgba(16,216,122,.5)" },
  black: { id: "black", name: "Noir", primary: "#0d162b", accent: "#dce8ff", glow: "rgba(180,205,255,.32)" },
  orange: { id: "orange", name: "Orange", primary: "#ff9d2e", accent: "#ffd15a", glow: "rgba(255,157,46,.52)" },
  violet: { id: "violet", name: "Violet", primary: "#9b5cff", accent: "#c090ff", glow: "rgba(155,92,255,.58)" },
  cyan: { id: "cyan", name: "Cyan", primary: "#00d6ff", accent: "#baf7ff", glow: "rgba(0,214,255,.56)" },
  gold: { id: "gold", name: "Doré", primary: "#ffc247", accent: "#ffe3a3", glow: "rgba(255,194,71,.58)" },
};

export const CHIP_SIZE_MODES = {
  auto: { id: "auto", name: "Auto" },
  compact: { id: "compact", name: "Compact" },
  normal: { id: "normal", name: "Normal" },
  large: { id: "large", name: "Large" },
};

export const CHIP_THEMES = {
  neon_modern: {
    id: "neon_modern",
    name: "Neon Modern",
    desc: "Signature PokerForge, glow bleu/violet premium",
    style: "neon",
    folder: "neon_modern",
    edge: "#7fe8ff",
    glow: "rgba(0,191,255,.62)",
    textColor: "#ffffff",
    cols: ["#00d6ff", "#1f8bff", "#9b5cff", "#071b44", "#baf7ff"],
  },
  vip_gold: {
    id: "vip_gold",
    name: "VIP Gold",
    desc: "Noir, or et violet haut de gamme",
    style: "vip",
    folder: "vip_gold",
    edge: "#ffe3a3",
    glow: "rgba(255,194,71,.56)",
    textColor: "#fff7dd",
    cols: ["#ffc247", "#1b102d", "#7d4cff", "#050913", "#ffe3a3"],
  },
  premium_casino: {
    id: "premium_casino",
    name: "Premium Casino",
    desc: "Céramique détaillée, bord métallique",
    style: "premium",
    folder: "premium_casino",
    edge: "#dce8ff",
    glow: "rgba(160,190,255,.44)",
    textColor: "#ffffff",
    cols: ["#dce8ff", "#1f8bff", "#0c1b3c", "#ffc247", "#ffffff"],
  },
  classic_casino: {
    id: "classic_casino",
    name: "Classic Casino",
    desc: "Jetons casino réalistes et lisibles",
    style: "classic",
    folder: "classic_casino",
    edge: "#f5f7ff",
    glow: "rgba(255,255,255,.34)",
    textColor: "#ffffff",
    cols: ["#f5f7ff", "#1f8bff", "#ff4560", "#10d87a", "#111827"],
  },
  poker_online: {
    id: "poker_online",
    name: "Poker Online",
    desc: "Room online moderne, net et lumineux",
    style: "online",
    folder: "poker_online",
    edge: "#60b0ff",
    glow: "rgba(31,139,255,.46)",
    textColor: "#ffffff",
    cols: ["#1f8bff", "#34d8ff", "#ff4560", "#10d87a", "#ffc247"],
  },
  minimal_performance: {
    id: "minimal_performance",
    name: "Minimal Performance",
    desc: "CSS léger, animations réduites",
    style: "minimal",
    folder: "neon_modern",
    edge: "#60b0ff",
    glow: "rgba(31,139,255,.28)",
    textColor: "#ffffff",
    cols: ["#1f8bff", "#34d8ff", "#071b44", "#dce8ff"],
    minimal: true,
  },
  // Trainer V2 — jetons SVG vectoriels (planche « Assets Trainer V2 »).
  // Forcé dans le Trainer (skin V2) ; volontairement absent du sélecteur.
  trainer_v2: {
    id: "trainer_v2",
    name: "Trainer V2",
    desc: "Design system V2 — jetons vectoriels",
    style: "v2",
    folder: "trainer_v2",
    svg: true,
    edge: "#20CFFF",
    glow: "rgba(32,207,255,.5)",
    textColor: "#ffffff",
    cols: ["#20CFFF", "#FFB800", "#17C964", "#E53935", "#A855F7"],
  },
  // Legacy aliases kept so old localStorage values do not break the Trainer.
  blue: null,
  gold: null,
  titan: null,
};

CHIP_THEMES.blue = { ...CHIP_THEMES.neon_modern, id: "blue", name: "PokerForge Blue" };
CHIP_THEMES.gold = { ...CHIP_THEMES.vip_gold, id: "gold", name: "Royal Gold" };
CHIP_THEMES.titan = { ...CHIP_THEMES.premium_casino, id: "titan", name: "Titanium" };

const CHIP_THEME_ORDER = ["neon_modern", "vip_gold", "premium_casino", "classic_casino", "poker_online", "minimal_performance"];

export function chipThemeOptions() {
  return CHIP_THEME_ORDER.map((id) => CHIP_THEMES[id]);
}

export function normalizeChipTheme(themeKey = "neon_modern") {
  return CHIP_THEMES[themeKey] || CHIP_THEMES.neon_modern;
}

export function normalizeChipColor(colorKey = "blue") {
  return CHIP_COLOR_OPTIONS[colorKey] || CHIP_COLOR_OPTIONS.blue;
}

export function normalizeChipSizeMode(sizeMode = "auto") {
  return CHIP_SIZE_MODES[sizeMode] || CHIP_SIZE_MODES.auto;
}

export function chipThemeStyleVars(themeKey = "neon_modern", colorKey = "blue") {
  const theme = normalizeChipTheme(themeKey);
  const color = normalizeChipColor(colorKey);
  return {
    "--pf-chip-primary": color.primary,
    "--pf-chip-accent": color.accent,
    "--pf-chip-edge": theme.edge,
    "--pf-chip-glow": color.glow || theme.glow,
    "--pf-chip-text": theme.textColor,
  };
}

export function chipDenominationForAmount(amount = 0) {
  const n = Math.max(0, Number(amount) || 0);
  if (n <= 0.75) return CHIP_DENOMINATIONS[0];
  if (n <= 1.75) return CHIP_DENOMINATIONS[1];
  if (n <= 2.75) return CHIP_DENOMINATIONS[2];
  if (n <= 3.5) return CHIP_DENOMINATIONS[3];
  if (n <= 4.5) return CHIP_DENOMINATIONS[4];
  if (n <= 12) return CHIP_DENOMINATIONS[5];
  if (n <= 60) return CHIP_DENOMINATIONS[6];
  return CHIP_DENOMINATIONS[7];
}

export function chipAssetUrl(themeKey = "neon_modern", amount = 1) {
  const theme = normalizeChipTheme(themeKey);
  if (theme.minimal) return null;
  const denom = chipDenominationForAmount(amount);
  if (theme.svg) {
    const svgPath = `../../../assets/chips/svg/${theme.folder}/chip_${denom.key}.svg`;
    return chipSvgModules[svgPath] || null;
  }
  const path = `../../../assets/chips/png/${theme.folder}/chip_${denom.key}.png`;
  return chipAssetModules[path] || null;
}

export function chipThemePreviewAsset(themeKey = "neon_modern") {
  return chipAssetUrl(themeKey, 25) || chipAssetUrl("neon_modern", 25);
}
