/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : POKER STATE NORMALISÉ + TAXONOMIE SÉMANTIQUE

   « LE MOTEUR CALCULE ET DÉCRIT LE SPOT. L'IA EXPLIQUE.
     L'IA NE RECONSTRUIT JAMAIS LE COUP. »

   Ce module est la SOURCE UNIQUE de vérité descriptive d'une décision Hero.
   Tout ce qu'un coach doit savoir pour parler juste — qui a ouvert, à combien,
   ce que Hero affronte, ce qu'il pouvait légalement faire — est CALCULÉ ici,
   à partir du flux d'événements, jamais deviné depuis du texte libre.

   ── POURQUOI CE MODULE EXISTE ──
   L'ancien pipeline déduisait le contexte d'une chaîne de caractères :

       facing = /raise|bet|3-?bet|all-?in|relance|mise/i.test(prevAction)

   où `prevAction` était le libellé de la DERNIÈRE action adverse. Dans
   « HJ open 2bb · BTN call · Hero BB », cette dernière action est « Call 2bb » :
   le test échouait, le moteur croyait Hero libre d'ouvrir et produisait
   « Open 2.1bb — 62 % » pour une big blind qui faisait face à un open.
   Le libellé n'est pas un état. Ici, le contexte est reconstruit à partir des
   MONTANTS et de l'ORDRE des actions, jamais de leur intitulé.

   Module PUR (aucune dépendance React/DOM) → testable en Node.
═══════════════════════════════════════════════════════════════ */
import { POSITIONS_BY_SIZE } from "../data/content.js";

const rb = v => Math.round(v * 100) / 100;
const EPS = 1e-4;

/* ═══════════════════════════════════════════════════════════════
   §3 — TAXONOMIE SÉMANTIQUE

   « RAISE » ne veut rien dire tout seul : ouvrir, 3-better et check-raiser
   sont la même famille mécanique et trois actes stratégiques différents.
   Le moteur tranche AVANT l'appel IA ; le modèle reçoit un nom, pas un choix.
═══════════════════════════════════════════════════════════════ */
export const SEM = {
  /* ── Préflop ── */
  OPEN_RAISE:        "OPEN_RAISE",
  LIMP:              "LIMP",
  OVERLIMP:          "OVERLIMP",
  ISO_RAISE:         "ISO_RAISE",
  CALL_OPEN:         "CALL_OPEN",
  THREE_BET:         "THREE_BET",
  CALL_THREE_BET:    "CALL_THREE_BET",
  FOUR_BET:          "FOUR_BET",
  CALL_FOUR_BET:     "CALL_FOUR_BET",
  FIVE_BET:          "FIVE_BET",
  FOLD_TO_OPEN:      "FOLD_TO_OPEN",
  FOLD_TO_THREE_BET: "FOLD_TO_THREE_BET",
  FOLD_TO_FOUR_BET:  "FOLD_TO_FOUR_BET",
  CHECK_OPTION:      "CHECK_OPTION",
  /* ── Postflop ── */
  CHECK:             "CHECK",
  BET:               "BET",
  DONK_BET:          "DONK_BET",
  CALL_BET:          "CALL_BET",
  RAISE_BET:         "RAISE_BET",
  CHECK_RAISE:       "CHECK_RAISE",
  CALL_RAISE:        "CALL_RAISE",
  RERAISE:           "RERAISE",
  FOLD_TO_BET:       "FOLD_TO_BET",
  FOLD_TO_RAISE:     "FOLD_TO_RAISE",
  /* ── Transverse ── */
  ALL_IN:            "ALL_IN",
  FOLD:              "FOLD",
  UNKNOWN:           "UNKNOWN",
};

/* Libellés FR — le SEUL vocabulaire autorisé à l'écran et dans le prompt.
   Le modèle ne choisit pas comment nommer l'action : on lui donne le nom. */
