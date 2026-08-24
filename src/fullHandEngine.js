/* ══════════════════════════════════════════════════════════════════════════
   fullHandEngine.js — MOTEUR DE MAIN COMPLÈTE (Full Hand, postflop)

   Permet au Héro de jouer TOUT le coup street par street (flop → turn → river)
   contre ses adversaires, avec des règles de poker correctes et un VRAI
   showdown (évaluation de main via le solver), en remplacement de l'ancien
   comportement probabiliste (Math.random pour le résultat).

   Modèle : N joueurs, No-Limit. Le heads-up n'est plus un cas particulier
   câblé dans le moteur — c'est une table de deux. Les side pots sont JOUÉS
   (paliers de contribution suivis pendant les tours d'enchères) et non
   seulement calculés au moment de l'attribution ; le découpage final est
   délégué à `potDistribution.js`.
   Chaque adversaire joue via une politique injectable (`villainPolicy`) ; à
   défaut une politique par défaut raisonnable est utilisée.

   Module PUR (aucune dépendance React/DOM). Dépend uniquement de l'évaluateur
   et de `potDistribution`.
   ══════════════════════════════════════════════════════════════════════════ */

import { evalBestI, handCategoryOf, HAND_CATEGORY_COUNT } from "./solver/core/evaluator.js";
import { distributePots, partager } from "./potDistribution.js";

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

const EPS = 1e-9;
const roundBb = v => Math.round((Number(v) || 0) * 2) / 2;

function boardForStreet(fullBoard, street) {
  const n = street === "flop" ? 3 : street === "turn" ? 4 : 5;
  return (fullBoard || []).slice(0, n);
}

export const FH_MIN_BET_BB = 1;      // une grosse blinde : plancher légal d'ouverture
export const HERO = "hero";
export const VILLAIN = "villain";

/* ══════════════════════════════════════════════════════════════════════════
   N JOUEURS, PAS DEUX

   Le moteur était écrit pour exactement deux sièges : `heroStack` / `villStack`,
   `contrib.hero` / `contrib.villain`, `toAct` valant l'un ou l'autre. Toute
   configuration à trois joueurs était donc refusée — « heads-up par
   construction », c'est-à-dire sans que la règle soit énoncée nulle part, et
   les side pots n'existaient qu'au moment de payer.

   L'état interne est maintenant une TABLE de joueurs et un ORDRE de parole.
   Les identifiants des deux principaux restent `hero` / `villain`, et les
   champs historiques (`heroStack`, `villStack`, `contrib`, `acted`,
   `committedBefore`, `startStacks`, `heroHand`, `villHand`) sont conservés
   comme MIROIRS resynchronisés après chaque mutation : une seule vérité,
   plusieurs lectures.
   ══════════════════════════════════════════════════════════════════════════ */

function makePlayer({ id, hand = [], stack = 0, committedBefore = 0 }) {
  return {
    id,
    hand: Array.isArray(hand) ? hand : [],
    stack: Math.max(0, roundBb(stack)),
    contrib: 0,                 // engagé sur la street courante
    committed: 0,               // engagé depuis le début du coup complet (postflop)
    committedBefore: roundBb(committedBefore),
    folded: false,
    acted: false,
  };
}

/* Recopie l'état interne vers les champs historiques lus par l'interface et
   par les tests. */
function sync(s) {
  const h = s.players[HERO], v = s.players[VILLAIN];
  s.heroStack = h ? h.stack : 0;
  s.villStack = v ? v.stack : 0;
  s.contrib = { hero: h ? h.contrib : 0, villain: v ? v.contrib : 0 };
  s.acted = { hero: h ? h.acted : false, villain: v ? v.acted : false };
  s.committedBefore = { hero: h ? h.committedBefore : 0, villain: v ? v.committedBefore : 0 };
  s.heroHand = h ? h.hand : [];
  s.villHand = v ? v.hand : [];
  /* Vue par siège, seule forme utilisable au-delà de deux joueurs. */
  s.seatContrib = Object.fromEntries(s.seats.map(id => [id, s.players[id].contrib]));
  s.seatStacks = Object.fromEntries(s.seats.map(id => [id, s.players[id].stack]));
  return s;
}

