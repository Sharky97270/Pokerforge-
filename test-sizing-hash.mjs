/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-hash — PFASE §19, §20, §63 : CANONICALISATION ET CACHE

   §19 nomme le piège exactement : « Attention à ne pas générer deux IDs
   différents pour deux états mathématiquement identiques à cause d'un simple
   ordre JSON. » L'inverse est tout aussi grave, et c'est celui qui s'est
   réellement produit pendant le développement : DEUX ARBRES DIFFÉRENTS
   partageant une entrée de cache, donc trois sizings crédités de la même EV.

   §63 exige qu'un changement de board, de tapis, de range, de rake, de sizing
   candidat ou de version de moteur invalide la clé.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  canonicalize, canonicalRange, canonicalTreeSpec, canonicalSolverConfig,
  gameStateHash, solutionId, evaluationKey, hash64,
} from "./src/sizing/canonicalHash.js";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { potSizing, previousBetSizing, jamSizing, geometricSizing } from "./src/sizing/sizingSpec.js";
import { SIZING_ENGINE_VERSION, SOLVER_VERSION, SOLUTION_SCHEMA_VERSION } from "./src/sizing/config.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const ne = (a, b, m) => { assert.notDeepEqual(a, b, m); passed++; };

const baseInput = (over = {}) => ({
  gameType: "CASH", street: "FLOP", board: [12, 25, 3], blinds: { sb: 0.5, bb: 1 },
  players: [
    { id: "h", position: "BB", stack: 94, committedStreet: 0, isHero: true },
    { id: "v", position: "BTN", stack: 94, committedStreet: 0 },
  ],
  deadPot: 12, actorId: "h", ...over,
});
const RANGE_A = { AA: { r: 100, c: 0, f: 0 }, KK: { r: 0, c: 80, f: 20 }, "72o": { r: 0, c: 0, f: 100 } };
const RANGE_B = { AA: { r: 100, c: 0, f: 0 }, KK: { r: 0, c: 60, f: 40 } };
const H = (over = {}, extra = {}) => gameStateHash({
  state: normalizeGameState(baseInput(over)).state,
  heroRange: RANGE_A, villainRanges: [RANGE_B],
  treeSpec: { mode: "AUTOMATIC", betSizes: [potSizing(0.33), potSizing(0.75)] },
  solverConfig: { maxIterations: 200, maxCombos: 140 },
  ...extra,
}).hash;

console.log("\n── §19 — l'ordre des clés ne change RIEN");
{
  eq(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }), "deux objets, mêmes données, ordres différents → même chaîne");
  eq(canonicalize({ x: { p: 1, q: 2 } }), canonicalize({ x: { q: 2, p: 1 } }), "y compris en profondeur");
  ne(canonicalize([1, 2]), canonicalize([2, 1]), "un TABLEAU garde son ordre : une séquence d'actions n'est pas un ensemble");
  eq(canonicalize(undefined), "∅", "undefined a une représentation stable");
  eq(canonicalize(null), "∅", "null aussi");
  /* Le bruit flottant ne doit pas créer deux états. */
  eq(canonicalize({ v: 100 }), canonicalize({ v: 100.0000001 }), "un bruit sous la quantification ne crée pas un état distinct");
  eq(canonicalize({ v: 0 }), canonicalize({ v: -0 }), "0 et −0 sont le même nombre");
}

console.log("\n── §19 — une range est un ENSEMBLE, un arbre aussi");
{
  eq(canonicalRange({ AA: { r: 100 }, KK: { c: 50 } }), canonicalRange({ KK: { c: 50 }, AA: { r: 100 } }),
    "l'ordre d'insertion des mains ne change pas la range");
  eq(canonicalRange({ AA: { r: 100 }, "72o": { f: 100 } }), canonicalRange({ AA: { r: 100 } }),
    "une main jamais continuée n'entre pas dans la signature (elle ne change pas le solve)");
  ne(canonicalRange({ AA: { r: 100 } }), canonicalRange({ AA: { r: 50, c: 50 } }),
    "un poids différent change la range");

  eq(canonicalTreeSpec({ betSizes: [potSizing(0.33), potSizing(0.75)] }),
    canonicalTreeSpec({ betSizes: [potSizing(0.75), potSizing(0.33)] }),
    "{33,75} et {75,33} sont le MÊME arbre");
  ne(canonicalTreeSpec({ betSizes: [potSizing(0.33)] }),
    canonicalTreeSpec({ betSizes: [potSizing(0.33), potSizing(0.75)] }),
    "ajouter un sizing change l'arbre");
}

