/* ══════════════════════════════════════════════════════════════════════════
   fullHandEngine.js — MOTEUR DE MAIN COMPLÈTE (Full Hand, heads-up postflop)

   Permet au Héro de jouer TOUT le coup street par street (flop → turn → river)
   contre le Villain, avec des règles de poker correctes et un VRAI showdown
   (évaluation de main via le solver), en remplacement de l'ancien comportement
   probabiliste (Math.random pour le résultat).

   Modèle : heads-up (Héro vs Villain), No-Limit. Pas de side pots (2 joueurs).
   Le Villain joue via une politique injectable (`villainPolicy`) ; à défaut une
   politique par défaut raisonnable est utilisée.

   Module PUR (aucune dépendance React/DOM). Dépend uniquement de l'évaluateur.
   ══════════════════════════════════════════════════════════════════════════ */

import { eval7i } from "./solver/core/evaluator.js";

const RANK_ORDER = "23456789TJQKA";
const SUIT_ORDER = "♠♥♦♣"; // ♠♥♦♣ (identique côté trainer + générateur)
export const FH_STREETS = ["flop", "turn", "river"];

/* Carte {r,s} → entier 0..51 attendu par l'évaluateur (rang<<2 | couleur). */
export function cardToInt(c) {
  if (!c) return 0;
  const r = RANK_ORDER.indexOf(c.r);
  const s = SUIT_ORDER.indexOf(c.s);
  return (Math.max(0, r) << 2) | Math.max(0, s);
}

/* Force d'une main de 5 parmi 7 (Héro/Villain + board). Plus haut = meilleur. */
export function handStrength7(hole2, board5) {
  const cards = [...hole2, ...board5].filter(Boolean).map(cardToInt);
  if (cards.length < 5) return -1;
  return eval7i(cards.slice(0, 7));
}

function roundBb(v) { return Math.round((Number(v) || 0) * 2) / 2; }
function boardForStreet(fullBoard, street) {
  const n = street === "flop" ? 3 : street === "turn" ? 4 : 5;
  return fullBoard.slice(0, n);
}
function otherActor(a) { return a === "hero" ? "villain" : "hero"; }

/* ──────────────────────────────────────────────────────────────────────────
   createFullHand — état initial au flop.
   opts : { heroHand, villHand, fullBoard(5), startPot, heroStack, villStack,
            firstToAct('hero'|'villain') }
   ────────────────────────────────────────────────────────────────────────── */
export function createFullHand(opts = {}) {
  const {
    heroHand = [], villHand = [], fullBoard = [],
    startPot = 6, heroStack = 100, villStack = 100,
    firstToAct = "villain",
  } = opts;
  return {
    street: "flop",
    fullBoard,
    board: boardForStreet(fullBoard, "flop"),
    pot: roundBb(startPot),
    heroHand, villHand,
    heroStack: roundBb(heroStack), villStack: roundBb(villStack),
    contrib: { hero: 0, villain: 0 },   // engagé sur la street courante
    acted: { hero: false, villain: false },
    toAct: firstToAct,
    firstToActPostflop: firstToAct,     // l'OOP reparle en premier chaque street
    lastAggressor: null,
    history: [],
    done: false,
    result: null,
    lastVillainAction: null,
  };
}

/* Montant à payer par l'acteur courant (0 s'il peut checker). */
export function amountToCall(state, actor = state.toAct) {
  return Math.max(0, roundBb(state.contrib[otherActor(actor)] - state.contrib[actor]));
}

/* Actions légales pour l'acteur courant. */
export function legalActions(state, actor = state.toAct) {
  if (state.done || !actor) return [];
  const toCall = amountToCall(state, actor);
  const stack = actor === "hero" ? state.heroStack : state.villStack;
  const acts = [];
  if (toCall > 0) {
    acts.push({ type: "FOLD" });
    acts.push({ type: "CALL", amount: Math.min(toCall, stack) });
    if (stack > toCall) acts.push({ type: "RAISE" });
  } else {
    acts.push({ type: "CHECK" });
    if (stack > 0) acts.push({ type: "BET" });
  }
  return acts;
}

/* Taille de mise par défaut (bb) : BET ≈ 60% pot ; RAISE ≈ 2.5× la mise à payer. */
function defaultBetAmount(state, actor) {
  return Math.max(1, roundBb(state.pot * 0.6));
}
function defaultRaiseTo(state, actor) {
  const toCall = amountToCall(state, actor);
  const opp = state.contrib[otherActor(actor)];
  return roundBb(opp + Math.max(toCall * 2.5, toCall + state.pot * 0.5));
}

