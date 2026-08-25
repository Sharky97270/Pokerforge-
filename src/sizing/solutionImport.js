/* ══════════════════════════════════════════════════════════════════════════
   PFASE · IMPORT ET VÉRIFICATION DE SOLUTIONS EXTERNES (mission §84)

   « Validation externe (import Pio/HRC) ». Deux décisions gouvernent ce module,
   et il vaut mieux les énoncer d'emblée.

   ── 1. UN FORMAT NEUTRE, PAS UN FORMAT PROPRIÉTAIRE ─────────────────────────
   PokerForge ne lit AUCUN format binaire propriétaire, et ne rétro-conçoit rien.
   Il lit un format d'échange documenté ici, en JSON, que l'utilisateur produit
   depuis l'outil qu'il possède. La règle est explicite dans la mission : « ne pas
   tenter de copier du code, des modèles propriétaires, des données propriétaires
   ou des algorithmes non publics provenant d'un concurrent ». Un lecteur de
   format fermé serait exactement cela ; un format d'échange ouvert ne l'est pas.

   ── 2. « VERIFIED » VEUT DIRE MESURÉ, PAS REÇU ──────────────────────────────
   C'est le cœur du module. La provenance `VERIFIED_IMPORT` porte le mot
   « vérifié » ; l'accorder à un fichier simplement parce qu'il s'est chargé
   serait un badge mensonger au sens exact du §18.

   PokerForge vérifie donc pour de bon, avec ses propres outils :

     · il RECONSTRUIT l'arbre depuis l'état déclaré, et refuse si l'arbre importé
       n'est pas le même — un sizing en plus ou en moins, et les deux stratégies
       ne décrivent plus le même jeu ;
     · il INSTALLE la stratégie importée, main par main, dans cet arbre ;
     · il MESURE son exploitabilité par meilleure réponse exacte.

   Une stratégie d'équilibre a une exploitabilité proche de zéro. Une stratégie
   fausse, tronquée, mal alignée ou simplement médiocre a une exploitabilité que
   cette mesure révèle — en big blinds, pas en opinion. Le verdict en découle :

     exploitabilité ≤ tolérance  →  VERIFIED_IMPORT
     exploitabilité >  tolérance  →  APPROXIMATION, avec le chiffre mesuré

   Aucun import n'est refusé en silence, et aucun n'est promu sur parole.

   ── CE QUI RESTE HORS DE PORTÉE ─────────────────────────────────────────────
   La vérification exige que TOUS les nœuds de décision soient couverts par la
   stratégie importée : un nœud non couvert serait joué par le CFR de PokerForge,
   et l'on mesurerait alors l'exploitabilité d'un hybride, pas celle de l'import.
   En pratique cela restreint la vérification aux boards complets (river), où
   l'arbre n'a pas de rue suivante — la même frontière que L8. C'est dit, et le
   motif est rendu, plutôt que de rendre un nombre qui ne mesure pas ce qu'il
   prétend.
   ══════════════════════════════════════════════════════════════════════════ */

import { normalizeGameState } from "./gameState.js";
import { gameStateHash, solutionId } from "./canonicalHash.js";
import { buildSolution, SolutionProvenance } from "./solutionSchema.js";
import { solveTreeSpec } from "./solverAdapter.js";
import { extractStreetStrategy, pathKey } from "./strategyExtract.js";
import { bestResponseEV } from "../solver/core/multistreet.js";
import { specKey, potSizing, geometricSizing, previousBetSizing, jamSizing, bbSizing } from "./sizingSpec.js";
import { SolveStatus, SizingComplexity, EPS } from "./config.js";

export const IMPORT_FORMAT_VERSION = 1;

/* Au-delà de cette exploitabilité (en bb), un import n'est plus présenté comme
   une solution vérifiée. La valeur n'est pas arbitraire : elle est du même ordre
   que le plancher de mesure de PFASE lui-même — exiger mieux reviendrait à
   demander à un import d'être plus précis que ce que l'on sait mesurer. */
export const DEFAULT_IMPORT_TOLERANCE_BB = 0.10;

