/* ══════════════════════════════════════════════════════════════════════════
   trainerPausePolicy.js — RÉGLAGE « PAUSE APRÈS » (Lot 4 bis)

   POURQUOI UN MODULE PLUTÔT QU'UN `if` DANS LE COMPOSANT
   La pause doit se comporter à l'identique dans six contextes qui n'ont
   aujourd'hui aucun code commun : GTO, Exploit, Full Hand, spot isolé, sessions
   limitées ou illimitées, et 1T→4T. Une condition écrite dans le rendu se serait
   dupliquée six fois, et aurait divergé. La règle vit ici, une fois, et se teste
   sans navigateur.

   DEUX PIÈGES QUE CE MODULE FERME EXPLICITEMENT
   ① Une décision NON ÉVALUÉE (scénario invalide, solution indisponible) n'est
      pas une faute du joueur. La confondre avec une erreur ferait s'arrêter le
      Trainer en accusant le joueur d'un défaut de l'application. Elle a donc sa
      propre classe, et seule l'option « Chaque action » s'y arrête.
   ② React re-rend un composant autant de fois qu'il le juge utile. Une pause
      déclenchée « au rendu » se redéclencherait après avoir été levée. D'où la
      clé `tableId + handId + decisionId` : une pause au plus par décision.
   ══════════════════════════════════════════════════════════════════════════ */

export const PAUSE_AFTER = {
  NEVER: "never",
  MISTAKE: "mistake",
  INACCURACY: "inaccuracy",
  EVERY: "every",
};

export const PAUSE_AFTER_DEFAULT = PAUSE_AFTER.NEVER;

/* Libellés français non ambigus. « Erreur » et « Imprécision+ » nomment des
   paliers de verdict qui existent déjà (cf. VERDICT_SEUILS) : le joueur
   retrouve à l'identique le mot qu'il lit dans son feedback. */
export const PAUSE_AFTER_OPTIONS = [
  { id: PAUSE_AFTER.NEVER, l: "Jamais",
    hint: "La session ne s'arrête jamais d'elle-même." },
  { id: PAUSE_AFTER.MISTAKE, l: "Erreur",
    hint: "S'arrête après une décision classée Erreur ✗ ou Blunder 💥." },
  { id: PAUSE_AFTER.INACCURACY, l: "Imprécision+",
    hint: "S'arrête dès une Imprécision ⚠, et a fortiori sur Erreur ✗ / Blunder 💥." },
  { id: PAUSE_AFTER.EVERY, l: "Chaque action",
    hint: "S'arrête après chaque décision d'Hero, y compris les bonnes — pour étudier le feedback." },
];

export const PAUSE_AFTER_HELP =
  "Interrompt la table concernée après une décision, le temps de lire le verdict, " +
  "l'EV perdue et la range. Les autres tables ne sont pas affectées. " +
  "Le compte à rebours de la table en pause est suspendu jusqu'à « Continuer ».";

export function isPauseAfter(v) {
  return Object.values(PAUSE_AFTER).includes(v);
}
export function normalizePauseAfter(v) {
  return isPauseAfter(v) ? v : PAUSE_AFTER_DEFAULT;
}

/* ──────────────────────────────────────────────────────────────────────────
   Classes de verdict. Une seule échelle pour deux sources de vérité qui ne
   parlaient pas la même langue :
     · spotVerdict()               → "Best Move ✦" / "Correct ✓" / "Imprécision ⚠"
                                     / "Erreur ✗" / "Blunder 💥"
     · evaluatePostflopDecision()  → "best" / "ok" / "imprecise" / "error"
   ────────────────────────────────────────────────────────────────────────── */
export const VERDICT_CLASS = {
  BEST: "best",
  CORRECT: "correct",
  INACCURACY: "inaccuracy",
  MISTAKE: "mistake",
  BLUNDER: "blunder",
  UNEVALUATED: "unevaluated",
};

