/* ══════════════════════════════════════════════════════════════════════════
   PFASE · ÉTAT DE JEU NORMALISÉ (Mission §7, §37, §39, §92, §109-2)

   POURQUOI
   Trois calculateurs de pot cohabitent aujourd'hui dans PokerForge : `math.pot`
   (SharkSolverTab), `handLedger` (Trainer) et `state.pot` (fullHandEngine).
   Aucun n'est faux, mais aucun n'est LA référence — et le SPR, qui pilote tout
   le sizing géométrique, en dépend. La mission exige une source unique (§7).

   Ce module produit un `GameState` canonique et en DÉRIVE, une seule fois :

     pot · effectiveStack · SPR · currentBet · amountToCall
     minimumRaise · maximumRaise · streetsRemaining

   Il refuse un état incohérent (§92) plutôt que de le rattraper : un pot négatif
   ou une relance impossible sont des bugs amont, pas des cas à absorber.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { EPS, EvaluationModel, TableFormat } from "./config.js";
import { roundAmount, roundTo } from "./sizingSpec.js";

/* ── TYPES D'ACTION STRICTS (§37) ──────────────────────────────────────────
   « Ne jamais qualifier un CALL de BET. » Le type et le montant sont deux
   grandeurs distinctes : `{ actionType, size }`, jamais un libellé unique. */
export const ActionType = Object.freeze({
  FOLD: "FOLD",
  CHECK: "CHECK",
  CALL: "CALL",
  BET: "BET",
  RAISE: "RAISE",
  ALL_IN: "ALL_IN",
});
export const ACTION_TYPES = Object.freeze(Object.keys(ActionType));

/* Une action est-elle dimensionnée (porte-t-elle un montant choisi) ? */
export function isSizedActionType(t) {
  return t === ActionType.BET || t === ActionType.RAISE || t === ActionType.ALL_IN;
}
/* Une action est-elle agressive (met de l'argent au-delà de l'égalisation) ? */
export function isAggressiveActionType(t) {
  return t === ActionType.BET || t === ActionType.RAISE || t === ActionType.ALL_IN;
}

export const STREETS = Object.freeze(["PREFLOP", "FLOP", "TURN", "RIVER"]);
export const STREET_BOARD_LENGTH = Object.freeze({ PREFLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 });

/* Les formes acceptées sont ÉNUMÉRÉES, pas devinées par préfixe. Un
   `/^PRE/` acceptait « PRE-TURN » et le transformait silencieusement en
   préflop : exactement le genre de rattrapage que §92 interdit. */
const STREET_ALIASES = new Map(Object.entries({
  PREFLOP: "PREFLOP", PRE: "PREFLOP", "PRÉFLOP": "PREFLOP", "PRE-FLOP": "PREFLOP",
  "PRÉ-FLOP": "PREFLOP", PREFLOPPED: "PREFLOP",
  FLOP: "FLOP",
  TURN: "TURN",
  RIVER: "RIVER", RIVIERE: "RIVER", "RIVIÈRE": "RIVER",
}));
export function normalizeStreet(s) {
  const t = String(s || "").trim().toUpperCase();
  return STREET_ALIASES.get(t) || null;
}
/* Rues de mise restantes À VENIR, celle-ci comprise. Flop → 3, turn → 2,
   river → 1. Alimente le sizing géométrique (§6). */
