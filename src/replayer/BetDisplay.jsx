/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : BetDisplay (§9).

       BetDisplay
        ├─ chipStack   (1 à 3 piles, hauteur ∝ montant)
        └─ amountLabel (montant dominant, type d'action discret)

   Empilé à la VERTICALE, contrairement au badge horizontal du Trainer : sur
   l'anneau du Replayer, un badge large de 150 px déborde vers le siège voisin
   et c'est précisément ce qui rendait la mise de Hero attribuable au CO. En
   colonne, l'objet est étroit (largeur d'une pile) et son étiquette tombe
   juste sous SES jetons — le lien jetons ↔ montant devient sans ambiguïté.

   Tailles en PIXELS calculées (aucun transform:scale sur une image raster) :
   les jetons restent nets sur écran HiDPI (§7) et restent subordonnés aux
   cartes / avatars / board / pot (§8).
═══════════════════════════════════════════════════════════════ */
import React from "react";
import { ChipStack } from "../components/table/Chips.jsx";
import { getChipStackVisualAmount } from "../components/poker/chips/chipSizing.js";

const rb = v => Math.round(v * 100) / 100;

/* Type d'action → classe visuelle + libellé court (§9 : « BET » discret). */
const KINDS = {
  CALL: { cls: "call", tag: "CALL" },
  RAISE: { cls: "raise", tag: "RAISE" },
  ALLIN: { cls: "allin", tag: "ALL-IN" },
  BET: { cls: "bet", tag: "BET" },
  OPEN: { cls: "bet", tag: "OPEN" },
  BLIND: { cls: "blind", tag: "BLIND" },
};

export function betVisualKind(type = "BET") {
  const t = String(type || "BET").toUpperCase();
  if (t === "3BET" || t === "4BET" || t === "5BET") return KINDS.RAISE;
  return KINDS[t] || KINDS.BET;
}

/* Diamètre nominal d'un jeton de mise, en px (avant `--pf-bet-scale`).
   Doit rester en phase avec `--pf-chip-base-size` posé par replayer-table.css :
   c'est la même grandeur, écrite une seule fois de chaque côté. */
export const BET_CHIP_PX = 23;
export const FLY_CHIP_PX = 20;

/** Taille (px) occupée par un BetDisplay — sert au solveur d'ancrage (§10). */
export function betDisplaySize(amount = 0, scale = 1, allin = false) {
  const v = getChipStackVisualAmount(amount, "1T", allin);
  const chip = BET_CHIP_PX * scale;
  const piles = Math.max(1, v.pileCount);
  // Chaque pile occupe `chip + 8` moins le chevauchement de 4 px (cf. CSS).
  const chipsW = piles * (chip + 8) - (piles - 1) * 4;
  const labelW = 46 * scale;                     // « 13.3bb BET » ≈ 46–74 px
  const w = Math.round(Math.max(chipsW, labelW));
  const stackH = chip + Math.max(0, v.visibleChips - 1) * 3 * scale;
  const h = Math.round(stackH + 17 * scale);     // + étiquette montant
  return { w: Math.max(34, w), h: Math.max(30, h), piles: v.piles, visibleChips: v.visibleChips };
}

export default function BetDisplay({
  x, y, amount = 0, type = "BET", kind = "villain", pos,
  swept = 0, blocked = null,
  scale = 1, active = false, className = "", style,
  themeKey = "trainer_v2", colorKey = "blue",
  tossDx = 0, tossDy = 0, duration = 0, animate = null, bump = false,
}) {
  if (!(amount > 0.0001)) return null;
  const k = betVisualKind(type);
  const allin = k.cls === "allin";
  const visual = getChipStackVisualAmount(amount, "1T", allin);
  const n = rb(amount);

  return (
    <div
      className={[
        "pf-bet-display", `pf-bet-${k.cls}`,
        kind === "hero" ? "is-hero" : "is-villain",
        active ? "is-active" : "",
        animate === "toss" ? "is-toss" : "",
        bump ? "is-bump" : "",
        className,
      ].filter(Boolean).join(" ")}
      data-seat={pos}
      data-amount={n}
      /* Traçabilité de l'ancrage : de combien de degrés la mise a dû être
         décalée, et qui l'a poussée. Lu par scripts/replayer-bet-audit.mjs. */
      data-swept={Math.round(swept || 0)}
      data-blocked={blocked && blocked.length ? blocked.join(",") : undefined}
      style={{
        left: `${x}%`, top: `${y}%`,
        "--pf-toss-dx": `${tossDx}px`,
        "--pf-toss-dy": `${tossDy}px`,
        "--pf-cine-dur": `${duration || 230}ms`,
        "--pf-bet-scale": scale,
        ...style,
      }}
    >
      <span className={`pf-bet-chips piles-${visual.piles.length}`}>
        {visual.piles.map((count, i) => (
          <ChipStack
            key={i}
            count={count}
            amount={amount}
            kind={allin ? "danger" : i % 2 === 1 ? "pot" : kind}
            themeKey={themeKey}
            colorKey={colorKey}
            size="small"
            tableMode="1T"
          />
        ))}
      </span>
      {/* Le type d'action n'est écrit QUE sur la mise du joueur qui vient
          d'agir : sur un pot multiway, six étiquettes « BET » ajoutent du bruit
          sans rien apprendre, alors que le montant, lui, se lit toujours (§9). */}
      <span className="pf-bet-label">
        <b className="pf-bet-amount">{Number.isInteger(n) ? n : n.toFixed(1)}<i>bb</i></b>
        {(active || allin) && <em className="pf-bet-tag">{k.tag}</em>}
      </span>
    </div>
  );
}

/**
 * Jetons en vol — utilisés pour l'ajout d'un raise (§14) et pour le transfert
 * des mises vers le pot (§16). Même matériau graphique que le BetDisplay :
 * l'œil suit les MÊMES jetons du joueur jusqu'au pot (§17).
 */
export function ChipFly({ x, y, dx, dy, amount = 0, allin = false, kind = "villain", scale = 1, duration = 300, delay = 0, label, themeKey = "trainer_v2", colorKey = "blue" }) {
  const visual = getChipStackVisualAmount(amount, "1T", allin);
  return (
    <div
      className={`pf-chip-fly${allin ? " is-allin" : ""} ${kind === "hero" ? "is-hero" : "is-villain"}`}
      style={{
        left: `${x}%`, top: `${y}%`,
        "--pf-fly-dx": `${dx}px`, "--pf-fly-dy": `${dy}px`,
        "--pf-cine-dur": `${duration}ms`,
        "--pf-bet-scale": scale,
        animationDelay: `${delay}ms`,
      }}
    >
      <span className="pf-bet-chips">
        {visual.piles.map((count, i) => (
          <ChipStack key={i} count={count} amount={amount} kind={allin ? "danger" : kind}
            themeKey={themeKey} colorKey={colorKey} size="small" tableMode="1T" />
        ))}
      </span>
      {label && <em className="pf-fly-label">{label}</em>}
    </div>
  );
}
