const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const repFile = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    let d = false;
    for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
      if (s.includes(pat)) { s = s.replace(pat, r2); d = true; break; }
    }
    if (!d) { console.error('MISS [' + p + '] : ' + a.slice(0, 80)); process.exit(1); }
  }
  fs.writeFileSync(p, s);
};

repFile('test-sizing-trainer.mjs', [
  /* La fixture accepte désormais un bloc d'EV optionnel, pour tester les deux
     régimes : solution SANS EV (l'ancien cas, toujours valide) et AVEC. */
  [`          aggregate: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])),
          byClass: { AKs: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])) },
          potBb: 12, toCallBb: 0,
          normalization: { ok: true, sum: 1, problems: [] },`,
   `          aggregate: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])),
          byClass: { AKs: Object.fromEntries(labels.map((l, i) => [l, freqs[i]])) },
          potBb: 12, toCallBb: 0,
          normalization: { ok: true, sum: 1, problems: [] },
          /* EV par action — absente par défaut (une solution peut très bien ne
             pas l'avoir : budget épuisé, extraction sans EV). \`over.ev\` la
             fournit pour les tests qui portent sur le verdict d'EV. */
          ev: over.ev || null,`],

  [`  const v = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 3.96 } });
  ok(v.solutionAction, "l'action de la solution est fournie");
  ok(typeof v.matched.frequency === "number", "la fréquence l'est aussi");
  eq(v.evAvailable, false, "l'EV par action ne l'est pas — et on le dit plutôt que d'en inventer une");
  ok(/n'est pas conservée/.test(v.evNote), "avec l'explication");`,
   `  const v = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 3.96 } });
  ok(v.solutionAction, "l'action de la solution est fournie");
  ok(typeof v.matched.frequency === "number", "la fréquence l'est aussi");
  eq(v.evAvailable, false, "l'EV par action ne l'est pas — et on le dit plutôt que d'en inventer une");
  ok(/n'a pas été calculée/.test(v.evNote), "avec l'explication");
  eq(v.evPlayedBb, null, "aucun nombre n'est fabriqué à la place");
  eq(v.evBestBb, null, "ni pour la meilleure action");
  eq(v.evLossBb, null, "ni pour l'écart");`],

  /* ── nouveau bloc de tests, inséré juste avant le §43 ─────────────────── */
  [`console.log("\\n── §43/§68 — le Vilain échantillonne, et la séquence est rejouable");`,
   `console.log("\\n── §36/§49 — EV jouée · EV la meilleure · écart, quand elles EXISTENT");
{
  clearStore();
  /* Fixture d'EV construite pour piéger la confusion « meilleure action » :
     B (33 %) est la PLUS FRÉQUENTE (freq 0.8 contre 0.2), mais X est la MIEUX
     VALORISÉE (2.5 contre 2.0). L'écart doit se mesurer contre X. */
  const ev = {
    available: true, exact: true, samples: 1,
    byAction: { X: 2.5, B: 2.0 },
    byClass: { AKs: { X: 2.5, B: 2.0 }, AA: { X: 0.4, B: 3.9 } },
    mixedEV: 2.1, reachShare: 1,
  };
  const { sol } = seedSolution(SPOT(), LEDGER(), "SINGLE", [potSizing(0.33)], { ev });

  const v = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 3.96 } });
  eq(v.evAvailable, true, "l'EV est annoncée disponible");
  eq(v.evPlayedBb, 2, "EV jouée");
  eq(v.evBestBb, 2.5, "EV de la meilleure action — celle qui VAUT le plus");
  eq(v.evLossBb, 0.5, "écart = meilleure − jouée");
  eq(v.evBestLabel, null, "le check n'a pas d'étiquette de sizing");
  eq(v.evSource, "hand-class", "l'EV vient de la classe de main, comme la fréquence");
  eq(v.evExact, true, "et elle est exacte (board complet)");

  /* La distinction qui compte : la plus fréquente n'est pas la mieux valorisée. */
  const node = getTrainingNode(sol, [], { handClass: "AKs" });
  const plusFrequente = node.actions.reduce((m, a) => (a.frequency > m.frequency ? a : m));
  eq(plusFrequente.label, "B", "l'action la plus FRÉQUENTE est bien la mise");
  eq(v.evBestLabel === null && v.evBestBb === 2.5, true, "mais l'écart se mesure contre le CHECK, mieux valorisé");

  /* Une classe absente de byClass retombe sur l'agrégat de range — et le DIT. */
  const v2 = trainerVerdict({ solution: sol, handClass: "72o", heroAction: { actionType: "BET", toBb: 3.96 } });
  eq(v2.evAvailable, true, "l'EV de range reste disponible");
  eq(v2.evSource, "range-aggregate", "mais sa source est annoncée comme celle de la RANGE");
  eq(v2.evIsRangeWide, true, "et le drapeau le dit explicitement");
  ok(/RANGE ENTIÈRE/.test(v2.evNote), "avec la mise en garde : ce n'est pas l'EV de cette main");

  /* Un sizing non étudié : pas d'EV jouée, mais le contexte reste chiffré. */
  const v3 = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 7.77 } });
  eq(v3.evAvailable, false, "§50 — le sizing joué n'a pas d'EV : on ne lui en prête pas");
  eq(v3.evPlayedBb, null, "aucune EV jouée");
  eq(v3.evBestBb, 2.5, "l'EV de la meilleure action ÉTUDIÉE reste publiée");
  ok(/extrapolation/.test(v3.evNote), "et la note interdit explicitement de la reporter sur le sizing joué");
}

console.log("\\n── §14/§21 — un écart d'EV sous le résidu d'indifférence n'est PAS une faute");
{
  clearStore();
  /* Deux actions mixées 50/50 dont les EV diffèrent de 0.03 : c'est du résidu de
     convergence, pas une erreur de jeu. Le verdict doit le dire. */
  const ev = {
    available: true, exact: true, samples: 1,
    byAction: { X: 2.53, B0: 2.5, B1: 2.5 },
    byClass: { AKs: { X: 2.53, B0: 2.5, B1: 2.5 } },
    mixedEV: 2.51, reachShare: 1,
  };
  const { sol } = seedSolution(SPOT(), LEDGER(), "SIMPLE", [potSizing(0.33), potSizing(0.75)], { ev });
  const v = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 3.96 } });
  eq(v.evLossBb, 0.03, "l'écart est mesuré et publié tel quel");
  ok(v.evEquilibriumResidualBb >= 0.03, "le résidu d'indifférence du nœud est au moins aussi grand");
  eq(v.evLossBelowNoise, true, "donc l'écart est déclaré sous le bruit — ce n'est pas une erreur de jeu");
}

console.log("\\n── §43/§68 — le Vilain échantillonne, et la séquence est rejouable");`],
]);
console.log('ok');
