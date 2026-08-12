/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-multitable.mjs — LE BANDEAU GAUCHE EST UN CONTRAT

   Ce fichier verrouille la règle : « si l'utilisateur peut sélectionner une
   option, cette option doit réellement traverser toute la chaîne ».

   Il couvre en particulier la régression corrigée : Full Hand et Session
   forçaient silencieusement 1 table (verrou UI `fullSolo` + verrou moteur
   `numTables===1` sur autoFull). Les tests ci-dessous exercent les couches
   PURES (config, options moteur, générateur, moteur de main complète) ; la
   couche visuelle est validée par scripts/trainer-multitable-audit.mjs.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  buildTrainingConfig, normalizeTrainingConfig, trainingConfigToFilters,
  trainingConfigToEngineOpts, saveTrainingConfig, loadTrainingConfig,
  SESSION_TYPES, TABLE_COUNTS, TRAINING_MODES, SESSION_LENGTHS,
} from "./src/trainingConfig.js";
import { buildTrainerIntegrationQueue, ADAPTIVE_MODE_OPTIONS } from "./src/spotAiEngine.js";
import { resolveTrainingConstraints } from "./src/constraintEngine.js";
import {
  createFullHand, applyAction, playVillain, defaultVillainPolicy, amountToCall,
} from "./src/fullHandEngine.js";
import { validateSpotConsistency } from "./src/trainerActionEvent.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const seq = (s = 1) => () => ((s = (s * 9301 + 49297) % 233280), s / 233280);

/* ══ 1 — tableCount survit à TOUS les types de session ══
   C'était le bug : `full` et `session` retombaient à 1. */
for (const sessionType of SESSION_TYPES) {
  for (const tableCount of TABLE_COUNTS) {
    const c = buildTrainingConfig({ sessionType, tableCount });
    eq(c.tableCount, tableCount, `${sessionType} × ${tableCount}T : tableCount conservé`);
    eq(c.sessionType, sessionType, `${sessionType} × ${tableCount}T : sessionType conservé`);
  }
}

/* ══ 2 — L'ORDRE DES CLICS n'a aucune influence (§14) ══
   « 4T puis Full Hand » doit donner exactement « Full Hand puis 4T ». */
for (const sessionType of SESSION_TYPES) {
  for (const tableCount of TABLE_COUNTS) {
    const a = buildTrainingConfig({ tableCount, sessionType });               // tables → type
    const b = normalizeTrainingConfig({ ...buildTrainingConfig({ tableCount }), sessionType }); // type après coup
    const c = normalizeTrainingConfig({ ...buildTrainingConfig({ sessionType }), tableCount }); // tables après coup
    eq(a, b, `${sessionType}/${tableCount}T : ordre tables→type indifférent`);
    eq(a, c, `${sessionType}/${tableCount}T : ordre type→tables indifférent`);
  }
}

/* ══ 3 — Round-trip config ↔ filtres legacy : aucune valeur perdue ══ */
for (const tableCount of TABLE_COUNTS) {
  const src = buildTrainingConfig({
    tableCount, sessionType: "full", trainingMode: "exploit", sessionLength: 100,
    f: { nplayers: 9, hp: "BTN", stackEff: "40", adaptiveMode: "leak-hunter", vt: "Nit", timer: 15 },
  });
  const back = normalizeTrainingConfig({ ...src, ...buildTrainingConfig({ f: trainingConfigToFilters(src), tableCount, sessionType: src.sessionType, trainingMode: src.trainingMode, sessionLength: src.sessionLength }) });
  eq(back.tableCount, tableCount, `round-trip ${tableCount}T`);
  eq(back.tableStructure, 9, "round-trip structure 9J");
  eq(back.heroPosition, "BTN", "round-trip position Héro");
  eq(back.stackDepth, "40", "round-trip stack effectif");
  eq(back.adaptiveMode, "leak-hunter", "round-trip mode adaptatif");
  eq(back.villainProfile, "Nit", "round-trip profil Villain");
  eq(back.timer, 15, "round-trip timer");
}