const alive = s => s.seats.filter(id => !s.players[id].folded);
const canAct = s => s.seats.filter(id => !s.players[id].folded && s.players[id].stack > EPS);
const maxContrib = s => alive(s).reduce((m, id) => Math.max(m, s.players[id].contrib), 0);

/* ──────────────────────────────────────────────────────────────────────────
   createFullHand — état initial au flop.

   ⚠ CONTINUITÉ DES TAPIS (C3). Les tapis passés sont ceux RESTANTS après le
   préflop, pas la profondeur de départ. L'appelant qui passe la profondeur
   entière pendant que `startPot` contient déjà les engagements préflop CRÉE
   des jetons.

   Deux formes acceptées :
     • héritée, heads-up : { heroHand, villHand, heroStack, villStack,
                             heroCommittedBefore, villCommittedBefore }
     • générale, N joueurs : { players: [{ id, hand, stack, committedBefore }],
                               seats: [id…] }   ← `seats` = ordre de parole
   ────────────────────────────────────────────────────────────────────────── */
export function createFullHand(opts = {}) {
  const {
    heroHand = [], villHand = [], fullBoard = [],
    startPot = 6, heroStack = 100, villStack = 100,
    heroCommittedBefore = null, villCommittedBefore = null,
    firstToAct = VILLAIN, minBet = FH_MIN_BET_BB,
    players: playersIn = null, seats: seatsIn = null,
  } = opts;

  const pot = roundBb(startPot);
  let liste;
  if (Array.isArray(playersIn) && playersIn.length >= 2) {
    /* Faute d'information sur qui a mis quoi avant le flop, le pot d'entrée est
       partagé à parts égales — c'est une HYPOTHÈSE, elle est écrite, et
       l'appelant la remplace en fournissant `committedBefore` par joueur. */
    const part = roundBb(pot / playersIn.length);
    liste = playersIn.map((p, i) => makePlayer({
      ...p,
      committedBefore: p.committedBefore != null ? p.committedBefore
        : (i === playersIn.length - 1 ? roundBb(pot - part * (playersIn.length - 1)) : part),
    }));
  } else {
    const hs = Math.max(0, roundBb(heroStack)), vs = Math.max(0, roundBb(villStack));
    const hBefore = heroCommittedBefore != null ? roundBb(heroCommittedBefore) : roundBb(pot / 2);
    const vBefore = villCommittedBefore != null ? roundBb(villCommittedBefore) : roundBb(pot - roundBb(pot / 2));
    liste = [
      makePlayer({ id: HERO, hand: heroHand, stack: hs, committedBefore: hBefore }),
      makePlayer({ id: VILLAIN, hand: villHand, stack: vs, committedBefore: vBefore }),
    ];
  }

  const players = {};
  for (const p of liste) players[p.id] = p;
  const seats = (Array.isArray(seatsIn) && seatsIn.length ? seatsIn : liste.map(p => p.id))
    .filter(id => players[id]);
  const premier = players[firstToAct] ? firstToAct : seats[0];

  const startStacks = {};
  for (const p of liste) startStacks[p.id] = p.stack;
  /* `startStacks` est aussi lu sous sa forme héritée {hero, villain}. */
  startStacks.hero = startStacks[HERO] ?? 0;
  startStacks.villain = startStacks[VILLAIN] ?? 0;

  const s = {
    seats, players,
    street: "flop",
    fullBoard,
    board: boardForStreet(fullBoard, "flop"),
    pot,
    toAct: premier,
    firstToActPostflop: premier,     // l'OOP reparle en premier à chaque street
    lastActor: null,
    lastAggressor: null,
    /* Incrément de la dernière mise ou relance COMPLÈTE de la street : c'est
       lui — et pas le total misé — qui fixe la relance minimale. */
    lastRaiseSize: 0,
    raiseLocked: false,
    minBet: Math.max(0.5, roundBb(minBet)),
    history: [],
    /* LEDGER : chaque débit, crédit, remboursement et attribution. C'est la
       pièce qui rend la comptabilité vérifiable au lieu d'être crue. */
    ledger: [{ street: "flop", actor: null, kind: "carry", amount: pot, potAfter: pot }],
    startStacks,
    /* Total de jetons du coup complet, invariant : tapis + pot ne peut ni
       croître ni décroître avant l'attribution finale. */
    totalChips: roundBb(liste.reduce((a, p) => a + p.stack, 0) + pot),
    done: false,
    result: null,
    pots: null,
  };
  return sync(s);
}

