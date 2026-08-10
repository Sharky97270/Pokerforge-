/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — CADRE THÉORIQUE DE L'ÉQUILIBRE (§5)

   Ce que ces tests protègent : l'interdiction d'annoncer « équilibre de Nash » là où
   la théorie ne le permet pas.

   `NashConv = brEV(Hero) + brEV(Vilain)` est une IDENTITÉ QUI SUPPOSE LA SOMME NULLE.
   À 3 joueurs et plus sous ICM, les jetons transférés déplacent l'équité de joueurs
   qui ne sont pas dans le coup : la somme des utilités n'est plus constante, et la
   métrique cesse d'être interprétable. À exactement 2 joueurs, la somme des équités
   est constante — la métrique reste valide, même en mode ICM.

   Le verrou est un BOOLÉEN porté par le résultat (`mayClaimNashApproximation`), pas
   une règle à réappliquer dans chaque composant d'interface : une règle qu'on
   reconstitue à plusieurs endroits finit par être oubliée à l'un d'eux.
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { solveMultiStreet } from "./src/solver/api.js";
import {
  deriveEquilibriumScope, mayClaimNashApproximation, TheoreticalScope, GuaranteeLabel,
} from "./src/solver/certification/types.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

const C = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
const board = (...cs) => cs.map(s => C(s[0], s[1]));
const freqs = obj => obj;

/* ══ 1. LE CADRE EST ATTACHÉ AU RÉSULTAT ══ */
console.log("[1] Cadre théorique attaché aux solves");
{
  const b = board("2c", "7h", "9s", "Jd", "4s");     // board complet → NashConv calculable
  const hero = freqs({ AA: { r: 100, c: 0, f: 0 }, "72o": { r: 100, c: 0, f: 0 } });
  const vill = freqs({ KK: { r: 100, c: 0, f: 0 }, "83o": { r: 100, c: 0, f: 0 } });

  const chip = solveMultiStreet(hero, vill, b, { iters: 200, betSizes: [0.75], startPot: 10, seed: 1 });
  ok(chip.equilibriumScope, "le solve porte son cadre théorique");
  eq(chip.equilibriumScope.playerCount, 2, "chip-EV postflop : 2 joueurs par construction");
  eq(chip.equilibriumScope.zeroSum, true, "…donc à somme nulle");
  eq(chip.equilibriumScope.theoreticalScope, TheoreticalScope.TWO_PLAYER_ZERO_SUM, "cadre 2 joueurs somme nulle");
  eq(chip.equilibriumScope.guaranteeLabel, GuaranteeLabel.NASH_APPROXIMATION_SUPPORTED,
    "l'approximation de Nash est théoriquement soutenue");
  ok(chip.mayClaimNashApproximation === true,
    "board complet + heads-up + NashConv mesuré → revendication autorisée");
  ok(typeof chip.convergence.nashConv === "number", "NashConv effectivement mesuré");
  console.log(`    heads-up chip-EV : NashConv ${chip.convergence.nashConv.toFixed(5)} bb · revendication autorisée`);
}

/* ══ 2. BOARD INCOMPLET — pas de mesure, donc pas de revendication ══
   Une exploitabilité non mesurée ne peut pas fonder une affirmation d'équilibre,
   même dans un cadre théoriquement valide. */
console.log("[2] Board incomplet — mesure absente, revendication refusée");
{
  const b = board("2c", "7h", "9s");                  // flop → runouts échantillonnés
  const hero = freqs({ AA: { r: 100, c: 0, f: 0 } });
  const vill = freqs({ KK: { r: 100, c: 0, f: 0 } });
  const sol = solveMultiStreet(hero, vill, b, { iters: 60, betSizes: [0.75], startPot: 10, seed: 2 });
  eq(sol.equilibriumScope.zeroSum, true, "le cadre reste à somme nulle (heads-up)");
  eq(sol.convergence.nashConv, null, "mais NashConv n'est pas mesurable (runouts échantillonnés)");
  eq(sol.mayClaimNashApproximation, false,
    "→ revendication REFUSÉE : cadre valide mais preuve absente");
  ok(/échantillonn/i.test(sol.convergence.note || ""), "la note dit pourquoi la mesure manque");
}

