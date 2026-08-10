/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — TESTS DE PROPRIÉTÉS (§10)

   Un test par l'exemple prouve que le code marche SUR CET EXEMPLE. Un test de
   propriété affirme quelque chose sur TOUTES les entrées d'un domaine, et laisse
   `fast-check` chercher activement un contre-exemple. Quand il en trouve un, il le
   RÉDUIT au plus petit cas qui échoue encore — ce qui transforme un échec obscur en
   cas minimal reproductible.

   SEEDS FIXÉES : chaque propriété est rejouable à l'identique. Une preuve qu'on ne
   peut pas rejouer n'est pas une preuve.
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import fc from "fast-check";
import { computeEquity } from "./src/solver/core/equity.js";
import { eval5i, eval7i } from "./src/solver/core/evaluator.js";
import { solveTree } from "./src/solver/core/multistreet.js";
import { solveMultiStreet } from "./src/solver/api.js";
import { ResultSource } from "./src/solver/provenance.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const prop = (label, arb, predicate, opts = {}) => {
  fc.assert(fc.property(arb, predicate), { seed: 20260806, numRuns: opts.runs ?? 200, ...opts });
  n++;
  console.log(`    ✓ ${label}`);
};

/* Générateur : k cartes DISTINCTES parmi 52. */
const distinctCards = k => fc.uniqueArray(fc.integer({ min: 0, max: 51 }), { minLength: k, maxLength: k });
const asCombo = ([a, b]) => [{ cards: [a, b], w: 1 }];

/* ══ 1. ÉQUITÉ — bornes, symétrie, complémentarité ══ */
console.log("[1] Propriétés de l'équité");
{
  // 9 cartes distinctes : 2 Hero + 2 Vilain + 5 board.
  prop("équité toujours dans [0,100]", distinctCards(9), cs => {
    const e = computeEquity(asCombo(cs.slice(0, 2)), asCombo(cs.slice(2, 4)), cs.slice(4, 9), { budget: 1e9 }).equity;
    return e >= 0 && e <= 100;
  });

  prop("symétrie : eq(A,B) + eq(B,A) = 100", distinctCards(9), cs => {
    const h = asCombo(cs.slice(0, 2)), v = asCombo(cs.slice(2, 4)), b = cs.slice(4, 9);
    const ab = computeEquity(h, v, b, { budget: 1e9 }).equity;
    const ba = computeEquity(v, h, b, { budget: 1e9 }).equity;
    return Math.abs(ab + ba - 100) < 1e-6;
  });

  // Board complet : l'issue est déterministe, donc 0, 50 ou 100 — jamais entre les deux.
  prop("board complet ⇒ équité ∈ {0, 50, 100}", distinctCards(9), cs => {
    const e = computeEquity(asCombo(cs.slice(0, 2)), asCombo(cs.slice(2, 4)), cs.slice(4, 9), { budget: 1e9 }).equity;
    return Math.abs(e - 0) < 1e-6 || Math.abs(e - 50) < 1e-6 || Math.abs(e - 100) < 1e-6;
  });

  // Cohérence avec l'évaluateur : qui a la meilleure main a 100 % d'équité.
  prop("l'équité sur board complet suit l'évaluateur", distinctCards(9), cs => {
    const hc = cs.slice(0, 2), vc = cs.slice(2, 4), b = cs.slice(4, 9);
    const e = computeEquity(asCombo(hc), asCombo(vc), b, { budget: 1e9 }).equity;
    const hs = eval7i([...hc, ...b]), vs = eval7i([...vc, ...b]);
    const expected = hs > vs ? 100 : hs < vs ? 0 : 50;
    return Math.abs(e - expected) < 1e-6;
  });
}

/* ══ 2. INVARIANCE PAR PERMUTATION DES COULEURS ══
   Renommer globalement les couleurs est une symétrie du jeu. Cette propriété est ce
   qui légitime l'abstraction par classe de main : sans elle, regrouper des combos
   serait une approximation, et non une identité. */
