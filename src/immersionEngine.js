/* ══════════════════════════════════════════════════════════════════════════
   immersionEngine.js — IMMERSION ENGINE + ANIMATION QUEUE
   (Mission Master §30, §61-64, Phase 9)

   Sépare la LOGIQUE POKER de l'ANIMATION (§30) :
     GAME EVENT → IMMERSION EVENT → ANIMATION → RENDERER UPDATE

   Ce module est PUR (aucune dépendance React/DOM). Il fournit :
   1. la TRADUCTION d'un état de jeu / d'actions en séquence d'événements
      d'animation ordonnés (§31-38, §62) ;
   2. une AnimationQueue par table (§64), exécutée dans l'ordre (§62),
      interruptible (§63), avec timeout de sécurité (§61) — une animation qui
      échoue ne bloque JAMAIS le GameState ni « Main suivante ».

   L'exécuteur concret (DOM/CSS) est injecté via `run(event)` : le moteur ne
   sait pas DESSINER, il sait ORDONNER. Le rendu adopte la queue à son rythme.
   ══════════════════════════════════════════════════════════════════════════ */

/* Types d'événements d'animation (§62). */
export const ANIM = Object.freeze({
  POST_BLIND: "POST_BLIND",
  DEAL_HERO: "DEAL_HERO",
  DEAL_FLOP: "DEAL_FLOP",
  DEAL_TURN: "DEAL_TURN",
  DEAL_RIVER: "DEAL_RIVER",
  BET: "BET",
  CALL: "CALL",
  RAISE: "RAISE",
  CHECK: "CHECK",
  FOLD: "FOLD",
  MOVE_BETS_TO_POT: "MOVE_BETS_TO_POT",
  SHOWDOWN: "SHOWDOWN",
  POT_TO_WINNER: "POT_TO_WINNER",
});

/* Vitesses (§39). Défaut NORMAL. */
export const ANIM_SPEED = Object.freeze({
  FAST: 0.5,
  NORMAL: 1,
  IMMERSIVE: 1.6,
});

/* Durées de base (ms) par type — mises à l'échelle par la vitesse. */
export const BASE_DURATION = Object.freeze({
  POST_BLIND: 160,
  DEAL_HERO: 220,
  DEAL_FLOP: 380,
  DEAL_TURN: 240,
  DEAL_RIVER: 240,
  BET: 220,
  CALL: 220,
  RAISE: 240,
  CHECK: 140,
  FOLD: 160,
  MOVE_BETS_TO_POT: 300,
  SHOWDOWN: 400,
  POT_TO_WINNER: 380,
});

const BLIND_ORDER = ["SB", "BB"];

function ev(type, payload = {}) {
  return { type, duration: BASE_DURATION[type] || 200, ...payload };
}

/* Mappe un type d'action poker → type d'événement d'animation. */
function actionAnim(actionType) {
  const t = String(actionType || "").toUpperCase();
  if (t === "FOLD") return ANIM.FOLD;
  if (t === "CHECK" || t === "CHECK_BACK") return ANIM.CHECK;
  if (t === "CALL") return ANIM.CALL;
  if (t === "BET" || t === "OPEN" || t === "BET33" || t === "BET50" || t === "BET75" || t === "BET100" || t === "PROBE" || t === "DONK") return ANIM.BET;
  return ANIM.RAISE; // RAISE/3BET/4BET/5BET/ALLIN…
}

const DEAL_BY_STREET = { flop: ANIM.DEAL_FLOP, turn: ANIM.DEAL_TURN, river: ANIM.DEAL_RIVER };
const STREET_RANK = { preflop: 0, flop: 1, turn: 2, river: 3 };

/* ──────────────────────────────────────────────────────────────────────────
   buildSpotIntroSequence — séquence d'ouverture immersive d'un spot (§71) :
   post des blindes → distribution Héro → rejeu de l'historique d'action →
   collecte → distribution du board jusqu'à la street courante.

   Accepte un spot legacy OU son `schema` §26 (actionHistory, board, street…).
   ────────────────────────────────────────────────────────────────────────── */
export function buildSpotIntroSequence(spot = {}, { immersive = true } = {}) {
  const schema = spot.schema || null;
  const street = String((schema?.street || spot.street || "Preflop")).toLowerCase();
  const actionHistory = schema?.actionHistory || spot.ctx?.preActions || [];
  const blinds = schema?.blinds || { sb: 0.5, bb: 1 };
  const seq = [];

  // 1. Blindes (§31)
  if (immersive) {
    seq.push(ev(ANIM.POST_BLIND, { position: "SB", amount: blinds.sb }));
    seq.push(ev(ANIM.POST_BLIND, { position: "BB", amount: blinds.bb }));
  }
  // 2. Cartes Héro (§37)
  seq.push(ev(ANIM.DEAL_HERO, { hand: schema?.hero?.hand || spot.hand || [] }));

  // 3. Rejeu de l'action préflop (§38 — actions Villain visibles)
  for (const a of actionHistory) {
    const type = actionAnim(a.actionType);
    if (type === ANIM.FOLD) continue; // les folds ne déplacent pas de jetons
    seq.push(ev(type, { position: a.position, amount: a.amountBb, potAfter: a.potAfterAction }));
  }

  // 4. Distribution du board jusqu'à la street courante (§34-36)
  const rank = STREET_RANK[street] ?? 0;
  if (rank >= 1) {
    if (actionHistory.length) seq.push(ev(ANIM.MOVE_BETS_TO_POT));
    seq.push(ev(ANIM.DEAL_FLOP, { cards: (schema?.board || spot.board || []).slice(0, 3) }));
  }
  if (rank >= 2) seq.push(ev(ANIM.DEAL_TURN, { cards: (schema?.board || spot.board || []).slice(3, 4) }));
  if (rank >= 3) seq.push(ev(ANIM.DEAL_RIVER, { cards: (schema?.board || spot.board || []).slice(4, 5) }));

  return seq;
}

