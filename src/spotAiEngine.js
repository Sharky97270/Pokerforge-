import {
  normalizeTrainerActionEvent,
  parseTrainerBb,
  validateSpotConsistency,
} from "./trainerActionEvent.js";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

export const ADAPTIVE_MODE_OPTIONS = [
  { id: "balanced", label: "Equilibre", hint: "Melange sain entre fondamentaux, leaks et revision." },
  { id: "leak-hunter", label: "Leak Hunter", hint: "Surpondere les positions, streets et actions ratees." },
  { id: "tournament-prep", label: "Preparation tournoi", hint: "MTT, KO/PKO, ICM, 15-30bb, blind vs blind." },
  { id: "intensive", label: "Challenge intensif", hint: "Spots difficiles et decisions proches." },
  { id: "review-errors", label: "Revision erreurs", hint: "Rejoue les familles qui coutent le plus d'EV." },
  { id: "mental-focus", label: "Focus mental", hint: "Rythme stable, spots propres, variance reduite." },
];

const VILLAIN_AI_PROFILES = {
  Nit: {
    name: "Nit",
    vpip: 14,
    pfr: 10,
    agg: 1.2,
    bluff: 8,
    call: 28,
    fold: 72,
    tendency: "Range serree, value forte, bluff rare.",
    exploit: "Value plus thin, reduis les hero calls river, vole ses blinds.",
  },
  TAG: {
    name: "TAG",
    vpip: 22,
    pfr: 18,
    agg: 2.8,
    bluff: 22,
    call: 45,
    fold: 55,
    tendency: "Solide, agressif controle, proche theorie.",
    exploit: "Reste equilibre, attaque surtout les ranges cappees.",
  },
  LAG: {
    name: "LAG",
    vpip: 35,
    pfr: 28,
    agg: 3.8,
    bluff: 36,
    call: 48,
    fold: 48,
    tendency: "Open large, 3-bet frequent, barrels plus nombreux.",
    exploit: "Value plus fort, bluffcatch mieux les bons bloqueurs.",
  },
  Reg: {
    name: "Reg",
    vpip: 25,
    pfr: 20,
    agg: 3,
    bluff: 24,
    call: 43,
    fold: 54,
    tendency: "Equilibre, sizings coherents, adaptation legere.",
    exploit: "Cherche les deviations de population plutot qu'un read isole.",
  },
  Fish: {
    name: "Fish",
    vpip: 55,
    pfr: 12,
    agg: 1.2,
    bluff: 12,
    call: 72,
    fold: 32,
    tendency: "Call trop souvent, sizings irreguliers, limp possible.",
    exploit: "Value epaisse, bluffs reduits, iso plus cher preflop.",
  },
  "Calling Station": {
    name: "Calling Station",
    vpip: 48,
    pfr: 9,
    agg: 0.8,
    bluff: 6,
    call: 80,
    fold: 24,
    tendency: "Fold tres peu, bluff peu, call trop large.",
    exploit: "Value large et peu de bluffs, surtout river.",
  },
  Maniac: {
    name: "Maniac",
    vpip: 62,
    pfr: 42,
    agg: 5.2,
    bluff: 48,
    call: 55,
    fold: 36,
    tendency: "Overbluff, overbet, shove plus souvent.",
    exploit: "Piege avec value, call down plus large sur bons bloqueurs.",
  },
  GTO: {
    name: "GTO",
    vpip: 24,
    pfr: 19,
    agg: 3,
    bluff: 25,
    call: 45,
    fold: 52,
    tendency: "Ranges et frequences theoriques.",
    exploit: "Ne devie que si le spot fournit une information fiable.",
  },
  "Field low stakes": {
    name: "Field low stakes",
    vpip: 42,
    pfr: 18,
    agg: 1.7,
    bluff: 13,
    call: 68,
    fold: 34,
    tendency: "Trop de limp/call, sous-bluff river, sizings irreguliers.",
    exploit: "Iso plus cher, value plus thin, moins de bluffs multi-street.",
  },
  "Field mid stakes": {
    name: "Field mid stakes",
    vpip: 29,
    pfr: 22,
    agg: 3.2,
    bluff: 26,
    call: 46,
    fold: 51,
    tendency: "Sizings plus coherents, 3-bet structure, c-bet equilibre.",
    exploit: "Choisis des bluffs avec bloqueurs et respecte les ranges fortes.",
  },
};

const POPULATION_MODELS = {
  standard: {
    id: "standard",
    name: "Field regulier",
    format: "Mix",
    tendencies: ["sizings coherents", "fold/call proche theorie"],
    modifiers: { call: 0, fold: 0, bluff: 0, threeBet: 0, limp: 0 },
  },
  "winamax-low": {
    id: "winamax-low",
    name: "Field Winamax micro/low stakes",
    format: "MTT",
    tendencies: ["trop de call preflop", "trop de limp", "moins de bluff river"],
    modifiers: { call: 16, fold: -12, bluff: -9, threeBet: -3, limp: 10 },
  },
  "winamax-mid": {
    id: "winamax-mid",
    name: "Field Winamax mid stakes",
    format: "MTT",
    tendencies: ["3-bet plus structure", "pression bulle plus elevee"],
    modifiers: { call: 4, fold: 2, bluff: 4, threeBet: 6, limp: -4 },
  },
  "mtt-ko": {
    id: "mtt-ko",
    name: "Field MTT KO",
    format: "KO/PKO",
    tendencies: ["calls plus larges si bounty", "reshove plus frequent"],
    modifiers: { call: 14, fold: -8, bluff: -4, threeBet: 5, limp: 0 },
  },
  "pko-aggressive": {
    id: "pko-aggressive",
    name: "Field PKO agressif",
    format: "PKO",
    tendencies: ["pression bounty", "jam et reshove plus frequents"],
    modifiers: { call: 10, fold: -6, bluff: 3, threeBet: 8, limp: -2 },
  },
  recreational: {
    id: "recreational",
    name: "Field recreatif",
    format: "Mix",
    tendencies: ["overcall", "underbluff", "limp frequent"],
    modifiers: { call: 20, fold: -15, bluff: -10, threeBet: -5, limp: 12 },
  },
  gto: {
    id: "gto",
    name: "Field GTO",
    format: "GTO",
    tendencies: ["frequences propres", "sizings theoriques"],
    modifiers: { call: 0, fold: 0, bluff: 0, threeBet: 0, limp: -8 },
  },
  exploit: {
    id: "exploit",
    name: "Field exploit",
    format: "Exploit",
    tendencies: ["deviations assumees", "punition des leaks adverses"],
    modifiers: { call: 8, fold: -3, bluff: 6, threeBet: 7, limp: 2 },
  },
};

function rndInt(random, lo, hi) {
  return lo + Math.floor(random() * (hi - lo + 1));
}

