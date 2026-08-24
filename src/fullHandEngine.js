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

import { evalBestI, handCategoryOf, HAND_CATEGORY_COUNT } from "./solver/core/evaluator.js";

const RANK_ORDER = "23456789TJQKA";
const SUIT_ORDER = "♠♥♦♣"; // ♠♥♦♣ (identique côté trainer + générateur)
export const FH_STREETS = ["flop", "turn", "river"];

/* Carte {r,s} → entier 0..51 attendu par l'évaluateur (rang<<2 | couleur).
   Une carte illisible n'est PAS silencieusement ramenée à 2♠ : c'est
   exactement le mécanisme qui inventait des paires de 2 et des couleurs à
   pique. Elle lève. */
export function cardToInt(c) {
  const r = RANK_ORDER.indexOf(c && c.r);
  const s = SUIT_ORDER.indexOf(c && c.s);
  if (r < 0 || s < 0) throw new RangeError(`cardToInt : carte invalide ${JSON.stringify(c)}`);
  return (r << 2) | s;
}

/* ── UNE SEULE ÉVALUATION POUR HERO ET POUR LE VILAIN (C1) ─────────────────
   Le besoin métier est identique — « quelle est la meilleure main de 5 que
   ces cartes composent ? » — donc le chemin doit l'être aussi. `evalBestI`
   accepte STRICTEMENT 5, 6 ou 7 cartes et refuse tout le reste : plus aucune
   carte implicite ne peut atteindre l'évaluateur.

   Ce que faisait l'ancien chemin : `eval7i(cards.slice(0,7))` avec 5 cartes
   (flop) laissait deux indices à `undefined`, et `undefined>>2 === 0` les
   transformait en 2♠. Le Vilain évaluait sa main plus deux 2 de pique
   imaginaires — 95,7 % des flops mesurés faussés.

   Le nom `handStrength7` est conservé (déjà appelé ailleurs) mais il ne
   suppose plus 7 cartes : flop (5), turn (6) et river (7) sont évalués avec
   la même exactitude. */
export function handStrength(hole, board) {
  const holeCards = (Array.isArray(hole) ? hole : []).filter(Boolean);
  const boardCards = (Array.isArray(board) ? board : []).filter(Boolean);
  if (boardCards.length < 3) return -1;       // préflop : rien à évaluer
  const cards = [...holeCards, ...boardCards].map(cardToInt);
  if (new Set(cards).size !== cards.length)
    throw new RangeError("handStrength : cartes en double dans la main évaluée");
  return evalBestI(cards);                    // lève si la longueur n'est pas 5/6/7
}
export const handStrength7 = handStrength;

function roundBb(v) { return Math.round((Number(v) || 0) * 2) / 2; }
function boardForStreet(fullBoard, street) {
  const n = street === "flop" ? 3 : street === "turn" ? 4 : 5;
  return fullBoard.slice(0, n);
}
function otherActor(a) { return a === "hero" ? "villain" : "hero"; }

const STACK_KEY = { hero: "heroStack", villain: "villStack" };
export const FH_MIN_BET_BB = 1;      // une grosse blinde : plancher légal d'ouverture

/* ──────────────────────────────────────────────────────────────────────────
   createFullHand — état initial au flop.

   ⚠ CONTINUITÉ DES TAPIS (C3). `heroStack` / `villStack` sont les tapis
   RESTANTS après le préflop, pas la profondeur de départ. L'appelant qui
   passe la profondeur entière pendant que `startPot` contient déjà les
   engagements préflop CRÉE des jetons : c'est le défaut mesuré (pot 8 + deux
   tapis de 20 pour deux joueurs à 20bb = 8bb sortis de nulle part).

   `heroCommittedBefore` / `villCommittedBefore` ne servent pas au jeu : ils
   servent au BILAN (résultat net en bb) et à l'invariant de conservation.

   opts : { heroHand, villHand, fullBoard(5), startPot, heroStack, villStack,
            heroCommittedBefore, villCommittedBefore, firstToAct, minBet }
   ────────────────────────────────────────────────────────────────────────── */