/* Montant à payer par l'acteur (0 s'il peut checker). */
export function amountToCall(state, actor = state.toAct) {
  const p = state.players?.[actor];
  if (!p) return 0;
  return Math.max(0, roundBb(maxContrib(state) - p.contrib));
}

export function stackOf(state, actor) { return state.players?.[actor]?.stack || 0; }

/* ── BORNES LÉGALES D'UNE MISE OU D'UNE RELANCE (C7/C8) ────────────────────
   `minTo` / `maxTo` sont des TOTAUX atteints sur la street (« to X »), pas des
   compléments. `maxTo` est toujours le tapis : aucune proposition ne peut le
   dépasser. Quand `minTo` est plafonné par le tapis, la seule relance possible
   est le tapis — l'appelant doit alors l'annoncer comme ALL-IN. */
export function raiseBounds(state, actor = state.toAct) {
  const p = state.players?.[actor];
  if (!p) return { minTo: 0, maxTo: 0, increment: 0, fullRaisePossible: false, allInOnly: false };
  const own = p.contrib || 0;
  const facing = maxContrib(state);
  const maxTo = roundBb(own + p.stack);
  const increment = Math.max(state.lastRaiseSize || 0, state.minBet);
  const minToRaw = facing > 0 ? roundBb(facing + increment) : roundBb(own + state.minBet);
  const minTo = Math.min(minToRaw, maxTo);
  return {
    minTo, maxTo, increment,
    /* Une relance « complète » exige minToRaw ; en dessous, seul le tapis est
       jouable et il NE ROUVRE PAS l'action (règle du all-in incomplet). */
    fullRaisePossible: maxTo >= minToRaw - EPS,
    allInOnly: maxTo < minToRaw - EPS,
  };
}

/* Actions légales pour l'acteur, avec leurs bornes. */
export function legalActions(state, actor = state.toAct) {
  if (state.done || !actor || !state.players?.[actor]) return [];
  const p = state.players[actor];
  if (p.folded || p.stack <= EPS) return [];
  const toCall = amountToCall(state, actor);
  const b = raiseBounds(state, actor);
  const acts = [];
  if (toCall > 0) {
    acts.push({ type: "FOLD" });
    acts.push({ type: "CALL", amount: Math.min(toCall, p.stack), allIn: p.stack <= toCall + EPS });
    if (p.stack > toCall + EPS && !state.raiseLocked)
      acts.push({ type: "RAISE", minTo: b.minTo, maxTo: b.maxTo, allInOnly: b.allInOnly });
  } else {
    acts.push({ type: "CHECK" });
    if (p.stack > 0) acts.push({ type: "BET", minTo: b.minTo, maxTo: b.maxTo, allInOnly: b.allInOnly });
  }
  return acts;
}

/* Tailles par DÉFAUT (quand l'appelant n'impose rien), bornées ensuite. */
function defaultBetAmount(state) {
  return Math.max(state.minBet, roundBb(state.pot * 0.6));
}
function defaultRaiseTo(state, actor) {
  const b = raiseBounds(state, actor);
  const opp = maxContrib(state);
  const souhaite = roundBb(opp + Math.max((b.increment || state.minBet) * 2, state.pot * 0.5));
  return Math.max(b.minTo, Math.min(souhaite, b.maxTo));
}

/* Applique une action. Retourne un NOUVEL état (immuable). Une action illégale
   laisse l'état inchangé — elle n'est jamais « rattrapée » vers une valeur
   voisine. */