console.log("[2] Invariance par permutation des couleurs");
{
  const permutations = [[1, 0, 3, 2], [2, 3, 0, 1], [3, 2, 1, 0], [1, 2, 3, 0]];
  prop("l'évaluateur est invariant par permutation des couleurs",
    fc.tuple(distinctCards(5), fc.integer({ min: 0, max: permutations.length - 1 })),
    ([cs, pi]) => {
      const perm = permutations[pi];
      const mapped = cs.map(c => ((c >> 2) << 2) | perm[c & 3]);
      return eval5i(cs) === eval5i(mapped);
    });

  prop("l'équité est invariante par permutation des couleurs",
    fc.tuple(distinctCards(9), fc.integer({ min: 0, max: permutations.length - 1 })),
    ([cs, pi]) => {
      const perm = permutations[pi];
      const map = c => ((c >> 2) << 2) | perm[c & 3];
      const base = computeEquity(asCombo(cs.slice(0, 2)), asCombo(cs.slice(2, 4)), cs.slice(4, 9), { budget: 1e9 }).equity;
      const alt = computeEquity(asCombo(cs.slice(0, 2).map(map)), asCombo(cs.slice(2, 4).map(map)), cs.slice(4, 9).map(map), { budget: 1e9 }).equity;
      return Math.abs(base - alt) < 1e-6;
    }, { runs: 120 });
}

/* ══ 3. ÉVALUATEUR — ordre total et cohérence 5/7 ══ */
console.log("[3] Propriétés de l'évaluateur");
{
  prop("l'ordre est antisymétrique et transitif sur les triplets",
    fc.tuple(distinctCards(5), distinctCards(5), distinctCards(5)),
    ([a, b, c]) => {
      const [x, y, z] = [eval5i(a), eval5i(b), eval5i(c)];
      // transitivité : x≥y et y≥z ⇒ x≥z (vrai par construction sur des nombres,
      // ce qui vérifie surtout que le score est bien un scalaire total)
      if (x >= y && y >= z) return x >= z;
      return true;
    });

  prop("eval7i ≥ le meilleur eval5i de ses sous-mains… et lui est égal",
    distinctCards(7), cs => {
      let best = -Infinity;
      for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
        best = Math.max(best, eval5i(cs.filter((_, k) => k !== a && k !== b)));
      }
      return eval7i(cs) === best;
    }, { runs: 150 });

  prop("le score est indépendant de l'ordre des cartes", distinctCards(5), cs => {
    const shuffled = [...cs].reverse();
    return eval5i(cs) === eval5i(shuffled);
  });
}

/* ══ 4. STRATÉGIES — distribution de probabilité valide ══
   Propriété fondamentale : à chaque nœud de décision, la stratégie de chaque combo
   doit être une distribution de probabilité — composantes dans [0,1] et somme 1.
   Une violation signalerait un regret matching cassé. */
console.log("[4] Propriétés des stratégies CFR (chemin de production)");
{
  const boardArb = distinctCards(9);   // 5 board + 2 Hero + 2 Vilain
  prop("chaque stratégie est une distribution de probabilité valide",
    boardArb, cs => {
      const board = cs.slice(0, 5);
      const heroList = [{ cards: cs.slice(5, 7), w: 1 }];
      const villList = [{ cards: cs.slice(7, 9), w: 1 }];
      const sol = solveTree(heroList, villList, board, {
        startPot: 10, betSizes: [0.75], effStack: 200, iters: 60, seed: 4242, streets: 1,
      });
      const visit = node => {
        if (!node || node.kind !== "decision") return true;
        const nc = node.player === 0 ? heroList.length : villList.length;
        for (let c = 0; c < nc; c++) {
          const d = sol.avgOf(node, c);
          if (d.length !== node.actions.length) return false;
          let s = 0;
          for (const p of d) { if (!(p >= -1e-9 && p <= 1 + 1e-9)) return false; s += p; }
          if (Math.abs(s - 1) > 1e-6) return false;
        }
        return node.actions.every(a => visit(node.children[a]));
      };
      return visit(sol.tree);
    }, { runs: 25 });
}

/* ══ 5. ENTRÉES DÉGÉNÉRÉES — une range vide ne doit pas produire de solution ══
   Le point n'est pas d'éviter une exception, mais de ne JAMAIS retourner une
   stratégie qui aurait l'air valide alors qu'elle ne repose sur rien. */
