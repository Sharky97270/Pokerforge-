/* ══════════════════════════════════════════════════════════════════════════
   test-sizing-math — PFASE §60 : LA MATHÉMATIQUE DES MONTANTS

   Ce fichier verrouille les grandeurs dont TOUT le reste dépend. Un sizing
   géométrique faux, un SPR calculé avant l'actualisation des contributions, un
   plafond arrondi vers le haut : chacun de ces défauts produit une stratégie
   d'apparence correcte et matériellement injouable.

   Couverture exigée par §60 : pot · SPR · tapis effectif · pourcentage de pot ·
   multiple de relance · sizing géométrique · relance min · relance max ·
   all-in · arrondis. Cas limites obligatoires.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  SizingType, potSizing, geometricSizing, previousBetSizing, bbSizing, jamSizing,
  toSizingSpec, normalizeSpec, isValidSpec, specKey, specLabel,
  resolveSizing, resolveSizingList, geometricFraction, roundTo, roundAmount, sameSizing,
} from "./src/sizing/sizingSpec.js";
import {
  normalizeGameState, sizingContextFrom, validateDataQuality, cardKey,
  streetsRemainingFor, normalizeStreet, ActionType, isSizedActionType,
} from "./src/sizing/gameState.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 1e-6) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

console.log("\n── §72 — un sizing est un OBJET, jamais une chaîne");
{
  ok(isValidSpec(potSizing(0.75)), "pot 75% est un spec valide");
  ok(isValidSpec(geometricSizing(2)), "géométrique 2 rues est valide");
  ok(isValidSpec(jamSizing()), "jam est valide");
  eq(normalizeSpec({ type: "pot", value: -1 }), null, "une fraction négative n'est pas un spec");
  eq(normalizeSpec({ type: "inconnu", value: 1 }), null, "un type inconnu n'est pas un spec");
  eq(normalizeSpec(null), null, "null n'est pas un spec");
  /* Rétro-compatibilité : le moteur historique passe des nombres nus. */
  eq(toSizingSpec(0.33), { type: "pot", value: 0.33 }, "un nombre nu vaut une fraction de pot");
  eq(toSizingSpec({ type: "jam" }), { type: "jam" }, "un spec passe tel quel");
  eq(toSizingSpec("abc"), null, "une chaîne n'est PAS convertie en sizing");
  /* La clé est stable et indépendante de l'ordre des propriétés. */
  eq(specKey({ value: 0.5, type: "pot" }), specKey({ type: "pot", value: 0.5 }), "la clé ne dépend pas de l'ordre des propriétés");
  eq(specKey(jamSizing()), "jam", "clé du jam");
  eq(specLabel(potSizing(0.33)), "33%", "libellé DÉRIVÉ du spec");
  eq(specLabel(previousBetSizing(2.5)), "2.5x", "libellé d'un multiple de mise");
  eq(specLabel(jamSizing()), "JAM", "§25 — JAM et non « AI », qui se confond avec l'IA");
}

console.log("\n── §73 — un seul arrondi, et un plafond ne monte JAMAIS");
{
  eq(roundTo(3.14159, 2), 3.14, "arrondi à 2 décimales");
  eq(roundTo(-0, 3), 0, "pas de −0");
  /* Le défaut corrigé côté Trainer : `roundStep` transformait une capacité de
     66.9bb en « Tapis 67bb » — 0.1bb que le joueur n'a pas. */
  eq(roundAmount(66.94, { amountDecimals: 3, betStepBb: 0.5 }), 66.5, "une capacité est TRONQUÉE au pas, jamais relevée");
  eq(roundAmount(67, { amountDecimals: 3, betStepBb: 0.5 }), 67, "un multiple exact du pas est conservé");
  eq(roundAmount(3.2, { amountDecimals: 3, betStepBb: 0 }), 3.2, "pas de quantification quand le pas vaut 0");
}

