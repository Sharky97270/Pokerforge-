import assert from "node:assert/strict";
import {
  DEFAULT_TRAINING_CONFIG,
  buildTrainingConfig,
  normalizeTrainingConfig,
  trainingConfigToFilters,
  trainingConfigToEngineOpts,
  saveTrainingConfig,
  loadTrainingConfig,
  TRAINING_CONFIG_STORE_KEY,
} from "./src/trainingConfig.js";

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); passed++; };

/* ── 1. buildTrainingConfig mappe f + states frères ── */
const f = {
  cat: "RFI", fmt: "MTT ICM", vt: "LAG", hp: "BTN", vp: "BB", diff: "Expert",
  nplayers: 8, stackEff: "20", spotTypes: ["3bet", "squeeze"], phase: "Bubble",
  icm: "Forte", fmtDetail: "MTT Bounty/PKO", vilainAdv: "Reg MTT Winamax",
  field: "Tough Reg", heroStyle: "TAG", adaptiveMode: "leakhunter",
  heroLayout: "table", diffLvl: 4, objectives: ["Push/Fold"], objective: "ICM",
  timer: 15, coachLevel: "Expert",
};
const cfg = buildTrainingConfig({
  f, smode: 50, ntables: 3, trainerMode: "exploit",
  platform: "winamax", trainMode: "street", streetStart: "Turn",
});
eq(cfg.sessionLength, 50, "sessionLength ← smode");
eq(cfg.tableCount, 3, "tableCount ← ntables");
eq(cfg.trainingMode, "exploit", "trainingMode ← trainerMode");
eq(cfg.platform, "winamax", "platform");
eq(cfg.sessionType, "street", "sessionType ← trainMode");
eq(cfg.streetStart, "Turn", "streetStart");
eq(cfg.tableStructure, 8, "tableStructure ← nplayers");
eq(cfg.heroDisplayMode, "table", "heroDisplayMode ← heroLayout");
eq(cfg.stackDepth, "20", "stackDepth ← stackEff");
eq(cfg.spotTypes, ["3bet", "squeeze"], "spotTypes");
eq(cfg.tournamentPhase, "Bubble", "tournamentPhase ← phase");
eq(cfg.icmPressure, "Forte", "icmPressure ← icm");
eq(cfg.format, "MTT ICM", "format ← fmt");
eq(cfg.villainProfile, "LAG", "villainProfile ← vt");
eq(cfg.heroPosition, "BTN", "heroPosition ← hp");
eq(cfg.villainPosition, "BB", "villainPosition ← vp");
eq(cfg.difficulty, "Expert", "difficulty ← diff");
eq(cfg.difficultyLevel, 4, "difficultyLevel ← diffLvl");
eq(cfg.category, "RFI", "category ← cat");
eq(cfg.timer, 15, "timer");
eq(cfg.coachLevel, "Expert", "coachLevel");
eq(cfg.workOn, ["Push/Fold"], "workOn ← objectives");

/* ── 2. Round-trip : toFilters(build(f)) préserve toutes les clés de f ── */
const back = trainingConfigToFilters(cfg);
for (const k of Object.keys(f)) {
  eq(back[k], f[k], `round-trip préserve f.${k}`);
}
// spotTypes clonés (pas la même référence → pas de mutation partagée)
ok(back.spotTypes !== f.spotTypes, "spotTypes cloné (pas de partage de référence)");

/* ── 3. Dérivation des engine opts par type de session ── */
const optsStreet = trainingConfigToEngineOpts(cfg);
eq(optsStreet.onlyStreet, "Turn", "street → onlyStreet");
eq(optsStreet.trainerMode, "exploit", "engine opts trainerMode");
eq(optsStreet.trainMode, "street", "engine opts trainMode");
eq(optsStreet.platform, "winamax", "engine opts platform");
ok(!optsStreet.onlyPreflop, "street ≠ onlyPreflop");

const optsFull = trainingConfigToEngineOpts({ ...cfg, sessionType: "full" });
eq(optsFull.onlyPreflop, true, "full → onlyPreflop");
eq(optsFull.preferFlop, true, "full → preferFlop");
ok(optsFull.onlyStreet === undefined, "full ≠ onlyStreet");

const optsSpot = trainingConfigToEngineOpts({ ...cfg, sessionType: "spot" });
ok(!optsSpot.onlyPreflop && optsSpot.onlyStreet === undefined, "spot → aucune contrainte street");

/* ── 4. Normalisation : borne les valeurs aberrantes sans supprimer d'option ── */
const norm = normalizeTrainingConfig({
  sessionLength: 999999, tableCount: 42, trainingMode: "bogus",
  sessionType: "nope", tableStructure: 99, timer: -5, customStack: "abc",
});
eq(norm.sessionLength, DEFAULT_TRAINING_CONFIG.sessionLength, "sessionLength invalide → défaut");
eq(norm.tableCount, 4, "tableCount clampé à 4");
eq(norm.trainingMode, "gto", "trainingMode invalide → défaut");
eq(norm.sessionType, "spot", "sessionType invalide → défaut");
eq(norm.tableStructure, 9, "tableStructure clampé à 9");
eq(norm.timer, 0, "timer négatif → 0");
eq(norm.customStack, null, "customStack non-numérique → null");

/* ── 5. Persistance unifiée (mock localStorage) ── */
const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, v),
};
saveTrainingConfig(cfg, storage);
ok(mem.has(TRAINING_CONFIG_STORE_KEY), "snapshot canonique écrit");
ok(mem.has("pf_trainer_cfg"), "clé legacy pf_trainer_cfg écrite (compat)");
ok(mem.has("pf_train_mode"), "clé legacy pf_train_mode écrite (compat)");
const reloaded = loadTrainingConfig(storage);
eq(reloaded.format, "MTT ICM", "reload snapshot canonique restaure format");
eq(reloaded.tableCount, 3, "reload restaure tableCount");
eq(reloaded.sessionType, "street", "reload restaure sessionType");

/* ── 6. Reconstruction depuis legacy seul (pas de snapshot canonique) ── */
const mem2 = new Map();
mem2.set("pf_trainer_cfg", JSON.stringify({ hp: "CO", fmt: "Cash 6-max" }));
mem2.set("pf_train_mode", "full");
const storage2 = { getItem: (k) => (mem2.has(k) ? mem2.get(k) : null), setItem: (k, v) => mem2.set(k, v) };
const fromLegacy = loadTrainingConfig(storage2);
eq(fromLegacy.heroPosition, "CO", "reconstruit heroPosition depuis legacy f");
eq(fromLegacy.format, "Cash 6-max", "reconstruit format depuis legacy f");
eq(fromLegacy.sessionType, "full", "reconstruit sessionType depuis pf_train_mode");

console.log(`✅ trainingConfig — ${passed} assertions OK`);
