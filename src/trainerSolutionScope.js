/* ══════════════════════════════════════════════════════════════════════════
   trainerSolutionScope.js — PÉRIMÈTRE DE VALIDITÉ D'UNE SOLUTION

   POURQUOI CE MODULE EXISTE
   Le seul moteur exactement résolu embarqué dans l'application est le push/fold
   préflop `solvePreflopPushFold`. Son propre en-tête (src/solver/core/pushfold.js)
   déclare ses limites : « HEADS-UP uniquement » et « chip-EV pur : aucune
   contrainte ICM ». Or le Trainer l'appliquait à TOUT spot préflop dont le tapis
   était entier et ≤ 30bb, sans jamais regarder combien de joueurs restaient dans
   le coup ni quel était le barème de gains.

   Conséquence mesurée à l'écran (2026-08-21, 1920×1080, 2T) : un spot
   « BTN 25bb — Push ou fold ? » en Cash 6-max affichait le bandeau
   « 🦈 SOLUTION SOLVEUR — calcul exact ». Le modèle sous-jacent est SB jam vs BB
   avec blindes 0.5/1 déjà postées ; au BTN, Hero n'a rien posté et DEUX joueurs
   peuvent encore payer. Les fréquences affichées ne décrivaient donc pas le spot
   montré — et elles portaient le mot « exact ».

   Ce module ne calcule aucune stratégie. Il répond à une seule question, de
   façon pure et testable : « ce spot est-il DANS le domaine de validité de ce
   moteur, et sinon pourquoi ? ». Un appelant qui reçoit `inDomain:false` doit
   afficher la limite, pas extrapoler.
   ══════════════════════════════════════════════════════════════════════════ */

/* Ordre d'action préflop. Un joueur situé APRÈS Hero dans cet ordre et qui n'a
   pas encore agi est toujours dans le coup : il n'est pas « couché ».

   SOURCE UNIQUE : `POSITIONS_BY_SIZE` (src/data/content.js) — c'est déjà la
   table dont se sert le rendu de la mosaïque. Redéfinir ici un ordre « à peu
   près équivalent » recréerait la divergence qu'on corrige : l'ordre 6-max
   n'est PAS le suffixe de l'ordre 9-max (le 6-max ouvre à UTG, le 9-max place
   UTG+1, MP et LJ entre les deux). */
import { POSITIONS_BY_SIZE } from "./data/content.js";

export const PREFLOP_ORDER = POSITIONS_BY_SIZE[9];

/* Ordre d'action réel de la table, à la taille donnée. */
export function preflopOrderFor(size) {
  if (Number.isInteger(size) && POSITIONS_BY_SIZE[size]) return POSITIONS_BY_SIZE[size];
  return PREFLOP_ORDER;
}

export const PAYOUT = { CHIP_EV: "chipEV", ICM: "ICM", PKO: "PKO" };

/* Barème de gains déduit du format. Un format inconnu n'est PAS supposé chipEV :
   on renvoie null, et l'appelant traite l'inconnu comme hors domaine plutôt que
   de parier. */
export function payoutModelOf(fmt) {
  const f = String(fmt || "").toLowerCase();
  if (!f) return null;
  if (/pko|bounty|knockout/.test(f)) return PAYOUT.PKO;
  // Un Spin & Go est un SNG 3 joueurs à prize pool exponentiel : ICM, jamais chipEV.
  if (/icm|spin|sng|sit ?& ?go|bulle|bubble|final table|table finale/.test(f)) return PAYOUT.ICM;
  if (/chipev|chip ev|cash|nlhe|zoom|rush/.test(f)) return PAYOUT.CHIP_EV;
  if (/mtt/.test(f)) return PAYOUT.CHIP_EV;   // « MTT ChipEV » et assimilés
  return null;
}

/* Nombre de sièges de la table. `spot.nplayers` fait foi quand il existe ; sinon
   on lit le format. Faute des deux, null (inconnu ≠ heads-up). */
export function tableSizeOf(spot) {
  const n = Number(spot?.nplayers);
  if (Number.isInteger(n) && n >= 2) return n;
  const f = String(spot?.fmt || "").toLowerCase();
  const m = f.match(/(\d+)\s*-?\s*max/);
  if (m) return Number(m[1]);
  if (/heads ?-?up|\bhu\b/.test(f)) return 2;
  if (/spin/.test(f)) return 3;
  return null;
}