export function applyAction(state, actor, action) {
  if (state.done || state.toAct !== actor || !state.players?.[actor]) return state;
  const s = cloneState(state);
  const p = s.players[actor];
  const type = String(action?.type || "").toUpperCase();
  const toCall = amountToCall(s, actor);

  const commit = (amt, kind) => {
    const pay = Math.min(roundBb(amt), p.stack);
    p.stack = roundBb(p.stack - pay);
    p.contrib = roundBb(p.contrib + pay);
    p.committed = roundBb(p.committed + pay);
    s.pot = roundBb(s.pot + pay);
    s.ledger.push({ street: s.street, actor, kind, amount: pay, potAfter: s.pot });
    return pay;
  };

  if (type === "FOLD") {
    p.folded = true; p.acted = true; s.lastActor = actor;
    s.history.push({ street: s.street, actor, action: "FOLD", amount: 0 });
    sync(s);
    return advance(s);
  }
  if (type === "CHECK" && toCall === 0) {
    p.acted = true; s.lastActor = actor;
    s.history.push({ street: s.street, actor, action: "CHECK", amount: 0 });
    sync(s);
    return advance(s);
  }
  if (type === "CALL" && toCall > 0) {
    const paid = commit(toCall, "call");
    p.acted = true; s.lastActor = actor;
    s.history.push({ street: s.street, actor, action: "CALL", amount: paid, to: p.contrib, allIn: p.stack <= EPS });
    sync(s);
    return advance(s);
  }
  if ((type === "BET" && toCall === 0) || (type === "RAISE" && toCall > 0)) {
    if (type === "RAISE" && s.raiseLocked) return state;   // all-in incomplet : action non rouverte
    const b = raiseBounds(s, actor);
    /* `amount` est un TOTAL atteint sur la street (« to X »), pas un
       complément. Un appelant qui envoie un complément se trompe de grandeur,
       et le moteur le refuse plutôt que de deviner. */
    const wanted = action.amount != null
      ? roundBb(action.amount)
      : (type === "BET" ? roundBb(p.contrib + defaultBetAmount(s)) : defaultRaiseTo(s, actor));
    const raiseTo = Math.min(wanted, b.maxTo);
    const estTapis = raiseTo >= b.maxTo - EPS;
    const facingAvant = maxContrib(s);
    if (raiseTo < b.minTo - EPS && !estTapis) return state;
    if (raiseTo <= facingAvant + EPS && !estTapis) return state;
    const delta = roundBb(raiseTo - p.contrib);
    if (delta <= 0) return state;
    commit(delta, type === "BET" ? "bet" : "raise");
    const increment = roundBb(p.contrib - facingAvant);
    const relanceComplete = increment >= b.increment - EPS;
    if (relanceComplete) { s.lastRaiseSize = increment; s.raiseLocked = false; }
    else s.raiseLocked = true;   // all-in incomplet : personne ne peut re-relancer
    p.acted = true; s.lastAggressor = actor; s.lastActor = actor;
    /* Une mise ou une relance COMPLÈTE rouvre la parole à TOUS les autres —
       règle qui n'a de sens visible qu'au-delà de deux joueurs, et qui était
       jusqu'ici implicite dans l'alternance heads-up. */
    if (relanceComplete)
      for (const id of s.seats) if (id !== actor && !s.players[id].folded) s.players[id].acted = false;
    s.history.push({
      street: s.street, actor, action: type, amount: roundBb(delta),
      to: p.contrib, allIn: p.stack <= EPS, fullRaise: relanceComplete,
    });
    sync(s);
    return advance(s);
  }
  return state;   // action illégale → inchangé
}

/* ── QUI PARLE MAINTENANT ? ────────────────────────────────────────────────
   Le tour d'enchères se ferme quand tout joueur encore capable d'agir a parlé
   ET a égalé la mise en cours. Écrit pour N, il vaut aussi pour deux. */
function advance(s) {
  const vivants = alive(s);
  if (vivants.length <= 1) return finish(s, vivants[0] || null, "fold");
  const max = maxContrib(s);
  const doitAgir = s.seats.filter(id => {
    const q = s.players[id];
    return !q.folded && q.stack > EPS && (!q.acted || q.contrib < max - EPS);
  });
  if (!doitAgir.length) return closeStreet(s);
  const depart = s.seats.indexOf(s.lastActor);
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const id = s.seats[((depart + k) % n + n) % n];
    if (doitAgir.includes(id)) { s.toAct = id; return sync(s); }
  }
  s.toAct = doitAgir[0];
  return sync(s);
}