export function createFullHand(opts = {}) {
  const {
    heroHand = [], villHand = [], fullBoard = [],
    startPot = 6, heroStack = 100, villStack = 100,
    heroCommittedBefore = null, villCommittedBefore = null,
    firstToAct = "villain", minBet = FH_MIN_BET_BB,
  } = opts;
  const pot = roundBb(startPot);
  const hs = Math.max(0, roundBb(heroStack));
  const vs = Math.max(0, roundBb(villStack));
  /* Faute d'information, on attribue le pot d'entrée à parts égales aux deux
     joueurs : en heads-up postflop, le coup n'a pu arriver là que parce que la
     dernière mise préflop a été SUIVIE. C'est une hypothèse, elle est écrite. */
  const hBefore = heroCommittedBefore != null ? roundBb(heroCommittedBefore) : roundBb(pot / 2);
  const vBefore = villCommittedBefore != null ? roundBb(villCommittedBefore) : roundBb(pot - roundBb(pot / 2));
  return {
    street: "flop",
    fullBoard,
    board: boardForStreet(fullBoard, "flop"),
    pot,
    heroHand, villHand,
    heroStack: hs, villStack: vs,
    contrib: { hero: 0, villain: 0 },   // engagé sur la street courante
    acted: { hero: false, villain: false },
    toAct: firstToAct,
    firstToActPostflop: firstToAct,     // l'OOP reparle en premier chaque street
    lastAggressor: null,
    /* Incrément de la dernière mise ou relance COMPLÈTE de la street : c'est
       lui — et pas le total misé — qui fixe la relance minimale. */
    lastRaiseSize: 0,
    raiseLocked: false,
    minBet: Math.max(0.5, roundBb(minBet)),
    history: [],
    /* LEDGER : chaque débit, crédit, remboursement et attribution. C'est la
       pièce qui rend la comptabilité vérifiable au lieu d'être crue. */
    ledger: [{ street: "flop", actor: null, kind: "carry", amount: pot, potAfter: pot, heroStack: hs, villStack: vs }],
    committedBefore: { hero: hBefore, villain: vBefore },
    startStacks: { hero: hs, villain: vs },
    /* Total de jetons du coup complet, invariant : tapis + pot ne peut ni
       croître ni décroître avant l'attribution finale. */
    totalChips: roundBb(hs + vs + pot),
    done: false,
    result: null,
    lastVillainAction: null,
  };
}

/* Montant à payer par l'acteur courant (0 s'il peut checker). */
export function amountToCall(state, actor = state.toAct) {
  return Math.max(0, roundBb(state.contrib[otherActor(actor)] - state.contrib[actor]));
}

export function stackOf(state, actor) { return state[STACK_KEY[actor]] || 0; }

/* ── BORNES LÉGALES D'UNE MISE OU D'UNE RELANCE (C7/C8) ────────────────────
   `minTo` / `maxTo` sont des TOTAUX atteints sur la street (« to X »), pas des
   compléments. `maxTo` est toujours le tapis : aucune proposition ne peut le
   dépasser. Quand `minTo` est plafonné par le tapis, la seule relance possible
   est le tapis — l'appelant doit alors l'annoncer comme ALL-IN. */
export function raiseBounds(state, actor = state.toAct) {
  const stack = stackOf(state, actor);
  const own = state.contrib[actor] || 0;
  const facing = state.contrib[otherActor(actor)] || 0;
  const maxTo = roundBb(own + stack);
  const increment = Math.max(state.lastRaiseSize || 0, state.minBet);
  const minToRaw = facing > 0 ? roundBb(facing + increment) : roundBb(own + state.minBet);
  const minTo = Math.min(minToRaw, maxTo);
  return {
    minTo, maxTo, increment,
    /* Une relance « complète » exige minToRaw ; en dessous, seul le tapis est
       jouable et il NE ROUVRE PAS l'action (règle du all-in incomplet). */
    fullRaisePossible: maxTo >= minToRaw - 1e-9,
    allInOnly: maxTo < minToRaw - 1e-9,
  };
}

/* Actions légales pour l'acteur courant, avec leurs bornes. */
export function legalActions(state, actor = state.toAct) {
  if (state.done || !actor) return [];
  const toCall = amountToCall(state, actor);
  const stack = stackOf(state, actor);
  const b = raiseBounds(state, actor);
  const acts = [];
  if (toCall > 0) {
    acts.push({ type: "FOLD" });
    acts.push({ type: "CALL", amount: Math.min(toCall, stack), allIn: stack <= toCall + 1e-9 });
    if (stack > toCall + 1e-9 && !state.raiseLocked) acts.push({ type: "RAISE", minTo: b.minTo, maxTo: b.maxTo, allInOnly: b.allInOnly });
  } else {
    acts.push({ type: "CHECK" });
    if (stack > 0) acts.push({ type: "BET", minTo: b.minTo, maxTo: b.maxTo, allInOnly: b.allInOnly });
  }
  return acts;
}