/* ══ 3. MULTIJOUEUR SOUS ICM — le cadre lui-même interdit la revendication ══ */
console.log("[3] Multijoueur sous ICM — cadre non à somme nulle");
{
  const b = board("2c", "7h", "9s", "Jd", "4s");
  const hero = freqs({ AA: { r: 100, c: 0, f: 0 } });
  const vill = freqs({ KK: { r: 100, c: 0, f: 0 } });
  const sol = solveMultiStreet(hero, vill, b, {
    iters: 120, betSizes: [0.75], startPot: 10, seed: 3,
    icm: { stacks: [100, 90, 80, 70], payouts: [50, 30, 20, 0], heroIdx: 0, villIdx: 1 },
  });
  eq(sol.equilibriumScope.playerCount, 4, "4 joueurs détectés depuis les tapis de tournoi");
  eq(sol.equilibriumScope.zeroSum, false, "4 joueurs sous ICM : PAS à somme nulle");
  eq(sol.equilibriumScope.theoreticalScope, TheoreticalScope.NON_ZERO_SUM, "cadre non à somme nulle");
  eq(sol.equilibriumScope.guaranteeLabel, GuaranteeLabel.CONVERGED_STRATEGY_NO_FULL_NASH_GUARANTEE,
    "libellé imposé : « stratégie convergée dans le modèle »");
  eq(sol.mayClaimNashApproximation, false, "revendication d'équilibre de Nash INTERDITE");
  eq(sol.convergence.nashConv, null, "NashConv n'est pas exposé dans ce cadre");
  ok(/somme nulle|pas interprétable/i.test(sol.convergence.note || ""),
    "la note explique que la métrique n'est pas interprétable ici");
  console.log(`    4 joueurs ICM : ${sol.equilibriumScope.theoreticalScope} · revendication refusée`);
}

/* ══ 4. ICM À DEUX JOUEURS — la somme nulle survit ══
   Piège classique : croire que « mode ICM » implique « pas de somme nulle ». C'est le
   NOMBRE DE JOUEURS qui décide. À deux, la somme des équités est constante. */
console.log("[4] ICM heads-up — la somme nulle est préservée");
{
  const b = board("2c", "7h", "9s", "Jd", "4s");
  const sol = solveMultiStreet(
    { AA: { r: 100, c: 0, f: 0 } }, { KK: { r: 100, c: 0, f: 0 } }, b, {
    iters: 120, betSizes: [0.75], startPot: 10, seed: 4,
    icm: { stacks: [100, 100], payouts: [70, 30], heroIdx: 0, villIdx: 1 },
  });
  eq(sol.equilibriumScope.playerCount, 2, "2 joueurs");
  eq(sol.equilibriumScope.zeroSum, true, "ICM à 2 joueurs : somme nulle malgré l'utilité ICM");
  ok(mayClaimNashApproximation(sol.equilibriumScope),
    "le cadre autorise la revendication (contrairement au multijoueur)");
  console.log(`    2 joueurs ICM : ${sol.equilibriumScope.theoreticalScope} · cadre favorable`);
}

/* ══ 5. LE VERROU EST COHÉRENT SUR TOUTE COMBINAISON ══
   Balayage systématique : la revendication ne doit JAMAIS être autorisée quand le
   cadre l'interdit, quelle que soit la configuration. */
console.log("[5] Cohérence systématique du verrou");
{
  let violations = 0, cases = 0;
  for (const players of [2, 3, 4, 6, 9]) {
    for (const kind of ["chip", "icm", "pko"]) {
      const scope = deriveEquilibriumScope({ playerCount: players, utilityKind: kind });
      const allowed = mayClaimNashApproximation(scope);
      cases++;
      // Règle : autorisé si et seulement si exactement 2 joueurs.
      if (allowed !== (players === 2)) violations++;
      // Et le libellé doit suivre le booléen, sans exception.
      const labelOk = allowed
        ? scope.guaranteeLabel === GuaranteeLabel.NASH_APPROXIMATION_SUPPORTED
        : scope.guaranteeLabel === GuaranteeLabel.CONVERGED_STRATEGY_NO_FULL_NASH_GUARANTEE;
      if (!labelOk) violations++;
    }
  }
  eq(violations, 0, `${cases} combinaisons (joueurs × type d'utilité) : 0 incohérence`);
  ok(cases === 15, "balayage complet : 5 tailles × 3 types d'utilité");
}

/* ══ 6. RÉTRO-COMPATIBILITÉ ══ */
console.log("[6] Rétro-compatibilité");
{
  const b = board("2c", "7h", "9s", "Jd", "4s");
  const sol = solveMultiStreet({ AA: { r: 100, c: 0, f: 0 } }, { KK: { r: 100, c: 0, f: 0 } }, b,
    { iters: 100, betSizes: [0.75], startPot: 10, seed: 5 });
  ok(sol.source && sol.result && sol.convergence, "champs historiques présents (source, result, convergence)");
  ok(sol.abstraction && sol.solveId, "…ainsi que abstraction et solveId");
  ok("experimental" in sol, "le marqueur `experimental` est conservé");
}

console.log(`\n✅ cadre théorique — ${n} assertions OK`);