export function streetsRemainingFor(street) {
  const s = normalizeStreet(street);
  return s === "FLOP" ? 3 : s === "TURN" ? 2 : s === "RIVER" ? 1 : 4;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const pos = (v) => { const n = num(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/* ══════════════════════════════════════════════════════════════════════════
   normalizeGameState — construit l'état canonique et le VALIDE.

   Entrée (tout est en bb) :
     {
       gameType:"CASH"|"TOURNAMENT", format:"HU"|"6MAX"|…, tableFormat:"HU"|"3WAY"|…,
       street, board:[int|{r,s}], blinds:{sb,bb}, ante, rake:{pct,cap},
       players:[{ id, position, stack, committedStreet, committedTotal,
                  folded, allIn, isHero }],
       actorId,                       // qui doit parler (défaut : le héros)
       deadPot,                       // pot des rues précédentes
       lastRaiseIncrement,            // dernier incrément de relance sur la street
       minBet,                        // plancher d'ouverture (défaut : 1bb)
       actionHistory:[{position, actionType, size}],
       evaluationModel, icmParams, pkoParams
     }

   Sortie : { ok, errors, state } — `state` est null si `ok` est faux.
   ══════════════════════════════════════════════════════════════════════════ */
export function normalizeGameState(input = {}) {
  const errors = [];
  const street = normalizeStreet(input.street);
  if (!street) errors.push(`street invalide : « ${input.street} »`);

  /* ── Board ── */
  const board = Array.isArray(input.board) ? input.board.slice() : [];
  const expectedBoard = street ? STREET_BOARD_LENGTH[street] : null;
  if (street && board.length !== expectedBoard) {
    errors.push(`board de ${board.length} carte(s) incompatible avec ${street} (attendu ${expectedBoard})`);
  }
  /* Cartes dupliquées (§92) — on compare la forme canonique de chaque carte. */
  const boardKeys = board.map(cardKey).filter(Boolean);
  if (boardKeys.length !== board.length) errors.push("board : carte illisible");
  if (new Set(boardKeys).size !== boardKeys.length) errors.push("board : carte dupliquée");

  /* ── Blindes / antes ── */
  const bb = pos(input.blinds?.bb) || 1;
  const sb = pos(input.blinds?.sb) || bb / 2;
  const ante = Math.max(0, num(input.ante) || 0);
  const minBet = pos(input.minBet) || bb;

  /* ── Joueurs ── */
  const rawPlayers = Array.isArray(input.players) ? input.players : [];
  if (!rawPlayers.length) errors.push("aucun joueur");
  const players = rawPlayers.map((p, i) => {
    const stack = Math.max(0, num(p?.stack) || 0);
    const cs = Math.max(0, num(p?.committedStreet) || 0);
    const ct = Math.max(0, num(p?.committedTotal) || cs);
    if (num(p?.stack) < 0) errors.push(`tapis négatif pour ${p?.position || i}`);
    if (ct < cs - EPS.amount) errors.push(`engagement total < engagement de street pour ${p?.position || i}`);
    return {
      id: p?.id != null ? String(p.id) : `P${i}`,
      position: String(p?.position || `P${i}`),
      seat: i,
      stack: roundAmount(stack),
      committedStreet: roundAmount(cs),
      committedTotal: roundAmount(ct),
      folded: !!p?.folded,
      allIn: !!p?.allIn || stack <= EPS.amount,
      isHero: !!p?.isHero,
    };
  });
  const heroes = players.filter(p => p.isHero);
  if (heroes.length > 1) errors.push("plusieurs joueurs marqués Hero");
  const hero = heroes[0] || players[0] || null;

  const live = players.filter(p => !p.folded);
  if (live.length < 2) errors.push("moins de deux joueurs encore dans le coup");

  /* ── Acteur ── */
  const actorId = input.actorId != null ? String(input.actorId) : (hero ? hero.id : null);
  const actor = players.find(p => p.id === actorId) || hero || null;
  if (!actor) errors.push("acteur introuvable");
  else if (actor.folded) errors.push("l'acteur s'est déjà couché");

  /* ══ DÉRIVATIONS — LA SOURCE UNIQUE (§7) ══
     Ordre imposé : les contributions d'abord, le pot ensuite, le SPR en dernier.
     C'est l'inversion de cet ordre qui produisait des SPR faux au changement de
     rue (le pot était lu avant que les contributions ne soient versées). */
  const streetContrib = players.reduce((a, p) => a + p.committedStreet, 0);
  const deadPot = Math.max(0, num(input.deadPot) || 0);
  const pot = roundAmount(deadPot + streetContrib);
  if (pot < 0) errors.push("pot négatif");

  const currentBet = players.reduce((m, p) => Math.max(m, p.committedStreet), 0);
  const amountToCall = actor ? roundAmount(Math.max(0, currentBet - actor.committedStreet)) : 0;

  /* Tapis effectif : ce qu'Hero peut réellement perdre ou gagner face au plus
     fourni des adversaires encore en jeu. Une relance que personne ne peut
     égaler n'est pas une taille jouable (le surplus reviendrait aussitôt). */
  const opponents = live.filter(p => actor && p.id !== actor.id);
  const actorCapacity = actor ? actor.committedStreet + actor.stack : 0;
  const opponentCapacity = opponents.reduce((m, p) => Math.max(m, p.committedStreet + p.stack), 0);
  const maximumRaise = roundAmount(opponents.length ? Math.min(actorCapacity, opponentCapacity) : actorCapacity);
  const effectiveStack = roundAmount(Math.max(0, maximumRaise - (actor ? actor.committedStreet : 0)));

  /* Incrément minimal de relance : le dernier incrément observé, plancher à la
     mise minimale. Sans lui, un « min-raise » proposé serait illégal. */
  const lastRaiseIncrement = Math.max(
    pos(input.lastRaiseIncrement) || 0,
    currentBet > EPS.amount ? 0 : 0,
  ) || (currentBet > EPS.amount ? currentBet : 0);
  const minIncrement = Math.max(minBet, lastRaiseIncrement || minBet);
  const minimumRaise = roundAmount(
    currentBet > EPS.amount ? currentBet + minIncrement : (actor ? actor.committedStreet + minBet : minBet)
  );
  /* Un tapis qui ne permet pas la relance minimale n'ouvre qu'une seule action
     dimensionnée : le tapis. On le dit plutôt que de proposer l'impossible. */
  const allInOnly = maximumRaise < minimumRaise - EPS.amount;

  const spr = pot > EPS.amount ? roundTo(effectiveStack / pot, 4) : null;

  /* ── Rake (§78) — structure DÉCLARÉE, jamais inventée ── */
  const rake = input.rake ? {
    pct: Math.max(0, num(input.rake.pct) || 0),
    cap: input.rake.cap == null ? null : Math.max(0, num(input.rake.cap) || 0),
    /* Le moteur CFR actuel ne retire pas le rake de l'utilité terminale : le
       déclarer sans l'appliquer serait mentir. On le transporte pour le hash et
       l'affichage, et `applied:false` dit la vérité. */
    applied: false,
  } : { pct: 0, cap: null, applied: false };

  /* ── Modèle d'évaluation (§55) ── */
  const evaluationModel = input.evaluationModel || EvaluationModel.CHIP_EV;
  if (!Object.values(EvaluationModel).includes(evaluationModel)) {
    errors.push(`evaluationModel inconnu : ${evaluationModel}`);
  }
  if (evaluationModel === EvaluationModel.ICM && !input.icmParams) errors.push("evaluationModel=ICM sans icmParams");
  if (evaluationModel === EvaluationModel.PKO && !input.pkoParams) errors.push("evaluationModel=PKO sans pkoParams");

  /* ── Format de table (§56) ── */
  const tableFormat = input.tableFormat || (live.length === 2 ? TableFormat.HU : live.length === 3 ? TableFormat.THREE_WAY : TableFormat.MULTIWAY);

  /* ── Historique d'actions normalisé (§37) ── */
  const actionHistory = (Array.isArray(input.actionHistory) ? input.actionHistory : []).map((a, i) => {
    const t = String(a?.actionType || a?.type || "").toUpperCase();
    const at = ACTION_TYPES.includes(t) ? t : null;
    if (!at) errors.push(`actionHistory[${i}] : type d'action inconnu « ${a?.actionType ?? a?.type} »`);
    return {
      street: normalizeStreet(a?.street) || street,
      position: String(a?.position || ""),
      actionType: at,
      /* `size` est le TOTAL atteint sur la street pour BET/RAISE/ALL_IN, le
         montant payé pour CALL, 0 sinon. Deux grandeurs, jamais mélangées. */
      size: isSizedActionType(at) || at === ActionType.CALL ? roundAmount(Math.max(0, num(a?.size) || 0)) : 0,
    };
  });

  if (errors.length) return { ok: false, errors, state: null };

  const state = Object.freeze({
    gameType: String(input.gameType || "CASH").toUpperCase(),
    format: String(input.format || "").toUpperCase() || null,
    tableFormat,
    street,
    streetsRemaining: streetsRemainingFor(street),
    board,
    boardKeys,
    blinds: Object.freeze({ sb: roundAmount(sb), bb: roundAmount(bb) }),
    ante: roundAmount(ante),
    minBet: roundAmount(minBet),
    rake: Object.freeze(rake),
    players: Object.freeze(players.map(Object.freeze)),
    heroId: hero ? hero.id : null,
    actorId: actor.id,
    actorPosition: actor.position,
    /* ══ LES SEPT GRANDEURS DÉRIVÉES (§7) ══ */
    pot,
    effectiveStack,
    spr,
    currentBet: roundAmount(currentBet),
    amountToCall,
    minimumRaise,
    maximumRaise,
    /* Compléments indispensables à la résolution d'un sizing */
    allInOnly,
    minIncrement: roundAmount(minIncrement),
    actorCommittedStreet: actor.committedStreet,
    deadPot: roundAmount(deadPot),
    actionHistory: Object.freeze(actionHistory),
    evaluationModel,
    icmParams: input.icmParams || null,
    pkoParams: input.pkoParams || null,
  });

  return { ok: true, errors: [], state };
}

/* Contexte de résolution d'un sizing, DÉRIVÉ de l'état canonique — c'est le
   seul pont autorisé entre `gameState` et `sizingSpec`. */
export function sizingContextFrom(state, opts = {}) {
  if (!state) return null;
  return {
    pot: state.pot,
    effectiveRemaining: state.effectiveStack,
    alreadyCommitted: state.actorCommittedStreet,
    facingLevel: state.currentBet,
    minIncrement: state.minIncrement,
    bb: state.blinds.bb,
    streetsRemaining: opts.streetsRemaining != null ? opts.streetsRemaining : state.streetsRemaining,
  };
}

/* ══ VALIDATION DE QUALITÉ DE DONNÉE (§92) ════════════════════════════════
   Contrôles qui dépassent la normalisation : ranges, doublons de cartes entre
   main et board, sommes de fréquences. Retourne la liste des problèmes. */
export function validateDataQuality({ state, heroRange, villainRanges, heroCards } = {}) {
  const problems = [];
  if (!state) { problems.push("état de jeu absent"); return problems; }

  const boardSet = new Set(state.boardKeys);
  const heroKeys = (heroCards || []).map(cardKey).filter(Boolean);
  if (heroCards && heroKeys.length !== heroCards.length) problems.push("main Hero : carte illisible");
  if (new Set(heroKeys).size !== heroKeys.length) problems.push("main Hero : carte dupliquée");
  for (const k of heroKeys) if (boardSet.has(k)) problems.push(`carte ${k} présente à la fois en main et au board`);

  const checkRange = (label, r) => {
    if (!r) return;
    if (typeof r !== "object") { problems.push(`${label} : range illisible`); return; }
    const keys = Object.keys(r);
    if (!keys.length) { problems.push(`${label} : range vide`); return; }
    let anyPositive = false;
    for (const k of keys) {
      const f = r[k] || {};
      const total = (num(f.r) || 0) + (num(f.c) || 0) + (num(f.f) || 0);
      if (!Number.isFinite(total)) { problems.push(`${label} : ${k} fréquences non numériques`); continue; }
      if (total > 100 + 1e-3) problems.push(`${label} : ${k} somme des fréquences = ${roundTo(total, 2)} > 100`);
      if ((num(f.r) || 0) + (num(f.c) || 0) > 0) anyPositive = true;
    }
    if (!anyPositive) problems.push(`${label} : aucune main en continuation`);
  };
  checkRange("range Hero", heroRange);
  for (const [i, vr] of (villainRanges || []).entries()) checkRange(`range Villain[${i}]`, vr);

  if (state.pot < 0) problems.push("pot négatif");
  if (state.amountToCall > state.effectiveStack + state.actorCommittedStreet + EPS.amount) {
    problems.push("montant à payer supérieur à ce que l'acteur peut engager");
  }
  return problems;
}

/* Forme canonique d'une carte, quelle que soit sa représentation d'entrée
   (entier 0..51 du solveur, ou {r,s} du Trainer). */
export function cardKey(c) {
  if (c == null) return null;
  if (typeof c === "number") {
    if (!Number.isInteger(c) || c < 0 || c > 51) return null;
    return "23456789TJQKA"[c >> 2] + "shdc"[c & 3];
  }
  if (typeof c === "string") {
    const t = c.trim();
    return /^[2-9TJQKA][shdc♠♥♦♣]$/i.test(t) ? t[0].toUpperCase() + suitChar(t[1]) : null;
  }
  if (typeof c === "object" && c.r != null && c.s != null) {
    const r = String(c.r).toUpperCase();
    if (!"23456789TJQKA".includes(r)) return null;
    const s = suitChar(c.s);
    return s ? r + s : null;
  }
  return null;
}
function suitChar(s) {
  const m = { "♠": "s", "♥": "h", "♦": "d", "♣": "c", s: "s", h: "h", d: "d", c: "c", S: "s", H: "h", D: "d", C: "c" };
  return m[s] || null;
}