/* Tailles par DÉFAUT (quand l'appelant n'impose rien). Elles sont ensuite
   bornées par `raiseBounds` : jamais au-dessus du tapis, jamais sous le
   minimum légal. */
function defaultBetAmount(state) {
  return Math.max(state.minBet, roundBb(state.pot * 0.6));
}
function defaultRaiseTo(state, actor) {
  const b = raiseBounds(state, actor);
  const opp = state.contrib[otherActor(actor)] || 0;
  const souhaite = roundBb(opp + Math.max((b.increment || state.minBet) * 2, state.pot * 0.5));
  return Math.max(b.minTo, Math.min(souhaite, b.maxTo));
}

/* Applique une action de l'acteur `actor`. Retourne un NOUVEL état (immuable).
   Une action illégale laisse l'état inchangé — elle n'est jamais « rattrapée »
   en silence vers une valeur voisine. */
export function applyAction(state, actor, action) {
  if (state.done || state.toAct !== actor) return state;
  const s = cloneState(state);
  const type = String(action?.type || "").toUpperCase();
  const stackKey = STACK_KEY[actor];
  const opp = otherActor(actor);
  const toCall = amountToCall(s, actor);

  const commit = (amt, kind) => {
    const pay = Math.min(roundBb(amt), s[stackKey]);
    s[stackKey] = roundBb(s[stackKey] - pay);
    s.contrib[actor] = roundBb(s.contrib[actor] + pay);
    s.pot = roundBb(s.pot + pay);
    s.ledger.push({ street: s.street, actor, kind, amount: pay, potAfter: s.pot, heroStack: s.heroStack, villStack: s.villStack });
    return pay;
  };

  if (type === "FOLD") {
    s.history.push({ street: s.street, actor, action: "FOLD", amount: 0 });
    returnUncalled(s);                              // la mise non suivie revient au miseur
    return finish(s, opp, "fold");
  }
  if (type === "CHECK" && toCall === 0) {
    s.acted[actor] = true;
    s.history.push({ street: s.street, actor, action: "CHECK", amount: 0 });
    if (s.acted[opp]) return closeStreet(s);       // les deux ont checké
    s.toAct = opp; return s;
  }
  if (type === "CALL" && toCall > 0) {
    const paid = commit(toCall, "call");
    s.acted[actor] = true;
    s.history.push({ street: s.street, actor, action: "CALL", amount: paid, allIn: s[stackKey] <= 0 });
    return closeStreet(s);                          // suivre clôt le tour d'enchères
  }
  if (type === "RAISE" && s.raiseLocked) return state;   // all-in incomplet : action non rouverte
  if ((type === "BET" && toCall === 0) || (type === "RAISE" && toCall > 0)) {
    const b = raiseBounds(s, actor);
    const wanted = action.amount != null
      ? roundBb(action.amount)
      : (type === "BET" ? roundBb(s.contrib[actor] + defaultBetAmount(s)) : defaultRaiseTo(s, actor));
    /* `amount` est un TOTAL atteint sur la street. Un appelant qui envoie un
       complément se trompe de grandeur, et le moteur le refuse plutôt que de
       deviner : c'est la confusion `raiseTo` / `additionalChips` qui faisait
       accepter une « relance » à 6.5bb face à une mise de 6bb. */
    const raiseTo = Math.min(wanted, b.maxTo);
    const estTapis = raiseTo >= b.maxTo - 1e-9;
    if (raiseTo < b.minTo - 1e-9 && !estTapis) return state;      // sous la relance minimale
    if (raiseTo <= (s.contrib[opp] || 0) + 1e-9 && !estTapis) return state;
    const delta = roundBb(raiseTo - s.contrib[actor]);
    if (delta <= 0) return state;
    const paid = commit(delta, type === "BET" ? "bet" : "raise");
    const total = s.contrib[actor];
    /* ── ALL-IN INFÉRIEUR À LA RELANCE MINIMALE : PAS DE RÉOUVERTURE ────────
       Un tapis trop court pour constituer une relance complète doit être suivi
       ou couché, il ne rend PAS la parole à celui qui avait déjà misé. On ne
       met donc `acted[opp]` à faux que si l'incrément était complet. */
    const increment = roundBb(total - (state.contrib[opp] || 0));
    const relanceComplete = increment >= b.increment - 1e-9;
    if (relanceComplete) { s.lastRaiseSize = increment; s.raiseLocked = false; }
    else if (s.acted[opp]) {
      /* L'adversaire avait déjà agi et fait face à un all-in INCOMPLET : il
         peut suivre ou se coucher, pas relancer. L'action n'est pas rouverte. */
      s.raiseLocked = true;
    }
    s.acted[actor] = true;
    s.lastAggressor = actor;
    s.history.push({ street: s.street, actor, action: type, amount: paid, to: total, allIn: s[stackKey] <= 0, fullRaise: relanceComplete });
    s.toAct = opp; s.acted[opp] = false;
    /* Le relanceur est à tapis et l'adversaire a déjà couvert : plus rien à
       décider, on clôt. */
    if (stackOf(s, actor) <= 0 && amountToCall(s, opp) <= 0) return closeStreet(s);
    return s;
  }
  // Action illégale → inchangé.
  return state;
}