export const SEM_FR = {
  OPEN_RAISE: "open (ouverture)",
  LIMP: "limp",
  OVERLIMP: "sur-limp",
  ISO_RAISE: "iso-raise",
  CALL_OPEN: "call de l'open",
  THREE_BET: "3-bet",
  CALL_THREE_BET: "call du 3-bet",
  FOUR_BET: "4-bet",
  CALL_FOUR_BET: "call du 4-bet",
  FIVE_BET: "5-bet",
  FOLD_TO_OPEN: "fold face à l'open",
  FOLD_TO_THREE_BET: "fold face au 3-bet",
  FOLD_TO_FOUR_BET: "fold face au 4-bet",
  CHECK_OPTION: "check de l'option",
  CHECK: "check",
  BET: "bet",
  DONK_BET: "donk bet",
  CALL_BET: "call de la mise",
  RAISE_BET: "raise de la mise",
  CHECK_RAISE: "check-raise",
  CALL_RAISE: "call du raise",
  RERAISE: "re-raise",
  FOLD_TO_BET: "fold face à la mise",
  FOLD_TO_RAISE: "fold face au raise",
  ALL_IN: "all-in",
  FOLD: "fold",
  UNKNOWN: "action indéterminée",
};
export const semFr = s => SEM_FR[s] || SEM_FR.UNKNOWN;

/* Familles mécaniques — le pont vers `decisionAnalysis.ACT` (FOLD/CHECK/
   CALL/BET/RAISE/ALLIN), qui reste la clé d'appariement avec le solveur. */
export const FAMILY = { FOLD: "FOLD", CHECK: "CHECK", CALL: "CALL", BET: "BET", RAISE: "RAISE", ALLIN: "ALLIN" };

const SEM_FAMILY = {
  OPEN_RAISE: "RAISE", ISO_RAISE: "RAISE", THREE_BET: "RAISE", FOUR_BET: "RAISE",
  FIVE_BET: "RAISE", RAISE_BET: "RAISE", CHECK_RAISE: "RAISE", RERAISE: "RAISE",
  BET: "BET", DONK_BET: "BET",
  LIMP: "CALL", OVERLIMP: "CALL", CALL_OPEN: "CALL", CALL_THREE_BET: "CALL",
  CALL_FOUR_BET: "CALL", CALL_BET: "CALL", CALL_RAISE: "CALL",
  CHECK: "CHECK", CHECK_OPTION: "CHECK",
  FOLD: "FOLD", FOLD_TO_OPEN: "FOLD", FOLD_TO_THREE_BET: "FOLD",
  FOLD_TO_FOUR_BET: "FOLD", FOLD_TO_BET: "FOLD", FOLD_TO_RAISE: "FOLD",
  ALL_IN: "ALLIN",
};
/** Action sémantique → famille mécanique (FOLD/CHECK/CALL/BET/RAISE/ALLIN). */
export function familyOf(sem) { return SEM_FAMILY[sem] || null; }

/* ── Ordre des positions (parole préflop) : sert à IP/OOP et à l'ordre d'action. */
function posOrder(tableSize) {
  return POSITIONS_BY_SIZE[tableSize] || POSITIONS_BY_SIZE[6];
}
/** Hero est-il en position sur `vilPos` POSTFLOP (SB/BB parlent en premier) ? */
export function isInPosition(heroPos, vilPos, tableSize = 6) {
  const ring = posOrder(tableSize);
  // Ordre de parole postflop : SB, BB, UTG … BTN. Le dernier à parler est IP.
  const post = [...ring.slice(ring.indexOf("SB")), ...ring.slice(0, ring.indexOf("SB"))];
  const h = post.indexOf(heroPos), v = post.indexOf(vilPos);
  if (h < 0 || v < 0) return null;
  return h > v;
}

/* ═══════════════════════════════════════════════════════════════
   CONTEXTE DE MISE — reconstruit depuis les MONTANTS, pas les libellés.

   `betLevel` = nombre de « crans » d'agression déjà posés sur la street :
     préflop  1 = la big blind (mise forcée), 2 = open, 3 = 3-bet, 4 = 4-bet…
     postflop 0 = personne n'a misé, 1 = une mise, 2 = un raise…
   C'est ce compteur — et lui seul — qui nomme l'action de Hero.
═══════════════════════════════════════════════════════════════ */

const VOLUNTARY = ["fold", "check", "call", "bet", "raise", "allin"];
const AGGRESSIVE = ["bet", "raise", "allin"];