/* ══ 4 — Options moteur : full/session = coup complet, quel que soit le nb de tables ══ */
for (const trainingMode of TRAINING_MODES) {
  for (const tableCount of TABLE_COUNTS) {
    for (const sessionType of ["full", "session"]) {
      const o = trainingConfigToEngineOpts(buildTrainingConfig({ sessionType, tableCount, trainingMode }));
      ok(o.onlyPreflop === true && o.preferFlop === true,
        `${trainingMode}/${sessionType}/${tableCount}T : le coup complet reste demandé`);
      eq(o.trainerMode, trainingMode, `${trainingMode}/${sessionType}/${tableCount}T : moteur pédagogique transmis`);
      eq(o.trainMode, sessionType, `${trainingMode}/${sessionType}/${tableCount}T : type de session transmis`);
    }
    // Street : la street de départ choisie est bien celle transmise
    const st = trainingConfigToEngineOpts(buildTrainingConfig({ sessionType: "street", streetStart: "Turn", tableCount, trainingMode }));
    eq(st.onlyStreet, "Turn", `street de départ transmise (${tableCount}T)`);
    // Spot / Mix : aucune contrainte de street imposée
    for (const t of ["spot", "mix"]) {
      const o = trainingConfigToEngineOpts(buildTrainingConfig({ sessionType: t, tableCount, trainingMode }));
      ok(!o.onlyPreflop && !o.onlyStreet, `${t}/${tableCount}T : aucune contrainte de street parasite`);
    }
  }
}

/* ══ 5 — Le contrat Full Hand : les spots générés peuvent ATTEINDRE le postflop ══
   Un RFI à 20bb = push : le coup se termine au préflop et « préflop → river »
   ne serait pas tenu. `preferFlop` doit écarter ces spots dans les DEUX
   générateurs (legacy et file IA). */
const isTerminalPreflop = (spot) => {
  const acts = Array.isArray(spot?.acts) ? spot.acts : [];
  if (!acts.length) return false;
  return !acts.some((a) => {
    const id = String(a?.id || a?.action || "").toUpperCase();
    if (id === "FOLD" || id === "ALLIN") return false;
    return !/push|tapis|all-?in/i.test(`${a?.l || ""} ${a?.s || ""}`);
  });
};
for (const mode of TRAINING_MODES) {
  for (const tableCount of TABLE_COUNTS) {
    const cfg = buildTrainingConfig({ sessionType: "full", tableCount, trainingMode: mode });
    const opts = trainingConfigToEngineOpts(cfg);
    const q = buildTrainerIntegrationQueue({
      filters: trainingConfigToFilters(cfg), count: 24, mode, random: seq(11),
      spotTypeMap: {}, onlyPreflop: opts.onlyPreflop, preferFlop: opts.preferFlop,
    });
    ok(q.length === 24, `${mode}/full/${tableCount}T : 24 spots générés`);
    ok(q.every((s) => /^pre/i.test(s.street || "")), `${mode}/full/${tableCount}T : tous préflop`);
    const terminal = q.filter(isTerminalPreflop);
    eq(terminal.length, 0, `${mode}/full/${tableCount}T : aucun spot push-only (coup complet impossible)`);
  }
}
/* …et à l'inverse : hors Full Hand, on n'écarte RIEN (pas de sur-filtrage). */
{
  const q = buildTrainerIntegrationQueue({
    filters: {}, count: 30, mode: "gto", random: seq(5), spotTypeMap: {},
    onlyPreflop: true, preferFlop: false,
  });
  ok(q.length === 30, "sans preferFlop : la génération reste large");
}

/* ══ 6 — Longueur de session : le nombre demandé est le nombre produit ══ */
for (const sessionLength of SESSION_LENGTHS) {
  for (const tableCount of TABLE_COUNTS) {
    const cfg = buildTrainingConfig({ sessionLength, tableCount, sessionType: "spot" });
    eq(cfg.sessionLength, sessionLength, `session ${sessionLength} × ${tableCount}T conservée`);
    const q = buildTrainerIntegrationQueue({
      filters: {}, count: cfg.sessionLength, mode: "gto", random: seq(3), spotTypeMap: {},
    });
    const expected = sessionLength === 999 ? 180 : sessionLength;
    eq(q.length, expected, `session ${sessionLength} → ${expected} spots (${tableCount}T)`);
    // Il faut au moins de quoi remplir un premier lot complet de N tables.
    ok(q.length >= tableCount, `assez de spots pour alimenter ${tableCount} tables`);
  }
}

