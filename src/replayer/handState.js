/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : HANDSTATE NORMALISÉ (§6)

   Structure interne INDÉPENDANTE de la room d'origine, seule forme
   acceptée par l'orchestration d'analyse (solveur puis IA).

   Principe : ce module ne fabrique AUCUNE donnée stratégique. Il
   traduit fidèlement le NormalizedHand du parser en un objet compact,
   stable et validable — rien de plus.

   Module PUR (aucune dépendance React/DOM) → testable en Node.
═══════════════════════════════════════════════════════════════ */

const rb = v => Math.round(v * 100) / 100;
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* Le parser stocke les couleurs en symboles (♠♥♦♣) ; la forme normalisée les
   exprime en lettres ASCII — c'est ce que lisent le solveur, le backend et tout
   moteur d'équité. */
const SUIT_ASCII = { "♠": "s", "♥": "h", "♦": "d", "♣": "c", s: "s", h: "h", d: "d", c: "c" };

/* Carte du modèle interne { r, s } → notation compacte "Ah". */
export function cardStr(c) {
  if (!c) return null;
  if (typeof c === "string") {
    const su = SUIT_ASCII[c[c.length - 1]];
    return su ? c.slice(0, -1) + su : c;
  }
  const su = SUIT_ASCII[c.s];
  return su ? `${c.r}${su}` : null;
}
const cardsStr = list => (Array.isArray(list) ? list.map(cardStr).filter(Boolean) : []);

/* Familles d'actions transmises au backend (vocabulaire fermé §23). */
export const HS_ACTIONS = ["post", "fold", "check", "call", "bet", "raise", "allin", "deal", "showdown", "end"];
const BETTING_TYPES = ["fold", "check", "call", "bet", "raise", "allin"];
function hsActionType(type) {
  switch (type) {
    case "post-sb": case "post-bb": case "post-ante": return "post";
    case "deal-hole": case "deal-flop": case "deal-turn": case "deal-river": return "deal";
    case "fold": case "check": case "call": case "bet": case "raise": case "allin":
    case "showdown": case "end": return type;
    default: return null;
  }
}

/**
 * NormalizedHand (handModel.js) → HandState (§6).
 * Toutes les valeurs monétaires sont EN BIG BLINDS (le parser convertit déjà).
 *
 * @param {object} hand main normalisée (valid:true)
 * @param {object} [opts] { includeActions:boolean }
 * @returns {object|null}
 */
export function buildHandState(hand, opts = {}) {
  if (!hand || !hand.valid || !Array.isArray(hand.events)) return null;
  const players = hand.players || [];
  const hero = players.find(p => p.isHero) || null;

  // Le board complet vient des événements de deal (le champ `board` du parser
  // peut rester partiel sur les mains sans showdown).
  const flop = [], turn = [], river = [];
  for (const e of hand.events) {
    if (e.type === "deal-flop") flop.push(...cardsStr(e.cards));
    else if (e.type === "deal-turn") turn.push(...cardsStr(e.cards));
    else if (e.type === "deal-river") river.push(...cardsStr(e.cards));
  }

  const actions = [];
  if (opts.includeActions !== false) {
    hand.events.forEach((e, i) => {
      const type = hsActionType(e.type);
      if (!type || type === "deal") return;                 // les deals sont portés par `board`
      const p = players.find(x => x.id === e.playerId);
      actions.push({
        step: i,
        street: e.street || "preflop",
        position: p ? p.pos : null,
        isHero: !!(p && p.isHero),
        action: type,
        amountBB: e.amount != null ? rb(e.amount) : null,
        label: e.label || null,
      });
    });
  }

  // Pot final = somme des investissements (hors retours non payés).
  let potBB = 0;
  for (const e of hand.events) {
    if (["post-sb", "post-bb", "post-ante", "call", "bet", "raise", "allin"].includes(e.type)) potBB += e.amount || 0;
    else if (e.type === "uncalled-return") potBB -= e.amount || 0;
  }

  return {
    handId: String(hand.handId || hand.id || ""),
    site: hand.room || hand.site || "Inconnu",
    format: hand.gameType === "mtt" ? "MTT" : "Cash",
    game: "NLHE",
    tableSize: players.length,
    hero: hero
      ? {
          position: hero.pos || "?",
          cards: cardsStr(hero.hole),
          stackBB: rb(hero.stackStart ?? 0),
          seat: hero.seat ?? null,
        }
      : null,
    players: players.map(p => ({
      position: p.pos || "?",
      stackBB: rb(p.stackStart ?? 0),
      isHero: !!p.isHero,
      seat: p.seat ?? null,
    })),
    blinds: {
      sb: rb(hand.blinds?.sb ?? 0.5),
      bb: rb(hand.blinds?.bb ?? 1),
      ante: rb(hand.blinds?.ante ?? 0),
    },
    board: {
      flop: flop.length ? flop : null,
      turn: turn.length ? turn[0] : null,
      river: river.length ? river[0] : null,
    },
    actions,
    potBB: rb(Math.max(0, potBB)),
    resultBB: typeof hand.resultBb === "number" ? rb(hand.resultBb) : null,
    /* Une street est « jouée » si elle porte une action de mise ou son deal —
       l'événement de fin de main est rattaché à la dernière street et ne suffit
       donc pas à la considérer comme jouée. */
    streetsPlayed: ["preflop", "flop", "turn", "river"].filter(s => hand.events.some(
      e => e.street === s && (BETTING_TYPES.includes(e.type) || e.type === `deal-${s}`))),
  };
}