/* ══════════════════════════════════════════════════════════════════════════
   LE FORMAT D'ÉCHANGE — documenté ici, et nulle part ailleurs

   {
     "formatVersion": 1,
     "source":   { "tool": "…", "version": "…", "exportedAt": "2026-08-25T…" },
     "state":    { … tout ce qu'accepte normalizeGameState … },
     "heroRange":    { "AA": {"r":0,"c":100,"f":0}, … },
     "villainRange": { … },
     "sizings":  { "bets": [{"type":"pot","value":0.75}, …], "raises":[…],
                   "allowJam": true },
     "strategy": {
       "nodes": {
         "":      { "player":0, "byClass": { "AA": {"X":0.02,"B0":0.98}, … } },
         "B0":    { "player":1, "byClass": { … } },
         …
       }
     }
   }

   Les CHEMINS de nœuds ("", "B0", "X|B1") et les LABELS d'action sont ceux de
   l'arbre de PokerForge. C'est volontaire : c'est ce qui rend l'alignement
   vérifiable au lieu d'être deviné. Un export produit ailleurs doit donc être
   traduit — et cette traduction, faite par l'utilisateur ou par un script à lui,
   est exactement l'endroit où une erreur doit être détectée, pas absorbée.
   ══════════════════════════════════════════════════════════════════════════ */

const SPEC_BUILDERS = {
  pot: (v) => potSizing(v),
  geometric: (v, o) => geometricSizing(o && o.streets ? o.streets : v),
  previousBet: (v) => previousBetSizing(v),
  bb: (v) => bbSizing(v),
  jam: () => jamSizing(),
};