/* ── LA MISE NON SUIVIE REVIENT À SON PROPRIÉTAIRE (C8) ────────────────────
   Hero mise 40bb, le Vilain n'a que 5bb et paie à tapis : 35bb d'Hero n'ont
   été suivis par personne. Sans ce remboursement, le pot valait 55bb et un
   tapis de 5bb pouvait encaisser 55bb. La règle est arithmétique, pas
   optionnelle. */
function returnUncalled(s) {
  const d = roundBb(s.contrib.hero - s.contrib.villain);
  if (Math.abs(d) < 1e-9) return 0;
  const who = d > 0 ? "hero" : "villain";
  const amt = Math.abs(d);
  s[STACK_KEY[who]] = roundBb(s[STACK_KEY[who]] + amt);
  s.contrib[who] = roundBb(s.contrib[who] - amt);
  s.pot = roundBb(s.pot - amt);
  s.ledger.push({ street: s.street, actor: who, kind: "return", amount: amt, potAfter: s.pot, heroStack: s.heroStack, villStack: s.villStack });
  return amt;
}

/* Clôture la street : si river → showdown ; sinon distribue la carte suivante. */
function closeStreet(s) {
  returnUncalled(s);                                 // avant tout transfert
  const unJoueurATapis = s.heroStack <= 0 || s.villStack <= 0;
  const idx = FH_STREETS.indexOf(s.street);
  if (s.street === "river" || unJoueurATapis) {
    // Déroule le reste du board si all-in, puis showdown.
    return resolveShowdown(s);
  }
  const next = FH_STREETS[idx + 1];
  /* CHANGEMENT DE STREET : les engagements sont DÉJÀ dans le pot (ils ont
     quitté le tapis au moment du commit). On remet les compteurs de street à
     zéro — on ne recrédite rien, on ne recrée rien. */
  s.ledger.push({ street: s.street, actor: null, kind: "collect", amount: roundBb(s.contrib.hero + s.contrib.villain), potAfter: s.pot, heroStack: s.heroStack, villStack: s.villStack });
  s.street = next;
  s.board = boardForStreet(s.fullBoard, next);
  s.contrib = { hero: 0, villain: 0 };
  s.acted = { hero: false, villain: false };
  s.lastAggressor = null;
  s.lastRaiseSize = 0;
  s.raiseLocked = false;
  // Postflop heads-up : l'OOP (premier à parler au flop) reparle en premier.
  s.toAct = s.firstToActPostflop || "villain";
  return s;
}

function resolveShowdown(s) {
  s.board = boardForStreet(s.fullBoard, "river");
  const hero = handStrength(s.heroHand, s.board);
  const vill = handStrength(s.villHand, s.board);
  const winner = hero > vill ? "hero" : vill > hero ? "villain" : "split";
  return finish(s, winner, "showdown", { heroRank: hero, villRank: vill });
}

/* ── PARTAGE D'UN POT EN DEMI-BLINDES ──────────────────────────────────────
   La plus petite unité du Trainer est le demi-blind. Un pot impair ne se coupe
   donc pas en deux : le demi-blind indivisible va au joueur HORS DE POSITION
   (celui qui parle en premier postflop), convention usuelle du jeton impair. */
