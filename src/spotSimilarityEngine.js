/* ══════════════════════════════════════════════════════════════════════════
   spotSimilarityEngine.js — SPOT SIMILARITY ENGINE (Mission Master §51-52)

   À partir d'une VRAIE main (Replayer / HH), génère des spots SIMILAIRES pour
   l'entraînement. Certaines variables sont VERROUILLÉES (identiques à la main de
   référence), d'autres sont MODIFIÉES pour créer de la variété pédagogique.

   §51 — verrouillables : positions, type de pot, street, action history.
         modifiables    : board, main Héro, stack, sizing, profil Villain, ICM,
                          phase de tournoi.
   §52 — buildSimilarSession : 5 spots très proches · 5 similaires ·
         5 variantes conceptuelles · 5 plus difficiles.

   Sortie = descripteurs de main compatibles `createTrainingSpotFromHand`.
   Module PUR (aucune dépendance React/DOM).
   ══════════════════════════════════════════════════════════════════════════ */

const RANKS = "23456789TJQKA".split("");
const SUITS = ["♠", "♥", "♦", "♣"];
const STREET_BOARD = { preflop: 0, flop: 3, turn: 4, river: 5 };
const STACK_PRESETS = [5, 10, 15, 20, 25, 30, 40, 60, 100, 150, 200];
const VILLAIN_PROFILES = ["Reg", "TAG", "LAG", "Fish", "Nit", "Calling Station", "Maniac"];
const TOURNAMENT_PHASES = ["Toutes", "Early Game", "Middle Game", "Late Game", "Bubble", "ITM", "Table Finale"];

/* Champs verrouillables (§51). */
export const LOCKABLE_VARS = ["heroPosition", "villainPosition", "potType", "street", "actionHistory"];
/* Champs modifiables (§51). */
export const VARIABLE_VARS = ["board", "heroHand", "stack", "sizing", "villainProfile", "icm", "phase"];

/* Presets de verrou/variation par mode (§52). */
const MODE_PRESETS = {
  near:       { vary: ["board", "heroHand"], stackSpread: 0 },
  similar:    { vary: ["board", "heroHand", "stack", "villainProfile"], stackSpread: 1 },
  conceptual: { vary: ["board", "heroHand", "stack", "villainProfile", "sizing", "phase"], stackSpread: 2 },
  harder:     { vary: ["board", "heroHand", "stack", "villainProfile", "sizing"], stackSpread: 2, harder: true },
};

function pick(random, arr) { return arr[Math.floor(random() * arr.length) % arr.length]; }
function nearestPresetIndex(v) {
  let bi = 0;
  for (let i = 1; i < STACK_PRESETS.length; i++) if (Math.abs(STACK_PRESETS[i] - v) < Math.abs(STACK_PRESETS[bi] - v)) bi = i;
  return bi;
}
function streetKey(s) { return String(s || "preflop").toLowerCase(); }

/* Tire `n` cartes distinctes en excluant `blocked` (cartes {r,s}). */
function dealCards(random, n, blocked = []) {
  const used = new Set(blocked.filter(Boolean).map((c) => `${c.r}${c.s}`));
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 400) {
    const c = { r: pick(random, RANKS), s: pick(random, SUITS) };
    const key = `${c.r}${c.s}`;
    if (used.has(key)) continue;
    used.add(key); out.push(c);
  }
  return out;
}

/* Extrait le type de pot de la référence (single/3bet/limped…) — heuristique
   sur toCall / actionHistory ; sert de variable verrouillable "potType". */
export function derivePotType(ref = {}) {
  if (ref.potType) return ref.potType;
  const hist = Array.isArray(ref.actionHistory) ? ref.actionHistory : [];
  const raises = hist.filter((a) => /3BET|4BET|RAISE/i.test(a.actionType || a.action || "")).length;
  if (raises >= 3) return "4bet";
  if (raises >= 2) return "3bet";
  if (raises >= 1) return "single-raised";
  return "limped";
}

/* ──────────────────────────────────────────────────────────────────────────
   generateSimilarSpots — produit `count` descripteurs similaires à `reference`.
   opts : { count, mode, lock, vary, random }
   - `lock` / `vary` explicites priment sur les presets du mode.
   ────────────────────────────────────────────────────────────────────────── */