console.log("\n── §6 — le sizing géométrique DÉPEND DU SPR (jamais 75% en dur)");
{
  /* Contrôle analytique : en UNE rue, la mise géométrique EST le tapis. */
  near(geometricFraction({ pot: 10, effectiveRemaining: 10, streetsRemaining: 1 }), 1, "1 rue, SPR 1 → 100% du pot = tapis");
  near(geometricFraction({ pot: 10, effectiveRemaining: 30, streetsRemaining: 1 }), 3, "1 rue, SPR 3 → 300% du pot = tapis");
  /* Deux rues : (1+2x)² = 1+2·SPR. SPR 4 → (1+2x)² = 9 → x = 1. */
  near(geometricFraction({ pot: 10, effectiveRemaining: 40, streetsRemaining: 2 }), 1, "2 rues, SPR 4 → 100% du pot par rue");
  /* Trois rues : (1+2x)³ = 1+2·SPR. SPR 13 → (1+2x)³ = 27 → x = 1. */
  near(geometricFraction({ pot: 10, effectiveRemaining: 130, streetsRemaining: 3 }), 1, "3 rues, SPR 13 → 100% du pot par rue");
  /* LE POINT CENTRAL : deux tapis différents → deux fractions différentes. */
  const a = geometricFraction({ pot: 10, effectiveRemaining: 20, streetsRemaining: 2 });
  const b = geometricFraction({ pot: 10, effectiveRemaining: 100, streetsRemaining: 2 });
  ok(Math.abs(a - b) > 0.2, `le géométrique change avec le tapis (SPR 2 → ${roundTo(a, 4)}, SPR 10 → ${roundTo(b, 4)})`);
  ok(b > a, "plus le SPR est grand, plus la mise géométrique est grosse");
  eq(geometricFraction({ pot: 0, effectiveRemaining: 10, streetsRemaining: 2 }), null, "pot nul → pas de géométrique");
  eq(geometricFraction({ pot: 10, effectiveRemaining: 0, streetsRemaining: 2 }), null, "tapis nul → pas de géométrique");
}

console.log("\n── §7 — pot, SPR, tapis effectif : UNE source, et dans le bon ordre");
{
  const n = normalizeGameState({
    gameType: "CASH", street: "FLOP", board: [12, 25, 3], blinds: { sb: 0.5, bb: 1 },
    players: [
      { id: "h", position: "BB", stack: 94, committedStreet: 0, committedTotal: 6, isHero: true },
      { id: "v", position: "BTN", stack: 94, committedStreet: 0, committedTotal: 6 },
    ],
    deadPot: 12, actorId: "h",
  });
  ok(n.ok, "état valide");
  const s = n.state;
  eq(s.pot, 12, "pot = argent mort + contributions de street");
  eq(s.effectiveStack, 94, "tapis effectif = le plus petit des deux capacités");
  near(s.spr, 94 / 12, "SPR = tapis effectif / pot", 1e-3);
  eq(s.currentBet, 0, "aucune mise en cours");
  eq(s.amountToCall, 0, "rien à payer");
  eq(s.streetsRemaining, 3, "flop → 3 rues de mise restantes");

  /* Le SPR se calcule APRÈS l'actualisation des contributions : une mise de
     street déjà versée grossit le pot ET réduit le tapis. */
  const n2 = normalizeGameState({
    gameType: "CASH", street: "FLOP", board: [12, 25, 3], blinds: { sb: 0.5, bb: 1 },
    players: [
      { id: "h", position: "BB", stack: 94, committedStreet: 0, isHero: true },
      { id: "v", position: "BTN", stack: 86, committedStreet: 8 },
    ],
    deadPot: 12, actorId: "h", lastRaiseIncrement: 8,
  });
  eq(n2.state.pot, 20, "le pot inclut la mise de street du vilain");
  eq(n2.state.currentBet, 8, "mise en cours = 8bb");
  eq(n2.state.amountToCall, 8, "Hero doit payer 8bb");
  /* Capacité adverse = 86 + 8 = 94 ; capacité Hero = 0 + 94 = 94 → max 94. */
  eq(n2.state.maximumRaise, 94, "relance maximale = la plus petite des deux capacités");
  eq(n2.state.effectiveStack, 94, "tapis effectif d'Hero pour cette street");
  eq(n2.state.minimumRaise, 16, "relance minimale = mise en cours + dernier incrément");
  near(n2.state.spr, 94 / 20, "SPR recalculé sur le pot ACTUEL", 1e-3);
}

