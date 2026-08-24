/* ══════════════════════════════════════════════════════════════════════════
   postflopHeuristic.js — ÉVALUATION POSTFLOP HEURISTIQUE (Full Hand, §60)

   Le postflop n'est PAS solvé en interne (le CFR est experimental). Pour donner
   un retour pédagogique PAR STREET au Full Hand, on ESTIME la qualité d'une
   décision Héro à partir de la force de sa main sur le board courant.

   HONNÊTETÉ (§2) : provenance = "heuristic-estimate", jamais présentée comme un
   GTO exact. Le solveur exact prendra le relais quand il aura fait ses preuves.

   Module PUR. Réutilise handStrength7 (évaluateur du solveur, via fullHandEngine).
   ══════════════════════════════════════════════════════════════════════════ */

import { cardToInt } from "./fullHandEngine.js";
import { evalBestI, handCategoryOf, HAND_CATEGORY_COUNT } from "./solver/core/evaluator.js";

/* Meilleure main parmi 5, 6 ou 7 cartes — MÊME abstraction que le Vilain (C1).
   Cette fonction vivait ici en double ; c'est précisément cette duplication qui
   permettait au chemin Vilain de rester cassé pendant que celui d'Hero était
   juste. Il n'y a plus qu'un évaluateur, et il refuse les longueurs invalides. */
const evalBest = evalBestI;

/* Force normalisée 0..1 de la main Héro sur le board (catégorie de main → 0..1).
   score ≈ cat*15^5 + kickers ; on ramène la catégorie (0=hauteur … 8=quinte fl)
   sur 0..1, avec un léger bonus kicker pour départager. */
export function normalizedHandStrength(heroHand, board) {
  const b = Array.isArray(board) ? board.filter(Boolean) : [];
  if (b.length < 3) return 0.5; // pas assez de board → neutre
  const cards = [...(heroHand || []), ...b].filter(Boolean).map(cardToInt);
  const score = evalBest(cards);
  if (score < 0) return 0.5;
  const cat = handCategoryOf(score);                          // 0..8
  const within = (score % Math.pow(15, 5)) / Math.pow(15, 5); // 0..1 kickers
  const span = HAND_CATEGORY_COUNT - 1;
  return Math.min(1, cat / span + within * (1 / span) * 0.6);
}

// Seuils calés sur les catégories de main (cat/8) : brelan+ (cat≥3 → ≥0.375)
// = fort ; paire/double paire (cat 1-2 → 0.12-0.33) = moyen ; hauteur = faible.
function bucket(s) { return s >= 0.34 ? "strong" : s >= 0.12 ? "medium" : "weak"; }
function norm(actionType) {
  const t = String(actionType || "").toUpperCase();
  if (t === "CHECK" || t === "CHECK_BACK") return "CHECK";
  if (t === "FOLD") return "FOLD";
  if (t === "CALL") return "CALL";
  if (t === "RAISE" || t === "3BET" || t === "4BET") return "RAISE";
  return "BET"; // BET/OPEN/PSB/PROBE/DONK/ALLIN…
}

/* Action « idéale » heuristique selon la force et le contexte. */
function bestAction(b, facingBet) {
  if (facingBet) return b === "strong" ? "RAISE" : b === "medium" ? "CALL" : "FOLD";
  return b === "strong" ? "BET" : "CHECK"; // medium/weak → check
}

/* Matrice qualité + delta d'EV estimé (bb, avant mise à l'échelle par le pot).
   quality : "best" | "ok" | "imprecise" | "error". */
function grade(b, facingBet, act) {
  const best = bestAction(b, facingBet);
  if (act === best) return { quality: "best", ev: 0, best };

  if (facingBet) {
    // strong : RAISE idéal ; CALL ok ; FOLD = grosse erreur
    if (b === "strong") {
      if (act === "CALL") return { quality: "ok", ev: -0.12, best };
      if (act === "FOLD") return { quality: "error", ev: -1.1, best };
    }
    // medium : CALL idéal ; RAISE imprécis ; FOLD léger
    if (b === "medium") {
      if (act === "RAISE") return { quality: "imprecise", ev: -0.35, best };
      if (act === "FOLD") return { quality: "imprecise", ev: -0.25, best };
    }
    // weak : FOLD idéal ; CALL erreur ; RAISE (bluff) imprécis
    if (b === "weak") {
      if (act === "CALL") return { quality: "error", ev: -0.8, best };
      if (act === "RAISE") return { quality: "imprecise", ev: -0.4, best };
    }
  } else {
    // pas de mise à payer
    if (b === "strong") { // BET idéal
      if (act === "CHECK") return { quality: "imprecise", ev: -0.3, best }; // manque de value
      if (act === "FOLD") return { quality: "error", ev: -1.4, best };      // fold la nuts
    }
    if (b === "medium") { // CHECK idéal
      if (act === "BET") return { quality: "ok", ev: -0.12, best };         // semi-bluff ok
      if (act === "FOLD") return { quality: "error", ev: -0.9, best };
    }
    if (b === "weak") { // CHECK idéal
      if (act === "BET") return { quality: "imprecise", ev: -0.25, best };  // bluff ok parfois
      if (act === "FOLD") return { quality: "ok", ev: -0.05, best };        // fold air ≈ ok
    }
  }
  return { quality: "imprecise", ev: -0.3, best };
}

const LABELS = { CHECK: "Check", BET: "Bet", FOLD: "Fold", CALL: "Call", RAISE: "Raise" };

/* ──────────────────────────────────────────────────────────────────────────
   evaluatePostflopDecision — retour pédagogique ESTIMÉ d'une décision Héro.
   opts : { heroHand, board, street, pot, facingBet, actionType }
   ────────────────────────────────────────────────────────────────────────── */
export function evaluatePostflopDecision({ heroHand = [], board = [], street = "flop", pot = 0, facingBet = false, actionType = "CHECK" } = {}) {
  const s = normalizedHandStrength(heroHand, board);
  const b = bucket(s);
  const act = norm(actionType);
  const g = grade(b, facingBet, act);
  const potScale = Math.max(0.5, Math.min(3, (Number(pot) || 6) / 12)); // amplifie l'erreur avec le pot
  const evDelta = Math.round(g.ev * potScale * 100) / 100;
  const isCorrect = g.quality === "best" || g.quality === "ok";
  return {
    source: "heuristic-estimate",
    street,
    strength: Math.round(s * 100) / 100,
    bucket: b,
    action: act,
    bestActionId: g.best,
    bestAction: LABELS[g.best] || g.best,
    quality: g.quality,          // best | ok | imprecise | error
    correct: isCorrect,
    evDelta,                     // ≤ 0 (perte estimée vs meilleure action)
    note: isCorrect
      ? `Estimation : ${LABELS[act]} correct avec une main ${b === "strong" ? "forte" : b === "medium" ? "moyenne" : "faible"}.`
      : `Estimation : ${LABELS[g.best]} aurait été préférable (main ${b === "strong" ? "forte" : b === "medium" ? "moyenne" : "faible"}).`,
  };
}