/* Séquence pour UNE action (Héro ou Villain) — §32. */
export function buildActionSequence(action = {}, { closesRound = false } = {}) {
  const type = actionAnim(action.actionType);
  const seq = [ev(type, { position: action.position, amount: action.amountBb ?? action.displayAmount, playerId: action.playerId })];
  if (closesRound) seq.push(ev(ANIM.MOVE_BETS_TO_POT));
  return seq;
}

/* Séquence de changement de street (§34-36) : collecte → distribution carte. */
export function buildStreetChangeSequence(toStreet, board = []) {
  const s = String(toStreet || "").toLowerCase();
  const dealType = DEAL_BY_STREET[s];
  if (!dealType) return [];
  const seq = [ev(ANIM.MOVE_BETS_TO_POT)];
  const cards = s === "flop" ? board.slice(0, 3) : s === "turn" ? board.slice(3, 4) : board.slice(4, 5);
  seq.push(ev(dealType, { cards }));
  return seq;
}

/* Séquence de fin de main (§34, §46) : collecte finale → showdown → gain. */
export function buildShowdownSequence({ winner = null } = {}) {
  return [ev(ANIM.MOVE_BETS_TO_POT), ev(ANIM.SHOWDOWN), ev(ANIM.POT_TO_WINNER, { winner })];
}

/* ──────────────────────────────────────────────────────────────────────────
   createAnimationQueue — file d'animation INDÉPENDANTE par table (§64).
   Exécute les événements dans l'ordre (§62). Chaque table a sa propre instance ;
   la Table 1 n'attend jamais la Table 2.

   Options :
     tableId    : identifiant (debug §65)
     run(event) : exécuteur concret → Promise|void (DOM/CSS injecté par le rendu)
     speed      : "FAST" | "NORMAL" | "IMMERSIVE" (§39)
     safetyMs   : marge de timeout ajoutée à la durée (§61) — si run() traîne,
                  on poursuit sans bloquer
     delay(ms)  : temporisateur injectable (Promise) — testable sans vrais timers
     onError    : callback (event, err) — journalisé, jamais bloquant
   ────────────────────────────────────────────────────────────────────────── */
export function createAnimationQueue({
  tableId = null,
  run = () => {},
  speed = "NORMAL",
  safetyMs = 1200,
  delay = (ms) => new Promise((r) => setTimeout(r, ms)),
  onError = null,
} = {}) {
  let scale = ANIM_SPEED[speed] ?? 1;
  let queue = [];
  let running = false;
  let cancelled = false;
  let generation = 0; // incrémenté à chaque cancel → invalide la boucle en cours

  function setSpeed(next) { scale = ANIM_SPEED[next] ?? scale; }

  async function pump() {
    if (running) return;
    running = true;
    const myGen = generation;
    try {
      while (queue.length && !cancelled && myGen === generation) {
        const event = queue.shift();
        const dur = Math.max(0, Math.round((event.duration || 0) * scale));
        try {
          // Course entre l'exécuteur concret et un timeout de sécurité (§61).
          await Promise.race([
            Promise.resolve().then(() => run(event, { scale, duration: dur, tableId })),
            delay(dur + safetyMs).then(() => "TIMEOUT"),
          ]);
        } catch (err) {
          if (onError) { try { onError(event, err); } catch {} }
          // On NE bloque pas : l'événement suivant s'exécute quand même.
        }
        // Respire la durée nominale (rythme visuel) si run() a rendu la main tôt.
        if (dur > 0 && myGen === generation && !cancelled) await delay(dur);
      }
    } finally {
      running = false;
    }
  }

  return {
    tableId,
    /* Ajoute des événements et démarre l'exécution (idempotent). */
    enqueue(events) {
      const arr = Array.isArray(events) ? events : [events];
      queue.push(...arr.filter(Boolean));
      cancelled = false;
      // Lance sans attendre : la queue est asynchrone (§61 — jamais bloquant).
      pump();
      return this;
    },
    /* Interrompt TOUTE animation en cours et vide la file (§63).
       Utilisé quand l'utilisateur clique « Main suivante » pendant une anim. */
    cancel() {
      cancelled = true;
      generation += 1; // invalide la boucle pump() courante
      queue = [];
      return this;
    },
    setSpeed,
    get pending() { return queue.length; },
    get isRunning() { return running; },
  };
}

/* Gestionnaire multi-table (§64) : une AnimationQueue par tableId, indépendantes. */
export function createImmersionController(defaults = {}) {
  const queues = new Map();
  function get(tableId) {
    if (!queues.has(tableId)) queues.set(tableId, createAnimationQueue({ ...defaults, tableId }));
    return queues.get(tableId);
  }
  return {
    queue: get,
    enqueue(tableId, events) { return get(tableId).enqueue(events); },
    cancel(tableId) { if (queues.has(tableId)) queues.get(tableId).cancel(); },
    cancelAll() { for (const q of queues.values()) q.cancel(); },
    setSpeed(speed) { for (const q of queues.values()) q.setSpeed(speed); defaults.speed = speed; },
    remove(tableId) { if (queues.has(tableId)) { queues.get(tableId).cancel(); queues.delete(tableId); } },
    get size() { return queues.size; },
  };
}