console.log("\n── §7 — une relance que personne ne peut couvrir n'est pas jouable");
{
  const n = normalizeGameState({
    street: "FLOP", board: [12, 25, 3], blinds: { sb: 0.5, bb: 1 },
    players: [
      { id: "h", position: "BB", stack: 200, committedStreet: 0, isHero: true },
      { id: "v", position: "BTN", stack: 30, committedStreet: 0 },
    ],
    deadPot: 12, actorId: "h",
  });
  eq(n.state.maximumRaise, 30, "le plafond est le tapis du vilain, pas celui d'Hero");
  eq(n.state.effectiveStack, 30, "tapis EFFECTIF, pas tapis nominal");
  const r = resolveSizing(jamSizing(), sizingContextFrom(n.state));
  eq(r.computedAmount, 30, "le jam vaut le tapis effectif — jamais les 200bb d'Hero");
  ok(r.allIn, "et il est bien marqué all-in");
}

console.log("\n── §92 — un état incohérent est REFUSÉ, jamais rattrapé");
{
  const bad = normalizeGameState({ street: "FLOP", board: [12, 25], players: [{ position: "BB", stack: 10, isHero: true }, { position: "BTN", stack: 10 }] });
  ok(!bad.ok, "board de 2 cartes au flop → refusé");
  ok(bad.errors.some(e => /board de 2/.test(e)), "avec le motif exact");

  const dup = normalizeGameState({ street: "FLOP", board: [12, 12, 3], players: [{ position: "BB", stack: 10, isHero: true }, { position: "BTN", stack: 10 }] });
  ok(!dup.ok && dup.errors.some(e => /dupliquée/.test(e)), "carte dupliquée au board → refusé");

  const solo = normalizeGameState({ street: "FLOP", board: [12, 25, 3], players: [{ position: "BB", stack: 10, isHero: true }] });
  ok(!solo.ok && solo.errors.some(e => /deux joueurs/.test(e)), "un seul joueur → refusé");

  const badStreet = normalizeGameState({ street: "PRE-TURN", board: [], players: [{ position: "BB", stack: 10, isHero: true }, { position: "BTN", stack: 10 }] });
  ok(!badStreet.ok, "street inconnue → refusé");

  const icmSansParams = normalizeGameState({
    street: "FLOP", board: [12, 25, 3], evaluationModel: "ICM",
    players: [{ position: "BB", stack: 10, isHero: true }, { position: "BTN", stack: 10 }], deadPot: 4,
  });
  ok(!icmSansParams.ok && icmSansParams.errors.some(e => /icmParams/.test(e)), "§55 — badge ICM sans paramètres ICM → refusé");
}

console.log("\n── §92 — qualité de donnée : cartes, ranges, fréquences");
{
  const n = normalizeGameState({
    street: "FLOP", board: [12, 25, 3], blinds: { sb: 0.5, bb: 1 },
    players: [{ position: "BB", stack: 90, isHero: true }, { position: "BTN", stack: 90 }], deadPot: 12,
  });
  const good = { AA: { r: 100, c: 0, f: 0 }, KK: { r: 0, c: 60, f: 40 } };
  eq(validateDataQuality({ state: n.state, heroRange: good, villainRanges: [good] }), [], "range saine → aucun problème");

  const over = { AA: { r: 80, c: 50, f: 0 } };
  const p1 = validateDataQuality({ state: n.state, heroRange: over, villainRanges: [good] });
  ok(p1.some(x => /> 100/.test(x)), "somme de fréquences > 100 détectée");

  const empty = { AA: { r: 0, c: 0, f: 100 } };
  const p2 = validateDataQuality({ state: n.state, heroRange: empty, villainRanges: [good] });
  ok(p2.some(x => /continuation/.test(x)), "range sans aucune main en continuation détectée");

  /* Carte à la fois en main et au board : c'est un état IMPOSSIBLE. */
  const p3 = validateDataQuality({ state: n.state, heroRange: good, villainRanges: [good], heroCards: [12, 40] });
  ok(p3.some(x => /main et au board/.test(x)), "collision main/board détectée");
  const p4 = validateDataQuality({ state: n.state, heroRange: good, villainRanges: [good], heroCards: [40, 40] });
  ok(p4.some(x => /dupliquée/.test(x)), "main avec carte dupliquée détectée");
}