export function parseStackBb(stack) {
  const n = Number(String(stack ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function extraPositions(spot) {
  const raw = [
    ...(Array.isArray(spot?.multiway) ? spot.multiway : []),
    ...(Array.isArray(spot?.extraPlayers) ? spot.extraPlayers : []),
    ...(Array.isArray(spot?.callers) ? spot.callers : []),
  ];
  return raw.map(p => (typeof p === "string" ? p : p?.pos || p?.position || p?.seat)).filter(Boolean);
}

/* Positions explicitement couchées dans la ligne préflop reconstruite. */
function foldedPositions(spot) {
  const out = new Set();
  const acts = [
    ...(Array.isArray(spot?.preActions) ? spot.preActions : []),
    ...(Array.isArray(spot?.line?.actions) ? spot.line.actions : []),
  ];
  for (const a of acts) {
    const t = String(a?.actionType || a?.action || a?.act || "").toUpperCase();
    const pos = a?.position || a?.pos || a?.actor;
    if (pos && t.includes("FOLD")) out.add(pos);
  }
  return out;
}

/* Positions encore susceptibles de mettre des jetons au moment de la décision
   d'Hero, en préflop et en l'absence de relance : Hero, le vilain désigné, les
   éventuels joueurs multiway déclarés, et TOUS ceux qui parlent après Hero.

   C'est ce dernier terme qui manquait partout : le Trainer marquait « couché »
   tout siège qui n'était ni Hero ni le vilain, y compris SB et BB alors que Hero
   ouvre au BTN — donc avant eux. */
export function livePositionsAtDecision(spot) {
  const order = preflopOrderFor(tableSizeOf(spot));
  const hero = spot?.hpos;
  const folded = foldedPositions(spot);
  const live = new Set();
  if (hero) live.add(hero);
  if (spot?.vpos) live.add(spot.vpos);
  for (const p of extraPositions(spot)) live.add(p);
  const heroIdx = order.indexOf(hero);
  if (heroIdx >= 0 && /^pre/i.test(spot?.street || "Preflop")) {
    // Personne après Hero n'a encore parlé : ces sièges sont vivants par construction.
    for (let i = heroIdx + 1; i < order.length; i++) {
      if (!folded.has(order[i])) live.add(order[i]);
    }
  }
  for (const p of folded) if (p !== hero && p !== spot?.vpos) live.delete(p);
  return [...live];
}

/* ──────────────────────────────────────────────────────────────────────────
   Domaine de validité du solveur push/fold heads-up chip-EV.

   Le modèle résolu est EXACTEMENT : deux joueurs, blindes 0.5/1 déjà postées,
   SB décide jam-ou-fold, BB décide call-ou-fold, tout all-in va à l'abattage,
   utilité = jetons. Toute déviation sort du domaine.
   ────────────────────────────────────────────────────────────────────────── */
export const PUSHFOLD_MAX_BB = 25;   // profondeur tabulée (bibliothèque pré-solvée)

export function pushFoldDomain(spot) {
  const reasons = [];
  const stackBb = parseStackBb(spot?.stack);
  const street = String(spot?.street || "Preflop");
  const toCall = Math.max(0, Number(spot?.toCall) || 0);
  const acts = Array.isArray(spot?.acts) ? spot.acts : [];
  const hasFold = acts.some(a => String(a?.id || "").toUpperCase() === "FOLD");
  const hasJam = acts.some(a => /^(ALLIN|PUSH|SHOVE|JAM)$/.test(String(a?.id || "").toUpperCase()));
  const hasCall = acts.some(a => String(a?.id || "").toUpperCase() === "CALL");
  const live = livePositionsAtDecision(spot);
  const payout = payoutModelOf(spot?.fmt);
  const hero = spot?.hpos, vil = spot?.vpos;

  if (!/^pre/i.test(street)) reasons.push(`street ${street} — le moteur ne couvre que le préflop`);
  if (!(stackBb > 0)) reasons.push("profondeur inconnue");
  else if (stackBb > PUSHFOLD_MAX_BB) reasons.push(`${stackBb}bb > ${PUSHFOLD_MAX_BB}bb — hors profondeur résolue`);
  else if (Math.abs(stackBb - Math.round(stackBb)) > 1e-9) reasons.push(`${stackBb}bb — tapis fractionnaire non tabulé`);

  if (payout === null) reasons.push(`format « ${spot?.fmt || "?"} » — barème de gains indéterminé`);
  else if (payout !== PAYOUT.CHIP_EV) reasons.push(`${payout} non modélisé — le moteur est chip-EV pur`);

  // Heads-up STRICT : exactement deux joueurs encore susceptibles d'engager des jetons.
  if (live.length !== 2) {
    reasons.push(`${live.length} joueur(s) encore dans le coup (${live.join(", ") || "—"}) — le moteur est heads-up`);
  } else if (!(live.includes("SB") && live.includes("BB"))) {
    // Deux joueurs mais pas la structure de blindes du modèle (ex. BTN vs BB après
    // fold de SB : Hero n'a rien posté, le risque de jam n'est pas −0.5bb).
    reasons.push(`structure ${live.join(" vs ")} — le modèle suppose SB vs BB avec blindes 0.5/1 postées`);
  }

  if (toCall > 0) {
    if (!(hasFold && hasCall)) reasons.push("face à une mise sans option fold/call identifiable");
    else if (hero !== "BB") reasons.push(`Hero ${hero || "?"} face au jam — le modèle ne résout que BB face au jam de SB`);
  } else {
    if (!(hasFold && hasJam)) reasons.push("pas de couple fold/jam identifiable");
    else if (hero !== "SB") reasons.push(`Hero ${hero || "?"} ouvre — le modèle ne résout que le jam de SB`);
  }

  return {
    inDomain: reasons.length === 0,
    reasons,
    scope: {
      street: /^pre/i.test(street) ? "preflop" : street.toLowerCase(),
      players: live.length,
      livePositions: live,
      headsUp: live.length === 2,
      payout,
      depthBb: stackBb,
      hero, villain: vil,
      facing: toCall > 0 ? "jam" : null,
      tableSize: tableSizeOf(spot),
    },
  };
}

/* Libellé court et honnête pour l'écran. Jamais le mot « exact » hors domaine. */
export function scopeLimitLabel(domain) {
  if (!domain || domain.inDomain) return null;
  return domain.reasons[0] || "hors domaine de validité";
}