/**
 * Contexte de mise JUSTE AVANT l'événement `step`.
 * @returns {object|null}
 */
export function buildBettingContext(hand, snaps, step) {
  if (!hand?.events || step == null) return null;
  const ev = hand.events[step];
  if (!ev) return null;
  const street = String(ev.street || "preflop");
  const preflop = street === "preflop";
  const players = hand.players || [];
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  const posOf = id => byId[id]?.pos || "?";

  /* ── Engagements et niveau d'agression sur la street, avant `step`. ── */
  const committed = {};                       // mise totale de chacun sur la street
  let betLevel = preflop ? 1 : 0;             // la BB est déjà une mise
  let lastAggressor = null;                   // { id, pos, level, toAmountBB, semantic }
  const limpers = [];
  /* Joueurs ayant payé la dernière agression avant que Hero ne parle. Le sizing
     d'un 3-bet en dépend directement (convention : +1× l'open par caller) : sans
     ce compteur, on ne pourrait proposer qu'un sizing heads-up. */
  let callersInFront = 0;
  const actedThisStreet = new Set();
  const checkedThisStreet = new Set();
  const aggressionHistory = [];

  if (preflop) {
    for (const e of hand.events.slice(0, step)) {
      if (e.type === "post-sb" || e.type === "post-bb") committed[e.playerId] = rb(e.amount || 0);
    }
  }
  const highBet = () => Object.values(committed).reduce((m, v) => Math.max(m, v), preflop ? 0 : 0);

  for (const e of hand.events.slice(0, step)) {
    if (e.street !== street || !VOLUNTARY.includes(e.type)) continue;
    actedThisStreet.add(e.playerId);
    if (e.type === "check") { checkedThisStreet.add(e.playerId); continue; }
    if (e.type === "fold") continue;

    const before = highBet();
    const to = e.toAmount != null ? rb(e.toAmount) : rb((committed[e.playerId] || 0) + (e.amount || 0));
    committed[e.playerId] = to;

    if (AGGRESSIVE.includes(e.type) && to > before + EPS) {
      /* Une agression ne compte comme un cran que si elle DÉPASSE la mise en
         cours. Un all-in « short » (moins que la mise à suivre) n'ouvre pas un
         nouveau niveau : il ne rouvre pas l'action. */
      betLevel += 1;
      const semantic = preflop
        ? (betLevel === 2 ? (limpers.length ? SEM.ISO_RAISE : SEM.OPEN_RAISE)
          : betLevel === 3 ? SEM.THREE_BET
            : betLevel === 4 ? SEM.FOUR_BET : SEM.FIVE_BET)
        : (betLevel === 1 ? SEM.BET : betLevel === 2 ? SEM.RAISE_BET : SEM.RERAISE);
      lastAggressor = { id: e.playerId, pos: posOf(e.playerId), level: betLevel, toAmountBB: to, semantic, step: e.order ?? null };
      aggressionHistory.push({ pos: posOf(e.playerId), semantic, toAmountBB: to });
      callersInFront = 0;                     // une nouvelle agression remet le compte à zéro
    } else if (e.type === "call") {
      if (preflop && betLevel === 1) limpers.push(posOf(e.playerId));
      else callersInFront += 1;
    }
  }

  /* ── Agresseur de la street PRÉCÉDENTE : distingue un bet d'un donk bet. ── */
  const STREETS = ["preflop", "flop", "turn", "river"];
  const prevStreet = STREETS[STREETS.indexOf(street) - 1] || null;
  let prevStreetAggressorId = null;
  if (prevStreet) {
    for (const e of hand.events) {
      if (e.order != null && e.order >= step) break;
      if (e.street === prevStreet && AGGRESSIVE.includes(e.type)) prevStreetAggressorId = e.playerId;
    }
  }

  const actorId = ev.playerId;
  const heroCommitted = rb(committed[actorId] || 0);
  const high = rb(highBet());
  const toCall = rb(Math.max(0, high - heroCommitted));

  /* Pot AVANT la décision : streets closes + engagements de la street. */
  const prevSnap = step > 0 ? snaps?.[step - 1] : null;
  const potBefore = prevSnap ? rb(prevSnap.potTotal || 0) : null;

  /* ── Ce que Hero AFFRONTE ── */
  let facing = null;
  if (toCall > EPS) {
    facing = lastAggressor
      ? lastAggressor.semantic
      : (preflop ? SEM.OPEN_RAISE : SEM.BET);       // préflop sans relance = la blinde
    if (preflop && !lastAggressor) facing = limpers.length ? SEM.LIMP : null;
  } else if (preflop && limpers.length) {
    facing = SEM.LIMP;
  } else if (!preflop && checkedThisStreet.size) {
    facing = SEM.CHECK;
  }

  return {
    street, preflop,
    betLevel,
    lastAggressor,
    aggressionHistory,
    limpers,
    callersInFront,
    facing,
    toCallBB: toCall,
    heroCommittedBB: heroCommitted,
    highBetBB: high,
    potBeforeBB: potBefore,
    potOddsPct: (potBefore != null && toCall > EPS) ? Math.round((toCall / (potBefore + toCall)) * 100) : null,
    heroActedThisStreet: actedThisStreet.has(actorId),
    heroCheckedThisStreet: checkedThisStreet.has(actorId),
    heroWasPrevStreetAggressor: prevStreetAggressorId != null && prevStreetAggressorId === actorId,
    villainWasPrevStreetAggressor: prevStreetAggressorId != null && prevStreetAggressorId !== actorId,
  };
}