console.log("\n── §6 — résolution : pot %, multiple de mise, bb, jam");
{
  const ctx = { pot: 20, effectiveRemaining: 80, alreadyCommitted: 0, facingLevel: 0, minIncrement: 1, bb: 1, streetsRemaining: 2 };
  near(resolveSizing(potSizing(0.75), ctx).computedAmount, 15, "75% d'un pot de 20 = 15bb");
  near(resolveSizing(potSizing(0.75), ctx).potFraction, 0.75, "la fraction de pot est rendue telle quelle");
  eq(resolveSizing(previousBetSizing(2.5), ctx), null, "un multiple de mise sans mise affrontée n'existe pas");
  near(resolveSizing(bbSizing(2.5), ctx).computedAmount, 2.5, "2.5× BB = 2.5bb");
  near(resolveSizing(jamSizing(), ctx).computedAmount, 80, "le jam vaut le tapis restant");
  ok(resolveSizing(jamSizing(), ctx).allIn, "et se déclare all-in");

  /* Face à une mise : la convention universelle est « payer, puis miser X% du
     pot ainsi constitué ». */
  const vs = { pot: 30, effectiveRemaining: 80, alreadyCommitted: 0, facingLevel: 10, minIncrement: 10, bb: 1, streetsRemaining: 2 };
  near(resolveSizing(previousBetSizing(2.5), vs).computedAmount, 25, "relance 2.5× une mise de 10 = to 25bb");
  near(resolveSizing(potSizing(1), vs).computedAmount, 10 + 40, "relance pot = mise + (pot + à-payer)");

  /* Écrêtage : au-dessus du tapis, c'est le tapis, et c'est DIT. */
  const court = { pot: 20, effectiveRemaining: 12, alreadyCommitted: 0, facingLevel: 0, minIncrement: 1, bb: 1, streetsRemaining: 1 };
  const gros = resolveSizing(potSizing(2), court);
  near(gros.computedAmount, 12, "200% d'un pot de 20 écrêté au tapis de 12");
  eq(gros.clamped, "tapis", "et l'écrêtage est signalé");
  ok(gros.allIn, "et c'est un all-in");
}

console.log("\n── déduplication : deux specs, un seul montant = une seule action");
{
  const court = { pot: 20, effectiveRemaining: 12, alreadyCommitted: 0, facingLevel: 0, minIncrement: 1, bb: 1, streetsRemaining: 1 };
  /* À SPR 0.6, « 150% du pot », « 200% du pot » et le jam valent tous 12bb. */
  const list = resolveSizingList([potSizing(1.5), potSizing(2), jamSizing()], court);
  eq(list.length, 1, "trois specs, un seul montant jouable → une seule action");
  near(list[0].computedAmount, 12, "et c'est le tapis");

  const large = { pot: 20, effectiveRemaining: 200, alreadyCommitted: 0, facingLevel: 0, minIncrement: 1, bb: 1, streetsRemaining: 1 };
  const list2 = resolveSizingList([potSizing(0.33), potSizing(0.75), jamSizing()], large);
  eq(list2.length, 3, "à SPR élevé, les trois sont distinctes");
  ok(list2[0].computedAmount < list2[1].computedAmount && list2[1].computedAmount < list2[2].computedAmount, "et rendues triées par montant croissant");
  ok(sameSizing(list2[0], { computedAmount: list2[0].computedAmount + 1e-5 }), "deux montants à 1e-5 près sont la même action");
  ok(!sameSizing(list2[0], list2[1]), "deux montants distincts ne le sont pas");
}

