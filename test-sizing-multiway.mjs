/* ══════════════════════════════════════════════════════════════════════════
   PFASE · POT MULTIWAY, SIDE POTS ET DÉCLARATION DE CAPACITÉS (§7 · §77)

   Ce que cette suite vérifie, et la distinction qu'elle protège :

     · la COMPTABILITÉ d'un pot à N joueurs est EXACTE — paliers, side pots,
       joueurs couchés qui ont contribué, mise non suivie, conservation ;
     · la RÉSOLUTION STRATÉGIQUE d'un spot multiway reste UNSUPPORTED.

   Les annoncer ensemble était la faute d'origine. Répondre « non » à tout
   laissait croire que PokerForge ne savait pas compter un side pot ; répondre
   « oui » à tout laisserait croire qu'il en connaît la stratégie. Un test doit
   donc échouer si l'une des deux réponses déteint sur l'autre.

   Le calcul lui-même n'est pas dupliqué ici : `potDistribution.js` le porte, et
   ses propres suites (82 + 78 assertions) le vérifient. Ce qui est testé ici,
   c'est que l'ÉTAT PFASE le transporte fidèlement et que les capacités
   déclarées correspondent à ce que le moteur fait réellement.
   ══════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { describeCapabilities, formatCapabilities, CapabilityLevel, weakestOf } from "./src/sizing/capabilities.js";
import { resolveTrainingSolution, ResolutionOutcome } from "./src/sizing/trainingSolutionResolver.js";
import { buildPots } from "./src/potDistribution.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const etat = (players, over = {}) => normalizeGameState({
  gameType: "CASH", street: "FLOP", board: [12, 25, 3],
  blinds: { sb: 0.5, bb: 1 }, minBet: 1, deadPot: 0, actorId: players[0].id,
  players, ...over,
});

const J = (id, position, stack, committedTotal, extra = {}) =>
  ({ id, position, stack, committedTotal, committedStreet: 0, ...extra });

console.log("\n── HEADS-UP : rien ne doit changer");
{
  const r = etat([
    J("a", "BB", 40, 6, { isHero: true }),
    J("b", "BTN", 40, 6),
  ]);
  ok(r.ok, "l'état heads-up reste valide");
  const ps = r.state.potStructure;
  eq(ps.niveaux, 1, "un seul palier");
  eq(ps.sidePots, 0, "aucun side pot — il n'y a qu'un adversaire");
  eq(ps.conserve, true, "les jetons sont conservés");
  eq(r.state.effectiveStack, 40, "et le tapis effectif est inchangé");

  const caps = describeCapabilities(r.state);
  eq(caps.strategicSolving.level, CapabilityLevel.SUPPORTED, "le heads-up postflop reste résoluble");
  eq(caps.potAccounting.level, CapabilityLevel.EXACT, "et sa comptabilité est exacte");
}

console.log("\n── TROIS JOUEURS, UN SHORT STACK À TAPIS");
{
  /* b est à tapis pour 5 bb ; a et c se disputent 20 bb chacun. b ne peut pas
     remporter ce qu'il n'a pas payé : le pot principal vaut 3 × 5 = 15 et lui
     est ouvert, le side pot vaut 2 × 15 = 30 et ne l'est pas. */
  const r = etat([
    J("a", "BB", 35, 20, { isHero: true }),
    J("b", "BTN", 0, 5, { allIn: true }),
    J("c", "CO", 35, 20),
  ]);
  ok(r.ok, `l'état à trois joueurs est valide${r.ok ? "" : " : " + r.errors.join(", ")}`);
  const ps = r.state.potStructure;
  eq(ps.niveaux, 2, "deux paliers");
  eq(ps.sidePots, 1, "donc un side pot");
  eq(ps.pots[0].montant, 15, "pot principal = 3 × 5 bb");
  eq(ps.pots[0].disputePar.sort(), ["a", "b", "c"], "que les trois disputent");
  eq(ps.pots[1].montant, 30, "side pot = 2 × 15 bb");
  eq(ps.pots[1].disputePar.sort(), ["a", "c"], "que le joueur à tapis ne dispute PAS");
  ok(!ps.pots[1].disputePar.includes("b"), "un joueur à tapis pour 5 bb ne peut pas gagner 30 bb qu'il n'a pas payés");
  eq(ps.engage, 45, "45 bb engagés au total");
  eq(ps.repartition, 45, "et 45 bb répartis");
  eq(ps.conserve, true, "aucun jeton n'apparaît ni ne disparaît");
}

