/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — LA LIGNE PRÉFLOP (§3/§24/§37).

   Le pot d'un spot préflop n'a jamais été une donnée : c'est un RÉSULTAT. Il
   vaut exactement la somme de ce que les joueurs ont poussé, et rien d'autre.
   Tant que les générateurs le tiraient au sort — `pot = rndI(8,14)` — ou le
   figeaient en dur — `pot: 36` quelles que soient les positions — la table ne
   pouvait pas le peindre : les contributions n'existaient pas en tant que
   données. Le critère d'acceptation de la mission (« reconstruire 0.5 + 1 +
   2.5 = 4bb en regardant la table ») était donc hors d'atteinte par
   CONSTRUCTION, pas par erreur d'arithmétique.

   Ce module est la brique qui manquait : un vrai déroulé de tour d'enchères
   préflop. On lui donne une séquence d'actions, il rend

     • l'engagement TOTAL de chaque siège (blinde comprise — une SB qui ouvre à
       3 a engagé 3, pas 3.5) ;
     • le pot, qui n'est que la somme de ces engagements ;
     • ce que Hero doit payer ;
     • l'historique exact que la table peindra.

   Aucun spot préflop ne devrait plus porter un `pot` écrit à la main. Trois
   fabriques en produisaient (les spots statiques, le générateur dynamique du
   Trainer, le moteur de spots IA) : elles passent toutes par ici.

   Invariant tenu par `paintedPreflopAmounts` et vérifié par les tests :

       pot == Σ (ce que la table peint sur chaque siège)

   parce que la table peint l'engagement d'un siège dès qu'il dépasse sa
   blinde, et son marqueur de blinde sinon — donc `max(engagement, blinde)`,
   qui vaut l'engagement dans les deux cas.
   ═══════════════════════════════════════════════════════════════════════════ */
import { POSITIONS_BY_SIZE } from "./data/content.js";
import { roundPot } from "./potAccounting.js";

export const PREFLOP_BLINDS = Object.freeze({ SB: 0.5, BB: 1 });
export const blindOf = pos => PREFLOP_BLINDS[pos] || 0;

const num = v => (typeof v === "number" && isFinite(v) ? v : Number.isFinite(+v) ? +v : 0);
const isPreflopStreet = s => /^pre/i.test(String(s || ""));

/* Sizings par défaut quand le spot ne les dit pas. Le SB ouvre plus large (il
   sera OOP tout le coup) ; une « ouverture » depuis la BB n'existe que sur pot
   limpé, on lui laisse un sizing plausible plutôt que de refuser le spot. */
export function defaultOpenSize(pos) { return pos === "SB" ? 3 : pos === "BB" ? 3.5 : 2.5; }

/**
 * Sièges de la table, dans l'ORDRE D'ACTION préflop (UTG parle en premier, BB
 * en dernier). On part du format demandé ; si Hero ou le Vilain n'y tiennent
 * pas — un spot 6-max rejoué sur une table 5 joueurs, par exemple — on élargit
 * plutôt que de perdre le siège, sinon son engagement disparaîtrait du pot.
 */
export function preflopSeats({ nplayers, hero, villain, extra = [] } = {}) {
  const base = POSITIONS_BY_SIZE[nplayers] || POSITIONS_BY_SIZE[6];
  const wanted = [hero, villain, ...extra].filter(Boolean);
  if (wanted.every(p => base.includes(p))) return [...base];
  const full = POSITIONS_BY_SIZE[9];
  const kept = full.filter(p => base.includes(p) || wanted.includes(p));
  // Une position inconnue de l'anneau (EP sur une table courte…) reste jouable :
  // on l'insère en tête plutôt que de l'ignorer — un siège perdu, c'est un
  // engagement qui disparaît du pot.
  const orphans = wanted.filter(p => !kept.includes(p));
  return [...orphans, ...kept];
}

