/* ══════════════════════════════════════════════════════════════════════════
   chipDisplayResolver.js — CHIP DISPLAY RESOLVER (Mission Master §33)

   Transforme un montant (bb) en une PILE VISUELLE bornée :
     entrée : { amount, isAllIn, tableScale, chipTheme }
     sortie : { pileCount (0-4), stacks[], totalChips, label, scale, chipTheme }

   Contraintes §33 :
   - piles proportionnées aux tables (via tableScale) ;
   - éviter « 20 jetons superposés » → hauteur de pile bornée ;
   - 1 à 4 piles/jetons représentant le montant ;
   - le LABEL numérique conserve la valeur EXACTE (jamais arrondie ici).

   Module PUR. Réutilise `trainerChipPileCount` (source unique du nombre de piles).
   ══════════════════════════════════════════════════════════════════════════ */

import { trainerChipPileCount } from "./trainerActionEvent.js";

/* Dénominations de jetons en bb (grosses → petites). */
const DENOMS = [100, 25, 10, 5, 2, 1, 0.5];
/* Hauteur maximale d'une pile (nombre de jetons empilés) — évite le « 20 stack ». */
const MAX_STACK_HEIGHT = 5;

function roundBb(v) { return Math.round((Number(v) || 0) * 2) / 2; }

/* Label exact (non arrondi) : entier → "Nbb", sinon "N.Nbb". */
export function chipLabel(amount) {
  const n = Number(amount) || 0;
  if (n <= 0) return "";
  return Number.isInteger(n) ? `${n}bb` : `${n}bb`;
}

/* Facteur d'échelle des jetons selon la table : 1T pleine taille, multi réduit.
   Accepte soit un nombre (déjà l'échelle), soit un nombre de tables. */
function resolveScale(tableScale) {
  const n = Number(tableScale);
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n < 1) return n;           // échelle explicite fractionnaire (0<n<1)
  if (n === 1) return 1;         // 1 table
  if (n === 2) return 0.8;       // 2 tables
  if (n === 3) return 0.68;      // 3 tables
  return 0.58;                   // 4+ tables
}

/* Décompose `amount` en jetons par dénomination, en limitant à `maxStacks`
   piles et chaque pile à MAX_STACK_HEIGHT jetons (représentation, pas exacte). */
function buildStacks(amount, maxStacks) {
  const stacks = [];
  let remaining = roundBb(amount);
  for (const denom of DENOMS) {
    if (stacks.length >= maxStacks) break;
    if (remaining < denom - 1e-9) continue;
    let count = Math.floor((remaining + 1e-9) / denom);
    if (count <= 0) continue;
    count = Math.min(count, MAX_STACK_HEIGHT);
    stacks.push({ denom, count });
    remaining = roundBb(remaining - denom * count);
  }
  // Reste résiduel : on l'ajoute à la dernière pile (borné) pour rester proportionné.
  if (remaining > 0 && stacks.length) {
    const last = stacks[stacks.length - 1];
    last.count = Math.min(MAX_STACK_HEIGHT, last.count + 1);
  } else if (remaining > 0) {
    stacks.push({ denom: DENOMS[DENOMS.length - 1], count: 1 });
  }
  return stacks;
}

/* ──────────────────────────────────────────────────────────────────────────
   resolveChipDisplay — cœur du resolver (§33).
   ────────────────────────────────────────────────────────────────────────── */
export function resolveChipDisplay({ amount = 0, isAllIn = false, tableScale = 1, chipTheme = "neon_modern" } = {}) {
  const n = Number(amount) || 0;
  const pileCount = trainerChipPileCount(n, isAllIn);   // 0..4 (source unique)
  const scale = resolveScale(tableScale);
  if (n <= 0) {
    return { amount: n, label: "", pileCount: 0, stacks: [], totalChips: 0, scale, chipTheme, isAllIn: !!isAllIn };
  }
  const stacks = buildStacks(n, Math.max(1, pileCount));
  const totalChips = stacks.reduce((s, st) => s + st.count, 0);
  return {
    amount: n,
    label: chipLabel(n),          // valeur EXACTE, jamais arrondie
    pileCount,                    // 1..4
    stacks,                       // [{denom, count}] borné (≤4 piles, ≤5 hauteur)
    totalChips,                   // jamais « 20 superposés »
    scale,                        // proportion à la table
    chipTheme,
    isAllIn: !!isAllIn,
  };
}