console.log("\n── TROIS TAPIS DIFFÉRENTS : deux side pots");
{
  const r = etat([
    J("a", "BB", 60, 40, { isHero: true }),
    J("b", "BTN", 0, 10, { allIn: true }),
    J("c", "CO", 0, 25, { allIn: true }),
  ]);
  ok(r.ok, "l'état est valide");
  const ps = r.state.potStructure;
  eq(ps.niveaux, 2, "deux paliers disputés");
  eq(ps.pots[0].montant, 30, "pot principal = 3 × 10");
  eq(ps.pots[1].montant, 30, "side pot 1 = 2 × 15 (de 10 à 25)");
  /* Au-dessus de 25, seul « a » a payé : ce n'est pas un pot, c'est une mise non
     suivie — elle lui revient, elle ne se dispute pas. */
  ok(ps.uncalled, "l'excédent d'un seul joueur est une MISE NON SUIVIE");
  eq(ps.uncalled.joueur, "a", "elle appartient à celui qui l'a mise");
  eq(ps.uncalled.montant, 15, "et vaut 40 − 25 = 15 bb");
  eq(ps.engage, 75, "75 bb engagés");
  eq(ps.repartition, 75, "75 bb répartis (paliers + non suivi)");
  eq(ps.conserve, true, "conservation exacte");
}

console.log("\n── UN JOUEUR COUCHÉ ALIMENTE LE POT, IL N'EN DISPUTE AUCUN");
{
  const r = etat([
    J("a", "BB", 30, 20, { isHero: true }),
    J("b", "BTN", 30, 20),
    J("c", "CO", 40, 8, { folded: true }),
  ]);
  ok(r.ok, "l'état est valide");
  const ps = r.state.potStructure;
  eq(ps.engage, 48, "les 8 bb du joueur couché sont bien dans le pot");
  eq(ps.conserve, true, "et conservés");
  for (const p of ps.pots) {
    ok(!p.disputePar.includes("c"), `${p.nom} : le joueur couché n'y prétend pas`);
  }
  ok(ps.pots.some(p => (p.alimentePar || {}).c > 0), "mais sa contribution est tracée — on sait qui a payé quoi");
}

console.log("\n── CONSERVATION DES JETONS : contrôle aléatoire sur 200 configurations");
{
  /* Une conservation qui ne tient que sur les cas choisis à la main ne prouve
     rien. On tire des configurations au hasard, avec une graine fixe pour que
     l'échec soit rejouable. */
  let seed = 20260825;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let vus = 0, sidePotsVus = 0, couchesVus = 0;
  for (let t = 0; t < 200; t++) {
    const n = 2 + Math.floor(rnd() * 3);              // 2 à 4 joueurs
    const players = [];
    for (let i = 0; i < n; i++) {
      const eng = Math.round(rnd() * 40 * 2) / 2;     // engagement au demi-blind
      const folded = i > 1 && rnd() < 0.3;
      players.push(J(`p${i}`, `P${i}`, Math.round(rnd() * 50), eng, { isHero: i === 0, folded }));
    }
    /* Au moins deux joueurs encore en jeu, sinon l'état est refusé à raison. */
    if (players.filter(p => !p.folded).length < 2) continue;
    const r = etat(players);
    if (!r.ok) continue;
    vus++;
    const ps = r.state.potStructure;
    ok(ps.conserve, `configuration ${t} : ${ps.engage} engagés = ${ps.repartition} répartis`);
    if (ps.sidePots > 0) sidePotsVus++;
    if (players.some(p => p.folded && p.committedTotal > 0)) couchesVus++;
    /* Aucun joueur ne dispute un palier qu'il n'a pas atteint. */
    for (const pot of ps.pots) {
      for (const j of pot.disputePar) {
        const joueur = players.find(x => x.id === j);
        ok(joueur && !joueur.folded, `${pot.nom} : ${j} est encore en jeu`);
      }
    }
  }
  ok(vus > 100, `${vus} configurations valides examinées`);
  ok(sidePotsVus > 5, `dont ${sidePotsVus} avec au moins un side pot`);
  ok(couchesVus > 5, `et ${couchesVus} avec un joueur couché ayant contribué`);
  console.log(`   ${vus} configurations · ${sidePotsVus} avec side pot · ${couchesVus} avec un couché contributeur`);
}