console.log("\n── LE BUG RÉEL : deux nommages, une seule vérité");
{
  /* Le moteur nomme `betSizes`, PFASE nomme `betSpecs`. Ne lire qu'un seul des
     deux rendait TOUS les arbres identiques du point de vue du hash — donc une
     entrée de cache unique, donc la même EV renvoyée pour tous les sizings. */
  eq(canonicalTreeSpec({ betSpecs: [potSizing(0.33)] }), canonicalTreeSpec({ betSizes: [potSizing(0.33)] }),
    "les deux nommages produisent la même canonicalisation");
  ne(canonicalTreeSpec({ betSpecs: [potSizing(0.33)] }), canonicalTreeSpec({ betSpecs: [potSizing(0.75)] }),
    "et deux arbres différents restent différents (le bug corrigé)");
  ne(canonicalTreeSpec({ betSpecs: [potSizing(0.33)] }), canonicalTreeSpec({ betSpecs: [jamSizing()] }),
    "33% et le jam ne sont pas le même arbre");
  ne(canonicalTreeSpec({ betSpecs: [potSizing(0.33)], raiseSpecs: [previousBetSizing(2.5)] }),
    canonicalTreeSpec({ betSpecs: [potSizing(0.33)], raiseSpecs: [previousBetSizing(3)] }),
    "changer un sizing de RELANCE change l'arbre");
  ne(canonicalTreeSpec({ betSpecsByPlayer: { 0: [potSizing(0.33)], 1: [potSizing(0.75)] } }),
    canonicalTreeSpec({ betSpecsByPlayer: { 0: [potSizing(0.75)], 1: [potSizing(0.33)] } }),
    "un arbre asymétrique n'est pas son miroir");
  ne(canonicalTreeSpec({ betSpecs: [potSizing(0.33)], allowJam: true }),
    canonicalTreeSpec({ betSpecs: [potSizing(0.33)], allowJam: false }),
    "autoriser le jam change l'arbre");
  ne(canonicalTreeSpec({ betSpecs: [geometricSizing(2)] }), canonicalTreeSpec({ betSpecs: [geometricSizing(3)] }),
    "deux horizons géométriques sont deux sizings");
}

console.log("\n── §63 — ce qui change le résultat change la clé");
{
  const ref = H();
  eq(H(), ref, "même état, même chemin → même hash (déterminisme)");

  ne(H({ board: [12, 25, 4] }), ref, "changer le BOARD invalide");
  ne(H({ players: [{ id: "h", position: "BB", stack: 50, committedStreet: 0, isHero: true }, { id: "v", position: "BTN", stack: 94, committedStreet: 0 }] }), ref, "changer un TAPIS invalide");
  ne(H({ deadPot: 20 }), ref, "changer le POT invalide");
  ne(H({ blinds: { sb: 1, bb: 2 } }), ref, "changer les BLINDES invalide");
  ne(H({ ante: 0.2 }), ref, "ajouter une ANTE invalide");
  ne(H({ rake: { pct: 0.05, cap: 3 } }), ref, "changer le RAKE invalide");
  ne(H({ street: "TURN", board: [12, 25, 3, 40] }), ref, "changer la RUE invalide");
  ne(H({ actorId: "v" }), ref, "changer l'ACTEUR invalide");

  /* Ranges */
  const otherRange = gameStateHash({
    state: normalizeGameState(baseInput()).state,
    heroRange: { AA: { r: 50, c: 50 } }, villainRanges: [RANGE_B],
    treeSpec: { mode: "AUTOMATIC", betSizes: [potSizing(0.33), potSizing(0.75)] },
    solverConfig: { maxIterations: 200, maxCombos: 140 },
  }).hash;
  ne(otherRange, ref, "changer une RANGE invalide");

  /* Sizings candidats */
  const otherTree = gameStateHash({
    state: normalizeGameState(baseInput()).state,
    heroRange: RANGE_A, villainRanges: [RANGE_B],
    treeSpec: { mode: "AUTOMATIC", betSizes: [potSizing(0.33), potSizing(0.75), potSizing(1.5)] },
    solverConfig: { maxIterations: 200, maxCombos: 140 },
  }).hash;
  ne(otherTree, ref, "ajouter un SIZING CANDIDAT invalide");

  /* Configuration solveur */
  const otherCfg = gameStateHash({
    state: normalizeGameState(baseInput()).state,
    heroRange: RANGE_A, villainRanges: [RANGE_B],
    treeSpec: { mode: "AUTOMATIC", betSizes: [potSizing(0.33), potSizing(0.75)] },
    solverConfig: { maxIterations: 400, maxCombos: 140 },
  }).hash;
  ne(otherCfg, ref, "changer la PRÉCISION invalide (une comparaison rapide n'est pas une solution)");
}

