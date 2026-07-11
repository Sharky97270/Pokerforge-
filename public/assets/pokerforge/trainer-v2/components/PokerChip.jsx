// PokerForge Trainer V2 — Jeton (planche §03). SVG par dénomination.
// Le MONTANT textuel réel reste piloté par les données du Trainer, hors image.
import React from "react";
const BASE = "/assets/pokerforge/trainer-v2/chips";
const DENOMS = ["25","100","500","1k","5k"];
// Choisit la dénomination visuelle la plus proche pour un montant en bb.
export function chipDenomFor(bb = 0) {
  if (bb >= 60) return "5k"; if (bb >= 25) return "1k";
  if (bb >= 10) return "500"; if (bb >= 3) return "100"; return "25";
}
export default function PokerChip({ denom, bb, size = 32, style, className = "" }) {
  const d = denom || chipDenomFor(bb);
  const key = DENOMS.includes(d) ? d : "25";
  return <img src={`${BASE}/chip-${key}.svg`} width={size} height={size} alt="" aria-hidden="true"
    draggable="false" className={`pf-chip ${className}`} style={{ display:"block", ...style }} />;
}
export function PotChip({ size = 40, style, className = "" }) {
  return <img src={`${BASE}/pot-chip.svg`} width={size} height={size} alt="" aria-hidden="true"
    draggable="false" className={`pf-pot-chip ${className}`} style={{ display:"block", ...style }} />;
}