function pick(random, items) {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function weightedPick(random, items, weightFn) {
  const rows = items.map((item) => ({ item, weight: Math.max(0.1, Number(weightFn(item)) || 1) }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let cursor = random() * total;
  for (const row of rows) {
    cursor -= row.weight;
    if (cursor <= 0) return row.item;
  }
  return rows[rows.length - 1]?.item;
}

function makeDeck() {
  return RANKS.flatMap((r) => SUITS.map((s) => ({ r, s })));
}

function drawCards(random, count, blocked = []) {
  const used = new Set(blocked.map((c) => `${c.r}${c.s}`));
  const deck = makeDeck().filter((c) => !used.has(`${c.r}${c.s}`));
  const out = [];
  while (out.length < count && deck.length) {
    const idx = Math.floor(random() * deck.length);
    out.push(deck.splice(idx, 1)[0]);
  }
  return out;
}

function handStrength(hand) {
  const [a, b] = hand || [];
  if (!a || !b) return 0;
  const i = RANKS.indexOf(a.r);
  const j = RANKS.indexOf(b.r);
  const hi = Math.min(i, j);
  const lo = Math.max(i, j);
  const pair = a.r === b.r;
  const suited = a.s === b.s;
  const gap = lo - hi;
  if (pair && hi <= 2) return 6;
  if (pair && hi <= 5) return 5;
  if (hi === 0 && lo <= 2) return suited ? 6 : 5;
  if (pair) return 4;
  if (hi <= 2 && lo <= 4) return suited ? 5 : 4;
  if (hi <= 3 && suited && gap <= 3) return 4;
  if (gap <= 2 && suited && lo <= 8) return 3;
  if (hi <= 4 && lo <= 6) return 3;
  if (suited && gap <= 3) return 2;
  return hi <= 6 ? 2 : 1;
}

function boardTexture(board) {
  const cards = board || [];
  if (cards.length < 3) return "preflop";
  const suits = cards.map((c) => c.s);
  const ranks = cards.map((c) => RANKS.indexOf(c.r)).sort((a, b) => a - b);
  const paired = new Set(cards.map((c) => c.r)).size < cards.length;
  const flushy = suits.some((s) => suits.filter((x) => x === s).length >= 2);
  const connected = ranks[ranks.length - 1] - ranks[0] <= 4;
  if (flushy && connected) return "wet";
  if (flushy || connected) return "semi-wet";
  if (paired) return "paired";
  return "dry";
}

function fmtBb(n) {
  const v = Math.round(Number(n || 0) * 10) / 10;
  return `${v}bb`;
}

function cloneSpot(spot) {
  return {
    ...spot,
    hand: (spot.hand || []).map((c) => ({ ...c })),
    board: (spot.board || []).map((c) => ({ ...c })),
    acts: (spot.acts || []).map((a) => ({ ...a })),
    freq: { ...(spot.freq || {}) },
    ev: { ...(spot.ev || {}) },
    detail: (spot.detail || []).map((d) => ({ ...d })),
    leaks: [...(spot.leaks || [])],
    multiway: Array.isArray(spot.multiway) ? spot.multiway.map((p) => ({ ...p })) : spot.multiway,
    aiMeta: spot.aiMeta ? { ...spot.aiMeta, coachPrompts: [...(spot.aiMeta.coachPrompts || [])] } : spot.aiMeta,
  };
}

function normalizeProfileName(input) {
  const v = String(input || "").toLowerCase();
  if (v.includes("nit")) return "Nit";
  if (v.includes("lag")) return "LAG";
  if (v.includes("maniac")) return "Maniac";
  if (v.includes("station")) return "Calling Station";
  if (v.includes("fish") || v.includes("rec")) return "Fish";
  if (v.includes("gto")) return "GTO";
  if (v.includes("tag")) return "TAG";
  if (v.includes("mid")) return "Field mid stakes";
  if (v.includes("low") || v.includes("micro")) return "Field low stakes";
  return "Reg";
}

function resolvePopulation(filters = {}, mode = "gto", platform = "pokerstars") {
  const field = String(filters.field || "").toLowerCase();
  const fmt = String(filters.fmt || filters.fmtDetail || "").toLowerCase();
  const p = String(platform || "").toLowerCase();
  if (mode === "gto") return POPULATION_MODELS.gto;
  if (fmt.includes("pko") || fmt.includes("bounty") || field.includes("pko")) return POPULATION_MODELS["mtt-ko"];
  if (field.includes("micro") || field.includes("low")) return POPULATION_MODELS["winamax-low"];
  if (field.includes("mid")) return POPULATION_MODELS["winamax-mid"];
  if (field.includes("rec") || field.includes("recre")) return POPULATION_MODELS.recreational;
  if (p.includes("winamax")) return POPULATION_MODELS["winamax-low"];
  return mode === "exploit" ? POPULATION_MODELS.exploit : POPULATION_MODELS.standard;
}

function applyPopulationToSpot(spot, population) {
  const p = population || POPULATION_MODELS.standard;
  const out = cloneSpot(spot);
  out.populationModel = p.id;
  out.aiMeta = {
    ...(out.aiMeta || {}),
    population: p.name,
    populationTendencies: p.tendencies,
  };
  if (!out.freq) out.freq = {};
  const mod = p.modifiers || {};
  for (const action of Object.keys(out.freq)) {
    if (action === "CALL") out.freq[action] = Math.max(0, Math.min(100, out.freq[action] + (mod.call || 0)));
    if (action === "FOLD") out.freq[action] = Math.max(0, Math.min(100, out.freq[action] + (mod.fold || 0)));
    if (["RAISE", "3BET", "4BET", "5BET", "ALLIN"].includes(action)) {
      out.freq[action] = Math.max(0, Math.min(100, out.freq[action] + (mod.threeBet || 0)));
    }
  }
  if (p.id !== "gto" && p.id !== "standard") {
    out.expl = `${out.expl || ""} Population ${p.name}: ${p.tendencies.join(", ")}.`;
  }
  return out;
}

function makeAiMeta({ template, spot, profile, population, adaptiveMode, objective }) {
  const pedagogicObjective = objective || template.objective || template.tags?.[0] || "decision precision";
  const why = [
    `Template fiable: ${template.name}.`,
    `Profil vilain: ${profile.name} - ${profile.tendency}`,
    `Population: ${population.name}.`,
    adaptiveMode && adaptiveMode !== "balanced" ? `Mode adaptatif: ${adaptiveMode}.` : "Mode adaptatif equilibre.",
  ].join(" ");
  return {
    engine: "PokerForge Evolutive Spot AI",
    templateId: template.id,
    pedagogicObjective,
    why,
    adaptation: profile.exploit,
    coachPrompts: [
      "Pourquoi ce spot ?",
      "Creer un spot similaire",
      "Travailler mes erreurs",
      "Analyse mon leak",
      "Prepare-moi une session ciblee",
      "Transforme cette main en exercice",
    ],
    explanationContext: {
      street: spot.street,
      format: spot.fmt,
      tags: template.tags || [],
      difficulty: spot.diff,
    },
  };
}

function baseSpot(template, request, random) {
  const profile = request.villainProfile && request.villainProfile !== "Tous"
    ? normalizeProfileName(request.villainProfile)
    : pick(random, template.villainProfiles || ["TAG", "Reg", "Fish"]);
  const stack = request.stackDepth || pick(random, template.stackDepths || [25, 40, 60, 100]);
  const fmt = request.format || pick(random, template.formats || ["Cash 6-max", "MTT ChipEV"]);
  const hand = request.heroHand || drawCards(random, 2);
  const board = request.board || drawCards(random, template.boardCards || 0, hand);
  return { profile, stack, fmt, hand, board };
}

function makeDetails(spot, template, profile) {
  return [
    { i: "PF", t: `<strong>${template.name}</strong> - objectif: ${template.objective || template.tags?.[0] || "precision"}.` },
    { i: "AI", t: `<strong>${profile.name}</strong>: ${profile.tendency}` },
    { i: "EV", t: `<strong>${spot.best}</strong> maximise la ligne contre ce profil et ce stack.` },
  ];
}

function rfiSpot(template, request, random, hero = "BTN", villain = "BB") {
  const base = baseSpot(template, request, random);
  const s = handStrength(base.hand);
  const stack = Number(base.stack);
  const push = stack <= 25 || template.id.includes("shove") || template.id.includes("push");
  const openSize = hero === "SB" ? 3 : 2.5;
  const ok = push ? (s >= 2 ? 1 : 0) : (s >= 2 ? 1 : 0);
  const acts = push
    ? [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "ALLIN", l: `Push ${stack}bb`, s: "All-in" }]
    : [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "RAISE", l: `Open ${openSize}bb`, s: fmtBb(openSize) }, { id: "BET75", l: "Open 3bb", s: "3bb" }];
  const spot = {
    id: `ai_${template.id}_${Math.floor(random() * 1e9)}`,
    templateId: template.id,
    cat: push ? "ICM" : "RFI",
    street: "Preflop",
    fmt: base.fmt,
    hpos: request.heroPosition || hero,
    vpos: request.villainPosition || villain,
    vtype: base.profile,
    stack: `${stack}bb`,
    hand: base.hand,
    board: [],
    pot: 1.5,
    toCall: 0,
    desc: `${hero} ${stack}bb - ${push ? "Push/Fold" : "Open raise"} - ${base.hand.map((c) => c.r + c.s).join("")}`,
    acts,
    ok,
    best: acts[ok].l,
    freq: push ? { FOLD: ok === 0 ? 82 : 10, ALLIN: ok === 1 ? 90 : 18 } : { FOLD: ok === 0 ? 75 : 5, RAISE: ok === 1 ? 80 : 20, BET75: ok === 1 ? 15 : 5 },
    ev: push ? { FOLD: 0, ALLIN: ok ? 1.4 : -0.6 } : { FOLD: 0, RAISE: ok ? 0.55 : -0.25, BET75: ok ? 0.44 : -0.35 },
    expl: push ? `${hero} ${stack}bb: decision Nash push/fold controlee par template.` : `${hero} RFI: open standard si la main est dans la range.`,
    leaks: push ? ["Fold trop tight short stack", "Shove hors range sous ICM"] : ["Open hors range", "Fold une main ouvrable"],
    diff: push || s <= 2 ? 3 : 1,
  };
  const profile = VILLAIN_AI_PROFILES[base.profile] || VILLAIN_AI_PROFILES.Reg;
  spot.detail = makeDetails(spot, template, profile);
  return spot;
}

function vsOpenSpot(template, request, random, hero = "BB", villain = "BTN", squeeze = false) {
  const base = baseSpot(template, request, random);
  const s = handStrength(base.hand);
  const toCall = hero === "BB" ? 1.5 : 2.5;
  const threeBet = squeeze ? 12 : hero === "BB" ? 9 : 8.5;
  const ok = s >= 5 ? 2 : s >= 2 ? 1 : 0;
  const spot = {
    id: `ai_${template.id}_${Math.floor(random() * 1e9)}`,
    templateId: template.id,
    cat: "Vs Open",
    street: "Preflop",
    fmt: base.fmt,
    hpos: request.heroPosition || hero,
    vpos: request.villainPosition || villain,
    vtype: base.profile,
    stack: `${base.stack}bb`,
    hand: base.hand,
    board: [],
    pot: squeeze ? 6.5 : 4,
    toCall,
    multiway: squeeze ? [{ pos: "CO", type: "Reg", amount: 2.5, action: "CALL", label: "Call" }] : undefined,
    desc: `${hero} vs ${villain} open - ${squeeze ? "squeeze" : "defense"} decision`,
    acts: [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "CALL", l: "Call", s: fmtBb(toCall) }, { id: "RAISE", l: `${squeeze ? "Squeeze" : "3-bet"} ${threeBet}bb`, s: fmtBb(threeBet) }],
    ok,
    best: ok === 0 ? "Fold" : ok === 1 ? "Call" : `${squeeze ? "Squeeze" : "3-bet"} ${threeBet}bb`,
    freq: ok === 0 ? { FOLD: 75, CALL: 18, RAISE: 7 } : ok === 1 ? { FOLD: 12, CALL: 68, RAISE: 20 } : { FOLD: 4, CALL: 22, RAISE: 74 },
    ev: { FOLD: 0, CALL: ok >= 1 ? 0.45 : -0.25, RAISE: ok >= 2 ? 1.4 : -0.15 },
    expl: `${hero} face open ${villain}: defense selon pot odds, blockers et jouabilite.`,
    leaks: ["Trop folder BB", "3-bet sans bloqueurs", "Cold-call trop large OOP"],
    diff: squeeze ? 3 : 2,
  };
  const profile = VILLAIN_AI_PROFILES[base.profile] || VILLAIN_AI_PROFILES.Reg;
  spot.detail = makeDetails(spot, template, profile);
  return spot;
}

