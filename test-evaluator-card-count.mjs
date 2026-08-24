/* ══════════════════════════════════════════════════════════════════════════
   test-evaluator-card-count — C1 : AUCUNE CARTE FANTÔME N'ATTEINT L'ÉVALUATEUR

   Le défaut corrigé : `eval7i` boucle sur les indices 0..6. Appelé avec 5 ou 6
   cartes, les indices manquants valaient `undefined`, et `undefined>>2 === 0`
   les transformait en 2♠. Le Vilain du Full Hand évaluait donc sa main PLUS
   deux 2 de pique imaginaires — d'où des paires de 2 et des couleurs à pique
   qui n'existaient pas.

   Ce fichier vérifie trois choses :
     ① 5, 6 et 7 cartes sont évaluées, et seulement celles-là ;
     ② les cas EXACTS où l'ancien bug inventait une main sont maintenant justes ;
     ③ sur un échantillon aléatoire, zéro divergence entre l'évaluation d'un
        flop/turn et la meilleure main réellement composable.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { eval5i, evalBestI, handCategoryOf, EVAL_MIN_CARDS, EVAL_MAX_CARDS } from "./src/solver/core/evaluator.js";
import { cardToInt, handStrength, handStrength7, normalizedStrength } from "./src/fullHandEngine.js";
import { normalizedHandStrength } from "./src/postflopHeuristic.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const throws = (fn, m) => { assert.throws(fn); passed++; void m; };

const C = (r, s) => ({ r, s });
const CAT = ["hauteur", "paire", "double paire", "brelan", "quinte", "couleur", "full", "carré", "quinte flush"];

/* Meilleure main de 5 parmi n, calculée INDÉPENDAMMENT (référence naïve). */
function bestOf5Reference(cardsInt) {
  const n = cardsInt.length;
  let best = -1;
  const pick = (start, acc) => {
    if (acc.length === 5) { const s = eval5i(acc); if (s > best) best = s; return; }
    for (let i = start; i < n; i++) pick(i + 1, [...acc, cardsInt[i]]);
  };
  pick(0, []);
  return best;
}

/* ── 1. Longueurs acceptées et refusées ─────────────────────────────────── */
{
  eq(EVAL_MIN_CARDS, 5, "minimum 5 cartes");
  eq(EVAL_MAX_CARDS, 7, "maximum 7 cartes");
  const deck = [0, 5, 10, 15, 20, 25, 30, 35];
  for (const n of [5, 6, 7]) {
    const score = evalBestI(deck.slice(0, n));
    ok(Number.isFinite(score) && score >= 0, `${n} cartes évaluées`);
    eq(score, bestOf5Reference(deck.slice(0, n)), `${n} cartes = meilleure des C(${n},5)`);
  }
  for (const n of [0, 1, 4, 8, 9]) throws(() => evalBestI(deck.slice(0, n)), `${n} cartes refusées`);
  throws(() => evalBestI(null), "non-tableau refusé");
  throws(() => evalBestI([0, 1, 2, 3, undefined]), "undefined refusé (le cœur du bug)");
  throws(() => evalBestI([0, 1, 2, 3, 52]), "carte hors 0..51 refusée");
  throws(() => evalBestI([0, 1, 2, 3, 4.5]), "carte non entière refusée");
}

/* ── 2. cardToInt ne fabrique plus de 2♠ ────────────────────────────────── */
{
  eq(cardToInt(C("2", "♠")), 0, "2♠ = 0");
  ok(cardToInt(C("A", "♠")) > cardToInt(C("K", "♠")), "A > K");
  throws(() => cardToInt(undefined), "carte absente refusée");
  throws(() => cardToInt(C("X", "♠")), "rang inconnu refusé");
  throws(() => cardToInt(C("A", "x")), "couleur inconnue refusée");
}

