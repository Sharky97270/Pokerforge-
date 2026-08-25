/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-gametree — PFASE : L'EXTENSION DU GAME TREE ENGINE

   Deux obligations, également importantes :

   1. NON-RÉGRESSION (mission §2). Sans les nouvelles options, l'arbre doit être
      IDENTIQUE à la v2 — mêmes labels, mêmes montants, même forme. Trois suites
      existantes (`test-solver-reduced-games`, `test-trainer-postflop-solver`,
      `test-replayer-cfr`) et le Worker du Trainer en dépendent.

   2. LES NOUVELLES CAPACITÉS FONCTIONNENT VRAIMENT (§6, §10, §74) : sizings
      typés, géométrique qui dépend du SPR, relances multiples, jam explicite,
      et restriction ASYMÉTRIQUE — celle sans laquelle la perte d'EV n'aurait
      pas de définition rigoureuse.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { buildPostflopTree, treeStats, legalActions, terminalUtility, HERO, VILL } from "./src/solver/core/gametree.js";
import { potSizing, geometricSizing, previousBetSizing, jamSizing, bbSizing } from "./src/sizing/sizingSpec.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 1e-6) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

/* Montant additionnel engagé par une action, lu sur l'arbre. */
const amountOf = (node, label) => {
  const c = node.children[label];
  const before = node.player === HERO ? node.betsH : node.betsV;
  const after = node.player === HERO ? c.betsH : c.betsV;
  return after - before;
};

console.log("\n── NON-RÉGRESSION : sans nouvelle option, l'arbre v2 est intact");
{
  const t = buildPostflopTree({ startPot: 6, streets: 2, betSizes: [0.33, 0.75], effStack: 50, maxRaisesPerStreet: 1 });
  eq(t.actions, ["X", "B0", "B1"], "labels v2 : X puis B0, B1 (indices de l'ordre fourni)");
  near(amountOf(t, "B0"), 6 * 0.33, "B0 = 33% du pot, sans arrondi ajouté");
  near(amountOf(t, "B1"), 6 * 0.75, "B1 = 75% du pot");
  const s = treeStats(t);
  eq(s, { decision: 100, chance: 9, terminal: 161, maxDepth: 9, total: 270 }, "forme d'arbre v2 inchangée (comptage exact)");

  const single = buildPostflopTree({ startPot: 6, streets: 1, betFrac: 0.66, effStack: 20 });
  eq(single.actions, ["X", "B"], "un seul sizing garde le label « B » nu — contrat lu par le Worker et le Trainer");
  eq(treeStats(single), { decision: 6, chance: 0, terminal: 9, maxDepth: 4, total: 15 }, "forme v2 à une rue inchangée");

  /* La relance v2 vaut raiseMult × la mise affrontée, et porte le label « R ». */
  const face = single.children.B;
  eq(face.actions, ["F", "C", "R"], "face à une mise : F, C, R");
  near(amountOf(face, "R"), 3 * face.toCall, "R = 3× la mise affrontée (raiseMult par défaut)");

  /* Écrêtage au tapis : comportement v2. */
  const court = buildPostflopTree({ startPot: 10, streets: 1, betSizes: [2], effStack: 8 });
  near(amountOf(court, "B"), 8, "une mise de 200% d'un pot de 10 est écrêtée au tapis de 8");
}

console.log("\n── déduplication v2 : deux fractions, un seul montant après écrêtage");
{
  const t = buildPostflopTree({ startPot: 10, streets: 1, betSizes: [1.5, 2, 3], effStack: 8 });
  eq(t.actions, ["X", "B0"], "les trois fractions valent toutes le tapis → une seule action");
}