function vsThreeBetSpot(template, request, random, hero = "BTN", villain = "BB") {
  const base = baseSpot(template, request, random);
  const s = handStrength(base.hand);
  const ok = s >= 5 ? 2 : s >= 3 ? 1 : 0;
  const spot = {
    id: `ai_${template.id}_${Math.floor(random() * 1e9)}`,
    templateId: template.id,
    cat: "Vs 3-bet",
    street: "Preflop",
    fmt: base.fmt,
    hpos: request.heroPosition || hero,
    vpos: request.villainPosition || villain,
    vtype: base.profile,
    stack: `${base.stack}bb`,
    hand: base.hand,
    board: [],
    pot: 13.5,
    toCall: 6.5,
    desc: `${hero} vs 3-bet ${villain}`,
    acts: [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "CALL", l: "Call", s: "6.5bb" }, { id: "RAISE", l: "4-bet 22bb", s: "22bb" }, { id: "ALLIN", l: `5-bet Jam ${base.stack}bb`, s: "All-in" }],
    ok,
    best: ok === 0 ? "Fold" : ok === 1 ? "Call" : "4-bet 22bb",
    freq: ok === 0 ? { FOLD: 72, CALL: 20, RAISE: 6, ALLIN: 2 } : ok === 1 ? { FOLD: 18, CALL: 58, RAISE: 19, ALLIN: 5 } : { FOLD: 0, CALL: 25, RAISE: 60, ALLIN: 15 },
    ev: { FOLD: 0, CALL: ok >= 1 ? 1.1 : -0.35, RAISE: ok >= 2 ? 2.2 : -0.1, ALLIN: ok >= 2 ? 1.8 : -0.6 },
    expl: "Defense vs 3-bet: call IP avec jouabilite, 4-bet les premiums/bloqueurs.",
    leaks: ["Overfold vs 3-bet", "4-bet bluff sans bloqueur"],
    diff: 3,
  };
  const profile = VILLAIN_AI_PROFILES[base.profile] || VILLAIN_AI_PROFILES.Reg;
  spot.detail = makeDetails(spot, template, profile);
  return spot;
}

