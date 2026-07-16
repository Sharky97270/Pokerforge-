// PokerForge Trainer V2 — Bouton d'action (planche §06).
// Texte + montant restent dynamiques (jamais gravés dans une image).
// Requiert tokens/trainer-v2.css et buttons/action-buttons.css, sous un parent .trainer-v2.
import React from "react";

const VARIANTS = { check:"check", call:"call", bet:"bet", raise:"raise", cbet:"cbet", betpot:"betpot", fold:"fold", allin:"allin" };

export default function ActionButton({ variant = "check", label, amount, disabled, onClick, style, className = "" }) {
  const v = VARIANTS[variant] || "check";
  return (
    <button
      type="button"
      className={`pf-btn pf-btn--${v} ${className}`}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      style={style}
    >
      <span>{label}</span>
      {amount != null && amount !== "" && <small>{amount}</small>}
    </button>
  );
}