/* ── LA MISE NON SUIVIE REVIENT À SON PROPRIÉTAIRE (C8) ────────────────────
   Hero mise 40bb, le Vilain n'a que 5bb et paie à tapis : 35bb d'Hero n'ont
   été suivis par personne. Sans ce remboursement, le pot valait 55bb et un
   tapis de 5bb pouvait encaisser 55bb. Écrit pour N : l'excédent du plus gros
   contributeur sur le SECOND plus gros lui revient. */
function returnUncalled(s) {
  const enJeu = s.seats.filter(id => s.players[id].contrib > EPS);
  if (!enJeu.length) return 0;
  const tries = [...enJeu].sort((a, b) => s.players[b].contrib - s.players[a].contrib);
  const premier = s.players[tries[0]];
  const second = tries.length > 1 ? s.players[tries[1]].contrib : 0;
  const excedent = roundBb(premier.contrib - second);
  if (excedent <= EPS) return 0;
  premier.stack = roundBb(premier.stack + excedent);
  premier.contrib = roundBb(premier.contrib - excedent);
  premier.committed = roundBb(premier.committed - excedent);
  s.pot = roundBb(s.pot - excedent);
  s.ledger.push({ street: s.street, actor: premier.id, kind: "return", amount: excedent, potAfter: s.pot });
  sync(s);
  return excedent;
}

/* Premier à parler d'une nouvelle street : l'OOP s'il peut encore agir, sinon
   le suivant dans l'ordre de parole. */
function premierParleur(s) {
  const n = s.seats.length;
  const base = Math.max(0, s.seats.indexOf(s.firstToActPostflop));
  for (let k = 0; k < n; k++) {
    const id = s.seats[(base + k) % n];
    const q = s.players[id];
    if (!q.folded && q.stack > EPS) return id;
  }
  return null;
}

/* Clôture la street : si river → showdown ; sinon distribue la carte suivante. */
function closeStreet(s) {
  returnUncalled(s);                                 // avant tout transfert
  /* Plus personne ne peut miser (tapis) : on déroule le board et on abat. */
  if (s.street === "river" || canAct(s).length <= 1) return resolveShowdown(s);
  const next = FH_STREETS[FH_STREETS.indexOf(s.street) + 1];
  if (!next) return resolveShowdown(s);
  /* CHANGEMENT DE STREET : les engagements sont DÉJÀ dans le pot (ils ont
     quitté le tapis au commit). On remet les compteurs de street à zéro — on ne
     recrédite rien, on ne recrée rien. */
  const collecte = roundBb(s.seats.reduce((a, id) => a + s.players[id].contrib, 0));
  s.ledger.push({ street: s.street, actor: null, kind: "collect", amount: collecte, potAfter: s.pot });
  s.street = next;
  s.board = boardForStreet(s.fullBoard, next);
  for (const id of s.seats) { s.players[id].contrib = 0; s.players[id].acted = false; }
  s.lastAggressor = null;
  s.lastRaiseSize = 0;
  s.raiseLocked = false;
  s.lastActor = null;
  s.toAct = premierParleur(s);
  sync(s);
  return s.toAct ? s : resolveShowdown(s);
}

function resolveShowdown(s) {
  s.board = boardForStreet(s.fullBoard, "river");
  const rangs = {};
  for (const id of alive(s)) rangs[id] = handStrength(s.players[id].hand, s.board);
  const ids = Object.keys(rangs);
  const meilleur = ids.length ? Math.max(...ids.map(id => rangs[id])) : -1;
  const gagnants = ids.filter(id => rangs[id] === meilleur);
  const winner = gagnants.length === 1 ? gagnants[0] : "split";
  return finish(s, winner, "showdown", {
    heroRank: rangs[HERO] ?? null,
    villRank: rangs[VILLAIN] ?? null,
    ranks: rangs,
    gagnants,
  });
}

/* Partage d'un pot en demi-blindes — conservé pour les appelants existants. */
export function splitPot(pot, oopActor = VILLAIN) {
  const total = roundBb(pot);
  const bas = Math.floor((total / 2) * 2) / 2;   // plancher au demi-blind
  const haut = roundBb(total - bas);
  return oopActor === HERO ? { hero: haut, villain: bas } : { hero: bas, villain: haut };
}