function vsFourBetSpot(template, request, random) {
  const base = baseSpot(template, request, random);
  const s = handStrength(base.hand);
  const ok = s >= 5 ? 2 : s >= 4 ? 1 : 0;
  const stack = Math.max(40, Number(base.stack));
  const spot = {
    id: `ai_${template.id}_${Math.floor(random() * 1e9)}`,
    templateId: template.id,
    cat: "Vs 4-bet",
    street: "Preflop",
    fmt: base.fmt,
    hpos: request.heroPosition || "BB",
    vpos: request.villainPosition || "BTN",
    vtype: base.profile,
    stack: `${stack}bb`,
    hand: base.hand,
    board: [],
    pot: 36,
    toCall: 18,
    desc: "BB 3-bet puis BTN 4-bet - jam/call/fold",
    acts: [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "CALL", l: "Call 18bb", s: "18bb" }, { id: "ALLIN", l: `5-bet Jam ${stack}bb`, s: "All-in" }],
    ok,
    best: ok === 0 ? "Fold" : ok === 1 ? "Call 18bb" : `5-bet Jam ${stack}bb`,
    freq: ok === 0 ? { FOLD: 74, CALL: 16, ALLIN: 10 } : ok === 1 ? { FOLD: 24, CALL: 48, ALLIN: 28 } : { FOLD: 5, CALL: 24, ALLIN: 71 },
    ev: { FOLD: 0, CALL: ok >= 1 ? 1.4 : -0.5, ALLIN: ok >= 2 ? 2.8 : -0.7 },
    expl: "Pot 4-bet: decisions polarisees, stack-off uniquement avec range robuste.",
    leaks: ["5-bet jam trop loose", "Fold une premium vs 4-bet"],
    diff: 4,
  };
  const profile = VILLAIN_AI_PROFILES[base.profile] || VILLAIN_AI_PROFILES.Reg;
  spot.detail = makeDetails(spot, template, profile);
  return spot;
}

function postflopSpot(template, request, random, street = "Flop", facing = false, kind = "cbet") {
  const base = baseSpot({ ...template, boardCards: street === "River" ? 5 : street === "Turn" ? 4 : 3 }, request, random);
  const s = handStrength(base.hand);
  const texture = boardTexture(base.board);
  const pot = street === "River" ? rndInt(random, 24, 46) : street === "Turn" ? rndInt(random, 12, 26) : rndInt(random, 5, 13);
  const bet = facing ? Math.max(1, Math.round(pot * (street === "River" ? 0.66 : 0.5) * 10) / 10) : 0;
  const ok = facing ? (s >= 4 ? 1 : 0) : (kind === "overbet" || kind === "value" ? (s >= 4 ? 2 : s >= 2 ? 1 : 0) : (texture === "dry" || s >= 3 ? 1 : 0));
  const actions = facing
    ? [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "CALL", l: "Call", s: fmtBb(bet) }, { id: "RAISE", l: street === "River" ? "Raise All-in" : `Raise ${Math.round(bet * 3)}bb`, s: street === "River" ? "All-in" : fmtBb(Math.round(bet * 3)) }]
    : kind === "overbet"
      ? [{ id: "CHECK", l: "Check", s: "0bb" }, { id: "BET50", l: "Bet 50%", s: fmtBb(pot * 0.5) }, { id: "BET100", l: "Overbet", s: fmtBb(Math.min(parseTrainerBb(base.stack), pot * 1.2)) }]
      : [{ id: "CHECK", l: "Check", s: "0bb" }, { id: "BET33", l: street === "Flop" ? "Cbet 33%" : "Bet 33%", s: fmtBb(pot * 0.33) }, { id: "BET75", l: "Bet 75%", s: fmtBb(pot * 0.75) }];
  const best = actions[ok]?.l || actions[0].l;
  const spot = {
    id: `ai_${template.id}_${Math.floor(random() * 1e9)}`,
    templateId: template.id,
    cat: street,
    street,
    fmt: base.fmt,
    hpos: request.heroPosition || (facing ? "BB" : "BTN"),
    vpos: request.villainPosition || (facing ? "BTN" : "BB"),
    vtype: base.profile,
    stack: `${base.stack}bb`,
    hand: base.hand,
    board: base.board,
    pot: facing ? pot + bet : pot,
    toCall: bet,
    desc: `${street} ${base.board.map((c) => c.r + c.s).join("")} (${texture}) - ${facing ? "facing bet" : "action hero"}`,
    acts: actions,
    ok,
    best,
    freq: facing
      ? (ok === 0 ? { FOLD: 68, CALL: 25, RAISE: 7 } : { FOLD: 25, CALL: 58, RAISE: 17 })
      : (ok === 0 ? { CHECK: 66, BET33: 25, BET75: 9, BET50: 20, BET100: 5 } : { CHECK: 16, BET33: 52, BET75: 32, BET50: 35, BET100: 20 }),
    ev: facing ? { FOLD: 0, CALL: ok ? 0.4 : -0.8, RAISE: ok && s >= 5 ? 1.1 : -0.5 } : { CHECK: ok ? 0.4 : 0.7, BET33: ok ? 1.1 : 0.2, BET75: ok ? 1.0 : 0.1, BET50: ok ? 1.2 : 0.2, BET100: ok >= 2 ? 1.8 : -0.2 },
    expl: `${street}: texture ${texture}, profil ${base.profile}, decision controlee par template ${template.name}.`,
    leaks: facing ? ["Bluffcatch trop large", "Fold trop vite vs LAG"] : ["C-bet automatique sans texture", "Missed value bet"],
    diff: street === "River" ? 4 : street === "Turn" ? 3 : 2,
  };
  const profile = VILLAIN_AI_PROFILES[base.profile] || VILLAIN_AI_PROFILES.Reg;
  spot.detail = makeDetails(spot, template, profile);
  return spot;
}