/* ── 3. Les cas EXACTS que l'ancien bug faussait ────────────────────────── */
{
  /* Cas de l'audit : K♥8♠ sur K♠ 6♦ T♥. Vraie main = PAIRE de rois.
     L'ancien chemin ajoutait deux 2♠ → « double paire » (rois + deux). */
  const flop = [C("K", "♠"), C("6", "♦"), C("T", "♥")];
  const s = handStrength([C("K", "♥"), C("8", "♠")], flop);
  eq(CAT[handCategoryOf(s)], "paire", "K8 sur K6T = paire, pas double paire");

  /* Une main sans paire au flop reste une hauteur — l'ancien chemin donnait
     systématiquement au moins une paire (les deux 2♠ fantômes). */
  const air = handStrength([C("9", "♥"), C("4", "♦")], [C("K", "♠"), C("7", "♦"), C("2", "♥")]);
  eq(CAT[handCategoryOf(air)], "hauteur", "9-4 sur K72 = hauteur");

  /* Trois piques au flop + deux cartes hors pique : PAS de couleur. Les deux
     cartes fantômes étaient des PIQUES, donc l'ancien chemin voyait 5 piques. */
  const troisPiques = [C("K", "♠"), C("7", "♠"), C("3", "♠")];
  const pasCouleur = handStrength([C("A", "♥"), C("Q", "♦")], troisPiques);
  ok(handCategoryOf(pasCouleur) < 5, "3 piques au board + 2 cartes rouges ≠ couleur");

  /* Turn (6 cartes) : même contrôle avec une seule carte fantôme. */
  const turn = [C("K", "♠"), C("6", "♦"), C("T", "♥"), C("4", "♣")];
  eq(CAT[handCategoryOf(handStrength([C("K", "♥"), C("8", "♠")], turn))], "paire",
     "turn : K8 sur K6T4 = paire");
}

/* ── 4. handStrength7 est bien l'alias de handStrength (5/6/7) ──────────── */
{
  ok(handStrength7 === handStrength, "handStrength7 pointe sur l'abstraction unique");
  const board5 = [C("Q", "♠"), C("J", "♦"), C("T", "♣"), C("2", "♥"), C("7", "♠")];
  ok(handStrength7([C("A", "♥"), C("K", "♥")], board5) > handStrength7([C("2", "♠"), C("2", "♦")], board5),
     "river : quinte > brelan de 2");
  eq(handStrength([C("A", "♥"), C("K", "♥")], []), -1, "board vide → non évaluable (-1)");
  eq(handStrength([C("A", "♥"), C("K", "♥")], [C("2", "♣"), C("5", "♦")]), -1, "2 cartes de board → -1");
  throws(() => handStrength([C("A", "♥"), C("K", "♥")], [C("A", "♥"), C("5", "♦"), C("9", "♣")]),
     "carte en double refusée");
}

/* ── 5. Comparatif aléatoire : zéro divergence due aux cartes manquantes ── */
{
  /* Générateur déterministe (xorshift) — le test doit être rejouable. */
  let seed = 20260821 >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const N = 20000;
  let divergences = 0, categoriesVues = new Set();
  for (let t = 0; t < N; t++) {
    const street = t % 3;                        // 0=flop(5) 1=turn(6) 2=river(7)
    const need = 5 + street;
    const cards = new Set();
    while (cards.size < need) cards.add(Math.floor(rnd() * 52));
    const arr = [...cards];
    const got = evalBestI(arr);
    const ref = bestOf5Reference(arr);
    if (got !== ref) divergences++;
    categoriesVues.add(handCategoryOf(got));
  }
  eq(divergences, 0, `${N} tirages flop/turn/river — 0 divergence vs référence exhaustive`);
  ok(categoriesVues.size >= 6, `échantillon bilatéral : ${categoriesVues.size} catégories de main atteintes`);
}

/* ── 6. Les deux forces normalisées (Hero et Vilain) s'accordent ────────── */
{
  const flop = [C("K", "♠"), C("6", "♦"), C("T", "♥")];
  const main = [C("K", "♥"), C("8", "♠")];
  const vilain = normalizedStrength(main, flop);
  const hero = normalizedHandStrength(main, flop);
  ok(Math.abs(vilain - hero) < 0.16, `Hero (${hero.toFixed(2)}) et Vilain (${vilain.toFixed(2)}) lisent la même main`);
  eq(normalizedStrength(main, []), 0.5, "board vide → force neutre, jamais inventée");
  eq(normalizedStrength(main, [C("2", "♣")]), 0.5, "board d'1 carte → force neutre");

  /* Preuve chiffrée du défaut corrigé : au flop, la force moyenne mesurée doit
     rester basse (l'audit relevait 0,419 au lieu de 0,138 avec les 2♠ fantômes). */
  let seed = 777 >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  let somme = 0; const N = 5000;
  for (let t = 0; t < N; t++) {
    const s = new Set(); while (s.size < 5) s.add(Math.floor(rnd() * 52));
    const [a, b, c, d, e] = [...s];
    const toCard = i => ({ r: "23456789TJQKA"[i >> 2], s: "♠♥♦♣"[i & 3] });
    somme += normalizedStrength([toCard(a), toCard(b)], [toCard(c), toCard(d), toCard(e)]);
  }
  const moyenne = somme / N;
  ok(moyenne < 0.30, `force moyenne au flop = ${moyenne.toFixed(3)} (< 0.30 ; l'ancien chemin donnait 0.419)`);
}

console.log(`✅ évaluateur 5/6/7 cartes (C1) — ${passed} assertions OK`);