export function generateSimilarSpots(reference = {}, opts = {}) {
  const random = opts.random || Math.random;
  const mode = MODE_PRESETS[opts.mode] ? opts.mode : "similar";
  const preset = MODE_PRESETS[mode];
  const count = Math.max(1, Number(opts.count) || 5);

  // Champs à faire varier = preset ∪ vary explicite, moins ce qui est verrouillé.
  const explicitLock = new Set(opts.lock || []);
  const varySet = new Set([...(preset.vary || []), ...(opts.vary || [])].filter((v) => !explicitLock.has(v)));

  const street = streetKey(reference.street);
  const boardLen = STREET_BOARD[street] ?? 0;
  const refStack = Number(reference.stack || reference.stackDepth || 40);
  const potType = derivePotType(reference);

  const out = [];
  for (let i = 0; i < count; i++) {
    const heroHand = varySet.has("heroHand") ? dealCards(random, 2) : (reference.hand || reference.heroHand || dealCards(random, 2));
    const board = boardLen === 0 ? [] :
      varySet.has("board") ? dealCards(random, boardLen, heroHand)
      : (Array.isArray(reference.board) ? reference.board.slice(0, boardLen) : dealCards(random, boardLen, heroHand));

    // Stack : proche (spread 0) → identique/preset voisin ; sinon fenêtre élargie.
    let stack = refStack;
    if (varySet.has("stack")) {
      const bi = nearestPresetIndex(refStack);
      const spread = preset.stackSpread || 0;
      const lo = Math.max(0, bi - spread), hi = Math.min(STACK_PRESETS.length - 1, bi + spread);
      stack = STACK_PRESETS[lo + Math.floor(random() * (hi - lo + 1))];
    }

    const vtype = varySet.has("villainProfile") ? pick(random, VILLAIN_PROFILES) : (reference.vtype || reference.villainProfile || "Reg");
    const phase = varySet.has("phase") ? pick(random, TOURNAMENT_PHASES) : (reference.phase || reference.tournamentPhase || "Toutes");

    // Sizing : variation du toCall/pot (± pour "harder" → décisions plus serrées).
    let toCall = Number(reference.toCall || 0);
    let pot = Number(reference.pot || (toCall > 0 ? toCall * 2 + 1.5 : 1.5));
    if (varySet.has("sizing") && toCall > 0) {
      const f = preset.harder ? (0.9 + random() * 0.5) : (0.8 + random() * 0.6);
      toCall = Math.round(toCall * f * 2) / 2;
      pot = Math.round(pot * f * 2) / 2;
    }

    out.push({
      // ── verrouillé (§51) ──
      heroPos: reference.heroPos || reference.heroPosition || "BTN",
      villainPos: reference.villainPos || reference.villainPosition || "BB",
      street: reference.street || "Preflop",
      actionHistory: reference.actionHistory || [],
      potType,
      // ── modifié (§51) ──
      hand: heroHand,
      board,
      stack,
      toCall,
      pot,
      vtype,
      phase,
      icm: varySet.has("icm") ? pick(random, ["Désactivée", "Faible", "Moyenne", "Forte"]) : (reference.icm || "Désactivée"),
      format: reference.format || reference.fmt || "Imported Hand",
      // ── métadonnées de traçabilité ──
      id: `similar_${mode}_${i}_${Math.floor(random() * 1e9)}`,
      _variantOf: reference.id || reference.handId || null,
      _mode: mode,
      _difficulty: preset.harder ? "harder" : mode,
    });
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   buildSimilarSession (§52) — 4 familles × `perGroup` spots depuis une main :
   très proches · similaires · conceptuels · plus difficiles.
   ────────────────────────────────────────────────────────────────────────── */
export function buildSimilarSession(reference = {}, { perGroup = 5, random = Math.random } = {}) {
  const groups = ["near", "similar", "conceptual", "harder"];
  const spots = [];
  for (const mode of groups) {
    spots.push(...generateSimilarSpots(reference, { count: perGroup, mode, random }));
  }
  return spots;
}