const TEMPLATE_BUILDERS = {
  "btn-open-bb-defend": (t, r, rnd) => vsOpenSpot(t, r, rnd, "BB", "BTN"),
  "co-open-btn-3bet": (t, r, rnd) => vsOpenSpot(t, r, rnd, "BTN", "CO"),
  "hj-open-co-3bet": (t, r, rnd) => vsOpenSpot(t, r, rnd, "CO", "HJ"),
  "utg-open-hj-call": (t, r, rnd) => vsOpenSpot(t, r, rnd, "HJ", "UTG"),
  "sb-open-bb-defend": (t, r, rnd) => vsOpenSpot(t, r, rnd, "BB", "SB"),
  "sb-limp-bb-iso": (t, r, rnd) => rfiSpot(t, r, rnd, "SB", "BB"),
  "btn-shove-25-bb-call": (t, r, rnd) => rfiSpot(t, { ...r, stackDepth: 25 }, rnd, "BTN", "BB"),
  "short-stack-push-fold": (t, r, rnd) => rfiSpot(t, { ...r, stackDepth: pick(rnd, [10, 12, 15, 20]) }, rnd, pick(rnd, ["BTN", "CO", "SB"]), "BB"),
  "bounty-open-shove": (t, r, rnd) => rfiSpot(t, { ...r, format: "MTT Bounty/PKO", stackDepth: pick(rnd, [15, 20, 25]) }, rnd, "BTN", "BB"),
  "bb-3bet-btn-call": (t, r, rnd) => vsThreeBetSpot(t, r, rnd, "BTN", "BB"),
  "four-bet-jam": (t, r, rnd) => vsFourBetSpot(t, r, rnd),
  "squeeze-20bb": (t, r, rnd) => vsOpenSpot(t, { ...r, stackDepth: 20 }, rnd, "BB", "CO", true),
  "srp-btn-bb-flop-cbet": (t, r, rnd) => postflopSpot(t, r, rnd, "Flop", false, "cbet"),
  "bb-checkraise-flop": (t, r, rnd) => postflopSpot(t, r, rnd, "Flop", true, "checkraise"),
  "threebet-pot-cbet-flop": (t, r, rnd) => postflopSpot({ ...t, formats: ["Cash 6-max"], stackDepths: [60, 80, 100] }, r, rnd, "Flop", false, "cbet"),
  "turn-barrel": (t, r, rnd) => postflopSpot(t, r, rnd, "Turn", false, "barrel"),
  "probe-turn": (t, r, rnd) => postflopSpot(t, { ...r, heroPosition: "BB", villainPosition: "BTN" }, rnd, "Turn", false, "probe"),
  "river-bluffcatch": (t, r, rnd) => postflopSpot(t, r, rnd, "River", true, "bluffcatch"),
  "river-overbet": (t, r, rnd) => postflopSpot(t, r, rnd, "River", false, "overbet"),
  "all-in-river": (t, r, rnd) => postflopSpot(t, r, rnd, "River", false, "overbet"),
  "thin-value-river": (t, r, rnd) => postflopSpot(t, r, rnd, "River", false, "value"),
  "missed-draw-bluff": (t, r, rnd) => postflopSpot(t, r, rnd, "River", false, "overbet"),
};

const SPOT_TEMPLATES = [
  ["btn-open-bb-defend", "BTN open / BB defend", "Preflop", "Vs Open", ["defense BB", "RFI response"], 2, 9],
  ["co-open-btn-3bet", "CO open / BTN 3bet", "Preflop", "Vs Open", ["3bet", "position"], 2, 7],
  ["hj-open-co-3bet", "HJ open / CO 3bet", "Preflop", "Vs Open", ["3bet", "HJ vs CO"], 3, 6],
  ["utg-open-hj-call", "UTG open / HJ call", "Preflop", "Vs Open", ["cold call", "tight range"], 3, 5],
  ["sb-open-bb-defend", "SB open / BB defend", "Preflop", "Vs Open", ["blind vs blind"], 2, 7],
  ["sb-limp-bb-iso", "SB limp / BB iso", "Preflop", "RFI", ["limp", "iso"], 2, 4],
  ["btn-shove-25-bb-call", "BTN shove 25bb / BB call or fold", "Preflop", "ICM", ["push fold", "25bb"], 3, 7],
  ["short-stack-push-fold", "Short stack push/fold", "Preflop", "ICM", ["10-20bb", "Nash"], 2, 8],
  ["bounty-open-shove", "Open shove KO bounty", "Preflop", "ICM", ["PKO", "bounty"], 3, 5],
  ["bb-3bet-btn-call", "BB 3bet / BTN call", "Preflop", "Vs 3-bet", ["3bet pot"], 3, 6],
  ["four-bet-jam", "4bet jam", "Preflop", "Vs 4-bet", ["4bet", "jam"], 4, 4],
  ["squeeze-20bb", "20bb squeeze spot", "Preflop", "Vs Open", ["squeeze", "multiway"], 3, 4],
  ["srp-btn-bb-flop-cbet", "SRP BTN vs BB flop cbet", "Flop", "Flop", ["cbet flop", "SRP"], 2, 8],
  ["bb-checkraise-flop", "BB check/raise flop", "Flop", "Flop", ["check raise", "OOP"], 3, 5],
  ["threebet-pot-cbet-flop", "3bet pot cbet flop", "Flop", "Flop", ["3bet pot", "cbet"], 3, 5],
  ["turn-barrel", "Turn barrel decision", "Turn", "Turn", ["barrel", "turn"], 3, 6],
  ["probe-turn", "Probe turn", "Turn", "Turn", ["probe", "OOP"], 3, 4],
  ["river-bluffcatch", "River bluffcatch", "River", "River", ["bluffcatch", "pot odds"], 4, 6],
  ["river-overbet", "River overbet spot", "River", "River", ["overbet", "polarization"], 4, 4],
  ["all-in-river", "All-in river", "River", "River", ["all-in", "SPR"], 4, 3],
  ["thin-value-river", "Value bet thin", "River", "River", ["thin value"], 3, 4],
  ["missed-draw-bluff", "Missed draw bluff", "River", "River", ["missed draw", "bluff"], 4, 3],
].map(([id, name, street, category, tags, difficulty, frequency]) => ({
  id,
  name,
  street,
  category,
  tags,
  difficulty,
  frequency,
  formats: ["Cash 6-max", "Cash 9-max", "MTT ChipEV", "MTT ICM", "MTT Bounty/PKO", "Spin & Go"],
  stackDepths: street === "Preflop" ? [10, 12, 15, 20, 25, 30, 50, 75, 100] : [25, 40, 60, 80, 100],
  streets: [street],
  actionTree: tags,
  sizings: ["33%", "50%", "75%", "pot", "all-in", "2.5bb", "3bet", "4bet"],
  objective: tags[0],
  villainProfiles: ["Nit", "TAG", "LAG", "Reg", "Fish", "Calling Station", "Maniac", "GTO", "Field low stakes", "Field mid stakes"],
}));