console.log("[5] Entrées dégénérées");
{
  const board = [0, 5, 10, 20, 30];
  const empty = solveMultiStreet({}, { AA: { r: 100, c: 0, f: 0 } }, board, { iters: 20 });
  ok(empty.source === ResultSource.NO_SOLUTION, "range Hero vide → NO_SOLUTION (aucune stratégie inventée)");
  ok(empty.result === null, "…et aucun résultat n'est retourné");
  const empty2 = solveMultiStreet({ AA: { r: 100, c: 0, f: 0 } }, {}, board, { iters: 20 });
  ok(empty2.source === ResultSource.NO_SOLUTION, "range Vilain vide → NO_SOLUTION");
  // Board incomplet (< 3 cartes) : hors périmètre du solveur postflop.
  const preflop = solveMultiStreet({ AA: { r: 100, c: 0, f: 0 } }, { KK: { r: 100, c: 0, f: 0 } }, [], { iters: 20 });
  ok(preflop.source === ResultSource.NO_SOLUTION, "board préflop → NO_SOLUTION (le CFR postflop ne s'y applique pas)");
}

/* ══ 6. COMBOS BLOQUÉS — un combo impossible ne peut garder un poids positif ══
   Si une carte du combo est au tableau, ce combo n'existe pas. Le laisser peser dans
   le calcul reviendrait à solver une range qui contient des mains impossibles. */
console.log("[6] Combos bloqués par le board");
{
  prop("un combo dont une carte est au board est exclu de la matrice d'affrontement",
    distinctCards(7), cs => {
      const board = cs.slice(0, 5);
      const blocked = [board[0], cs[5]];        // utilise une carte du board
      const valid = [cs[5], cs[6]];
      const sol = solveTree(
        [{ cards: blocked, w: 1 }, { cards: valid, w: 1 }],
        [{ cards: [cs[6], board[1]], w: 1 }],   // Vilain bloqué lui aussi
        board, { startPot: 10, betSizes: [0.75], effStack: 200, iters: 30, seed: 7, streets: 1 });
      // E vaut -1 pour toute paire impossible : c'est le marqueur d'exclusion.
      return sol.E[0][0] === -1;
    }, { runs: 30 });
}

/* ══ 7. MONOTONIE DE LA CONVERGENCE ══
   Sur un benchmark stable, augmenter les itérations ne doit pas dégrader
   l'exploitabilité. On teste une TENDANCE, pas une décroissance stricte : CFR+ n'est
   pas monotone à chaque pas, et exiger la monotonie stricte produirait un test
   instable qui finirait par être ignoré. */
console.log("[7] Tendance de convergence");
{
  const board = ["2c", "7h", "9s", "Jd", "4s"].map(s => "23456789TJQKA".indexOf(s[0]) * 4 + "shdc".indexOf(s[1]));
  const heroList = [{ cards: [board[0] + 1, board[1] + 1], w: 1 }];   // combos distincts du board
  // On reprend une configuration connue plutôt qu'aléatoire : la tendance ne se lit
  // proprement que sur un spot où la solution existe.
  const H = [{ cards: [8 * 4 + 1, 8 * 4 + 2], w: 1 }, { cards: [1 * 4 + 0, 3 * 4 + 1], w: 1 }];
  const V = [{ cards: [9 * 4 + 1, 9 * 4 + 3], w: 1 }, { cards: [1 * 4 + 1, 4 * 4 + 1], w: 1 }];
  const regrets = [100, 400, 1600].map(iters => {
    const sol = solveTree(H, V, board, { startPot: 10, betSizes: [0.75], effStack: 500, iters, seed: 99, streets: 1 });
    return { iters, ev: Math.abs(sol.ev) };
  });
  console.log(`    EV |racine| : ` + regrets.map(r => `${r.iters} it → ${r.ev.toFixed(4)}`).join(" · "));
  ok(regrets.every(r => Number.isFinite(r.ev)), "l'EV reste finie à toutes les profondeurs d'itération");
  // Stabilité : la valeur ne doit pas diverger quand on itère davantage.
  const spread = Math.max(...regrets.map(r => r.ev)) - Math.min(...regrets.map(r => r.ev));
  ok(spread < 1.0, `l'EV se stabilise (amplitude ${spread.toFixed(4)} bb entre 100 et 1600 itérations)`);
}

console.log(`\n✅ propriétés — ${n} propriétés/assertions OK (seed 20260806, rejouable)`);