/* ── ATTRIBUTION DU POT AUX TAPIS, SIDE POTS COMPRIS (C8) ──────────────────
   Un coup ne peut pas se terminer sur un pot orphelin : sans versement, aucun
   résultat en bb n'est dérivable des jetons. Le découpage en pot principal et
   side pots est délégué à `potDistribution`, qui empile les paliers par
   contribution TOTALE (préflop inclus). En heads-up il n'y a qu'un palier ;
   au-delà, chaque tapis court ne dispute que ce qu'il a pu payer. */
function finish(s, winner, reason, extra = {}) {
  returnUncalled(s);
  const potFinal = roundBb(s.pot);
  const contributions = {};
  for (const id of s.seats) {
    const q = s.players[id];
    const v = roundBb(q.committedBefore + q.committed);
    if (v > 0) contributions[id] = v;
  }
  const couches = s.seats.filter(id => s.players[id].folded);
  const classement = {};
  if (winner === "split") {
    for (const id of (extra.gagnants || alive(s))) classement[id] = 1;
  } else if (extra.ranks) {
    for (const [id, r] of Object.entries(extra.ranks)) classement[id] = r;
  } else if (winner) {
    classement[winner] = 1;
  }
  const oop = s.firstToActPostflop || s.seats[0];
  const dist = distributePots({ contributions, folded: couches, ranking: classement, oddChipTo: oop });

  const part = {};
  let verse = 0;
  for (const id of s.seats) { part[id] = roundBb(dist.payouts[id] || 0); verse = roundBb(verse + part[id]); }

  /* ── L'ARGENT MORT APPARTIENT AU POT PRINCIPAL, PAS À « QUELQU'UN » ──────
     Le pot peut contenir plus que la somme des contributions des joueurs
     ASSIS : blindes mortes d'un siège couché avant le flop, antes, pot reporté
     dont une part n'est rattachable à personne. `potDistribution` ne répartit
     que ce qui a un propriétaire ; le reste était jusqu'ici poussé en bloc
     vers le joueur hors de position — un choix arbitraire qui pouvait donner
     de l'argent mort au PERDANT du coup.

     L'argent mort entre dans le pot PRINCIPAL : il revient à qui remporte ce
     pot-là, comme au poker réel. Le résidu d'arrondi, lui, va à l'OOP. */
  let mort = roundBb(potFinal - verse);
  const mortInitial = mort > EPS ? mort : 0;
  if (mort > EPS) {
    const principal = dist.detail && dist.detail.length ? dist.detail[0] : null;
    const beneficiaires = (principal && principal.gagnants && principal.gagnants.length)
      ? principal.gagnants
      : (winner === "split" ? (extra.gagnants || alive(s)) : (winner ? [winner] : [oop]));
    const parts = partager(mort, beneficiaires, oop);
    for (const id of beneficiaires) { part[id] = roundBb((part[id] || 0) + (parts[id] || 0)); verse = roundBb(verse + (parts[id] || 0)); }
    s.ledger.push({ street: s.street, actor: null, kind: "dead", amount: mort, beneficiaires: [...beneficiaires], potAfter: s.pot });
    mort = roundBb(potFinal - verse);
  }
  /* Garde-fou : le découpage doit rendre EXACTEMENT le pot. Un résidu
     d'arrondi va au joueur hors de position, jamais perdu, jamais créé. */
  if (Math.abs(mort) > EPS) part[oop] = roundBb((part[oop] || 0) + mort);
  for (const id of s.seats) s.players[id].stack = roundBb(s.players[id].stack + (part[id] || 0));
  s.pot = 0;
  s.pots = dist.pots;
  s.ledger.push({
    street: s.street, actor: null, kind: "award", amount: potFinal, winner,
    part: { ...part },
    pots: dist.pots.map(p => ({ nom: p.nom, montant: p.montant })),
    potAfter: 0,
  });
  s.street = "done"; s.done = true; s.toAct = null;

  /* Résultat net du COUP COMPLET, préflop inclus : tapis final moins ce que le
     joueur avait avant de s'asseoir au flop, engagements préflop compris. */
  const netBb = {};
  for (const id of s.seats) {
    const q = s.players[id];
    netBb[id] = roundBb(q.stack - ((s.startStacks[id] ?? 0) + q.committedBefore));
  }
  netBb.hero = netBb[HERO] ?? 0;
  netBb.villain = netBb[VILLAIN] ?? 0;
  const payout = { ...part, hero: part[HERO] ?? 0, villain: part[VILLAIN] ?? 0 };
  s.result = {
    winner, reason, ...extra,
    potAwarded: potFinal,
    payout,
    pots: dist.pots.map(p => ({ nom: p.nom, montant: p.montant, disputePar: p.disputePar })),
    /* `sidePots` : combien de paliers ont RÉELLEMENT été joués. 1 = heads-up ou
       tapis égaux ; au-delà, le coup s'est terminé avec des tapis inégaux et
       chaque palier a trouvé son gagnant. */
    sidePots: Math.max(0, dist.pots.length - 1),
    /* Part du pot qui n'appartenait à aucun joueur assis (blindes mortes d'un
       siège couché avant le flop, antes, pot reporté sans propriétaire). Elle
       est versée avec le pot principal — la publier permet de vérifier que
       « somme des paliers + argent mort = pot disputé » plutôt que de laisser
       l'écart inexpliqué. */
    argentMort: mortInitial,
    /* Part rendue à son propriétaire parce que personne ne l'a suivie. Elle
       traverse le pot sans jamais être disputée : ni palier, ni argent mort.
       Trois catégories distinctes, dont la somme fait le pot. */
    nonSuivi: dist.uncalled ? { joueur: dist.uncalled.joueur, montant: dist.uncalled.montant } : null,
    netBb,
    heroNetBb: netBb.hero,
  };
  return sync(s);
}

