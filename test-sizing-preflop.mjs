/* ══════════════════════════════════════════════════════════════════════════
   PFASE · ARBRE PRÉFLOP ET CONTINUATION POSTFLOP (§54 · §38 · §66)

   Ce que cette suite établit, dans l'ordre où il faut l'établir :

     1. l'arbre préflop existe et a la bonne FORME — contributions inégales à la
        racine, option de la grosse blinde, calendrier de cartes à trois ;
     2. ses valeurs terminales sont EXACTES — vérifiées contre des nombres connus
        d'avance, pas contre « ça semble plausible » ;
     3. la continuation postflop CHANGE la valeur d'une action préflop ;
     4. `rankable` est DÉRIVÉ de la mesure, et ne peut pas être forcé.

   Le point 3 est celui qui justifie tout le reste : sans lui, un arbre préflop
   ne serait qu'un arbre de plus. Le point 4 est celui qui peut réellement
   échouer si quelqu'un décide un jour de « rendre le préflop classable ».
   ══════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { buildPreflopTree, preflopTreeStats, PREFLOP_CARD_SCHEDULE } from "./src/solver/core/preflopTree.js";
import { solveTree, nodeActionEVs } from "./src/solver/core/multistreet.js";
import { rangeComboList } from "./src/solver/core/combos.js";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { solvePreflopSizings } from "./src/sizing/preflopSolve.js";
import { preflopCandidates, preflopOpenAmountBb } from "./src/sizing/preflopSizing.js";
import { bbSizing, previousBetSizing } from "./src/sizing/sizingSpec.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const HERO = { AA: { r: 0, c: 100, f: 0 }, KK: { r: 0, c: 100, f: 0 }, AKs: { r: 0, c: 100, f: 0 }, "76s": { r: 0, c: 100, f: 0 }, T9s: { r: 0, c: 100, f: 0 }, "32o": { r: 0, c: 100, f: 0 } };
const VILL = { QQ: { r: 0, c: 100, f: 0 }, JJ: { r: 0, c: 100, f: 0 }, AQs: { r: 0, c: 100, f: 0 }, "98s": { r: 0, c: 100, f: 0 }, "54s": { r: 0, c: 100, f: 0 }, "72o": { r: 0, c: 100, f: 0 } };
const hl = rangeComboList(HERO), vl = rangeComboList(VILL);

const arbre = (over = {}) => buildPreflopTree({
  effStack: 20, openSpecs: [bbSizing(2.5)], reraiseSpecs: [previousBetSizing(3)],
  postflopStreets: 0, ...over,
});

console.log("\n── LA RACINE A DES CONTRIBUTIONS INÉGALES (verrou V1)");
{
  const t = arbre();
  /* C'est précisément ce que l'arbre postflop ne savait pas représenter : il
     documente que « les deux camps sont à égalité quand une street s'ouvre ». */
  eq(t.betsH, 1, "la grosse blinde a posté 1 bb");
  eq(t.betsV, 0.5, "la petite blinde a posté 0.5 bb");
  eq(t.player, 1, "et c'est la petite blinde (le bouton) qui parle la première");
  eq(t.toCall, 0.5, "elle affronte une mise que personne n'a choisi de faire");
  ok(t.betsH !== t.betsV, "les contributions sont INÉGALES à l'ouverture de la rue");

  eq(t.actions.includes("F"), true, "elle peut se coucher");
  eq(t.actions.includes("C"), true, "compléter");
  ok(t.actions.some(a => /^R\d+$/.test(a)), "ouvrir");
  eq(t.actions.includes("J"), true, "ou faire tapis");

  /* Le tapis doit valoir le TAPIS, pas un montant arbitraire. */
  const jam = t.children.J;
  eq(Math.max(jam.betsH, jam.betsV), 20, "le tapis engage bien les 20 bb effectifs");
  eq(jam.actions.sort(), ["C", "F"], "et la grosse blinde ne peut plus que payer ou se coucher");
}

console.log("\n── L'OPTION DE LA GROSSE BLINDE EXISTE");
{
  /* Si la petite blinde complète, le préflop n'est PAS clos : la grosse blinde
     peut relancer. Sans cela l'arbre supprimerait l'iso-raise — le sizing même
     que le §54 sait construire. */
  const t = arbre();
  const apresLimp = t.children.C;
  eq(apresLimp.kind, "decision", "après un limp, ce n'est pas encore fini");
  eq(apresLimp.player, 0, "c'est à la grosse blinde de parler");
  eq(apresLimp.toCall, 0, "elle n'a rien à payer");
  eq(apresLimp.actions.includes("X"), true, "elle peut fermer");
  ok(apresLimp.actions.some(a => /^R\d+$/.test(a) || a === "J"), "ou relancer");
  eq(apresLimp.actions.includes("F"), false, "mais pas se coucher devant un check — cette action n'existe pas");
}

