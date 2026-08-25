/* ══════════════════════════════════════════════════════════════════════════
   PFASE · CANONICALISATION ET HASH (Mission §19, §20, §63, §80)

   LE PROBLÈME EXACT QUE CE MODULE RÉSOUT
   `makeSolveId` (solver/api.js) hache `JSON.stringify(spec)`. Or l'ordre des
   clés d'un objet JavaScript dépend de l'ordre d'insertion : deux états
   mathématiquement identiques construits par deux chemins de code différents
   produisent deux chaînes différentes, donc deux IDs différents, donc deux
   solves au lieu d'un — et, pire, un « cache miss » qui ressemble à un « spot
   différent ». La mission le nomme explicitement (§19).

   Ici, la canonicalisation est explicite : clés triées, nombres quantifiés,
   tableaux d'ensembles triés. Deux états mathématiquement identiques rendent la
   MÊME chaîne, quel que soit le chemin de construction.

   Le hash inclut les TROIS versions (§80) : une mise à jour du moteur invalide
   automatiquement les solutions incompatibles, sans purge manuelle.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { SIZING_ENGINE_VERSION, SOLVER_VERSION, SOLUTION_SCHEMA_VERSION, DEFAULT_ROUNDING } from "./config.js";
import { specKey } from "./sizingSpec.js";

/* ── QUANTIFICATION ────────────────────────────────────────────────────────
   Deux stacks de 99.9999999 et 100.0000001 bb sont le même stack. Sans
   quantification, l'erreur d'arrondi flottant crée des clés distinctes pour des
   états identiques — le défaut inverse de celui de §19, tout aussi nuisible. */
const q = (v, decimals) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "NaN";
  const p = Math.pow(10, decimals);
  const r = Math.round(n * p) / p;
  /* `-0` et `0` sont le même nombre ; `Object.is` les distingue, pas nous. */
  return String(r === 0 ? 0 : r);
};
const qa = (v) => q(v, DEFAULT_ROUNDING.amountDecimals);
const qf = (v) => q(v, DEFAULT_ROUNDING.fractionDecimals);

/* ── SÉRIALISATION CANONIQUE GÉNÉRIQUE ─────────────────────────────────────
   Clés triées à tous les niveaux. Les tableaux gardent leur ordre (il porte du
   sens : une séquence d'actions n'est pas un ensemble) ; c'est à l'appelant de
   trier ce qui est un ensemble. */
export function canonicalize(value) {
  if (value === null || value === undefined) return "∅";
  const t = typeof value;
  if (t === "number") return Number.isFinite(value) ? qa(value) : "NaN";
  if (t === "boolean") return value ? "1" : "0";
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (t === "object") {
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
  }
  return "?";   // fonction, symbole : jamais dans une clé de cache
}

/* ── HASH ──────────────────────────────────────────────────────────────────
   FNV-1a sur deux voies indépendantes (offsets différents) concaténées : 64 bits
   effectifs. Un hash 32 bits collisionne en pratique vers quelques dizaines de
   milliers d'entrées (paradoxe des anniversaires) — insuffisant pour une
   bibliothèque de solutions qu'on veut pouvoir laisser grossir. */