console.log("\n── §6 — les sizings TYPÉS produisent les mêmes montants qu'un nombre nu");
{
  const num = buildPostflopTree({ startPot: 6, streets: 1, betSizes: [0.33, 0.75], effStack: 50 });
  const spec = buildPostflopTree({ startPot: 6, streets: 1, betSizes: [potSizing(0.33), potSizing(0.75)], effStack: 50 });
  eq(spec.actions, num.actions, "mêmes labels");
  near(amountOf(spec, "B0"), amountOf(num, "B0"), "même montant pour B0");
  near(amountOf(spec, "B1"), amountOf(num, "B1"), "même montant pour B1");
  eq(spec.sizingSpecs.B0.type, "pot", "le chemin typé conserve le spec sur le nœud (traçabilité)");
}

console.log("\n── §6 / CASE D — le géométrique CHANGE avec le tapis, sur le même board");
{
  const petit = buildPostflopTree({ startPot: 10, streets: 2, betSizes: [geometricSizing(2)], effStack: 20 });
  const gros = buildPostflopTree({ startPot: 10, streets: 2, betSizes: [geometricSizing(2)], effStack: 100 });
  const a = amountOf(petit, "B"), b = amountOf(gros, "B");
  ok(b > a * 1.5, `CASE D : même board, deux tapis → deux montants (SPR 2 → ${a.toFixed(2)}bb, SPR 10 → ${b.toFixed(2)}bb)`);
  /* Contrôle analytique : SPR 4 sur 2 rues ⇒ mise = 100% du pot. */
  const spr4 = buildPostflopTree({ startPot: 10, streets: 2, betSizes: [geometricSizing(2)], effStack: 40 });
  near(amountOf(spr4, "B"), 10, "SPR 4 sur 2 rues → mise = 100% du pot (vérification analytique)", 1e-4);
  /* Et en une rue, le géométrique EST le tapis. */
  const une = buildPostflopTree({ startPot: 10, streets: 1, betSizes: [geometricSizing(1)], effStack: 25 });
  near(amountOf(une, "B"), 25, "géométrique 1 rue = tapis");
}

console.log("\n── §74 — le JAM est une ACTION, pas « 999% du pot »");
{
  const t = buildPostflopTree({ startPot: 10, streets: 1, betSizes: [potSizing(0.5)], effStack: 40, allowJam: true });
  eq(t.actions, ["X", "B0", "J"], "le jam porte son propre label");
  near(amountOf(t, "B0"), 5, "la mise 50% reste 5bb");
  near(amountOf(t, "J"), 40, "le jam vaut le tapis");
  eq(t.sizingSpecs.J.type, "jam", "et son spec le dit");

  /* Quand un sizing atteint déjà le tapis, le jam ne crée PAS de doublon. */
  const court = buildPostflopTree({ startPot: 10, streets: 1, betSizes: [potSizing(2)], effStack: 15, allowJam: true });
  eq(court.actions.length, 2, "mise écrêtée au tapis + jam = une seule action de mise");
}

console.log("\n── §6 — plusieurs sizings de RELANCE");
{
  const t = buildPostflopTree({
    startPot: 10, streets: 1, betSizes: [potSizing(0.5)], effStack: 100, minBet: 1,
    raiseSizes: [previousBetSizing(2.5), previousBetSizing(3.5)], maxRaisesPerStreet: 1,
  });
  const face = t.children.B;
  eq(face.actions, ["F", "C", "R0", "R1"], "deux sizings de relance → R0 et R1");
  /* Relance « to 2.5× la mise » : la mise vaut 5bb, donc to 12.5bb. */
  near(amountOf(face, "R0"), 12.5, "R0 = relance TO 2.5× la mise de 5bb");
  near(amountOf(face, "R1"), 17.5, "R1 = relance TO 3.5× la mise de 5bb");

  /* Un seul sizing de relance garde le label « R » nu. */
  const un = buildPostflopTree({
    startPot: 10, streets: 1, betSizes: [potSizing(0.5)], effStack: 100, minBet: 1,
    raiseSizes: [previousBetSizing(3)],
  });
  eq(un.children.B.actions, ["F", "C", "R"], "un seul sizing de relance → label « R »");
}