console.log("\n── LE CALENDRIER DES CARTES (verrou V2)");
{
  eq(PREFLOP_CARD_SCHEDULE, [3, 1, 1], "flop 3, turn 1, river 1");

  /* Sans continuation, tout tombe d'un coup jusqu'à l'abattage. */
  const direct = arbre({ postflopStreets: 0 });
  const chDirect = direct.children.C.children.X;
  eq(chDirect.kind, "chance", "après la clôture du préflop vient un nœud de chance");
  eq(chDirect.cardsBefore, 0, "0 carte visible avant");
  eq(chDirect.cardsAfter, 5, "et 5 après : il n'y a plus de décision");
  eq(chDirect.continuation, "CHECKED_DOWN", "l'approximation est NOMMÉE, pas subie");

  /* Avec continuation, le flop en révèle exactement trois. */
  const suite = arbre({ postflopStreets: 1, postflopOpts: { betSizes: [0.75], allowJam: true } });
  const chFlop = suite.children.C.children.X;
  eq(chFlop.cardsBefore, 0, "0 carte avant le flop");
  eq(chFlop.cardsAfter, 3, "TROIS après — c'est le verrou que l'ancien moteur ne savait pas franchir");
  eq(chFlop.continuation, "SOLVED", "et la continuation est déclarée résolue");
  eq(chFlop.next.cardsVisible, 3, "le premier nœud de flop voit bien trois cartes");
  eq(chFlop.next.street, 1, "et il appartient à la rue 1, pas à la rue 0 — sinon l'extraction le prendrait pour du préflop");
}

console.log("\n── LA GREFFE NE CRÉE PAS DE COLLISION D'IDENTIFIANTS");
{
  /* `buildPostflopTree` repart de l'identifiant 0. Sans décalage, deux nœuds
     distincts partageraient un id — et les tables de regret, indexées par id, se
     mélangeraient SANS lever la moindre erreur. Les stratégies se
     contamineraient, simplement. */
  const t = arbre({ postflopStreets: 3, postflopOpts: { betSizes: [0.75], allowJam: true } });
  const ids = new Set(); let n = 0; const vus = new Set();
  (function walk(x) {
    if (!x || vus.has(x)) return; vus.add(x); n++; ids.add(x.id);
    if (x.kind === "decision") for (const a of x.actions) walk(x.children[a]);
    else if (x.kind === "chance") walk(x.next);
  })(t);
  eq(ids.size, n, `les ${n} nœuds de l'arbre greffé ont ${ids.size} identifiants distincts`);
}

console.log("\n── DEUX VALEURS TERMINALES CONNUES D'AVANCE");
{
  /* Le meilleur contrôle possible : deux nombres dont la réponse ne dépend
     d'aucun calcul. Une petite blinde qui se couche abandonne sa blinde, point.
     C'est le même genre de contrôle qui avait révélé le défaut de dénominateur
     sur les EV postflop (fold à −5.93 au lieu de −6). */
  const t = arbre({ postflopStreets: 0 });
  const sol = solveTree(hl, vl, [], { tree: t, startPot: 0, iters: 600, seed: 5 });

  const racine = nodeActionEVs(sol, [], { samples: 200 });
  ok(racine.available, "l'EV par action est calculable à la racine préflop");
  eq(racine.byAction.F, -0.5, "se coucher de la petite blinde vaut EXACTEMENT −0.5 bb");
  ok(Object.values(racine.byClass).every(c => c.F === -0.5),
    "et cela pour CHAQUE classe de main — un fold ne dépend pas de la main");

  const bb = nodeActionEVs(sol, ["J"], { samples: 200 });
  ok(bb.available, "le nœud « grosse blinde face à un tapis » est chiffré");
  eq(bb.byAction.F, -1, "s'y coucher vaut EXACTEMENT −1 bb : la grosse blinde perd sa blinde");
  ok(Object.values(bb.byClass).every(c => c.F === -1), "pour chaque classe également");
}

console.log("\n── CE QUI JUSTIFIE TOUT LE RESTE : la continuation change la valeur");
{
  /* Si la valeur d'une action préflop était la même avec et sans jeu postflop,
     construire la continuation n'aurait aucun intérêt. Elle ne l'est pas — et
     l'écart n'est pas cosmétique. */
  const mesure = (ps) => {
    const t = arbre({ effStack: 60, postflopStreets: ps, postflopOpts: { betSizes: [0.75], allowJam: true } });
    const sol = solveTree(hl, vl, [], { tree: t, startPot: 0, iters: 500, seed: 5, boardSeed: 424242, boardPool: ps > 0 ? 16 : 0 });
    return nodeActionEVs(sol, [], { samples: 40 }).byAction;
  };
  const sans = mesure(0), avec = mesure(1);
  ok(Math.abs(avec.C - sans.C) > 0.3,
    `la valeur d'un limp change de ${sans.C} bb (abattage direct) à ${avec.C} bb (avec jeu postflop)`);
  /* Le cas qui doit convaincre : le SIGNE change. Une valeur préflop calculée
     sans continuation ne se contente pas d'être imprécise, elle conclut
     l'inverse. */
  ok(sans.C < 0, "sans continuation, limper est perdant");
  console.log(`   limp à 60 bb : ${sans.C} bb sans continuation → ${avec.C} bb avec le flop joué`);
}

