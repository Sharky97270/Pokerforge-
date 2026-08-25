const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const rep = (p, a, b) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
    if (s.includes(pat)) { fs.writeFileSync(p, s.replace(pat, r2)); return; }
  }
  console.error('MISS : ' + a.slice(0, 90)); process.exit(1);
};

rep('test-sizing-trainer.mjs',
`  /* Fixture d'EV construite pour piéger la confusion « meilleure action » :
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
  eq(v.evBestLabel, "X", "la meilleure action est le CHECK — désigné par son label d'arbre, faute d'étiquette de sizing");
  eq(v.evSource, "hand-class", "l'EV vient de la classe de main, comme la fréquence");
  eq(v.evExact, true, "et elle est exacte (board complet)");

  /* La distinction qui compte : la plus fréquente n'est pas la mieux valorisée. */
  const node = getTrainingNode(sol, [], { handClass: "AKs" });
  const plusFrequente = node.actions.reduce((m, a) => (a.frequency > m.frequency ? a : m));
  eq(plusFrequente.label, "B", "l'action la plus FRÉQUENTE est bien la mise");
  eq(v.evBestLabel === "X" && v.evBestBb === 2.5, true, "mais l'écart se mesure contre le CHECK, mieux valorisé");`,

`  /* Fixture d'EV construite pour piéger la confusion « meilleure action » :
     la fixture joue X à 80 % et B à 20 % — X est donc la PLUS FRÉQUENTE. Mais
     c'est B qui VAUT le plus (2.5 contre 2.0). Un moteur qui mesurerait l'écart
     d'EV contre l'action majoritaire trouverait 0 ; il doit trouver 0.5. */
  const ev = {
    available: true, exact: true, samples: 1,
    byAction: { X: 2.0, B: 2.5 },
    byClass: { AKs: { X: 2.0, B: 2.5 }, AA: { X: 0.4, B: 3.9 } },
    mixedEV: 2.1, reachShare: 1,
  };
  const { sol } = seedSolution(SPOT(), LEDGER(), "SINGLE", [potSizing(0.33)], { ev });

  /* Hero CHECK : l'action majoritaire… et pourtant la moins bonne. */
  const v = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "CHECK" } });
  eq(v.evAvailable, true, "l'EV est annoncée disponible");
  eq(v.evPlayedBb, 2, "EV jouée");
  eq(v.evBestBb, 2.5, "EV de la meilleure action — celle qui VAUT le plus");
  eq(v.evLossBb, 0.5, "écart = meilleure − jouée");
  eq(v.evBestLabel, "33%", "et la meilleure action est désignée par son sizing");
  eq(v.evSource, "hand-class", "l'EV vient de la classe de main, comme la fréquence");
  eq(v.evExact, true, "et elle est exacte (board complet)");

  /* La distinction qui compte : la plus fréquente n'est PAS la mieux valorisée. */
  const node = getTrainingNode(sol, [], { handClass: "AKs" });
  const plusFrequente = node.actions.reduce((m, a) => (a.frequency > m.frequency ? a : m));
  eq(plusFrequente.label, "X", "l'action la plus FRÉQUENTE est le check");
  eq(v.evLossBb, 0.5, "or l'écart vaut 0.5 : il a bien été mesuré contre la MIEUX VALORISÉE, pas contre la majoritaire");

  /* Jouer la mise : c'est l'optimum, l'écart est nul. */
  const vb = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 3.96 } });
  eq(vb.evPlayedBb, 2.5, "EV jouée quand on prend la meilleure action");
  eq(vb.evLossBb, 0, "et l'écart est nul");`);

rep('test-sizing-trainer.mjs',
`  const v3 = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 7.77 } });`,
`  const v3 = trainerVerdict({ solution: sol, handClass: "AKs", heroAction: { actionType: "BET", toBb: 7.77 } });`);
console.log('ok');
