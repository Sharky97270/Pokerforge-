import assert from "node:assert/strict";
import {
  parseTrainingRequest,
  orchestrateTrainingRequest,
  describeUnderstanding,
} from "./src/aiTrainingOrchestrator.js";
import { DEFAULT_TRAINING_CONFIG } from "./src/trainingConfig.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* ── §57 Exemple 1 : « Fais-moi travailler BB vs BTN 20-30bb. » ── */
{
  const { patch, matched } = parseTrainingRequest("Fais-moi travailler BB vs BTN 20-30bb.");
  eq(patch.heroPosition, "BB", "héro BB");
  eq(patch.villainPosition, "BTN", "villain BTN");
  eq(patch.stackDepth, "25", "20-30bb → preset 25");
  ok(matched.length >= 2, "intentions reconnues");
}

/* ── §57 Exemple 2 : « Prépare-moi sur mes leaks. » ── */
{
  const { patch } = parseTrainingRequest("Prépare-moi sur mes leaks.");
  eq(patch.adaptiveMode, "leak-hunter", "adaptiveMode leak-hunter");
  eq(patch.workOn, ["Mes leaks détectés"], "workOn mes leaks");
}

/* ── §57 Exemple 3 : « Je joue une TF ce soir. » ── */
{
  const { patch } = parseTrainingRequest("Je joue une TF ce soir.");
  eq(patch.tournamentPhase, "Table Finale", "phase Table Finale");
  eq(patch.adaptiveMode, "tournament-prep", "prépa tournoi (tf ce soir)");
}

/* ── Positions seules ── */
{
  eq(parseTrainingRequest("travaille mon jeu au BTN").patch.heroPosition, "BTN", "position héro seule BTN");
  ok(parseTrainingRequest("UTG+1 vs BB").patch.heroPosition === "UTG+1", "UTG+1 matché avant UTG");
}

/* ── Stacks : single / court / profond ── */
{
  eq(parseTrainingRequest("15bb push fold").patch.stackDepth, "15", "15bb");
  eq(parseTrainingRequest("spots tapis court").patch.stackDepth, "10", "tapis court → 10");
  eq(parseTrainingRequest("cash profond").patch.stackDepth, "100", "profond → 100");
  eq(parseTrainingRequest("32bb").patch.stackDepth, "30", "32bb → preset 30");
}

/* ── Formats ── */
{
  eq(parseTrainingRequest("un peu de PKO").patch.formatDetail, "PKO", "PKO");
  eq(parseTrainingRequest("cash game 6max").patch.formatDetail, "Cash Game", "Cash Game");
  eq(parseTrainingRequest("spin & go").patch.formatDetail, "Expresso / Spin", "Spin");
  eq(parseTrainingRequest("satellite").patch.format, "MTT ICM", "satellite → famille ICM");
}

/* ── Types de spot multiples ── */
{
  const { patch } = parseTrainingRequest("bosse mes 3bet et squeeze");
  ok(patch.spotTypes.includes("3bet") && patch.spotTypes.includes("Squeeze"), "3bet + squeeze");
}
{
  eq(parseTrainingRequest("cbet flop").patch.spotTypes, ["C-bet Flop"], "cbet → C-bet Flop");
  eq(parseTrainingRequest("bluff catch river").patch.spotTypes.includes("Bluff Catch"), true, "bluff catch");
}

/* ── Mode GTO / Exploit ── */
{
  eq(parseTrainingRequest("en mode exploit vs fish").patch.trainingMode, "exploit", "exploit");
  eq(parseTrainingRequest("gto pur").patch.trainingMode, "gto", "gto");
}

/* ── Longueur de session / tables ── */
{
  eq(parseTrainingRequest("un sprint").patch.sessionLength, 20, "sprint → 20");
  eq(parseTrainingRequest("marathon").patch.sessionLength, 100, "marathon → 100");
  eq(parseTrainingRequest("sur 2 tables").patch.tableCount, 2, "2 tables");
}

/* ── orchestrateTrainingRequest : flux complet NL → config → contraintes ── */
{
  const r = orchestrateTrainingRequest("BB vs BTN 25bb en MTT", DEFAULT_TRAINING_CONFIG);
  eq(r.config.heroPosition, "BB", "config héro BB");
  eq(r.config.villainPosition, "BTN", "config villain BTN");
  eq(r.config.stackDepth, "25", "config stack 25");
  ok(r.constraints.ok, "contraintes ok");
  ok(r.understood, "demande comprise");
}

/* ── ConstraintEngine appliqué : HU force 2 joueurs ── */
{
  const r = orchestrateTrainingRequest("prépare-moi un heads-up", DEFAULT_TRAINING_CONFIG);
  eq(r.config.tournamentPhase, "Heads-Up", "phase HU");
  eq(r.config.tableStructure, 2, "HU → structure 2J (auto-résolu)");
}

/* ── Position incohérente auto-résolue : UTG demandé mais HU→2J ── */
{
  const r = orchestrateTrainingRequest("UTG vs BB en heads-up", DEFAULT_TRAINING_CONFIG);
  eq(r.config.tableStructure, 2, "HU → 2J");
  eq(r.config.heroPosition, "Tous", "UTG impossible en 2J → libéré par le ConstraintEngine");
}

/* ── describeUnderstanding ── */
{
  const { matched } = parseTrainingRequest("BB vs BTN 20bb");
  ok(describeUnderstanding(matched).startsWith("J'ai compris"), "résumé lisible");
  ok(describeUnderstanding([]).includes("configuration actuelle"), "fallback si rien compris");
}

console.log(`✅ aiTrainingOrchestrator — ${passed} assertions OK`);
