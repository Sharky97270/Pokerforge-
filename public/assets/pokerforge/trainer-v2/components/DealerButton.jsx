// PokerForge Trainer V2 — Bouton Dealer (planche §04).
// SVG vectoriel net à toute échelle. À positionner relativement au siège BTN.
import React from "react";
const SRC = "/assets/pokerforge/trainer-v2/dealer/dealer-button.svg";
export default function DealerButton({ size = 28, style, className = "" }) {
  return <img src={SRC} width={size} height={size} alt="Dealer" draggable="false"
    className={`pf-dealer-btn ${className}`} style={{ display:"block", ...style }} />;
}
