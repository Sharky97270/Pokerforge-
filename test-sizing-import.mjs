/* ══════════════════════════════════════════════════════════════════════════
   PFASE · IMPORT ET VÉRIFICATION DE SOLUTIONS EXTERNES (mission §84)

   Le test central est un ALLER-RETOUR avec CONTRÔLE NÉGATIF, et les deux moitiés
   comptent autant l'une que l'autre :

     · une solution réellement calculée par PokerForge, exportée au format
       d'échange puis ré-importée, doit passer la vérification ;
     · la MÊME solution, dégradée d'une manière qu'un œil humain ne verrait pas
       (une main qui checke au lieu de miser), doit ÉCHOUER.

   Sans la seconde moitié, le test ne prouverait rien : une vérification qui dit
   toujours oui passerait le premier contrôle sans difficulté. C'est précisément
   le piège qu'un badge « VERIFIED » tend à celui qui l'implémente.
   ══════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { parseImportedSolution, verifyImportedSolution, importSolution, IMPORT_FORMAT_VERSION, DEFAULT_IMPORT_TOLERANCE_BB } from "./src/sizing/solutionImport.js";
import { solveTreeSpec } from "./src/sizing/solverAdapter.js";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { extractStreetStrategy } from "./src/sizing/strategyExtract.js";
import { potSizing } from "./src/sizing/sizingSpec.js";
import { SolutionProvenance, mayClaimSolved } from "./src/sizing/solutionSchema.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const HERO = { AA: { r: 0, c: 100, f: 0 }, KK: { r: 0, c: 100, f: 0 }, AKs: { r: 0, c: 100, f: 0 }, "76s": { r: 0, c: 100, f: 0 }, T9s: { r: 0, c: 100, f: 0 }, "32o": { r: 0, c: 100, f: 0 } };
const VILL = { QQ: { r: 0, c: 100, f: 0 }, JJ: { r: 0, c: 100, f: 0 }, AQs: { r: 0, c: 100, f: 0 }, "98s": { r: 0, c: 100, f: 0 }, "54s": { r: 0, c: 100, f: 0 }, "72o": { r: 0, c: 100, f: 0 } };
const STATE = {
  gameType: "CASH", street: "RIVER", board: [12, 25, 3, 40, 7],
  blinds: { sb: 0.5, bb: 1 }, minBet: 1, deadPot: 12, actorId: "h",
  players: [
    { id: "h", position: "BB", stack: 40, committedStreet: 0, isHero: true },
    { id: "v", position: "BTN", stack: 40, committedStreet: 0 },
  ],
};
const SIZINGS = { bets: [{ type: "pot", value: 0.75 }], raises: [], allowJam: false };

/* Produit un document d'import à partir d'une VRAIE solution PokerForge. */
function exporter(iters) {
  const st = normalizeGameState(STATE).state;
  const r = solveTreeSpec({
    state: st, heroRange: HERO, villainRange: VILL,
    treeSpec: { betSpecs: [potSizing(0.75)], raiseSpecs: [], allowJam: false },
    config: { maxIterations: iters, maxCombos: 0, seed: 5 },
  });
  if (!r.ok) throw new Error("solve de référence échoué : " + r.reason);
  const ex = extractStreetStrategy(r.solution, { includeEV: false });
  const nodes = {};
  for (const [path, n] of Object.entries(ex.nodes)) {
    const byClass = {};
    for (const [cls, dist] of Object.entries(n.byClass)) {
      /* Renormalisation à 1 : l'extraction arrondit à 6 décimales, et le lecteur
         d'import refuse — à raison — une distribution qui ne somme pas à 1. */
      const s = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
      byClass[cls] = Object.fromEntries(Object.entries(dist).map(([a, f]) => [a, f / s]));
    }
    nodes[path] = { player: n.player, byClass };
  }
  return {
    formatVersion: IMPORT_FORMAT_VERSION,
    source: { tool: "PokerForge (export de test)", version: "1.0", exportedAt: "2026-08-25T00:00:00Z" },
    state: STATE, heroRange: HERO, villainRange: VILL, sizings: SIZINGS,
    strategy: { nodes },
  };
}