/* ═══════════════════════════════════════════════════════════════
   §3 — NOMMAGE DE L'ACTION

   `semanticOf` répond à : « compte tenu de ce qui précède, comment s'appelle
   cette action ? ». C'est la fonction que l'ancien pipeline n'avait pas.
═══════════════════════════════════════════════════════════════ */

/**
 * @param family  famille mécanique (FOLD/CHECK/CALL/BET/RAISE/ALLIN)
 * @param ctx     contexte de mise (buildBettingContext)
 * @param opts    { isHeroOOP:boolean }
 */
export function semanticOf(family, ctx, opts = {}) {
  if (!family || !ctx) return SEM.UNKNOWN;
  const { preflop, betLevel, facing, toCallBB, heroCheckedThisStreet, limpers } = ctx;
  const facingBet = toCallBB > EPS;

  if (family === FAMILY.CHECK) return preflop ? SEM.CHECK_OPTION : SEM.CHECK;

  if (family === FAMILY.FOLD) {
    if (!facingBet) return SEM.FOLD;                       // fold sans mise à suivre
    if (preflop) {
      /* Jeter en pot NON OUVERT (on ne « paie » que la grosse blinde) n'est pas
         un fold face à un open : c'est simplement ne pas entrer dans le coup.
         Les confondre ferait dire au coach « tu as fold face à l'ouverture »
         alors que personne n'a ouvert. */
      if (betLevel <= 1) return SEM.FOLD;
      if (facing === SEM.THREE_BET) return SEM.FOLD_TO_THREE_BET;
      if (facing === SEM.FOUR_BET || facing === SEM.FIVE_BET) return SEM.FOLD_TO_FOUR_BET;
      return SEM.FOLD_TO_OPEN;                             // open ou iso-raise
    }
    return (facing === SEM.RAISE_BET || facing === SEM.CHECK_RAISE || facing === SEM.RERAISE)
      ? SEM.FOLD_TO_RAISE : SEM.FOLD_TO_BET;
  }

  if (family === FAMILY.CALL) {
    if (preflop) {
      if (betLevel <= 1) return limpers.length ? SEM.OVERLIMP : SEM.LIMP;
      if (betLevel === 2) return SEM.CALL_OPEN;
      if (betLevel === 3) return SEM.CALL_THREE_BET;
      return SEM.CALL_FOUR_BET;
    }
    return (facing === SEM.RAISE_BET || facing === SEM.CHECK_RAISE || facing === SEM.RERAISE)
      ? SEM.CALL_RAISE : SEM.CALL_BET;
  }

  /* BET / RAISE / ALLIN : le cran d'agression donne le nom. */
  if (preflop) {
    if (betLevel <= 1) return limpers.length ? SEM.ISO_RAISE : SEM.OPEN_RAISE;
    if (betLevel === 2) return SEM.THREE_BET;
    if (betLevel === 3) return SEM.FOUR_BET;
    return SEM.FIVE_BET;
  }
  if (betLevel === 0) {
    /* Donk bet : miser hors de position DANS l'agresseur de la street
       précédente. Sans cette distinction, un donk et un c-bet portent le même
       nom alors qu'ils n'ont pas la même signification stratégique. */
    if (ctx.villainWasPrevStreetAggressor && opts.isHeroOOP === true) return SEM.DONK_BET;
    return SEM.BET;
  }
  if (heroCheckedThisStreet) return SEM.CHECK_RAISE;
  return betLevel === 1 ? SEM.RAISE_BET : SEM.RERAISE;
}