/**
 * Déroule un tour d'enchères préflop.
 *
 * @param seats   sièges dans l'ordre d'action (blindes incluses)
 * @param script  [{ pos, act:"FOLD"|"CHECK"|"CALL"|"RAISE"|"3BET"|"4BET"|"5BET"|"ALLIN", to }]
 *                `to` est l'engagement TOTAL visé (« raise TO »), pas l'ajout.
 *                Pour un CALL, il est déduit de la mise à suivre.
 * @returns { seats, actions, committed, folded, pot, highest, errors }
 */
export function playPreflop({ seats, script = [] } = {}) {
  const order = Array.isArray(seats) && seats.length ? [...seats] : [...POSITIONS_BY_SIZE[6]];
  const committed = {};
  order.forEach(p => { committed[p] = blindOf(p); });
  const folded = new Set();
  const actions = [];
  const errors = [];
  let pot = roundPot(order.reduce((a, p) => a + blindOf(p), 0));
  let highest = order.reduce((a, p) => Math.max(a, blindOf(p)), 0);

  for (const step of script) {
    const pos = step && step.pos;
    const act = String((step && (step.act || step.actionType)) || "").toUpperCase();
    if (!pos || !order.includes(pos)) { errors.push(`siège hors table: ${pos}`); continue; }
    if (folded.has(pos)) { errors.push(`${pos} agit après s'être couché`); continue; }
    if (act === "FOLD") {
      folded.add(pos);
      actions.push({ position: pos, actionType: "FOLD", amountBb: 0, potAfterAction: pot, street: "Preflop" });
      continue;
    }
    if (act === "CHECK") {
      actions.push({ position: pos, actionType: "CHECK", amountBb: 0, potAfterAction: pot, street: "Preflop" });
      continue;
    }
    const to = act === "CALL" ? highest : roundPot(num(step.to));
    if (to < committed[pos] - 1e-9) { errors.push(`${pos} ne peut pas reprendre des jetons (${to} < ${committed[pos]})`); continue; }
    if (act !== "CALL" && to < highest - 1e-9) errors.push(`${pos} relance à ${to}, sous la mise en cours (${highest})`);
    const added = roundPot(to - committed[pos]);
    committed[pos] = to;
    pot = roundPot(pot + added);
    if (to > highest) highest = to;
    /* `amountBb` porte l'engagement TOTAL du siège : c'est ce que la table peint
       devant lui, et c'est la convention du reste du Trainer. `potAfterAction`
       n'ajoute que le DELTA — l'ancien historique ajoutait le total à un pot qui
       contenait déjà la blinde du relanceur, et affichait donc un pot trop grand
       d'une blinde à chaque 3-bet de blindeur. */
    actions.push({ position: pos, actionType: act, amountBb: to, potAfterAction: pot, street: "Preflop" });
  }
  return { seats: order, actions, committed, folded: [...folded], pot, highest, errors };
}

/* ── Nature du spot préflop, déduite comme le fait déjà la table ──────────── */
export function preflopKind(spot) {
  const cat = String((spot && spot.cat) || "").toLowerCase();
  const desc = String((spot && spot.desc) || "").toLowerCase();
  const toCall = Math.max(0, num(spot && spot.toCall));
  const hasCallers = Array.isArray(spot && spot.multiway) && spot.multiway.length > 0;
  if (cat.includes("4-bet") || cat.includes("4bet")) return "vs4bet";
  if (cat.includes("3-bet") || cat.includes("3bet")) return "vs3bet";
  if (toCall <= 0) return "rfi";
  if (/squeeze/.test(cat) || /squeeze/.test(desc) || hasCallers) return "squeeze";
  return "vsOpen";
}

/* ── LES RÔLES PRÉFLOP ONT UN ORDRE (§37) ──────────────────────────────────
   Un 3-betteur parle APRÈS l'ouvreur, un squeezeur après un suiveur. Quand un
   filtre demande « CO vs 3-bet HJ », il demande une main impossible : le HJ a
   déjà parlé quand le CO ouvre. Le générateur produisait pourtant la table —
   le vilain y était à la fois couché et 3-betteur, et ses jetons peuplaient un
   pot que personne n'avait construit.

   On corrige le SIÈGE DU VILAIN, jamais celui de Hero : le Trainer est
   hero-centric, la position demandée pour Hero est le sujet de l'exercice.
   `ok:false` veut dire qu'aucun siège ne peut tenir le rôle (un « vs open »
   quand Hero est UTG) — à l'appelant de retomber sur un spot qui existe. */