console.log("\n── cas limites : tapis courts, tapis profonds, rien à engager");
{
  const rien = { pot: 20, effectiveRemaining: 0, alreadyCommitted: 0, facingLevel: 0, minIncrement: 1, bb: 1, streetsRemaining: 1 };
  eq(resolveSizing(potSizing(0.5), rien), null, "sans tapis, aucune mise n'existe");

  /* 5bb, 10bb, 15bb, 20bb, 30bb — §75 : les sizings changent fortement. */
  for (const stack of [5, 10, 15, 20, 30]) {
    const c = { pot: 6, effectiveRemaining: stack, alreadyCommitted: 0, facingLevel: 0, minIncrement: 1, bb: 1, streetsRemaining: 2 };
    const geo = resolveSizing(geometricSizing(2), c);
    const jam = resolveSizing(jamSizing(), c);
    ok(geo.computedAmount <= jam.computedAmount + 1e-9, `${stack}bb : le géométrique 2 rues ne dépasse pas le tapis`);
    ok(geo.computedAmount > 0, `${stack}bb : le géométrique est strictement positif`);
  }
  /* §76 — tapis profonds : pas de débordement. */
  for (const stack of [50, 100, 150, 200]) {
    const c = { pot: 6, effectiveRemaining: stack, alreadyCommitted: 0, facingLevel: 0, minIncrement: 1, bb: 1, streetsRemaining: 3 };
    const geo = resolveSizing(geometricSizing(3), c);
    ok(Number.isFinite(geo.computedAmount) && geo.computedAmount > 0, `${stack}bb : géométrique 3 rues fini et positif`);
    ok(!geo.allIn, `${stack}bb : le géométrique 3 rues n'est pas déjà le tapis`);
  }
}

console.log("\n── §37 — le TYPE et la TAILLE sont deux grandeurs distinctes");
{
  ok(isSizedActionType(ActionType.BET), "BET porte une taille");
  ok(isSizedActionType(ActionType.RAISE), "RAISE porte une taille");
  ok(isSizedActionType(ActionType.ALL_IN), "ALL_IN porte une taille");
  ok(!isSizedActionType(ActionType.CALL), "CALL n'est PAS une action dimensionnée — c'est le défaut nommé au §37");
  ok(!isSizedActionType(ActionType.CHECK), "CHECK non plus");
  ok(!isSizedActionType(ActionType.FOLD), "FOLD non plus");
}

console.log("\n── normalisation des cartes et des rues");
{
  eq(cardKey(0), "2s", "entier 0 → 2 de pique");
  eq(cardKey(51), "Ac", "entier 51 → As de trèfle");
  eq(cardKey({ r: "A", s: "♠" }), "As", "objet {r,s} avec symbole");
  eq(cardKey({ r: "a", s: "s" }), "As", "la casse du rang est tolérée (les sources d'entrée varient)");
  eq(cardKey({ r: "1", s: "s" }), null, "un rang inexistant n'est PAS deviné");
  eq(cardKey({ r: "A", s: "x" }), null, "une couleur inexistante n'est PAS devinée");
  eq(cardKey(52), null, "entier hors bornes refusé");
  eq(cardKey("A"), null, "une carte tronquée est refusée");
  eq(normalizeStreet("Préflop"), "PREFLOP", "« Préflop » normalisé");
  eq(normalizeStreet("river"), "RIVER", "« river » normalisé");
  eq(streetsRemainingFor("FLOP"), 3, "flop → 3");
  eq(streetsRemainingFor("TURN"), 2, "turn → 2");
  eq(streetsRemainingFor("RIVER"), 1, "river → 1");
}

console.log(`\n✅ PFASE mathématique des montants (§60) — ${passed} assertions OK\n`);