console.log("\n── légalité : une relance sous le minimum n'existe pas");
{
  /* Mise de 5bb, incrément minimal 5bb → toute relance doit atteindre ≥ 10bb.
     « 1.5× la mise » = 7.5bb : illégale, donc absente de l'arbre. */
  const t = buildPostflopTree({
    startPot: 10, streets: 1, betSizes: [potSizing(0.5)], effStack: 100, minBet: 1,
    raiseSizes: [previousBetSizing(1.5), previousBetSizing(3)], maxRaisesPerStreet: 1,
  });
  const face = t.children.B;
  const raiseLabels = face.actions.filter(a => a.startsWith("R"));
  eq(raiseLabels.length, 1, "la relance illégale est écartée, pas rattrapée");
  near(amountOf(face, raiseLabels[0]), 15, "seule la relance légale (3× = 15bb) subsiste");
}

console.log("\n── §10 — restriction ASYMÉTRIQUE : chaque camp a ses sizings");
{
  const t = buildPostflopTree({
    startPot: 10, streets: 1, effStack: 100,
    betSizesByPlayer: { 0: [potSizing(0.33)], 1: [potSizing(0.33), potSizing(0.75), potSizing(1.5)] },
    betSizes: [potSizing(0.33)],
  });
  eq(t.player, HERO, "la racine est au joueur 0");
  eq(t.actions, ["X", "B"], "le joueur optimisé n'a qu'un seul sizing");
  const ipAfterCheck = t.children.X;
  eq(ipAfterCheck.player, VILL, "après le check, c'est le vilain qui parle");
  eq(ipAfterCheck.actions, ["X", "B0", "B1", "B2"], "et le vilain garde ses trois sizings — c'est cela qui rend la perte d'EV ≥ 0");
  near(amountOf(ipAfterCheck, "B2"), 15, "le sizing 150% du vilain est bien construit");
}

console.log("\n── §10 — relances par joueur");
{
  const t = buildPostflopTree({
    startPot: 10, streets: 1, effStack: 100, minBet: 1,
    betSizes: [potSizing(0.5)],
    raiseSizesByPlayer: { 0: [previousBetSizing(3)], 1: [previousBetSizing(2.5), previousBetSizing(4)] },
  });
  /* Hero mise → le VILAIN fait face : il doit voir SES deux relances. */
  eq(t.children.B.actions, ["F", "C", "R0", "R1"], "le vilain dispose de ses deux sizings de relance");
  /* Hero check, vilain mise → HERO fait face : une seule relance. */
  const heroFacing = t.children.X.children.B;
  eq(heroFacing.actions, ["F", "C", "R"], "Hero, lui, n'a qu'un sizing de relance");
}

console.log("\n── unité BB : une ouverture ne se chiffre pas en pourcentage de pot");
{
  const t = buildPostflopTree({ startPot: 1.5, streets: 1, effStack: 100, betSizes: [bbSizing(2.5), bbSizing(3)], bb: 1 });
  near(amountOf(t, "B0"), 2.5, "2.5× BB = 2.5bb, indépendamment du pot");
  near(amountOf(t, "B1"), 3, "3× BB = 3bb");
}

console.log("\n── comptabilité terminale inchangée (base P/2, somme nulle)");
{
  const t = buildPostflopTree({ startPot: 6, streets: 1, betSizes: [0.5], effStack: 50 });
  const foldV = t.children.B.children.F;
  near(terminalUtility(foldV, 6, 0), 3 + foldV.betsV, "vilain se couche → Hero gagne P/2 + mises du vilain");
  const sd = t.children.X.children.X;
  near(terminalUtility(sd, 6, 1), 3 + sd.betsV, "showdown gagné");
  near(terminalUtility(sd, 6, 0), -(3 + sd.betsH), "showdown perdu");
  near(terminalUtility(sd, 6, 0.5), (sd.betsV - sd.betsH) / 2, "split");
  eq(legalActions(sd), [], "un nœud terminal n'a aucune action légale");
}

console.log(`\n✅ PFASE Game Tree (extension additive) — ${passed} assertions OK\n`);