/* Applique une action de l'acteur `actor`. Retourne un NOUVEL état (immuable). */
export function applyAction(state, actor, action) {
  if (state.done || state.toAct !== actor) return state;
  const s = cloneState(state);
  const type = String(action?.type || "").toUpperCase();
  const stack = actor === "hero" ? "heroStack" : "villStack";
  const opp = otherActor(actor);
  const toCall = amountToCall(s, actor);

  const commit = (amt) => {
    const pay = Math.min(roundBb(amt), s[stack]);
    s[stack] = roundBb(s[stack] - pay);
    s.contrib[actor] = roundBb(s.contrib[actor] + pay);
    s.pot = roundBb(s.pot + pay);
    return pay;
  };

  if (type === "FOLD") {
    s.history.push({ street: s.street, actor, action: "FOLD", amount: 0 });
    return finish(s, opp, "fold");
  }
  if (type === "CHECK" && toCall === 0) {
    s.acted[actor] = true;
    s.history.push({ street: s.street, actor, action: "CHECK", amount: 0 });
    if (s.acted[opp]) return closeStreet(s);       // les deux ont checké
    s.toAct = opp; return s;
  }
  if (type === "CALL" && toCall > 0) {
    commit(toCall);
    s.acted[actor] = true;
    s.history.push({ street: s.street, actor, action: "CALL", amount: toCall });
    return closeStreet(s);                          // suivre clôt le tour d'enchères
  }
  if (type === "BET" && toCall === 0) {
    const amt = action.amount != null ? action.amount : defaultBetAmount(s, actor);
    const paid = commit(amt);
    s.acted[actor] = true; s.lastAggressor = actor;
    s.history.push({ street: s.street, actor, action: "BET", amount: paid });
    s.toAct = opp; s.acted[opp] = false;            // l'adversaire doit répondre
    return s;
  }
  if (type === "RAISE" && toCall > 0) {
    const raiseTo = action.amount != null ? action.amount : defaultRaiseTo(s, actor);
    const delta = Math.max(toCall, roundBb(raiseTo - s.contrib[actor]));
    const paid = commit(delta);
    s.acted[actor] = true; s.lastAggressor = actor;
    s.history.push({ street: s.street, actor, action: "RAISE", amount: paid });
    s.toAct = opp; s.acted[opp] = false;
    return s;
  }
  // Action illégale → inchangé.
  return state;
}

/* Clôture la street : si river → showdown ; sinon distribue la carte suivante. */
function closeStreet(s) {
  const bothAllIn = s.heroStack <= 0 || s.villStack <= 0;
  const idx = FH_STREETS.indexOf(s.street);
  if (s.street === "river" || bothAllIn) {
    // Déroule le reste du board si all-in, puis showdown.
    return resolveShowdown(s);
  }
  const next = FH_STREETS[idx + 1];
  s.street = next;
  s.board = boardForStreet(s.fullBoard, next);
  s.contrib = { hero: 0, villain: 0 };
  s.acted = { hero: false, villain: false };
  s.lastAggressor = null;
  // Postflop heads-up : l'OOP (premier à parler au flop) reparle en premier.
  s.toAct = s.firstToActPostflop || "villain";
  return s;
}

function resolveShowdown(s) {
  s.board = boardForStreet(s.fullBoard, "river");
  const hero = handStrength7(s.heroHand, s.board);
  const vill = handStrength7(s.villHand, s.board);
  const winner = hero > vill ? "hero" : vill > hero ? "villain" : "split";
  s.street = "done"; s.done = true; s.toAct = null;
  s.result = { winner, reason: "showdown", heroRank: hero, villRank: vill };
  return s;
}

function finish(s, winner, reason) {
  s.street = "done"; s.done = true; s.toAct = null;
  s.result = { winner, reason };
  return s;
}

function cloneState(s) {
  return {
    ...s,
    board: [...s.board],
    contrib: { ...s.contrib },
    acted: { ...s.acted },
    history: [...s.history],
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Politique Villain par défaut (raisonnable, non exploitante) — utilisée si
   aucune politique n'est injectée. Décide selon la force relative de sa main.
   `random` injectable pour la testabilité.
   ────────────────────────────────────────────────────────────────────────── */
export function defaultVillainPolicy(state, { random = Math.random } = {}) {
  const acts = legalActions(state, "villain");
  if (!acts.length) return null;
  const strength = normalizedStrength(state.villHand, state.board);
  const toCall = amountToCall(state, "villain");
  if (toCall > 0) {
    // Face à une mise : fold faible, call moyen, raise fort.
    if (strength < 0.28 && random() < 0.85) return { type: "FOLD" };
    if (strength > 0.82 && random() < 0.55 && acts.some(a => a.type === "RAISE")) return { type: "RAISE" };
    return { type: "CALL" };
  }
  // Personne n'a misé : value/semi-bluff sinon check.
  if (strength > 0.6 && random() < 0.7) return { type: "BET" };
  if (strength < 0.35 && random() < 0.25) return { type: "BET" }; // bluff léger
  return { type: "CHECK" };
}

/* Force normalisée 0..1 de la main du villain sur ce board (heuristique via
   l'évaluateur ; sert uniquement à piloter la politique par défaut). */
function normalizedStrength(hole, board) {
  const s = handStrength7(hole, board.length >= 3 ? board : [...board, ...board].slice(0, 3));
  if (s < 0) return 0.5;
  // eval5i ≈ cat*15^5 ; on ramène la catégorie (0..8) sur 0..1.
  const cat = Math.floor(s / Math.pow(15, 5));
  return Math.min(1, cat / 8 + 0.06);
}

/* Joue l'action du Villain courant via la politique, retourne le nouvel état. */
export function playVillain(state, policy = defaultVillainPolicy, ctx = {}) {
  if (state.done || state.toAct !== "villain") return state;
  const action = policy(state, ctx) || { type: amountToCall(state, "villain") > 0 ? "CALL" : "CHECK" };
  return applyAction(state, "villain", action);
}