function mapSpotType(filters = {}, spotTypeMap = {}) {
  if (!Array.isArray(filters.spotTypes) || !filters.spotTypes.length) return null;
  return new Set(filters.spotTypes.map((t) => spotTypeMap[t] || t));
}

function spotMatchesFilters(spot, filters = {}, opts = {}) {
  if (!spot) return false;
  if (opts.onlyPreflop && !/^pre/i.test(spot.street || "")) return false;
  if (opts.onlyStreet && String(spot.street || "").toLowerCase() !== String(opts.onlyStreet).toLowerCase()) return false;
  if (filters.cat && filters.cat !== "Tous" && spot.cat !== filters.cat) return false;
  if (filters.fmt && filters.fmt !== "Tous" && spot.fmt !== filters.fmt) return false;
  if (filters.hp && filters.hp !== "Tous" && spot.hpos !== filters.hp) return false;
  if (filters.vp && filters.vp !== "Tous" && spot.vpos !== filters.vp) return false;
  if (filters.vt && filters.vt !== "Tous" && spot.vtype !== filters.vt) return false;
  if (filters.stackEff && /^\d+$/.test(String(filters.stackEff))) {
    const wanted = Number(filters.stackEff);
    const got = parseTrainerBb(spot.stack);
    if (Math.abs(got - wanted) > 0.1) return false;
  }
  const typeCats = mapSpotType(filters, opts.spotTypeMap);
  if (typeCats && !typeCats.has(spot.cat)) return false;
  if (filters.diffLvl && Number(filters.diffLvl) > 0 && Number(spot.diff || 2) > Number(filters.diffLvl)) return false;
  return true;
}

function buildLeakProfile(history = []) {
  const rows = Array.isArray(history) ? history.filter(Boolean) : [];
  const groups = { position: {}, street: {}, category: {}, format: {}, action: {}, villain: {} };
  const touch = (bucket, key, row) => {
    if (!key) return;
    const g = (groups[bucket][key] ||= { key, total: 0, err: 0, ok: 0, evLoss: 0 });
    g.total += 1;
    if (row.result === "ok" || row.correct === true) g.ok += 1;
    if (row.result === "err" || row.correct === false) {
      g.err += 1;
      g.evLoss += Math.abs(Number(row.evLoss) || 0);
    }
  };
  rows.forEach((row) => {
    touch("position", row.hero || row.hpos, row);
    touch("street", row.street, row);
    touch("category", row.cat || row.potType, row);
    touch("format", row.format, row);
    touch("action", row.chosenAction || row.chosenLabel, row);
    touch("villain", row.vtype || row.villainProfile, row);
  });
  const rank = (bucket) => Object.values(bucket)
    .filter((g) => g.total >= 1)
    .map((g) => ({ ...g, severity: Math.round(((g.err / g.total) * 70 + g.evLoss * 12) * 10) / 10 }))
    .sort((a, b) => b.severity - a.severity || b.err - a.err);
  return {
    total: rows.length,
    weakPositions: rank(groups.position),
    weakStreets: rank(groups.street),
    weakCategories: rank(groups.category),
    weakFormats: rank(groups.format),
    weakActions: rank(groups.action),
    weakVillains: rank(groups.villain),
  };
}

function adaptiveWeight(spot, leakProfile, adaptiveMode = "balanced") {
  let w = 1;
  const weakPos = leakProfile?.weakPositions?.[0]?.key;
  const weakStreet = leakProfile?.weakStreets?.[0]?.key;
  const weakCat = leakProfile?.weakCategories?.[0]?.key;
  const mode = adaptiveMode || "balanced";
  if (spot.hpos === weakPos) w += mode === "balanced" ? 1 : 2.5;
  if (spot.street === weakStreet) w += mode === "balanced" ? 0.8 : 2;
  if (spot.cat === weakCat) w += mode === "balanced" ? 1 : 2.4;
  if (mode === "tournament-prep" && /MTT|ICM|Bounty|PKO|Spin/i.test(`${spot.fmt} ${spot.cat}`)) w += 2.2;
  if (mode === "tournament-prep" && parseTrainerBb(spot.stack) <= 30) w += 1.6;
  if (mode === "intensive" && Number(spot.diff || 1) >= 3) w += 2;
  if (mode === "review-errors" && (spot.cat === weakCat || spot.hpos === weakPos)) w += 3;
  if (mode === "mental-focus" && Number(spot.diff || 1) <= 3) w += 0.8;
  return w;
}

function validateCandidate(spot, validator) {
  const strict = validateSpotConsistency(spot, spot.ctx || {}, { requireVillain: true });
  if (!strict.ok) return { ok: false, errors: strict.errors };
  if (typeof validator === "function") {
    const local = validator(spot);
    if (!(local?.valid ?? local?.ok)) return { ok: false, errors: local?.errors || ["app validator rejected spot"] };
    if (local?.ctx) spot.ctx = local.ctx;
  }
  return { ok: true, errors: [] };
}

function generateFromTemplate(template, request = {}, random = Math.random) {
  const builder = TEMPLATE_BUILDERS[template.id] || ((t, r, rnd) => rfiSpot(t, r, rnd));
  const population = request.population || resolvePopulation(request.filters, request.mode, request.platform);
  const generated = builder(template, request, random);
  const prof = VILLAIN_AI_PROFILES[generated.vtype] || VILLAIN_AI_PROFILES.Reg;
  generated.aiMeta = makeAiMeta({
    template,
    spot: generated,
    profile: prof,
    population,
    adaptiveMode: request.adaptiveMode || "balanced",
    objective: request.objective,
  });
  generated.generationMode = request.mode || "gto";
  generated.villainTrend = prof.tendency;
  generated.villainExploit = prof.exploit;
  return applyPopulationToSpot(generated, population);
}