/* ═══════════════════════════════════════════════════════════════
   §4 — ACTIONS LÉGALEMENT DISPONIBLES

   Le référentiel du validateur : ce que Hero POUVAIT faire. Une réponse qui
   recommande une action absente de cette liste est rejetée, pas reformulée.
═══════════════════════════════════════════════════════════════ */
export function legalActions(ctx, opts = {}) {
  if (!ctx) return [];
  const out = [];
  const facingBet = ctx.toCallBB > EPS;
  const canRaise = opts.heroStackBB == null ? true : opts.heroStackBB > ctx.toCallBB + EPS;

  if (facingBet) {
    out.push(semanticOf(FAMILY.FOLD, ctx, opts));
    out.push(semanticOf(FAMILY.CALL, ctx, opts));
    if (canRaise) out.push(semanticOf(FAMILY.RAISE, ctx, opts));
  } else {
    out.push(semanticOf(FAMILY.CHECK, ctx, opts));
    if (canRaise) out.push(semanticOf(FAMILY.BET, ctx, opts));
    /* Fold sans mise à suivre : légal aux règles, jamais correct. On ne
       l'expose pas comme une option — le proposer serait un conseil absurde. */
  }
  return [...new Set(out.filter(Boolean))];
}

/* ═══════════════════════════════════════════════════════════════
   §2 — POKER STATE NORMALISÉ
═══════════════════════════════════════════════════════════════ */

const cardStr = c => (typeof c === "string" ? c : c ? `${c.r}${{ "♠": "s", "♥": "h", "♦": "d", "♣": "c" }[c.s] || c.s}` : null);
const cardsStr = l => (Array.isArray(l) ? l.map(cardStr).filter(Boolean) : []);

/** Historique complet et lisible des actions de la main, jusqu'à `step` inclus. */
function actionHistory(hand, step) {
  const byId = Object.fromEntries((hand.players || []).map(p => [p.id, p]));
  const out = [];
  const committed = {};
  let street = "preflop";
  let level = 1;
  const limpers = [];
  hand.events.forEach((e, i) => {
    if (i > step) return;
    if (e.type === "deal-flop") { street = "flop"; level = 0; Object.keys(committed).forEach(k => delete committed[k]); limpers.length = 0; return; }
    if (e.type === "deal-turn") { street = "turn"; level = 0; Object.keys(committed).forEach(k => delete committed[k]); return; }
    if (e.type === "deal-river") { street = "river"; level = 0; Object.keys(committed).forEach(k => delete committed[k]); return; }
    if (e.type === "post-sb" || e.type === "post-bb") { committed[e.playerId] = rb(e.amount || 0); return; }
    if (!VOLUNTARY.includes(e.type)) return;

    const p = byId[e.playerId];
    const high = Object.values(committed).reduce((m, v) => Math.max(m, v), 0);
    let sem;
    if (e.type === "check") sem = street === "preflop" ? SEM.CHECK_OPTION : SEM.CHECK;
    else if (e.type === "fold") {
      const toCall = rb(Math.max(0, high - (committed[e.playerId] || 0)));
      sem = toCall <= EPS ? SEM.FOLD
        : street === "preflop"
          ? (level <= 1 ? SEM.FOLD : level === 2 ? SEM.FOLD_TO_OPEN
            : level === 3 ? SEM.FOLD_TO_THREE_BET : SEM.FOLD_TO_FOUR_BET)
          : (level >= 2 ? SEM.FOLD_TO_RAISE : SEM.FOLD_TO_BET);
    } else {
      const to = e.toAmount != null ? rb(e.toAmount) : rb((committed[e.playerId] || 0) + (e.amount || 0));
      const raised = AGGRESSIVE.includes(e.type) && to > high + EPS;
      committed[e.playerId] = to;
      if (raised) {
        level += 1;
        sem = street === "preflop"
          ? (level === 2 ? (limpers.length ? SEM.ISO_RAISE : SEM.OPEN_RAISE)
            : level === 3 ? SEM.THREE_BET : level === 4 ? SEM.FOUR_BET : SEM.FIVE_BET)
          : (level === 1 ? SEM.BET : level === 2 ? SEM.RAISE_BET : SEM.RERAISE);
      } else if (e.type === "call") {
        if (street === "preflop" && level <= 1) { sem = limpers.length ? SEM.OVERLIMP : SEM.LIMP; limpers.push(p?.pos); }
        else if (street === "preflop") sem = level === 2 ? SEM.CALL_OPEN : level === 3 ? SEM.CALL_THREE_BET : SEM.CALL_FOUR_BET;
        else sem = level >= 2 ? SEM.CALL_RAISE : SEM.CALL_BET;
      } else sem = SEM.ALL_IN;                       // all-in court qui ne rouvre pas
    }
    out.push({
      step: i, street,
      position: p?.pos || "?",
      isHero: !!p?.isHero,
      semantic: sem,
      family: familyOf(sem),
      amountBB: e.amount != null ? rb(e.amount) : null,
      toAmountBB: e.toAmount != null ? rb(e.toAmount) : null,
      allIn: e.type === "allin",
    });
  });
  return out;
}