console.log("\n── LES DEUX CAPACITÉS NE DÉTEIGNENT PAS L'UNE SUR L'AUTRE");
{
  const t3 = etat([
    J("a", "BB", 35, 20, { isHero: true }),
    J("b", "BTN", 0, 5, { allIn: true }),
    J("c", "CO", 35, 20),
  ]).state;
  const caps = describeCapabilities(t3);

  /* La comptabilité est exacte MALGRÉ trois joueurs. */
  eq(caps.potAccounting.level, CapabilityLevel.EXACT, "§7 — la comptabilité du pot est EXACTE à trois joueurs");
  eq(caps.potAccounting.sidePots, 1, "et elle sait combien de side pots existent");

  /* La stratégie ne l'est pas, et le motif ne parle QUE de stratégie. */
  eq(caps.strategicSolving.level, CapabilityLevel.UNSUPPORTED, "la résolution stratégique reste UNSUPPORTED");
  ok(/deux camps/.test(caps.strategicSolving.reason), "avec la vraie cause : l'arbre CFR a deux camps");
  ok(!/side pot|comptabilit/i.test(caps.strategicSolving.reason),
    "et ce motif ne prétend PAS que le pot serait incalculable");

  /* Le maillon faible gouverne l'annonce globale — jamais le maillon fort. */
  eq(caps.overall, CapabilityLevel.UNSUPPORTED, "globalement, l'état n'est pas résoluble");
  eq(weakestOf(CapabilityLevel.EXACT, CapabilityLevel.UNSUPPORTED), CapabilityLevel.UNSUPPORTED,
    "et c'est bien le plus faible qui l'emporte, pas le plus flatteur");

  const lignes = formatCapabilities(caps);
  eq(lignes.length, 4, "quatre capacités énoncées séparément");
  ok(lignes.some(l => /Comptabilité du pot\s+: EXACT/.test(l)), "l'écran peut afficher ce qui MARCHE");
  ok(lignes.some(l => /Résolution stratégique\s+: UNSUPPORTED/.test(l)), "et ce qui ne marche pas");
}

console.log("\n── UN REFUS DE SOLUTION N'EFFACE PAS CE QUI FONCTIONNE");
{
  const t3 = etat([
    J("a", "BB", 35, 20, { isHero: true }),
    J("b", "BTN", 0, 5, { allIn: true }),
    J("c", "CO", 35, 20),
  ]).state;
  const r = resolveTrainingSolution({ state: t3, heroRange: { AA: { r: 0, c: 100, f: 0 } }, villainRange: { KK: { r: 0, c: 100, f: 0 } } });
  eq(r.outcome, ResolutionOutcome.UNSUPPORTED, "aucune stratégie n'est servie sur un spot multiway");
  ok(r.capabilities, "mais le rapport transporte les capacités");
  eq(r.capabilities.potAccounting.level, CapabilityLevel.EXACT,
    "et dit que la comptabilité du pot, elle, est exacte — un refus qui n'énonce que ce qui manque est trompeur");
  eq(r.solution, null, "§0 — et rien n'est fabriqué pour combler le trou");
}

console.log("\n── LE MOTEUR DE POT N'EST PAS DUPLIQUÉ");
{
  /* L'état doit transporter EXACTEMENT ce que `potDistribution` calcule. Si les
     deux divergeaient un jour, ce test le dirait — c'est tout l'intérêt de ne
     pas avoir réécrit le calcul. */
  const players = [
    J("a", "BB", 35, 20, { isHero: true }),
    J("b", "BTN", 0, 5, { allIn: true }),
    J("c", "CO", 35, 20),
  ];
  const direct = buildPots({ a: 20, b: 5, c: 20 }, []);
  const via = etat(players).state.potStructure;
  eq(via.pots.map(p => p.montant), direct.pots.map(p => p.montant),
    "les montants de l'état sont ceux du module de référence, pas un second calcul");
  eq(via.pots.map(p => p.disputePar.sort().join(",")), direct.pots.map(p => p.disputePar.sort().join(",")),
    "et les éligibilités aussi");
}

console.log("\n── FORMAT TOURNOI (§77) : ce qui est su, et ce qui ne l'est pas");
{
  const icm = normalizeGameState({
    gameType: "MTT", street: "FLOP", board: [12, 25, 3], blinds: { sb: 0.5, bb: 1 }, minBet: 1, deadPot: 12, actorId: "a",
    evaluationModel: "ICM", icmParams: { stacks: [40, 40], payouts: [0.6, 0.4] },
    players: [J("a", "BB", 40, 6, { isHero: true }), J("b", "BTN", 40, 6)],
  }).state;
  const caps = describeCapabilities(icm);
  eq(caps.evaluation.level, CapabilityLevel.SUPPORTED, "l'ICM entre réellement dans le CFR — ce n'est pas une estimation posée à côté");
  ok(/somme nulle/.test(caps.evaluation.reason), "avec sa conséquence : NashConv devient indisponible");
  eq(caps.strategicSolving.level, CapabilityLevel.SUPPORTED, "un ICM heads-up reste résoluble");

  const pko = normalizeGameState({
    gameType: "MTT", street: "FLOP", board: [12, 25, 3], blinds: { sb: 0.5, bb: 1 }, minBet: 1, deadPot: 12, actorId: "a",
    evaluationModel: "PKO", pkoParams: { bounties: [1, 1], realization: 0.5 },
    players: [J("a", "BB", 40, 6, { isHero: true }), J("b", "BTN", 40, 6)],
  }).state;
  eq(describeCapabilities(pko).evaluation.level, CapabilityLevel.PARTIAL,
    "le PKO reste PARTIAL : la capture de prime est paramétrée, pas modélisée");
}

console.log(`\n✅ PFASE pot multiway, side pots et capacités (§7/§77) — ${passed} assertions OK\n`);