console.log("\n── `rankable` EST DÉRIVÉ, ET NE PEUT PAS ÊTRE FORCÉ");
{
  const st = normalizeGameState({
    gameType: "CASH", street: "PREFLOP", board: [], blinds: { sb: 0.5, bb: 1 }, minBet: 1, actorId: "v",
    players: [
      { id: "h", position: "BB", stack: 40, committedStreet: 1, isHero: true },
      { id: "v", position: "SB", stack: 40, committedStreet: 0.5 },
    ],
  }).state;
  const commun = {
    state: st, heroRange: HERO, villainRange: VILL,
    openSpecs: [bbSizing(2.2), bbSizing(3), bbSizing(4.5)], reraiseSpecs: [previousBetSizing(3)],
  };

  /* Sans continuation, AUCUN écart ne peut rendre le classement légitime : la
     valeur comparée décrit un jeu où personne ne mise après le flop. */
  const sansSuite = solvePreflopSizings({ ...commun, config: { postflopStreets: 0, iterations: 300 } });
  ok(sansSuite.ok, "le solve sans continuation aboutit");
  eq(sansSuite.rankable, false, "et il n'est JAMAIS classable — quelle que soit la taille de l'écart");
  ok(/continuation postflop n'a pas été résolue/.test(sansSuite.reason), "avec le motif exact");
  eq(sansSuite.ranking, null, "§0 — aucun classement n'est publié à côté du drapeau : il n'est pas publié du tout");
  eq(sansSuite.continuation.kind, "CHECKED_DOWN", "et l'approximation est nommée");

  /* Avec continuation, le verdict vient de la MESURE. On ne fige pas le
     résultat — il dépend du budget — mais on fige la règle : classable ⇒ écart
     strictement supérieur au plancher. */
  const avecSuite = solvePreflopSizings({ ...commun, config: { postflopStreets: 1, iterations: 600, boardPool: 16 } });
  ok(avecSuite.ok, "le solve avec continuation aboutit");
  eq(avecSuite.continuation.kind, "SOLVED", "la continuation est résolue");
  ok(avecSuite.continuation.boardAbstraction, "et l'abstraction de boards est DÉCLARÉE");
  eq(avecSuite.continuation.boardAbstraction.kind, "BOARD_SAMPLE", "elle porte son type");
  ok(avecSuite.continuation.boardAbstraction.boards > 0, "et le nombre de runouts sur lesquels elle a résolu");

  const m = avecSuite.measurement;
  ok(m.floor >= 0, "un plancher de mesure est rendu");
  ok(m.boardSampleNoise != null, "et la variance entre échantillons de runouts, séparément");
  ok(m.note.includes("MÊME sous-jeu"),
    "les deux ne mesurent pas la même chose : le plancher porte sur la convergence, à sous-jeu constant");
  eq(avecSuite.rankable, m.gapBestToSecond > m.floor,
    `classable ⇔ écart (${m.gapBestToSecond}) > plancher (${m.floor}) — la règle, pas le résultat`);
  if (!avecSuite.rankable) eq(avecSuite.ranking, null, "et rien n'est publié quand ce n'est pas mesurable");
  console.log(`   écart ${m.gapBestToSecond} bb · plancher ${m.floor} bb · bruit d'échantillon ${m.boardSampleNoise} bb → classable ${avecSuite.rankable}`);
}

console.log("\n── LE CONSTRUCTEUR DE MONTANTS RESTE CE QU'IL EST");
{
  /* `preflopSizing.js` construit des montants ; il ne les classe pas. Le solve
     est une capacité SÉPARÉE, et le constructeur ne doit pas se mettre à
     prétendre le contraire parce qu'elle existe désormais. */
  const st = normalizeGameState({
    gameType: "CASH", street: "PREFLOP", board: [], blinds: { sb: 0.5, bb: 1 }, minBet: 1, actorId: "h",
    players: [
      { id: "h", position: "CO", stack: 100, committedStreet: 0, isHero: true },
      { id: "v", position: "BB", stack: 100, committedStreet: 1 },
    ],
    actionHistory: [{ position: "UTG", actionType: "CALL", size: 1 }, { position: "MP", actionType: "CALL", size: 1 }],
  }).state;
  const c = preflopCandidates(st);
  eq(c.ok, true, "les candidats se construisent");
  eq(c.rankable, false, "et restent non classés : construire un montant n'est pas le départager");
  eq(preflopOpenAmountBb(st).amountBb, 4.5, "2.5 bb + 2 limpeurs × 1 = 4.5 bb");
}

console.log(`\n✅ PFASE arbre préflop et continuation postflop (§54/§38/§66) — ${passed} assertions OK\n`);