/* ── CONTRÔLE DE CONSERVATION (testable, appelable en dev) ─────────────────
   Somme des tapis + pot = somme initiale, à chaque événement. Rend la liste
   des écarts ; vide = comptabilité juste. */
export function auditLedger(state) {
  const problems = [];
  const total = roundBb(state.seats.reduce((a, id) => a + state.players[id].stack, 0) + state.pot);
  if (Math.abs(total - state.totalChips) > 0.001)
    problems.push({ code: "conservation", attendu: state.totalChips, obtenu: total });
  for (const id of state.seats)
    if (state.players[id].stack < -EPS)
      problems.push({ code: "tapis-negatif", joueur: id, obtenu: state.players[id].stack });
  if (state.pot < -EPS) problems.push({ code: "pot-negatif", obtenu: state.pot });
  if (state.done && state.pot !== 0) problems.push({ code: "pot-orphelin", obtenu: state.pot });
  return problems;
}

function cloneState(s) {
  const players = {};
  for (const id of Object.keys(s.players)) players[id] = { ...s.players[id] };
  return {
    ...s,
    players,
    seats: [...s.seats],
    board: [...s.board],
    history: [...s.history],
    ledger: [...s.ledger],
    startStacks: { ...s.startStacks },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Politique par défaut d'un joueur non-Hero (raisonnable, non exploitante).
   Décide selon la force relative de sa main. `random` injectable.
   ────────────────────────────────────────────────────────────────────────── */
export function defaultVillainPolicy(state, { random = Math.random, actor = null } = {}) {
  const id = actor || state.toAct;
  const acts = legalActions(state, id);
  if (!acts.length) return null;
  const strength = normalizedStrength(state.players?.[id]?.hand, state.board);
  const toCall = amountToCall(state, id);
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

/* Force normalisée 0..1 d'une main sur ce board (heuristique via l'évaluateur ;
   sert uniquement à piloter la politique par défaut).

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

/* Fait jouer le joueur dont c'est le tour, s'il n'est pas Hero. Vaut pour un
   adversaire quelconque, pas seulement pour `villain`. */
export function playVillain(state, policy = defaultVillainPolicy, ctx = {}) {
  const id = state.toAct;
  if (state.done || !id || id === HERO) return state;
  const action = policy(state, { ...ctx, actor: id })
    || { type: amountToCall(state, id) > 0 ? "CALL" : "CHECK" };
  return applyAction(state, id, action);
}