console.log("\n── §84 — LECTURE : rien n'est deviné, rien n'est complété");
{
  eq(parseImportedSolution("{pas du json").ok, false, "un JSON illisible est refusé");
  ok(/JSON illisible/.test(parseImportedSolution("{pas du json").problems[0]), "avec le motif");

  const doc = exporter(400);
  eq(parseImportedSolution(doc).ok, true, "un document complet est accepté");
  eq(parseImportedSolution(JSON.stringify(doc)).ok, true, "et il peut arriver sous forme de texte");

  const mauvaiseVersion = { ...doc, formatVersion: 99 };
  eq(parseImportedSolution(mauvaiseVersion).ok, false, "une version de format inconnue est refusée");

  for (const champ of ["state", "heroRange", "villainRange", "sizings", "strategy"]) {
    const tronque = { ...doc }; delete tronque[champ];
    eq(parseImportedSolution(tronque).ok, false, `« ${champ} » absent → refus`);
  }

  /* Le contrôle qui attrape les exports tronqués : une distribution qui ne somme
     pas à 1. La normaliser en silence ferait passer un fichier incomplet pour
     valide — et la vérification qui suit mesurerait alors autre chose. */
  const desequilibre = JSON.parse(JSON.stringify(doc));
  const cls = Object.keys(desequilibre.strategy.nodes[""].byClass)[0];
  const d = desequilibre.strategy.nodes[""].byClass[cls];
  d[Object.keys(d)[0]] += 0.4;
  const p = parseImportedSolution(desequilibre);
  eq(p.ok, false, "une distribution qui ne somme pas à 1 est refusée");
  ok(/somment à/.test(p.problems.join(" ")), "en disant à combien elle somme");

  const negative = JSON.parse(JSON.stringify(doc));
  const d2 = negative.strategy.nodes[""].byClass[cls];
  d2[Object.keys(d2)[0]] = -0.5;
  eq(parseImportedSolution(negative).ok, false, "une fréquence négative est refusée");
}

console.log("\n── §84 — ALLER-RETOUR : une vraie solution se vérifie");
{
  const doc = exporter(3000);
  const parsed = parseImportedSolution(doc);
  ok(parsed.ok, "le document se lit");
  const v = verifyImportedSolution({ imported: parsed.imported });
  ok(v.ok, `la vérification aboutit${v.ok ? "" : " : " + v.reason}`);
  eq(v.coverage.locked, v.coverage.nodes, "TOUS les nœuds sont verrouillés — aucun n'est joué par PokerForge");
  ok(v.exploitabilityBb >= 0, "l'exploitabilité mesurée est positive ou nulle");
  eq(v.verified, true, `elle est sous la tolérance (${v.exploitabilityBb} ≤ ${v.tolerance} bb)`);
  eq(v.provenance, SolutionProvenance.VERIFIED_IMPORT, "§18 — la provenance DÉCOULE de la mesure");
  console.log(`   exploitabilité de l'import : ${v.exploitabilityBb} bb (tolérance ${v.tolerance})`);
}