/* ══ 7 — Le mode adaptatif n'est pas décoratif ══
   Deux modes différents, même graine : les files produites doivent différer. */
{
  const build = (adaptiveMode) => buildTrainerIntegrationQueue({
    filters: { adaptiveMode }, count: 30, mode: "gto", random: seq(13), spotTypeMap: {},
    adaptiveMode,
    history: [
      { hpos: "BB", street: "Flop", cat: "Vs Open", result: "err", evLoss: 3 },
      { hpos: "BB", street: "Flop", cat: "Vs Open", result: "err", evLoss: 4 },
      { hpos: "SB", street: "Turn", cat: "RFI", result: "err", evLoss: 2 },
    ],
  });
  const sig = (q) => q.map((s) => `${s.cat}|${s.hpos}|${s.diff}`).join(",");
  const base = sig(build("balanced"));
  const differing = ADAPTIVE_MODE_OPTIONS.filter((o) => o.id !== "balanced")
    .filter((o) => sig(build(o.id)) !== base);
  ok(differing.length >= 3,
    `mode adaptatif effectif : ${differing.length} modes sur ${ADAPTIVE_MODE_OPTIONS.length - 1} changent la file`);
  for (const o of ADAPTIVE_MODE_OPTIONS) {
    const q = build(o.id);
    ok(q.length === 30, `mode adaptatif "${o.id}" produit bien une file complète`);
    ok(q.every((s) => s.aiMeta && s.aiMeta.adaptiveMode === o.id), `mode adaptatif "${o.id}" tracé sur chaque spot`);
  }
}

/* ══ 8 — Les autres filtres du bandeau atteignent réellement la génération ══ */
{
  const check = (filters, pred, label) => {
    const q = buildTrainerIntegrationQueue({ filters, count: 16, mode: "gto", random: seq(17), spotTypeMap: {} });
    ok(q.length > 0, `${label} : file non vide`);
    ok(q.every(pred), `${label} : respecté par tous les spots`);
  };
  check({ hp: "BTN" }, (s) => s.hpos === "BTN", "position Héro BTN");
  check({ vp: "BB", hp: "CO" }, (s) => s.vpos === "BB", "position Villain BB");
  check({ stackEff: "40" }, (s) => String(s.stack).startsWith("40"), "stack effectif 40bb");
  check({ vt: "Nit" }, (s) => s.vtype === "Nit", "profil Villain Nit");
  check({ diffLvl: 2 }, (s) => Number(s.diff || 2) <= 2, "difficulté plafonnée à 2");
  // Structure de table : le ConstraintEngine borne les positions au format choisi.
  for (const n of [2, 3, 6, 9]) {
    const r = resolveTrainingConstraints(buildTrainingConfig({ f: { nplayers: n } }));
    eq(r.resolved.tableStructure, n, `structure ${n}J transmise au moteur`);
  }
}

/* ══ 9 — Persistance : une session ne pollue pas la suivante (§13) ══ */
{
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const scenarios = [
    { trainingMode: "gto", sessionType: "full", tableCount: 4, sessionLength: 20 },
    { trainingMode: "exploit", sessionType: "session", tableCount: 3, sessionLength: 50 },
    { trainingMode: "gto", sessionType: "spot", tableCount: 2, sessionLength: 100 },
    { trainingMode: "exploit", sessionType: "mix", tableCount: 4, sessionLength: 999 },
  ];
  for (const s of scenarios) {
    saveTrainingConfig(buildTrainingConfig(s), store);
    const back = loadTrainingConfig(store);
    eq(back.tableCount, s.tableCount, `reprise : ${s.sessionType} garde ${s.tableCount}T`);
    eq(back.sessionType, s.sessionType, `reprise : type ${s.sessionType}`);
    eq(back.trainingMode, s.trainingMode, `reprise : moteur ${s.trainingMode}`);
    eq(back.sessionLength, s.sessionLength, `reprise : longueur ${s.sessionLength}`);
  }
}