/* Street atteinte par le HandState (dernière street réellement jouée). */
export function lastStreetOf(hs) {
  if (!hs) return "preflop";
  return hs.streetsPlayed?.[hs.streetsPlayed.length - 1] || "preflop";
}

/* Libellé lisible d'un spot ("BB vs BTN · SRP · flop"). */
export function spotLabel(hs) {
  if (!hs) return "";
  const heroPos = hs.hero?.position || "?";
  const vil = (hs.actions || []).find(a => !a.isHero && ["bet", "raise", "allin"].includes(a.action));
  const vilPos = vil?.position || (hs.players || []).find(p => !p.isHero)?.position || "?";
  return `${heroPos} vs ${vilPos} · ${cap(lastStreetOf(hs))}`;
}

const CARD_RE = /^(?:10|[2-9TJQKA])[shdc]$/;
const POS_RE = /^(?:UTG|UTG\+1|UTG\+2|MP|MP\+1|HJ|LJ|CO|BTN|SB|BB|\?)$/;

/**
 * Validation stricte (§23) — utilisée côté frontend ET répliquée côté backend.
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateHandState(hs) {
  const errors = [];
  const isNum = v => typeof v === "number" && Number.isFinite(v);
  if (!hs || typeof hs !== "object") return { valid: false, errors: ["handState absent"] };
  if (!hs.handId || String(hs.handId).length > 80) errors.push("handId invalide");
  if (!hs.site || String(hs.site).length > 40) errors.push("site invalide");
  if (!["MTT", "Cash"].includes(hs.format)) errors.push("format invalide");
  if (!isNum(hs.tableSize) || hs.tableSize < 2 || hs.tableSize > 10) errors.push("tableSize hors bornes (2-10)");
  if (!hs.hero) errors.push("hero absent");
  else {
    if (!POS_RE.test(String(hs.hero.position))) errors.push("position Hero invalide");
    if (!Array.isArray(hs.hero.cards) || hs.hero.cards.length > 2) errors.push("cartes Hero invalides");
    else if (hs.hero.cards.some(c => !CARD_RE.test(String(c)))) errors.push("format de carte Hero invalide");
    if (!isNum(hs.hero.stackBB) || hs.hero.stackBB < 0 || hs.hero.stackBB > 100000) errors.push("stack Hero hors bornes");
  }
  if (!Array.isArray(hs.players) || hs.players.length < 2 || hs.players.length > 10) errors.push("players hors bornes");
  if (!Array.isArray(hs.actions)) errors.push("actions absentes");
  else if (hs.actions.length > 400) errors.push("trop d'actions (max 400)");
  else if (hs.actions.some(a => !HS_ACTIONS.includes(a.action))) errors.push("type d'action inconnu");
  const b = hs.board || {};
  const boardCards = [...(b.flop || []), b.turn, b.river].filter(Boolean);
  if (boardCards.length > 5) errors.push("board > 5 cartes");
  if (boardCards.some(c => !CARD_RE.test(String(c)))) errors.push("format de carte board invalide");
  if (b.flop && b.flop.length !== 3) errors.push("flop incomplet");
  if (b.turn && !b.flop) errors.push("turn sans flop");
  if (b.river && !b.turn) errors.push("river sans turn");
  if (!isNum(hs.potBB) || hs.potBB < 0) errors.push("pot invalide");
  // Doublons de cartes (main + board)
  const all = [...(hs.hero?.cards || []), ...boardCards].map(String);
  if (new Set(all).size !== all.length) errors.push("cartes dupliquées");
  return { valid: errors.length === 0, errors };
}