/* Sévérité croissante. `unevaluated` est HORS de cette échelle : ce n'est pas
   « pire » ni « mieux » qu'une erreur, c'est une absence de jugement. */
const SEVERITY = {
  [VERDICT_CLASS.BEST]: 0,
  [VERDICT_CLASS.CORRECT]: 1,
  [VERDICT_CLASS.INACCURACY]: 2,
  [VERDICT_CLASS.MISTAKE]: 3,
  [VERDICT_CLASS.BLUNDER]: 4,
};

/* Verdict de spot (`spotVerdict`) → classe. On lit `cls`, pas le libellé :
   le libellé porte un emoji et peut changer sans que la règle change. */
export function classFromSpotVerdict(verdict) {
  if (!verdict) return VERDICT_CLASS.UNEVALUATED;
  switch (verdict.cls) {
    case "gto-best": return VERDICT_CLASS.BEST;
    case "gto-correct": return VERDICT_CLASS.CORRECT;
    case "gto-inaccuracy": return VERDICT_CLASS.INACCURACY;
    case "gto-wrong": return VERDICT_CLASS.MISTAKE;
    case "gto-blunder": return VERDICT_CLASS.BLUNDER;
    default: return VERDICT_CLASS.UNEVALUATED;
  }
}

/* Évaluation postflop (Full Hand) → classe. */
export function classFromPostflopQuality(quality) {
  switch (quality) {
    case "best": return VERDICT_CLASS.BEST;
    case "ok": return VERDICT_CLASS.CORRECT;
    case "imprecise": return VERDICT_CLASS.INACCURACY;
    case "error": return VERDICT_CLASS.MISTAKE;
    default: return VERDICT_CLASS.UNEVALUATED;
  }
}

/* Un spot dont la solution n'est pas exploitable ne peut produire aucun verdict
   honnête : ni bon, ni mauvais. */
export function isEvaluableSpot(spot) {
  if (!spot) return false;
  if (spot.invalid || spot.unavailable) return false;
  const acts = Array.isArray(spot.acts) ? spot.acts : [];
  if (!acts.length) return false;
  return Number.isInteger(spot.ok) && spot.ok >= 0 && spot.ok < acts.length;
}

/* ──────────────────────────────────────────────────────────────────────────
   LA règle.
   ────────────────────────────────────────────────────────────────────────── */
export function shouldPauseAfter(policy, verdictClass) {
  const p = normalizePauseAfter(policy);
  if (p === PAUSE_AFTER.NEVER) return false;
  if (p === PAUSE_AFTER.EVERY) return true;           // y compris « non évaluée »
  // Les deux paliers intermédiaires jugent une FAUTE : une décision non évaluée
  // n'en est pas une, on ne s'arrête pas dessus.
  if (verdictClass === VERDICT_CLASS.UNEVALUATED) return false;
  const sev = SEVERITY[verdictClass];
  if (sev == null) return false;
  const seuil = p === PAUSE_AFTER.MISTAKE
    ? SEVERITY[VERDICT_CLASS.MISTAKE]
    : SEVERITY[VERDICT_CLASS.INACCURACY];
  return sev >= seuil;
}

/* ──────────────────────────────────────────────────────────────────────────
   Identité d'une décision. `decisionId` distingue deux décisions successives
   d'une même main (Full Hand : flop, turn, river) — sans lui, la pause du turn
   serait considérée « déjà déclenchée » par celle du flop.
   ────────────────────────────────────────────────────────────────────────── */
export function decisionId({ street, index = 0 } = {}) {
  return `${String(street || "preflop").toLowerCase()}#${index}`;
}
export function pauseKey(tableId, handId, decision) {
  return `t${tableId ?? 0}|h${handId ?? "?"}|${decision ?? decisionId()}`;
}

/* Étiquette du compteur global. Le pluriel est porté ici pour qu'aucun rendu ne
   le réinvente. */
export function pausedCountLabel(n) {
  if (!n) return null;
  return n === 1 ? "1 table en pause" : `${n} tables en pause`;
}