function selectTemplates(filters = {}, opts = {}) {
  const typeCats = mapSpotType(filters, opts.spotTypeMap);
  return SPOT_TEMPLATES.filter((template) => {
    if (opts.onlyPreflop && template.street !== "Preflop") return false;
    if (opts.onlyStreet && template.street.toLowerCase() !== String(opts.onlyStreet).toLowerCase()) return false;
    if (filters.cat && filters.cat !== "Tous" && template.category !== filters.cat) return false;
    if (typeCats && !typeCats.has(template.category)) return false;
    if (filters.diffLvl && Number(filters.diffLvl) > 0 && template.difficulty > Number(filters.diffLvl)) return false;
    return true;
  });
}

export const SpotTemplateEngine = {
  templates: SPOT_TEMPLATES,
  list(filters = {}, opts = {}) {
    return selectTemplates(filters, opts);
  },
  get(id) {
    return SPOT_TEMPLATES.find((template) => template.id === id) || null;
  },
};

export const VillainAIProfileEngine = {
  profiles: VILLAIN_AI_PROFILES,
  resolve: normalizeProfileName,
  apply(spot, profileName) {
    const profile = VILLAIN_AI_PROFILES[normalizeProfileName(profileName)] || VILLAIN_AI_PROFILES.Reg;
    return { ...cloneSpot(spot), vtype: profile.name, villainTrend: profile.tendency, villainExploit: profile.exploit };
  },
};

export const PopulationModelEngine = {
  models: POPULATION_MODELS,
  resolve: resolvePopulation,
  apply: applyPopulationToSpot,
};

export const AdaptiveLearningEngine = {
  buildLeakProfile,
  scoreSpot: adaptiveWeight,
  recordDecision(decision = {}) {
    return recordAdaptiveDecision(decision);
  },
};

export const SpotConsistencyValidator = {
  validate(spot, validator) {
    const candidate = cloneSpot(spot);
    return validateCandidate(candidate, validator);
  },
};

export const CoachAIIntegration = {
  describeSpot(spot) {
    return describeCoachSpot(spot);
  },
  createSimilarSpot(spot, request = {}) {
    const template = SpotTemplateEngine.get(spot?.templateId) || SpotTemplateEngine.templates[0];
    return generateFromTemplate(template, { ...request, filters: request.filters || {}, mode: request.mode || spot?.generationMode || "gto" });
  },
};

export function describeCoachSpot(spot) {
  const meta = spot?.aiMeta || {};
  return {
    title: meta.pedagogicObjective || spot?.cat || "Spot training",
    why: meta.why || `Spot ${spot?.hpos || "Hero"} vs ${spot?.vpos || "Vilain"} pour travailler ${spot?.cat || spot?.street}.`,
    adaptation: meta.adaptation || spot?.villainExploit || "",
    prompts: meta.coachPrompts || [],
  };
}

export function createTrainingSpotFromHand(hand = {}, opts = {}) {
  const heroPos = hand.heroPos || hand.hero || opts.heroPosition || "BTN";
  const villainPos = hand.villainPos || hand.vpos || opts.villainPosition || "BB";
  const street = hand.street || opts.street || "Preflop";
  const board = Array.isArray(hand.board) ? hand.board : [];
  const toCall = Number(hand.toCall ?? opts.toCall ?? 0);
  const pot = Number(hand.pot ?? opts.pot ?? (toCall > 0 ? toCall * 2 + 1.5 : 1.5));
  const handCards = Array.isArray(hand.hand) && hand.hand.length >= 2 ? hand.hand.slice(0, 2) : drawCards(Math.random, 2);
  const acts = toCall > 0
    ? [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "CALL", l: "Call", s: fmtBb(toCall) }, { id: "RAISE", l: `Raise ${Math.max(toCall * 3, pot).toFixed(1)}bb`, s: fmtBb(Math.max(toCall * 3, pot)) }]
    : [{ id: /^pre/i.test(street) ? "FOLD" : "CHECK", l: /^pre/i.test(street) ? "Fold" : "Check", s: "0bb" }, { id: /^pre/i.test(street) ? "RAISE" : "BET33", l: /^pre/i.test(street) ? "Open 2.5bb" : "Bet 33%", s: /^pre/i.test(street) ? "2.5bb" : fmtBb(pot * 0.33) }];
  return {
    id: `replayer_training_${hand.id || Date.now()}`,
    templateId: "replayer-hand-transform",
    cat: /^pre/i.test(street) ? (toCall > 0 ? "Vs Open" : "RFI") : street,
    street,
    fmt: hand.format || opts.format || "Imported Hand",
    hpos: heroPos,
    vpos: villainPos,
    vtype: normalizeProfileName(hand.vtype || hand.villainProfile || "Reg"),
    stack: `${Number(hand.stack || opts.stackDepth || 40)}bb`,
    hand: handCards,
    board,
    pot,
    toCall,
    desc: `Main importee - ${street} - ${heroPos} vs ${villainPos}`,
    acts,
    ok: acts.length > 2 ? 1 : acts.length - 1,
    best: acts[acts.length > 2 ? 1 : acts.length - 1]?.l,
    freq: Object.fromEntries(acts.map((a, i) => [a.id, i === 1 ? 65 : 20])),
    ev: Object.fromEntries(acts.map((a, i) => [a.id, i === 1 ? 0.8 : 0])),
    expl: "Spot cree depuis une main du Replayer: decision cle extraite puis validee avant entrainement.",
    detail: [{ i: "RP", t: "<strong>Replayer -> Trainer</strong>: la main est transformee en exercice rejouable." }],
    leaks: ["Rejouer la decision cle de la main importee"],
    diff: 2,
    aiMeta: {
      engine: "PokerForge Evolutive Spot AI",
      templateId: "replayer-hand-transform",
      pedagogicObjective: "transformer une main reelle en exercice",
      why: "Cette main contient une decision rejouable et compatible avec le Trainer.",
      adaptation: "Travaille le meme noeud sans resultat-oriented thinking.",
      coachPrompts: ["Pourquoi cette main devient un exercice ?", "Creer 10 spots similaires", "Ajouter a mes leaks"],
    },
  };
}

export const TrainerIntegrationLayer = {
  generateSpot(request = {}) {
    return SpotGenerationEngine.generateSpot(request);
  },
  generateQueue(request = {}) {
    return SpotGenerationEngine.generateQueue(request);
  },
  recordDecision(decision = {}) {
    return recordAdaptiveDecision(decision);
  },
};