export function preflopRoleOk({ kind, hero, villain, seats }) {
  const order = seats && seats.length ? seats : POSITIONS_BY_SIZE[6];
  const hi = order.indexOf(hero), vi = order.indexOf(villain);
  if (hi < 0 || vi < 0 || hero === villain) return false;
  if (kind === "vs3bet") return vi > hi;                       // le 3-betteur parle après l'ouvreur
  if (kind === "vsOpen" || kind === "vs4bet") return vi < hi;  // l'ouvreur parle avant Hero
  if (kind === "squeeze") return vi < hi && order.some((p, i) => i > vi && i < hi && p !== "SB" && p !== "BB");
  return true;                                                  // rfi : le vilain n'a pas de rôle imposé
}

export function resolvePreflopRoles({ kind, hero, villain, nplayers } = {}) {
  const seats = preflopSeats({ nplayers, hero, villain });
  if (preflopRoleOk({ kind, hero, villain, seats })) return { hero, villain, seats, ok: true, repaired: false };
  const hi = seats.indexOf(hero);
  if (hi < 0) return { hero, villain, seats, ok: false, repaired: false };
  let candidates;
  if (kind === "vs3bet") candidates = seats.filter((p, i) => i > hi);
  else if (kind === "squeeze") candidates = seats.filter((p, i) => i < hi && seats.some((q, j) => j > i && j < hi && q !== "SB" && q !== "BB"));
  else if (kind === "vsOpen" || kind === "vs4bet") candidates = seats.filter((p, i) => i < hi);
  else candidates = seats.filter(p => p !== hero);
  if (!candidates.length) return { hero, villain, seats, ok: false, repaired: false };
  /* Le siège le plus PROCHE de Hero : c'est le spot le plus fréquent en jeu réel
     (on défend surtout contre le siège d'à côté) et celui qui déforme le moins
     l'intention du filtre. */
  const pick = (kind === "vs3bet") ? candidates[0] : candidates[candidates.length - 1];
  return { hero, villain: pick, seats, ok: true, repaired: pick !== villain };
}

/* Premier siège susceptible d'avoir SUIVI entre l'ouvreur et Hero. On ne prend
   ni SB ni BB : un blindeur qui « suit » complète, ce n'est pas un cold-call, et
   son engagement se lirait mal sur la table. */
function callerBetween(order, villain, hero, preferred) {
  const vi = order.indexOf(villain), hi = order.indexOf(hero);
  const between = order.filter((p, i) => i > vi && i < hi && p !== "SB" && p !== "BB");
  if (preferred && between.includes(preferred)) return preferred;
  return between[0] || null;
}

/**
 * Construit la ligne préflop d'un spot. C'est ici que le pot naît.
 *
 * On respecte le `toCall` du spot — les libellés d'action l'affichent — et on
 * en DÉDUIT les sizings : si Hero doit payer 1.5 depuis la BB, c'est que
 * l'ouverture était à 2.5. Le pot suit, il ne se décide pas.
 *
 * @returns null si le spot n'est pas préflop ou s'il manque les positions.
 */