console.log("\n── §80 — les trois versions entrent dans la clé");
{
  const g = gameStateHash({
    state: normalizeGameState(baseInput()).state,
    heroRange: RANGE_A, villainRanges: [RANGE_B],
  });
  ok(g.canonical.includes(SIZING_ENGINE_VERSION), "la version du moteur de sizing est dans la chaîne canonique");
  ok(g.canonical.includes(SOLVER_VERSION), "celle du solveur aussi");
  ok(g.canonical.includes(String(SOLUTION_SCHEMA_VERSION)), "celle du schéma aussi");
  ok(/^PFS-[0-9A-F]{16}$/.test(g.hash), "le hash a un préfixe et une largeur stables (64 bits)");
}

console.log("\n── §28 — un état, quatre solutions");
{
  const h = "PFS-ABCDEF0123456789";
  eq(solutionId(h, "SINGLE"), `${h}#SINGLE`, "l'id d'une solution = état + complexité");
  ne(solutionId(h, "SINGLE"), solutionId(h, "SIMPLE"), "deux niveaux ne se recouvrent pas");
  eq(solutionId(h), `${h}#FULL`, "le défaut est FULL");
}

console.log("\n── clés d'ÉVALUATION : distinctes des clés de solution");
{
  const h = "PFS-0000000000000001";
  const a = evaluationKey(h, { betSpecs: [potSizing(0.33)] }, { maxIterations: 100 });
  const b = evaluationKey(h, { betSpecs: [potSizing(0.75)] }, { maxIterations: 100 });
  const c = evaluationKey(h, { betSpecs: [potSizing(0.33)] }, { maxIterations: 200 });
  ne(a, b, "deux sous-arbres → deux clés d'évaluation");
  ne(a, c, "deux précisions → deux clés d'évaluation");
  ok(a.startsWith("EVAL:"), "une clé d'évaluation est reconnaissable — un micro-solve n'est pas une solution (§13)");
  eq(a, evaluationKey(h, { betSpecs: [potSizing(0.33)] }, { maxIterations: 100 }), "déterminisme");
}

console.log("\n── robustesse du hash");
{
  eq(hash64("abc"), hash64("abc"), "déterministe");
  ne(hash64("abc"), hash64("abd"), "sensible à un caractère");
  eq(hash64("").length, 16, "largeur constante, même sur l'entrée vide");
  /* Absence de collision sur un large échantillon d'états proches. */
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(hash64(`spot-${i}-board-${i % 52}-stack-${i * 1.5}`));
  eq(seen.size, 5000, "5000 chaînes voisines → 5000 hashs distincts");
}

console.log("\n── §20 — la configuration solveur est canonicalisée aussi");
{
  eq(canonicalSolverConfig({ maxIterations: 100, maxCombos: 50 }), canonicalSolverConfig({ maxCombos: 50, maxIterations: 100 }),
    "l'ordre des options ne change pas la clé");
  ne(canonicalSolverConfig({ seed: 1 }), canonicalSolverConfig({ seed: 2 }),
    "la graine entre dans la clé — deux runouts échantillonnés différemment ne sont pas le même solve");
  eq(canonicalSolverConfig(null), "∅", "config absente a une représentation stable");
}

console.log(`\n✅ PFASE canonicalisation et cache (§19/§20/§63/§80) — ${passed} assertions OK\n`);