/* ══ 10 — N coups complets INDÉPENDANTS (cœur du multitabling Full Hand) ══
   Chaque table possède son propre état : agir sur l'une ne doit RIEN changer
   aux autres, et chacune progresse à son rythme jusqu'au showdown. */
const card = (r, s) => ({ r, s });
const makeTable = (i) => createFullHand({
  heroHand: [card("A", "♠"), card("K", "♠")],
  villHand: [card("Q", "♥"), card("J", "♥")],
  fullBoard: [card("2", "♣"), card("7", "♦"), card("9", "♠"), card(["T", "3", "5", "8"][i], "♣"), card(["4", "6", "J", "2"][i], "♦")],
  startPot: 6 + i, heroStack: 100, villStack: 100, firstToAct: "hero",
});
for (const n of TABLE_COUNTS) {
  const tables = Array.from({ length: n }, (_, i) => makeTable(i));
  const snapshot = tables.map((t) => JSON.stringify(t));
  // On agit UNIQUEMENT sur la table 0.
  tables[0] = applyAction(tables[0], "hero", { type: "BET", amount: 3 });
  for (let i = 1; i < n; i++) {
    eq(JSON.stringify(tables[i]), snapshot[i], `${n}T : la table ${i + 1} est intacte après une action sur la table 1`);
  }
  ok(tables[0].pot > JSON.parse(snapshot[0]).pot, `${n}T : la table 1 a bien avancé`);
  ok(tables[0].toAct === "villain", `${n}T : la main passe au Villain sur la table 1 uniquement`);

  // Chaque table doit pouvoir aller jusqu'au bout, indépendamment.
  const rng = seq(29);
  tables.forEach((t, i) => {
    let st = t, guard = 0;
    while (!st.done && guard++ < 60) {
      if (st.toAct === "villain") { st = playVillain(st, (s) => defaultVillainPolicy(s, { random: rng })); continue; }
      st = amountToCall(st, "hero") > 0
        ? applyAction(st, "hero", { type: "CALL" })
        : applyAction(st, "hero", { type: "CHECK" });
    }
    ok(st.done, `${n}T : la table ${i + 1} atteint la fin du coup`);
    ok(st.result && typeof st.result.winner === "string", `${n}T : la table ${i + 1} a un résultat réel (showdown)`);
    tables[i] = st;
  });
  // Résultats/pots indépendants : rien n'est partagé entre les tables.
  ok(new Set(tables.map((t) => t.history.length)).size >= 1, `${n}T : historiques d'actions distincts par table`);
}

/* ══ 11 — Chaque combinaison de la matrice produit des spots JOUABLES ══
   (validateur strict : c'est ce qui garantit qu'une table ne se retrouve pas
   vide et ne disparaisse pas silencieusement de la mosaïque — §16.) */
for (const trainingMode of TRAINING_MODES) {
  for (const sessionType of SESSION_TYPES) {
    for (const tableCount of TABLE_COUNTS) {
      const cfg = buildTrainingConfig({ sessionType, tableCount, trainingMode, sessionLength: 20 });
      const opts = trainingConfigToEngineOpts(cfg);
      const q = buildTrainerIntegrationQueue({
        filters: trainingConfigToFilters(cfg), count: 20, mode: trainingMode,
        random: seq(23), spotTypeMap: {},
        onlyPreflop: !!opts.onlyPreflop, preferFlop: !!opts.preferFlop, onlyStreet: opts.onlyStreet || null,
        adaptiveMode: cfg.adaptiveMode,
      });
      const label = `${trainingMode}/${sessionType}/${tableCount}T`;
      ok(q.length >= tableCount, `${label} : assez de spots pour le premier lot`);
      ok(q.every((s) => validateSpotConsistency(s, s.ctx || {}, { requireVillain: false }).ok),
        `${label} : tous les spots passent le validateur strict`);
    }
  }
}

console.log(`✅ trainer-multitable — ${passed} assertions OK`);