export function buildPreflopLine(spot) {
  if (!spot || !isPreflopStreet(spot.street) || !spot.hpos || !spot.vpos) return null;
  const hero = spot.hpos, villain = spot.vpos;
  if (hero === villain) return null;
  const kind = preflopKind(spot);
  const toCall = Math.max(0, num(spot.toCall));
  const declared = (Array.isArray(spot.multiway) ? spot.multiway : [])
    .map(m => (typeof m === "string" ? { pos: m } : m || {}))
    .map(m => ({ ...m, pos: m.pos || m.position || m.seat }));
  const seats = preflopSeats({ nplayers: spot.nplayers, hero, villain, extra: declared.map(m => m.pos).filter(Boolean) });
  const hi = seats.indexOf(hero), vi = seats.indexOf(villain);
  /* On ne couche jamais un siege qui a un ROLE dans la ligne : sur un spot aux
     positions impossibles (un 3-betteur qui parle avant l ouvreur), le vilain se
     retrouvait couche PUIS relanceur, et ses jetons peignaient un pot fantome.
     La ligne remonte alors une erreur, et le spot est ecarte. */
  const foldsBefore = (pos, keep = []) => seats
    .filter((p, i) => i < seats.indexOf(pos) && p !== "SB" && p !== "BB" && !keep.includes(p))
    .map(p => ({ pos: p, act: "FOLD" }));

  const script = [];
  let facing = null, callers = [];

  if (kind === "rfi") {
    // First-in : personne n'a mis un jeton volontairement avant Hero.
    script.push(...foldsBefore(hero, [villain]));
  } else if (kind === "vsOpen" || kind === "squeeze") {
    /* Hero paie `toCall` PAR-DESSUS sa blinde : l'ouverture vaut donc
       toCall + blinde de Hero. C'est la seule lecture qui rende le pot
       reconstructible — l'ancienne ajoutait la blinde une seconde fois. */
    const openSize = Math.max(roundPot(toCall + blindOf(hero)), roundPot(blindOf(villain) + 0.5));
    script.push(...foldsBefore(villain, [hero]), { pos: villain, act: "RAISE", to: openSize });
    if (kind === "squeeze") {
      const caller = callerBetween(seats, villain, hero, declared[0] && declared[0].pos);
      if (caller) {
        script.push(...seats.filter((p, i) => i > vi && i < seats.indexOf(caller) && p !== "SB" && p !== "BB").map(p => ({ pos: p, act: "FOLD" })));
        script.push({ pos: caller, act: "CALL" });
        callers = [{ pos: caller, amount: openSize }];
      }
    }
    script.push(...seats
      .filter((p, i) => i > vi && i < hi && p !== "SB" && p !== "BB" && !script.some(s => s.pos === p))
      .map(p => ({ pos: p, act: "FOLD" })));
    facing = {
      kind: kind === "squeeze" ? "squeeze" : "open",
      label: kind === "squeeze" ? "Open + call" : "Open",
      amount: openSize, position: villain,
    };
  } else if (kind === "vs3bet") {
    /* Hero a ouvert, le Vilain a 3-bet. Le 3-bet vaut l'ouverture de Hero plus
       ce qu'il reste à payer à Hero. */
    const heroOpen = roundPot(num(spot.heroOpenSize) || defaultOpenSize(hero));
    const threeBet = roundPot(heroOpen + toCall);
    script.push(...foldsBefore(hero, [villain]), { pos: hero, act: "RAISE", to: heroOpen });
    script.push(...seats.filter((p, i) => i > hi && i < vi && p !== "SB" && p !== "BB").map(p => ({ pos: p, act: "FOLD" })));
    script.push({ pos: villain, act: "3BET", to: threeBet });
    facing = { kind: "3bet", label: "3-Bet", amount: threeBet, position: villain };
  } else {
    // vs4bet : le Vilain ouvre, Hero 3-bet, le Vilain 4-bet.
    const openV = roundPot(num(spot.villainOpenSize) || defaultOpenSize(villain));
    const heroThree = roundPot(num(spot.heroThreeBetSize) || Math.max(9, openV * 3.6));
    const fourBet = roundPot(heroThree + toCall);
    script.push(...foldsBefore(villain, [hero]), { pos: villain, act: "RAISE", to: openV });
    script.push(...seats.filter((p, i) => i > vi && i < hi && p !== "SB" && p !== "BB").map(p => ({ pos: p, act: "FOLD" })));
    script.push({ pos: hero, act: "3BET", to: heroThree });
    script.push({ pos: villain, act: "4BET", to: fourBet });
    facing = { kind: "4bet", label: "4-Bet", amount: fourBet, position: villain };
  }

  /* ── LES BLINDES AUSSI SE COUCHENT (C9) ──────────────────────────────────
     `foldsBefore` excluait systématiquement SB et BB, parce que leur blinde est
     dans le pot quoi qu'il arrive. Conséquence : sur un spot « BB défend face à
     un open du CO », la SB n'avait AUCUNE action enregistrée — ni fold, ni
     autre. Le rendu ne pouvait donc pas savoir qu'elle était sortie du coup, et
     le seul moyen de l'afficher couchée était de le DÉDUIRE, ce que la mission
     interdit (« n'affiche FOLD qu'après une action de fold réellement
     enregistrée »).

     Un fold vaut 0bb : il ne retire pas la blinde du pot, déjà postée avant le
     script. On l'insère à sa place dans l'ordre de parole. */
  const roles = new Set([hero, villain, ...callers.map(c => c.pos), ...script.map(s => s.pos)]);
  for (const p of ["SB", "BB"]) {
    const pi = seats.indexOf(p);
    if (pi < 0 || pi >= hi || roles.has(p)) continue;      // pas assis, parle après Hero, ou a un rôle
    let insert = script.length;
    for (let i = 0; i < script.length; i++) {
      if (seats.indexOf(script[i].pos) > pi) { insert = i; break; }
    }
    script.splice(insert, 0, { pos: p, act: "FOLD" });
    roles.add(p);
  }

  const state = playPreflop({ seats, script });
  const heroCommitted = roundPot(state.committed[hero] || 0);
  return {
    kind, seats,
    actions: state.actions,
    committed: state.committed,
    folded: state.folded,
    pot: state.pot,
    facing,
    heroCommitted,
    toCall: roundPot(Math.max(0, state.highest - heroCommitted)),
    callers,
    errors: state.errors,
  };
}