/* ── Lecture STRICTE. Rien n'est deviné, rien n'est complété par défaut. ──── */
export function parseImportedSolution(raw) {
  const problems = [];
  let doc = raw;
  if (typeof raw === "string") {
    try { doc = JSON.parse(raw); }
    catch (e) { return { ok: false, problems: [`JSON illisible : ${(e && e.message) || e}`] }; }
  }
  if (!doc || typeof doc !== "object") return { ok: false, problems: ["document vide ou non objet"] };

  if (doc.formatVersion !== IMPORT_FORMAT_VERSION) {
    problems.push(`formatVersion attendue ${IMPORT_FORMAT_VERSION}, reçue ${JSON.stringify(doc.formatVersion)}`);
  }
  if (!doc.state) problems.push("champ « state » absent — sans état de jeu, rien n'est vérifiable");
  if (!doc.heroRange || !Object.keys(doc.heroRange).length) problems.push("« heroRange » absente ou vide");
  if (!doc.villainRange || !Object.keys(doc.villainRange).length) problems.push("« villainRange » absente ou vide");
  if (!doc.sizings || !Array.isArray(doc.sizings.bets) || !doc.sizings.bets.length) {
    problems.push("« sizings.bets » absent ou vide — l'arbre ne peut pas être reconstruit");
  }
  if (!doc.strategy || !doc.strategy.nodes || !Object.keys(doc.strategy.nodes).length) {
    problems.push("« strategy.nodes » absent ou vide");
  }
  if (problems.length) return { ok: false, problems };

  /* Les sizings deviennent des specs TYPÉES — jamais des nombres nus (§37/§60). */
  const toSpecs = (arr, quoi) => (arr || []).map((s, i) => {
    const b = SPEC_BUILDERS[s && s.type];
    if (!b) { problems.push(`${quoi}[${i}] : type de sizing inconnu « ${s && s.type} »`); return null; }
    return b(s.value, s);
  }).filter(Boolean);
  const bets = toSpecs(doc.sizings.bets, "sizings.bets");
  const raises = toSpecs(doc.sizings.raises || [], "sizings.raises");

  /* Chaque distribution doit sommer à 1 — une stratégie qui ne somme pas à 1
     n'est pas une stratégie, et la « normaliser » en douce masquerait un export
     tronqué en le faisant passer pour valide. */
  for (const [path, node] of Object.entries(doc.strategy.nodes)) {
    if (!node || typeof node !== "object") { problems.push(`nœud « ${path} » illisible`); continue; }
    if (node.player !== 0 && node.player !== 1) problems.push(`nœud « ${path} » : « player » doit valoir 0 ou 1`);
    const byClass = node.byClass;
    if (!byClass || !Object.keys(byClass).length) { problems.push(`nœud « ${path} » : « byClass » absent`); continue; }
    for (const [cls, dist] of Object.entries(byClass)) {
      const vals = Object.values(dist || {});
      if (!vals.length) { problems.push(`nœud « ${path} », main ${cls} : distribution vide`); continue; }
      if (vals.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
        problems.push(`nœud « ${path} », main ${cls} : fréquence négative ou non numérique`);
        continue;
      }
      const sum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-3) problems.push(`nœud « ${path} », main ${cls} : les fréquences somment à ${sum.toFixed(4)} au lieu de 1`);
    }
  }
  if (problems.length) return { ok: false, problems };

  return {
    ok: true,
    imported: {
      formatVersion: doc.formatVersion,
      source: {
        tool: (doc.source && doc.source.tool) || "inconnu",
        version: (doc.source && doc.source.version) || null,
        exportedAt: (doc.source && doc.source.exportedAt) || null,
      },
      state: doc.state,
      heroRange: doc.heroRange,
      villainRange: doc.villainRange,
      treeSpec: { betSpecs: bets, raiseSpecs: raises, allowJam: !!doc.sizings.allowJam, maxRaisesPerStreet: doc.sizings.maxRaisesPerStreet ?? 1 },
      strategy: doc.strategy,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   verifyImportedSolution — LA MESURE

   Renvoie toujours un verdict, jamais une opinion :
     { ok, verified, exploitabilityBb, tolerance, provenance, coverage, reason }
   ══════════════════════════════════════════════════════════════════════════ */
export function verifyImportedSolution({ imported, tolerance = DEFAULT_IMPORT_TOLERANCE_BB, config = {} } = {}) {
  if (!imported) return { ok: false, reason: "aucune solution importée" };

  const n = normalizeGameState(imported.state);
  if (!n.ok) return { ok: false, reason: "état de jeu invalide", problems: n.errors };
  const state = n.state;

  /* La vérification est EXACTE ou n'est pas. Sur board incomplet, la meilleure
     réponse est échantillonnée : le nombre obtenu serait une estimation d'une
     exploitabilité, présentée comme une vérification. On refuse. */
  if (!state.board || state.board.length < 5) {
    return {
      ok: false,
      reason: "vérification refusée : elle exige un board complet. Sur board incomplet, l'exploitabilité est échantillonnée, et un import ne peut pas être déclaré « vérifié » sur une estimation (§0, cf. L8).",
    };
  }

  /* ── 1. LES DEUX ARBRES SONT-ILS LE MÊME ARBRE ? ──────────────────────────
     Un import qui décrit 33/75 et un arbre PokerForge qui offre 33/75/JAM ne
     décrivent pas le même jeu. Comparer leurs stratégies n'aurait aucun sens,
     et mesurer l'exploitabilité de l'un dans l'autre encore moins. */
  const probe = solveTreeSpec({
    state, heroRange: imported.heroRange, villainRange: imported.villainRange,
    treeSpec: imported.treeSpec,
    config: { maxIterations: 1, maxCombos: 0, seed: 1, ...config, noStore: true },
  });
  if (!probe.ok) return { ok: false, reason: `l'arbre ne se construit pas depuis l'état importé : ${probe.reason}` };

  const pfNodes = extractStreetStrategy(probe.solution, { includeEV: false });
  const attendus = Object.keys(pfNodes.nodes).sort();
  const fournis = Object.keys(imported.strategy.nodes).sort();
  const manquants = attendus.filter(p => !fournis.includes(p));
  const inconnus = fournis.filter(p => !attendus.includes(p));
  if (manquants.length || inconnus.length) {
    return {
      ok: false,
      reason: "l'arbre importé ne correspond pas à l'arbre reconstruit : la comparaison serait sans objet",
      coverage: { attendus: attendus.length, fournis: fournis.length, manquants, inconnus },
    };
  }
  /* Les ACTIONS de chaque nœud aussi : mêmes chemins ne garantit pas mêmes options. */
  for (const p of attendus) {
    const mine = pfNodes.nodes[p].actions.slice().sort();
    const theirs = Object.keys(Object.values(imported.strategy.nodes[p].byClass)[0] || {}).sort();
    if (mine.join(",") !== theirs.join(",")) {
      return {
        ok: false,
        reason: `nœud « ${p || "racine"} » : actions importées [${theirs.join(",")}] ≠ actions de l'arbre [${mine.join(",")}]`,
      };
    }
  }

  /* ── 2. INSTALLER LA STRATÉGIE IMPORTÉE, MAIN PAR MAIN ────────────────────
     Verrous par classe de main sur TOUS les nœuds, des deux camps. Le CFR ne
     décide alors plus rien : la « solution » obtenue EST la stratégie importée,
     ce qui est exactement ce dont on veut mesurer l'exploitabilité. */
  const locks = attendus.map(p => ({
    path: p ? p.split("|") : [],
    byClass: imported.strategy.nodes[p].byClass,
    /* Repli sur la moyenne des classes fournies, pour les combos d'une classe
       absente de l'export. S'il en reste, le verrou échoue et on le détecte. */
    freqs: moyenneDesClasses(imported.strategy.nodes[p].byClass),
  }));

  const locked = solveTreeSpec({
    state, heroRange: imported.heroRange, villainRange: imported.villainRange,
    treeSpec: { ...imported.treeSpec, locks },
    config: { maxIterations: 2, maxCombos: 0, seed: 1, ...config, noStore: true },
  });
  if (!locked.ok) return { ok: false, reason: `installation de la stratégie importée impossible : ${locked.reason}` };

  const sol = locked.solution;
  const nbNoeuds = attendus.length;
  if ((sol.lockedNodeCount || 0) < nbNoeuds) {
    return {
      ok: false,
      reason: `seuls ${sol.lockedNodeCount || 0} nœuds sur ${nbNoeuds} ont pu être verrouillés : les autres seraient joués par PokerForge, et la mesure porterait sur un hybride, pas sur l'import`,
    };
  }

  /* ── 3. MESURER ──────────────────────────────────────────────────────────
     Exploitabilité = gain de la meilleure réponse de chaque camp. Le jeu est ici
     à somme nulle (pas de rake, pas d'ICM : on l'exige), donc la somme est la
     mesure classique, et elle vaut ≈ 0 pour un équilibre. */
  if (state.rake && state.rake.applied) {
    return { ok: false, reason: "vérification refusée sous rake : la somme nulle tombe, et l'exploitabilité cesse d'être définie (cf. §78)." };
  }
  const brH = bestResponseEV(sol, 0), brV = bestResponseEV(sol, 1);
  if (brH == null || brV == null) {
    return { ok: false, reason: "exploitabilité non calculable sur cette solution (board échantillonné)" };
  }
  const exploitability = Math.round((brH + brV) * 10000) / 10000;
  const verified = exploitability <= tolerance + EPS.ev;

  return {
    ok: true,
    verified,
    exploitabilityBb: exploitability,
    bestResponseHeroBb: Math.round(brH * 10000) / 10000,
    bestResponseVillainBb: Math.round(brV * 10000) / 10000,
    tolerance,
    /* §18 — la provenance DÉCOULE de la mesure. Elle n'est pas choisie. */
    provenance: verified ? SolutionProvenance.VERIFIED_IMPORT : SolutionProvenance.APPROXIMATION,
    coverage: { nodes: nbNoeuds, locked: sol.lockedNodeCount },
    state, solution: sol, pfNodes,
    verdict: verified
      ? `exploitabilité mesurée ${exploitability} bb ≤ tolérance ${tolerance} bb — la stratégie importée est un équilibre approché dans l'arbre de PokerForge`
      : `exploitabilité mesurée ${exploitability} bb > tolérance ${tolerance} bb — la stratégie a été importée et VÉRIFIÉE, mais elle n'a PAS passé la vérification : elle n'est pas présentée comme une solution`,
  };
}

function moyenneDesClasses(byClass) {
  const acc = {}; let n = 0;
  for (const dist of Object.values(byClass || {})) {
    for (const [a, f] of Object.entries(dist)) acc[a] = (acc[a] || 0) + f;
    n++;
  }
  if (!n) return null;
  for (const a of Object.keys(acc)) acc[a] /= n;
  return acc;
}

/* ══════════════════════════════════════════════════════════════════════════
   importSolution — lire, vérifier, et n'assembler QUE ce que la mesure autorise
   ══════════════════════════════════════════════════════════════════════════ */
export function importSolution(raw, { tolerance = DEFAULT_IMPORT_TOLERANCE_BB, config = {}, acceptUnverified = false } = {}) {
  const parsed = parseImportedSolution(raw);
  if (!parsed.ok) return { ok: false, stage: "lecture", problems: parsed.problems };

  const v = verifyImportedSolution({ imported: parsed.imported, tolerance, config });
  if (!v.ok) return { ok: false, stage: "vérification", reason: v.reason, problems: v.problems, coverage: v.coverage };

  /* Un import non vérifié n'entre PAS dans le magasin par défaut. Il peut être
     conservé explicitement — un joueur a le droit d'étudier une stratégie qu'il
     sait imparfaite — mais alors sous provenance APPROXIMATION, avec le chiffre
     qui l'a disqualifiée, et jamais sous un badge de solution. */
  if (!v.verified && !acceptUnverified) {
    return {
      ok: false, stage: "vérification", verified: false,
      exploitabilityBb: v.exploitabilityBb, tolerance: v.tolerance,
      reason: v.verdict,
    };
  }

  const state = v.state;
  const gh = gameStateHash({
    state, heroRange: parsed.imported.heroRange, villainRanges: [parsed.imported.villainRange],
    treeSpec: parsed.imported.treeSpec, solverConfig: { imported: true, tool: parsed.imported.source.tool },
  });
  const complexity = SizingComplexity.FULL;
  const strategy = extractStreetStrategy(v.solution, { includeEV: true });

  const sol = buildSolution({
    solutionId: solutionId(gh.hash, complexity), gameStateHash: gh.hash, canonical: gh.canonical,
    state, heroRange: parsed.imported.heroRange, villainRanges: [parsed.imported.villainRange],
    mode: "FIXED", complexity,
    candidates: { bets: parsed.imported.treeSpec.betSpecs.map(spec => ({ spec })), raises: parsed.imported.treeSpec.raiseSpecs.map(spec => ({ spec })), dropped: [] },
    selectedBetSpecs: parsed.imported.treeSpec.betSpecs,
    selectedRaiseSpecs: parsed.imported.treeSpec.raiseSpecs,
    referenceBetSpecs: parsed.imported.treeSpec.betSpecs,
    referenceRaiseSpecs: parsed.imported.treeSpec.raiseSpecs,
    treeSpec: parsed.imported.treeSpec,
    strategy,
    /* Aucune simplification n'a eu lieu : l'arbre importé EST l'arbre de
       référence. Annoncer une perte nulle est ici un fait, pas une commodité. */
    metrics: { referenceEV: null, simplifiedEV: null, absoluteEVLoss: 0, relativeEVLoss: 0, evLossPotPct: 0, retainedEV: 1 },
    actionRanking: null,
    convergence: {
      iterations: null, elapsedMs: null,
      /* L'exploitabilité MESURÉE de l'import — c'est le résultat de la
         vérification, pas une convergence de CFR. Le champ est le même parce que
         la grandeur est la même. */
      nashConv: v.exploitabilityBb,
      note: `exploitabilité mesurée par meilleure réponse exacte sur l'arbre reconstruit (import ${parsed.imported.source.tool})`,
      sampled: false, completed: true,
    },
    status: SolveStatus.COMPLETE,
    partialReasons: v.verified ? [] : [`import NON vérifié : exploitabilité ${v.exploitabilityBb} bb au-dessus de la tolérance ${v.tolerance} bb`],
    provenance: v.provenance,
    evaluationConfig: null, finalSolveConfig: null,
    instrumentation: { import: { tool: parsed.imported.source.tool, version: parsed.imported.source.version, exportedAt: parsed.imported.source.exportedAt } },
    optimizeFor: 0, noise: null, plannerReport: null, seed: null,
  });
  sol.distinguishable = false;
  sol.imported = {
    ...parsed.imported.source,
    formatVersion: parsed.imported.formatVersion,
    verified: v.verified,
    exploitabilityBb: v.exploitabilityBb,
    tolerance: v.tolerance,
    verdict: v.verdict,
  };

  return { ok: true, solution: sol, verification: v };
}
