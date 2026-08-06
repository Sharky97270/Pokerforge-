/* Tests de l'infrastructure de charts préflop (registre + lookup + intégration).
   AUCUN chart réel n'est livré avec l'app : les données ci-dessous sont des FIXTURES
   de test, volontairement minuscules et étiquetées comme telles. */
import assert from "node:assert";
import {
  validateChartSet, registerChartSet, listChartSets, clearChartSets, chartCount,
  lookupPreflopChart, CHART_ACTIONS, STACK_TOLERANCE_BB,
} from "./src/solver/preflopCharts.js";
import { resolveFromChart, resolveSpotStrategy } from "./src/trainerStrategyProvider.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

// ── 1. INERTE PAR DÉFAUT : sans données chargées, rien ne change ──
clearChartSets();
eq(chartCount(), 0, "registre vide au départ");
eq(lookupPreflopChart({ heroPos: "BTN", action: "rfi", stackBb: 100, handKey: "AA" }), null,
  "lookup sans données → null");
const spotRfi = {
  street: "Preflop", cat: "RFI", hpos: "BTN", vpos: "BB", stack: "100",
  hand: [{ r: "A", s: "♠" }, { r: "A", s: "♥" }],
  acts: [{ id: "FOLD", l: "Fold" }, { id: "OPEN", l: "Open 2.5bb" }],
  ok: 1, freq: { OPEN: 88 },
};
eq(resolveFromChart(spotRfi), null, "resolveFromChart sans données → null");
const sansChart = resolveSpotStrategy(spotRfi);
eq(sansChart.source, "heuristic", "sans chart le spot reste heuristique (aucune régression)");

// ── 2. VALIDATION : l'attribution est OBLIGATOIRE ──
const base = {
  id: "fixture-test", label: "Fixture de test", attribution: "FIXTURE DE TEST — pas un vrai chart",
  stackBb: 100, spots: { "BTN|rfi": { AA: { r: 100, c: 0, f: 0 }, "72o": { r: 0, c: 0, f: 100 } } },
};
ok(validateChartSet(base).ok, "chart complet accepté");
ok(!validateChartSet({ ...base, attribution: "" }).ok, "attribution vide → REFUSÉ");
ok(!validateChartSet({ ...base, attribution: undefined }).ok, "attribution absente → REFUSÉ");
ok(validateChartSet({ ...base, attribution: undefined }).errors.some(e => /attribution/i.test(e)),
  "l'erreur nomme explicitement l'attribution");
ok(!validateChartSet({ ...base, id: undefined }).ok, "id manquant → refusé");
ok(!validateChartSet({ ...base, stackBb: 0 }).ok, "stackBb invalide → refusé");
ok(!validateChartSet({ ...base, spots: {} }).ok, "spots vide → refusé");
ok(!validateChartSet({ ...base, spots: { "BTN|inconnu": { AA: { r: 100 } } } }).ok, "action inconnue → refusée");
ok(!validateChartSet({ ...base, spots: { "BTN": { AA: { r: 100 } } } }).ok, "clé sans action → refusée");
ok(!validateChartSet({ ...base, spots: { "BTN|rfi": { AA: { r: 80, c: 80, f: 0 } } } }).ok,
  "fréquences > 100% → refusées");
assert.throws(() => registerChartSet({ ...base, attribution: "" }), /Chart refusé/, "register lève si invalide");
n++;
eq(chartCount(), 0, "un chart refusé n'entre pas dans le registre");

// ── 3. LOOKUP ──
registerChartSet(base);
eq(chartCount(), 1, "chart enregistré");
eq(listChartSets()[0].attribution, base.attribution, "l'attribution est exposée");
const hit = lookupPreflopChart({ heroPos: "BTN", action: "rfi", stackBb: 100, handKey: "AA" });
ok(hit && hit.freqs.r === 100, "lookup trouve AA");
eq(hit.exactStack, true, "tapis exact");
eq(hit.attribution, base.attribution, "l'attribution suit le résultat");
eq(lookupPreflopChart({ heroPos: "BTN", action: "rfi", stackBb: 100, handKey: "KK" }), null,
  "main absente du chart → null (on n'invente pas)");
eq(lookupPreflopChart({ heroPos: "CO", action: "rfi", stackBb: 100, handKey: "AA" }), null,
  "position non couverte → null");
// tolérance de tapis
ok(lookupPreflopChart({ heroPos: "BTN", action: "rfi", stackBb: 100 - STACK_TOLERANCE_BB + 1, handKey: "AA" }),
  "tapis proche → toléré");
eq(lookupPreflopChart({ heroPos: "BTN", action: "rfi", stackBb: 20, handKey: "AA" }), null,
  "tapis trop éloigné → null plutôt qu'une range fausse");
// clé spécifique à l'adversaire prioritaire
registerChartSet({
  id: "fixture-vs", label: "Fixture vs", attribution: "FIXTURE DE TEST", stackBb: 100,
  spots: { "BB|vs_open|BTN": { AA: { r: 90, c: 10, f: 0 } }, "BB|vs_open": { AA: { r: 50, c: 50, f: 0 } } },
});
const vsHit = lookupPreflopChart({ heroPos: "BB", vsPos: "BTN", action: "vs_open", stackBb: 100, handKey: "AA" });
eq(vsHit.freqs.r, 90, "la clé spécifique à l'adversaire prime sur la générique");

// ── 4. INTÉGRATION au provider : provenance "chart", jamais "solver" ──
const avecChart = resolveSpotStrategy(spotRfi);
eq(avecChart.source, "chart", "avec un chart chargé, la source devient chart");
eq(avecChart.provenance, "preflop-chart", "provenance dédiée");
ok(avecChart.source !== "solver", "un chart ne se fait JAMAIS passer pour un solveur");
eq(avecChart.freq.OPEN, 100, "fréquence issue du chart mappée sur l'action");
eq(avecChart.ok, 1, "action majoritaire = Open");
ok(/Source\s*:/.test(avecChart.note), "la note cite la source (attribution)");
ok(/lues, non calcul/i.test(avecChart.note), "la note dit que les fréquences sont lues, pas calculées");
// une main hors chart retombe proprement sur l'heuristique
const spotHorsChart = { ...spotRfi, hand: [{ r: "7", s: "♠" }, { r: "5", s: "♥" }] };
eq(resolveSpotStrategy(spotHorsChart).source, "heuristic", "main hors chart → repli heuristique");
// un spot postflop n'est jamais servi par un chart préflop
eq(resolveFromChart({ ...spotRfi, street: "Flop" }), null, "postflop → pas de chart préflop");

clearChartSets();
eq(chartCount(), 0, "nettoyage du registre");
eq(resolveSpotStrategy(spotRfi).source, "heuristic", "après nettoyage, retour à l'heuristique");

console.log(`\n✅ preflopCharts — ${n} assertions OK`);