/**
 * Ce que la table PEINT réellement, siège par siège — le miroir fidèle de
 * `seatShowsChips` : au-dessus de sa blinde un siège montre son engagement et
 * son marqueur de blinde s'efface ; un seul tas par joueur, jamais deux. Les
 * blindes des joueurs couchés restent peintes : c'est de l'argent mort, mais
 * il est dans le pot et doit donc rester visible, sinon la somme ne tombe plus.
 */
export function paintedPreflopAmounts(line) {
  if (!line || !line.committed) return [];
  return Object.entries(line.committed)
    .map(([pos, v]) => ({
      pos,
      amount: roundPot(Math.max(num(v), blindOf(pos))),
      source: num(v) > blindOf(pos) ? "mise" : "blinde",
    }))
    .filter(c => c.amount > 0);
}

/** Somme de ce qui est peint. Doit valoir le pot — c'est tout l'objet du module. */
export function paintedPreflopTotal(line) {
  return roundPot(paintedPreflopAmounts(line).reduce((a, c) => a + c.amount, 0));
}

/**
 * Attache la ligne à un spot préflop et lui donne SON pot. À appeler sur tout
 * spot préflop, quelle que soit la fabrique qui l'a produit. Mute le spot (les
 * appelants travaillent déjà sur des clones) et le rend.
 */
export function attachPreflopLine(spot) {
  if (!spot || !isPreflopStreet(spot.street)) return spot;
  const line = buildPreflopLine(spot);
  if (!line) return spot;
  spot.line = line;
  spot.pot = line.pot;
  if (line.callers.length) {
    const declared = Array.isArray(spot.multiway) ? spot.multiway : [];
    spot.multiway = line.callers.map(c => {
      const d = declared.find(m => m && (m.pos || m.position || m.seat) === c.pos) || {};
      return { pos: c.pos, type: d.type || d.profile || "Reg", amount: c.amount, action: "CALL", label: d.label || "Call" };
    });
  } else if (Array.isArray(spot.multiway)) {
    /* Un caller déclaré que la ligne n'a pas pu placer (il parlait AVANT
       l'ouvreur) n'a rien à faire sur la table : il peindrait des jetons que le
       pot ne contient pas. */
    delete spot.multiway;
  }
  return spot;
}