export const SpotGenerationEngine = {
  generateSpot(request = {}) {
    const random = request.random || Math.random;
    const templates = selectTemplates(request.filters || {}, request).filter(Boolean);
    const template = request.templateId
      ? SpotTemplateEngine.get(request.templateId)
      : weightedPick(random, templates.length ? templates : SPOT_TEMPLATES, (t) => t.frequency || 1);
    return generateFromTemplate(template || SPOT_TEMPLATES[0], request, random);
  },
  generateQueue(request = {}) {
    return buildTrainerIntegrationQueue(request);
  },
};

export function buildTrainerIntegrationQueue({
  legacyPool = [],
  filters = {},
  count = 20,
  mode = "gto",
  trainMode = "spot",
  platform = "pokerstars",
  adaptiveMode = "balanced",
  history = [],
  random = Math.random,
  validateSpot,
  spotTypeMap = {},
  onlyPreflop = false,
  preferFlop = false,
  onlyStreet = null,
} = {}) {
  const population = resolvePopulation(filters, mode, platform);
  const leakProfile = buildLeakProfile(history);
  const desired = count === 999 ? 180 : Math.max(1, Number(count) || 20);
  const opts = { spotTypeMap, onlyPreflop, preferFlop, onlyStreet };
  const requestBase = {
    filters,
    mode,
    trainMode,
    platform,
    adaptiveMode,
    population,
    spotTypeMap,
    onlyPreflop,
    onlyStreet,
    objective: filters.objective,
  };
  const generated = [];
  let tries = 0;
  while (generated.length < Math.max(40, desired * 2) && tries < desired * 12) {
    tries += 1;
    const template = weightedPick(random, selectTemplates(filters, opts).length ? selectTemplates(filters, opts) : SPOT_TEMPLATES, (t) => {
      let w = t.frequency || 1;
      if (adaptiveMode === "tournament-prep" && /ICM|push|bounty|shove|jam/i.test(`${t.category} ${t.tags?.join(" ")}`)) w += 4;
      if (adaptiveMode === "intensive" && t.difficulty >= 3) w += 3;
      if (adaptiveMode === "mental-focus" && t.difficulty <= 3) w += 2;
      return w;
    });
    const spot = generateFromTemplate(template, requestBase, random);
    if (filters.stackEff && /^\d+$/.test(String(filters.stackEff))) spot.stack = `${filters.stackEff}bb`;
    if (filters.hp && filters.hp !== "Tous") spot.hpos = filters.hp;
    if (filters.vp && filters.vp !== "Tous" && filters.vp !== spot.hpos) spot.vpos = filters.vp;
    if (!spotMatchesFilters(spot, filters, opts)) continue;
    const validation = validateCandidate(spot, validateSpot);
    if (!validation.ok) continue;
    generated.push(spot);
  }

  const legacy = (legacyPool || [])
    .map(cloneSpot)
    .filter((spot) => spotMatchesFilters(spot, filters, opts))
    .map((spot) => {
      const profile = VILLAIN_AI_PROFILES[normalizeProfileName(spot.vtype)] || VILLAIN_AI_PROFILES.Reg;
      const template = SpotTemplateEngine.get(spot.templateId) || {
        id: "legacy-static",
        name: spot.desc || "Legacy PokerForge spot",
        tags: [spot.cat || spot.street || "legacy"],
        objective: spot.cat || "legacy",
      };
      spot.aiMeta = spot.aiMeta || makeAiMeta({ template, spot, profile, population, adaptiveMode, objective: filters.objective });
      spot.populationModel = spot.populationModel || population.id;
      return spot;
    })
    .filter((spot) => validateCandidate(spot, validateSpot).ok);

  let pool = [...generated, ...legacy];
  if (!pool.length) pool = generated.length ? generated : legacy;
  if (!pool.length) return [];

  const queue = [];
  const seenWindow = [];
  while (queue.length < desired) {
    const pickSpot = weightedPick(random, pool, (spot) => {
      const recentPenalty = seenWindow.includes(spot.templateId || spot.id) ? 0.35 : 1;
      return recentPenalty * adaptiveWeight(spot, leakProfile, adaptiveMode) * (1 + (Number(spot.diff || 1) - 1) * 0.08);
    });
    const next = cloneSpot(pickSpot);
    next.aiMeta = {
      ...(next.aiMeta || {}),
      adaptiveMode,
      adaptiveWeight: adaptiveWeight(next, leakProfile, adaptiveMode),
      leakFocus: {
        position: leakProfile.weakPositions?.[0]?.key || null,
        street: leakProfile.weakStreets?.[0]?.key || null,
        category: leakProfile.weakCategories?.[0]?.key || null,
      },
    };
    queue.push(next);
    seenWindow.push(next.templateId || next.id);
    if (seenWindow.length > 6) seenWindow.shift();
  }
  return queue;
}

export function countEvolutiveSpots({ filters = {}, spotTypeMap = {}, onlyPreflop = false, onlyStreet = null } = {}) {
  return selectTemplates(filters, { spotTypeMap, onlyPreflop, onlyStreet }).length * 6;
}

export function recordAdaptiveDecision({
  userId = "local",
  spot,
  spotId = spot?.id,
  actionChosen,
  recommendedAction,
  result,
  evLoss = 0,
  mistakeType,
  confidence = 0.75,
} = {}) {
  if (typeof localStorage === "undefined") {
    return { ok: false, offline: true };
  }
  const row = {
    id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    userId,
    spotId,
    templateId: spot?.templateId || null,
    actionChosen,
    recommendedAction,
    result,
    evLoss: Number(evLoss) || 0,
    mistakeType: mistakeType || spot?.cat || spot?.street || null,
    position: spot?.hpos || null,
    street: spot?.street || null,
    villainProfile: spot?.vtype || null,
    format: spot?.fmt || null,
    confidence,
    createdAt: new Date().toISOString(),
  };
  try {
    const prev = JSON.parse(localStorage.getItem("pf_adaptive_training_decisions") || "[]");
    const next = [row, ...prev].slice(0, 800);
    localStorage.setItem("pf_adaptive_training_decisions", JSON.stringify(next));
    const leakProfile = buildLeakProfile(next.map((d) => ({
      ...d,
      hero: d.position,
      cat: d.mistakeType,
      result: d.result === "ok" ? "ok" : "err",
    })));
    localStorage.setItem("pf_user_leak_profile", JSON.stringify({
      userId,
      updatedAt: new Date().toISOString(),
      weakPositions: leakProfile.weakPositions.slice(0, 6),
      weakStreets: leakProfile.weakStreets.slice(0, 6),
      weakCategories: leakProfile.weakCategories.slice(0, 6),
      weakFormats: leakProfile.weakFormats.slice(0, 6),
      nextSpotWeights: {
        position: leakProfile.weakPositions[0]?.key || null,
        street: leakProfile.weakStreets[0]?.key || null,
        category: leakProfile.weakCategories[0]?.key || null,
      },
    }));
    return { ok: true, row };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