export function splitPot(pot, oopActor = "villain") {
  const total = roundBb(pot);
  const bas = Math.floor((total / 2) * 2) / 2;   // plancher au demi-blind
  const haut = roundBb(total - bas);
  return oopActor === "hero" ? { hero: haut, villain: bas } : { hero: bas, villain: haut };
}

/* ── ATTRIBUTION DU POT AUX TAPIS (C8) ─────────────────────────────────────
   Un coup ne peut pas se terminer sur un pot orphelin : sans versement, aucun
   résultat en bb n'est dérivable des jetons. */
function finish(s, winner, reason, extra = {}) {
  returnUncalled(s);
  const potFinal = roundBb(s.pot);
  let part = { hero: 0, villain: 0 };
  if (winner === "split") part = splitPot(potFinal, s.firstToActPostflop || "villain");
  else part[winner] = potFinal;
  s.heroStack = roundBb(s.heroStack + part.hero);
  s.villStack = roundBb(s.villStack + part.villain);
  s.pot = 0;
  s.ledger.push({ street: s.street, actor: null, kind: "award", amount: potFinal, winner, part: { ...part }, potAfter: 0, heroStack: s.heroStack, villStack: s.villStack });
  s.street = "done"; s.done = true; s.toAct = null;
  /* Résultat net du COUP COMPLET, préflop inclus : tapis final moins ce que le
     joueur avait avant de s'asseoir au flop, engagements préflop compris. */
  const netHero = roundBb(s.heroStack - (s.startStacks.hero + s.committedBefore.hero));
  const netVillain = roundBb(s.villStack - (s.startStacks.villain + s.committedBefore.villain));
  s.result = {
    winner, reason, ...extra,
    potAwarded: potFinal,
    payout: { ...part },
    netBb: { hero: netHero, villain: netVillain },
    heroNetBb: netHero,
  };
  return s;
}

/* ── CONTRÔLE DE CONSERVATION (testable, appelable en dev) ─────────────────
   Somme des tapis + pot = somme initiale, à chaque événement. Rend la liste
   des écarts ; vide = comptabilité juste. */
export function auditLedger(state) {
  const problems = [];
  const total = roundBb(state.heroStack + state.villStack + state.pot);
  if (Math.abs(total - state.totalChips) > 0.001)
    problems.push({ code: "conservation", attendu: state.totalChips, obtenu: total });
  if (state.heroStack < -1e-9) problems.push({ code: "tapis-hero-negatif", obtenu: state.heroStack });
  if (state.villStack < -1e-9) problems.push({ code: "tapis-vilain-negatif", obtenu: state.villStack });
  if (state.pot < -1e-9) problems.push({ code: "pot-negatif", obtenu: state.pot });
  if (state.done && state.pot !== 0) problems.push({ code: "pot-orphelin", obtenu: state.pot });
  return problems;
}

function cloneState(s) {
  return {
    ...s,
    board: [...s.board],
    contrib: { ...s.contrib },
    acted: { ...s.acted },
    history: [...s.history],
    ledger: [...s.ledger],
    committedBefore: { ...s.committedBefore },
    startStacks: { ...s.startStacks },
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
   l'évaluateur ; sert uniquement à piloter la politique par défaut).

   L'ancienne version DUPLIQUAIT les cartes du board (`[...board,...board]`)
   quand il en manquait — un board portant deux fois la même carte, impossible
   au poker. Un board incomplet n'est pas évaluable : on rend une force neutre,
   on n'en fabrique pas une. */
export function normalizedStrength(hole, board) {
  const b = (Array.isArray(board) ? board : []).filter(Boolean);
  if (b.length < 3) return 0.5;
  const s = handStrength(hole, b);
  if (s < 0) return 0.5;
  const cat = handCategoryOf(s);              // 0 = hauteur … 8 = quinte flush
  return Math.min(1, cat / (HAND_CATEGORY_COUNT - 1) + 0.06);
}

/* Joue l'action du Villain courant via la politique, retourne le nouvel état. */
export function playVillain(state, policy = defaultVillainPolicy, ctx = {}) {
  if (state.done || state.toAct !== "villain") return state;
  const action = policy(state, ctx) || { type: amountToCall(state, "villain") > 0 ? "CALL" : "CHECK" };
  return applyAction(state, "villain", action);
}