/**
 * §2 — Construit le PokerState d'UNE décision Hero.
 *
 * Toute donnée présente ici est CALCULÉE depuis la hand history. Toute donnée
 * absente est absente : aucun champ n'est rempli par défaut « pour faire joli ».
 * Un champ à `null` signifie « inconnu », et c'est cette valeur-là qui autorise
 * le coach à dire « cette information n'est pas disponible ».
 *
 * @param hand   NormalizedHand
 * @param snaps  snapshots (computeAllSnapshots)
 * @param step   index de l'événement (décision Hero)
 * @returns {object|null} null si l'étape n'est pas une décision Hero.
 */
export function buildPokerState(hand, snaps, step) {
  if (!hand?.valid || !Array.isArray(snaps) || step == null) return null;
  const ev = hand.events?.[step];
  if (!ev || !VOLUNTARY.includes(ev.type)) return null;
  if (ev.playerId !== hand.heroId) return null;

  const snap = snaps[step];
  const prev = step > 0 ? snaps[step - 1] : null;
  if (!snap) return null;

  const players = hand.players || [];
  const heroP = players.find(p => p.id === hand.heroId);
  if (!heroP) return null;
  const tableSize = players.length;

  const ctx = buildBettingContext(hand, snaps, step);
  if (!ctx) return null;

  /* État des joueurs AVANT la décision : c'est l'état que Hero voyait. */
  const base = prev || snap;
  const stateOf = id => base.players.find(p => p.id === id) || snap.players.find(p => p.id === id);
  const heroState = stateOf(hand.heroId);
  const inHand = base.players.filter(p => !p.folded);
  const villains = inHand.filter(p => p.id !== hand.heroId);

  const heroPos = heroP.pos || "?";
  const aggrPos = ctx.lastAggressor?.pos || null;
  const refVillain = aggrPos || villains[0]?.pos || null;
  const heroIP = refVillain ? isInPosition(heroPos, refVillain, tableSize) : null;

  const family = { fold: FAMILY.FOLD, check: FAMILY.CHECK, call: FAMILY.CALL,
                   bet: FAMILY.BET, raise: FAMILY.RAISE, allin: FAMILY.ALLIN }[ev.type];
  const heroSemantic = semanticOf(family, ctx, { isHeroOOP: heroIP === false });

  const heroStack = rb(heroState?.stack ?? 0);
  /* Tapis effectif : celui qui compte est celui du joueur qu'on affronte
     réellement (l'agresseur), pas le plus court de la table. En multiway le
     plus court peut être un joueur déjà couché ou marginal, et annoncer son
     tapis comme « effectif » fausse tout raisonnement de SPR. */
  const stackTotal = p => rb((p.stack || 0) + (p.committed || 0));
  const opp = (aggrPos && villains.find(v => v.pos === aggrPos)) || villains[0] || null;
  const effStack = opp
    ? rb(Math.min(heroStack + (heroState?.committed || 0), stackTotal(opp)))
    : null;

  const board = base.board || [];
  const legal = legalActions(ctx, { heroStackBB: heroStack, isHeroOOP: heroIP === false });

  return {
    /* ── Identité ── */
    handId: String(hand.handId || hand.id || ""),
    site: hand.room || "Inconnu",
    gameType: hand.gameType === "mtt" ? "MTT" : "Cash",
    game: "NLHE",
    tableSize,
    playersInHand: inHand.length,
    step,

    /* ── Street & board ── */
    street: ctx.street,
    board: cardsStr(board),
    boardCount: board.length,

    /* ── Hero ── */
    hero: {
      position: heroPos,
      cards: cardsStr(heroP.hole),
      stackBB: heroStack,
      committedThisStreetBB: ctx.heroCommittedBB,
      inPosition: heroIP,
    },

    /* ── Table ── */
    positions: players.map(p => p.pos || "?"),
    players: base.players.map(p => ({
      position: p.pos || "?",
      stackBB: rb(p.stack ?? 0),
      committedBB: rb(p.committed ?? 0),
      isHero: !!p.isHero,
      folded: !!p.folded,
      allIn: !!p.allIn,
    })),

    /* ── Économie du coup ── */
    blinds: { sb: rb(hand.blinds?.sb ?? 0.5), bb: rb(hand.blinds?.bb ?? 1), ante: rb(hand.blinds?.ante ?? 0) },
    potBB: ctx.potBeforeBB,
    toCallBB: ctx.toCallBB,
    potOddsPct: ctx.potOddsPct,
    effectiveStackBB: effStack,
    sprBefore: (ctx.potBeforeBB > 0 && effStack != null && ctx.street !== "preflop")
      ? Math.round((effStack / ctx.potBeforeBB) * 10) / 10 : null,

    /* ── §2 : historique, dernier agresseur, action affrontée ── */
    actionHistory: actionHistory(hand, step - 1),
    betLevel: ctx.betLevel,
    limpers: ctx.limpers,
    callersInFront: ctx.callersInFront,
    lastAggressor: ctx.lastAggressor
      ? { position: ctx.lastAggressor.pos, semantic: ctx.lastAggressor.semantic,
          semanticFr: semFr(ctx.lastAggressor.semantic), toAmountBB: ctx.lastAggressor.toAmountBB }
      : null,
    facingAction: ctx.facing,
    facingActionFr: ctx.facing ? semFr(ctx.facing) : null,

    /* ── §2 : action de Hero + options légales ── */
    heroAction: heroSemantic,
    heroActionFr: semFr(heroSemantic),
    heroActionFamily: family,
    heroActionAmountBB: ev.amount != null ? rb(ev.amount) : null,
    heroActionToAmountBB: ev.toAmount != null ? rb(ev.toAmount) : null,
    heroWentAllIn: ev.type === "allin" || heroStack <= EPS,
    legalActions: legal,
    legalActionsFr: legal.map(semFr),

    /* Les blocs stratégiques (fréquences, EV, équité, provenance) sont ajoutés
       par solverPackage : ce module décrit le SPOT, pas la solution. */
  };
}

/* Résumé d'une ligne, en vocabulaire poker exact — utilisé par l'UI, les logs
   de cohérence et le prompt. Aucune donnée n'y est reformulée par le modèle. */
export function describeSpot(ps) {
  if (!ps) return "";
  const bits = [`${ps.hero.position} ${ps.street}`];
  if (ps.lastAggressor) bits.push(`face au ${ps.lastAggressor.semanticFr} de ${ps.lastAggressor.position} (${ps.lastAggressor.toAmountBB}bb)`);
  else if (ps.limpers.length) bits.push(`face à ${ps.limpers.length} limp(s)`);
  else bits.push("pot non ouvert");
  bits.push(`Hero : ${ps.heroActionFr}`);
  return bits.join(" · ");
}