console.log("\n── §84 — CONTRÔLE NÉGATIF : une stratégie dégradée ÉCHOUE");
{
  /* La dégradation est délibérément discrète : une seule classe de main change
     d'action au nœud racine. Le fichier reste parfaitement bien formé, toutes
     les distributions somment à 1, et rien dans sa structure ne trahit quoi que
     ce soit. Seule la MESURE le voit. */
  const doc = exporter(3000);
  const casse = JSON.parse(JSON.stringify(doc));
  const racine = casse.strategy.nodes[""];
  const actions = Object.keys(Object.values(racine.byClass)[0]);
  racine.byClass.AA = Object.fromEntries(actions.map(a => [a, a === "X" ? 1 : 0]));

  const parsed = parseImportedSolution(casse);
  eq(parsed.ok, true, "le fichier dégradé reste parfaitement BIEN FORMÉ — la lecture ne peut rien voir");

  const v = verifyImportedSolution({ imported: parsed.imported });
  ok(v.ok, "la vérification s'exécute");
  eq(v.verified, false, `et elle REFUSE : exploitabilité ${v.exploitabilityBb} bb > ${v.tolerance} bb`);
  eq(v.provenance, SolutionProvenance.APPROXIMATION, "la provenance retombe sur APPROXIMATION");
  ok(/n'a PAS passé la vérification/.test(v.verdict), "avec un verdict explicite");
  console.log(`   exploitabilité de l'import dégradé : ${v.exploitabilityBb} bb — rejeté`);

  /* Et le pipeline complet refuse de produire une solution. */
  const r = importSolution(casse);
  eq(r.ok, false, "aucune solution n'est assemblée pour un import non vérifié");
  eq(r.stage, "vérification", "et l'étape qui a refusé est nommée");

  /* Sauf demande explicite — auquel cas la solution existe, mais SANS badge. */
  const force = importSolution(casse, { acceptUnverified: true });
  ok(force.ok, "conservée sur demande explicite");
  eq(force.solution.source, SolutionProvenance.APPROXIMATION, "mais sous provenance APPROXIMATION");
  eq(mayClaimSolved(force.solution), false, "et sans le droit de se dire résolue");
  ok((force.solution.partialReasons || []).some(x => /NON vérifié/.test(x)), "le motif voyage avec elle");
}

console.log("\n── §84 — DEUX ARBRES DIFFÉRENTS NE SE COMPARENT PAS");
{
  const doc = exporter(400);
  /* L'import annonce deux sizings quand sa stratégie n'en décrit qu'un : les
     deux arbres n'offrent plus les mêmes options, et mesurer l'exploitabilité de
     l'un dans l'autre n'aurait aucun sens. Le refus est la seule réponse juste. */
  const desaligne = JSON.parse(JSON.stringify(doc));
  desaligne.sizings = { bets: [{ type: "pot", value: 0.75 }, { type: "pot", value: 0.33 }], raises: [], allowJam: false };
  const parsed = parseImportedSolution(desaligne);
  ok(parsed.ok, "le document se lit — l'incohérence n'est pas syntaxique");
  const v = verifyImportedSolution({ imported: parsed.imported });
  eq(v.ok, false, "mais la vérification refuse");
  ok(/ne correspond pas|actions importées/.test(v.reason), `avec le motif d'alignement : ${v.reason.slice(0, 80)}`);
}

console.log("\n── §84 — CE QUI N'EST PAS VÉRIFIABLE EST REFUSÉ, PAS APPROXIMÉ");
{
  const doc = exporter(400);

  /* Board incomplet : la meilleure réponse serait échantillonnée. Un import ne
     peut pas être déclaré « vérifié » sur une estimation. */
  const turn = JSON.parse(JSON.stringify(doc));
  turn.state = { ...STATE, street: "TURN", board: [12, 25, 3, 40] };
  const vTurn = verifyImportedSolution({ imported: parseImportedSolution(turn).imported });
  eq(vTurn.ok, false, "board incomplet → vérification refusée");
  ok(/board complet/.test(vTurn.reason), "en disant que la mesure exacte l'exige");

  /* Sous rake, la somme nulle tombe : l'exploitabilité n'est plus définie. */
  const rake = JSON.parse(JSON.stringify(doc));
  rake.state = { ...STATE, rake: { pct: 0.05, cap: 3 } };
  const vRake = verifyImportedSolution({ imported: parseImportedSolution(rake).imported });
  eq(vRake.ok, false, "sous rake → vérification refusée");
  ok(/somme nulle/.test(vRake.reason), "parce que l'exploitabilité cesse d'être définie");
}

console.log("\n── §84 — UN IMPORT VÉRIFIÉ DEVIENT UNE SOLUTION UTILISABLE");
{
  const doc = exporter(3000);
  const r = importSolution(doc);
  ok(r.ok, `l'import aboutit${r.ok ? "" : " : " + (r.reason || (r.problems || []).join(" · "))}`);
  eq(r.solution.source, SolutionProvenance.VERIFIED_IMPORT, "provenance VERIFIED_IMPORT");
  eq(mayClaimSolved(r.solution), true, "elle peut se dire résolue — la mesure l'a établi");
  ok(r.solution.strategy && r.solution.strategy.nodeCount > 0, "elle porte une stratégie exploitable");
  eq(r.solution.imported.verified, true, "et garde trace de sa vérification");
  ok(r.solution.imported.exploitabilityBb != null, "avec le chiffre qui l'a fondée");
  eq(r.solution.imported.tool, "PokerForge (export de test)", "et l'outil d'origine");
  eq(r.solution.convergence.nashConv, r.verification.exploitabilityBb,
    "l'exploitabilité mesurée EST la convergence rapportée — même grandeur, pas deux chiffres différents");
  eq(r.solution.simplificationMetrics.absoluteEVLoss, 0, "aucune simplification : l'arbre importé est l'arbre de référence");
  console.log(`   solution importée : ${r.solution.solutionId} · exploitabilité ${r.solution.imported.exploitabilityBb} bb`);
}

console.log(`\n✅ PFASE import et vérification externes (§84) — ${passed} assertions OK\n`);
