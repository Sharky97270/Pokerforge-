/* Tests — convention d'affichage des nombres (finitions §12).
   Ce que cette suite protège : « 1.0bb », « 4.00bb » et « SPR 10.0 » ne doivent
   plus atteindre l'écran, SANS perdre les décimales qui, elles, disent quelque
   chose (« 1.5bb », « 0.25bb »).
   Lancement : node test-format-numbers.mjs                                    */
import { fmtNum, fmtBb, fmtSpr, roundBb } from "./src/utils/format.js";

let passed = 0, failed = 0;
function ok(c, m){ if(c) passed++; else { failed++; console.error("  ✗ " + m); } }
function eq(a, b, m){ ok(a === b, `${m} — attendu « ${b} », reçu « ${a} »`); }
function section(t){ console.log("\n── " + t); }

/* ── Les formes proscrites par le cahier des charges ── */
section("Zéros inutiles supprimés");
eq(fmtNum(1.0), "1", "1.0 → 1");
eq(fmtNum(4.00, 2), "4", "4.00 → 4");
eq(fmtNum(40), "40", "40 reste 40");
eq(fmtBb(1.0), "1bb", "1.0bb → 1bb");
eq(fmtBb(4), "4bb", "4bb inchangé");
eq(fmtBb(13.50), "13.5bb", "13.50bb → 13.5bb");

/* ── Les décimales qui portent une information sont conservées ── */
section("Décimales significatives conservées");
eq(fmtNum(1.5), "1.5", "1.5 conservé");
eq(fmtBb(1.5), "1.5bb", "1.5bb conservé");
eq(fmtBb(13.5), "13.5bb", "13.5bb conservé");
eq(fmtNum(0.25, 2), "0.25", "0.25 conservé à 2 décimales");
eq(fmtNum(-0.75, 2), "-0.75", "les pertes gardent leur signe");

/* ── Arrondi AVANT suppression des zéros, jamais l'inverse ── */
section("Ordre arrondi → nettoyage");
eq(fmtNum(0.249, 2), "0.25", "0.249 s'arrondit à 0.25");
eq(fmtNum(0.996, 2), "1", "0.996 → 1, pas « 1.00 »");
eq(fmtNum(2.04, 1), "2", "2.04 à une décimale → 2");
eq(fmtNum(2.06, 1), "2.1", "2.06 à une décimale → 2.1");

/* ── -0 est un artefact d'arrondi, jamais une perte ── */
section("Pas de « -0 »");
eq(fmtNum(-0.001, 2), "0", "-0.001 → 0, jamais « -0 »");
eq(fmtNum(-0), "0", "-0 → 0");

/* ── SPR ── */
section("SPR");
eq(fmtSpr(100, 10), "10", "SPR 10 (et non « 10.0 ») — la faute mesurée à l'écran");
eq(fmtSpr(45, 10), "4.5", "SPR 4.5 conservé");
eq(fmtSpr(100, 0), "—", "pot nul → pas de SPR inventé");
eq(fmtSpr(100, null), "—", "pot absent → pas de SPR inventé");

/* ── Entrées invalides : on ne fabrique aucun chiffre ── */
section("Entrées invalides");
eq(fmtNum(null), "—", "null → tiret");
eq(fmtNum(undefined), "—", "undefined → tiret");
eq(fmtNum(NaN), "—", "NaN → tiret");
eq(fmtNum(Infinity), "—", "Infinity → tiret");

/* ── `roundBb` (préexistant) renvoie toujours un NOMBRE, pas une chaîne ── */
section("Compatibilité roundBb");
ok(typeof roundBb(1.04) === "number", "roundBb renvoie un nombre");
eq(String(roundBb(1.04)), "1", "roundBb(1.04) s'affiche « 1 »");
eq(String(roundBb(1.06)), "1.1", "roundBb(1.06) s'affiche « 1.1 »");

console.log(`\n${failed ? "❌" : "✅"} format des nombres — ${passed} assertions OK, ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