export function hash64(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  h1 >>>= 0; h2 >>>= 0;
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/* ── RANGE ─────────────────────────────────────────────────────────────────
   Une range est un ENSEMBLE de (classe → poids) : ses clés sont triées, les
   classes de poids nul sont omises (elles ne changent rien au solve), et les
   poids sont quantifiés au dixième de point. */
export function canonicalRange(freqs) {
  if (!freqs || typeof freqs !== "object") return "∅";
  const parts = [];
  for (const k of Object.keys(freqs).sort()) {
    const f = freqs[k] || {};
    const r = Number(f.r) || 0, c = Number(f.c) || 0;
    if (r + c <= 0) continue;
    parts.push(k + ":" + q(r, 1) + "/" + q(c, 1));
  }
  return parts.join(";");
}

/* ── ARBRE DE MISES ────────────────────────────────────────────────────────
   L'ensemble des sizings d'un nœud est un ENSEMBLE : {33,75} et {75,33} sont le
   même arbre. On trie donc les clés de spec. */
export function canonicalTreeSpec(treeSpec) {
  if (!treeSpec) return "∅";
  const setOf = (arr) => (Array.isArray(arr) ? arr.map(specKey).sort() : []);
  /* ── DEUX NOMMAGES, UNE SEULE VÉRITÉ ────────────────────────────────────
     Le moteur (`buildPostflopTree`) nomme ses entrées `betSizes`/`raiseSizes` ;
     PFASE les nomme `betSpecs`/`raiseSpecs` pour rappeler qu'il s'agit d'objets
     typés et non de nombres. Ne lire qu'un seul des deux jeux de noms rendait
     TOUS les arbres identiques du point de vue du hash — donc une seule entrée
     de cache pour tous les sous-arbres, donc la même EV renvoyée partout. Le
     symptôme observé : trois sizings différents crédités exactement de la même
     EV. C'est précisément la panne que §62 demande de rendre impossible. */
  const bets = treeSpec.betSizes ?? treeSpec.betSpecs;
  const raises = treeSpec.raiseSizes ?? treeSpec.raiseSpecs;
  const byPlayer = treeSpec.betSizesByPlayer ?? treeSpec.betSpecsByPlayer;
  return canonicalize({
    mode: treeSpec.mode || null,
    complexity: treeSpec.complexity || null,
    betSizes: setOf(bets),
    raiseSizes: setOf(raises),
    /* Sizings PAR JOUEUR quand ils diffèrent (arbre asymétrique) */
    betSizesByPlayer: byPlayer ? { 0: setOf(byPlayer[0]), 1: setOf(byPlayer[1]) } : null,
    maxRaisesPerStreet: treeSpec.maxRaisesPerStreet ?? null,
    allowJam: !!treeSpec.allowJam,
    ipProbe: treeSpec.ipProbe !== false,
    streets: treeSpec.streets ?? null,
    /* Overrides par nœud (Tree Editor §26) : chemin → sizings, triés par chemin */
    /* §26 — un override est un OBJET { betSizes, raiseSizes, allowJam }, pas un
       tableau. Le canonicaliser comme un tableau rendait tous les overrides
       équivalents, donc invisibles au cache : deux arbres différents auraient
       partagé une entrée (§63). */
    nodeOverrides: treeSpec.nodeOverrides
      ? Object.keys(treeSpec.nodeOverrides).sort().map(path => {
        const o = treeSpec.nodeOverrides[path] || {};
        return [
          path,
          "b:" + setOf(o.betSizes).join("+"),
          "r:" + setOf(o.raiseSizes).join("+"),
          "j:" + (o.allowJam == null ? "-" : o.allowJam ? "1" : "0"),
        ].join("=");
      })
      : null,
  });
}

/* ── CONFIGURATION SOLVEUR ─────────────────────────────────────────────────
   Deux solves du même arbre à des précisions différentes ne sont PAS la même
   solution : la config entre dans la clé (§20/§63). */
export function canonicalSolverConfig(cfg) {
  if (!cfg) return "∅";
  return canonicalize({
    maxIterations: cfg.maxIterations ?? null,
    maxCombos: cfg.maxCombos ?? null,
    evaluationDepth: cfg.evaluationDepth ?? null,
    convergenceTarget: cfg.convergenceTarget ?? null,
    seed: cfg.seed ?? null,
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   gameStateHash — l'identifiant canonique d'un ÉTAT DE JEU (§19).

   Inclut, comme exigé : format, positions, stacks, pot, street, board, ranges,
   historique d'actions, rake, antes, arbre de sizing, configuration solveur,
   et les trois versions.

   Ne contient PAS : la main exacte du Héros (un solve porte sur des ranges, pas
   sur un combo — deux mains différentes lisent la MÊME solution). C'est
   volontaire et c'est ce qui rend le cache utile.
   ══════════════════════════════════════════════════════════════════════════ */
export function gameStateHash({ state, heroRange, villainRanges, treeSpec, solverConfig, extra } = {}) {
  const core = [
    "v", SIZING_ENGINE_VERSION, SOLVER_VERSION, String(SOLUTION_SCHEMA_VERSION),
    "g", String(state?.gameType || ""), String(state?.format || ""), String(state?.tableFormat || ""),
    "s", String(state?.street || ""),
    "b", (state?.boardKeys || []).join(""),                 // ordre du board conservé (il est donné)
    "bl", qa(state?.blinds?.sb), qa(state?.blinds?.bb), qa(state?.ante),
    "rk", qf(state?.rake?.pct), state?.rake?.cap == null ? "∅" : qa(state.rake.cap), state?.rake?.applied ? "1" : "0",
    "p", qa(state?.pot), qa(state?.deadPot),
    /* Les joueurs sont triés par position pour que deux constructions du même
       état (ordre de sièges différent) rendent la même clé. Le rôle (hero/acteur)
       est porté séparément. */
    "pl", (state?.players || []).slice()
      .map(p => [p.position, qa(p.stack), qa(p.committedStreet), qa(p.committedTotal), p.folded ? "F" : "-", p.allIn ? "A" : "-"].join("~"))
      .sort().join("|"),
    "hero", String(state?.heroId || ""), "actor", String(state?.actorPosition || ""),
    "ah", (state?.actionHistory || []).map(a => `${a.street}:${a.position}:${a.actionType}:${qa(a.size)}`).join(">"),
    "em", String(state?.evaluationModel || ""),
    "icm", state?.icmParams ? canonicalize(state.icmParams) : "∅",
    "pko", state?.pkoParams ? canonicalize(state.pkoParams) : "∅",
    "rh", canonicalRange(heroRange),
    "rv", (villainRanges || []).map(canonicalRange).join("#"),
    "tree", canonicalTreeSpec(treeSpec),
    "cfg", canonicalSolverConfig(solverConfig),
    "x", extra ? canonicalize(extra) : "∅",
  ].join("");
  return { canonical: core, hash: "PFS-" + hash64(core).toUpperCase() };
}

/* Identifiant d'une SOLUTION : état + niveau de complexité. Un même état porte
   jusqu'à quatre solutions (FULL/ADVANCED/SIMPLE/SINGLE — §28) ; elles doivent
   coexister sans se recouvrir. */
export function solutionId(gameHash, complexity) {
  return `${gameHash}#${String(complexity || "FULL").toUpperCase()}`;
}

/* Clé de cache d'une ÉVALUATION de sous-ensemble (§20, premier étage de cache).
   Distincte de la clé de solution : une évaluation est un micro-solve tronqué,
   jamais interchangeable avec le solve final (§13). */
export function evaluationKey(gameHash, treeSpec, evalConfig) {
  return `EVAL:${gameHash}:${hash64(canonicalTreeSpec(treeSpec) + "" + canonicalSolverConfig(evalConfig))}`;
}
