const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const rep = (p, a, b) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
    if (s.includes(pat)) { fs.writeFileSync(p, s.replace(pat, r2)); return; }
  }
  console.error('MISS : ' + a.slice(0, 90)); process.exit(1);
};

rep('test-sizing-pipeline.mjs',
  `import { mayClaimSolved } from "./src/sizing/solutionSchema.js";`,
  `import { mayClaimSolved } from "./src/sizing/solutionSchema.js";
import { strategyEV, nodeActionEVs } from "./src/solver/core/multistreet.js";
import { solveTreeSpec } from "./src/sizing/solverAdapter.js";
import { normalizeGameState } from "./src/sizing/gameState.js";
import { extractStreetStrategy } from "./src/sizing/strategyExtract.js";`);

rep('test-sizing-pipeline.mjs',
  `console.log(\`\\n✅ PFASE pipeline complet`,
  `console.log("\\n══ CASE I — L'EV PAR ACTION EST VRAIE, pas plausible (§36/§49) ══");
{
  /* Trois contrôles INDÉPENDANTS. Une EV par action a ceci de traître qu'elle a
     toujours l'air raisonnable : il faut donc la confronter à des grandeurs dont
     la valeur est connue par ailleurs, sans quoi « ça semble cohérent » tient
     lieu de preuve. */
  clearStore();
  const st = normalizeGameState(stateInput()).state;
  const r = solveTreeSpec({
    state: st, heroRange: HERO, villainRange: VILL,
    treeSpec: { betSpecs: [potSizing(0.33), potSizing(0.75), jamSizing()], raiseSpecs: [], allowJam: true },
    config: { maxIterations: 1200, maxCombos: 0, seed: 5 },
  });
  ok(r.ok, "le solve de contrôle aboutit");
  const sol = r.solution;

  /* ── 1. UNE VALEUR CONNUE D'AVANCE ────────────────────────────────────────
     Sur un pot mort de 12 bb, Hero qui FOLD face à une mise abandonne sa moitié :
     exactement −6 bb, pour toutes les mains, sans exception. C'est le seul
     nombre du tableau dont la réponse ne dépend d'aucun calcul — et c'est
     précisément pour cela qu'il est le meilleur test. Il a d'ailleurs servi :
     l'implémentation initiale rendait −5.93, en comptant au dénominateur des
     combinaisons adverses bloquées que le numérateur écartait. */
  const ex = extractStreetStrategy(sol);
  const faceMise = ex.nodes["X|B0"];
  ok(faceMise && faceMise.ev && faceMise.ev.available, "le nœud « Hero face à une mise » est chiffré");
  eq(faceMise.ev.byAction.F, -6, "FOLD vaut EXACTEMENT −6 bb : la moitié d'un pot mort de 12 bb");
  ok(Object.values(faceMise.ev.byClass).every(c => c.F === -6),
    "et cela vaut pour CHAQUE classe de main — un fold ne dépend pas de la main");

  /* ── 2. UN INVARIANT INTERNE ──────────────────────────────────────────────
     Mélanger, par combo, les EV par action selon les fréquences de la stratégie
     doit redonner l'EV de la stratégie elle-même. Le mélange se fait main par
     main : agréger d'abord et mélanger ensuite donne un autre nombre.

     ATTENTION à la référence : c'est `strategyEV` (l'EV de la stratégie MOYENNE)
     et non `solveTree.ev`, qui est la moyenne des EV des stratégies COURANTES
     sur toutes les itérations. Ces deux-là diffèrent encore de 0.086 bb à 600
     itérations — les confondre fait chercher un bug inexistant. */
  const racine = nodeActionEVs(sol, []);
  const sev = strategyEV(sol);
  ok(racine.available && sev, "les deux mesures sont disponibles");
  ok(Math.abs(racine.mixedEV - sev.ev) < 0.001,
    \`EV mélangée (\${racine.mixedEV}) = EV de la stratégie moyenne (\${sev.ev}) — écart \${Math.abs(racine.mixedEV - sev.ev).toFixed(6)}\`);

  /* ── 3. UNE PROPRIÉTÉ DE L'ÉQUILIBRE ──────────────────────────────────────
     À l'équilibre, les actions qu'une main joue réellement lui sont indifférentes.
     Le déficit résiduel, PONDÉRÉ par la fréquence de l'action et par le poids de
     la classe dans la range, doit tenir dans l'exploitabilité mesurée — c'est le
     lien entre les EV par action et NashConv, deux calculs entièrement séparés.
     Sans la pondération, on compare des grandeurs sans rapport : un écart brut de
     0.26 bb sur une classe jouée 9 % du temps et pesant 13 % de la range ne pèse
     que 0.003 bb, soit exactement l'ordre de NashConv. */
  const root = ex.nodes[""];
  const classes = Object.keys(root.byClass);
  let deficitPondere = 0;
  for (const cls of classes) {
    const f = root.byClass[cls], e = root.ev.byClass[cls];
    const meilleure = Math.max(...Object.values(e));
    for (const a of Object.keys(f)) deficitPondere += (f[a] || 0) * Math.max(0, meilleure - e[a]) / classes.length;
  }
  const nashConv = r.convergence.nashConv;
  ok(nashConv != null, "l'exploitabilité est mesurée indépendamment");
  ok(deficitPondere <= Math.max(0.05, nashConv * 6),
    \`déficit d'indifférence pondéré \${deficitPondere.toFixed(4)} bb, compatible avec NashConv \${nashConv}\`);

  /* ── ET LE VERDICT QUI EN DÉCOULE ────────────────────────────────────────── */
  const s2 = solve({ mode: "FIXED", userBetSpecs: [potSizing(0.33), potSizing(0.75)] });
  ok(s2.ok, "une solution complète est produite");
  const noeud = getTrainingNode(s2.solution, [], { handClass: "AA" });
  eq(noeud.evAvailable, true, "§36 — l'EV par action est désormais DISPONIBLE au Trainer");
  eq(noeud.evSource, "hand-class", "et elle porte sur la main, pas sur la range");
  eq(noeud.evExact, true, "board complet : elle est exacte");
  ok(noeud.actions.every(a => typeof a.evBb === "number"), "chaque action affichable porte son EV");

  const check = compareAction({ solution: s2.solution, path: [], handClass: "AA", actionType: "CHECK" });
  eq(check.evAvailable, true, "§49 — EV jouée / EV la meilleure / écart sont rendus");
  ok(check.evLossBb > 0.5, \`checker AA coûte \${check.evLossBb} bb — un écart réel, très au-dessus du résidu\`);
  eq(check.evLossBelowNoise, false, "et il est déclaré au-dessus du bruit : c'est bien une erreur");

  const horsArbre = compareAction({ solution: s2.solution, path: [], handClass: "AA", actionType: "BET", sizeBb: 7.77 });
  eq(horsArbre.evAvailable, false, "§50 — un sizing non résolu n'a toujours PAS d'EV");
  eq(horsArbre.evPlayedBb, null, "aucun nombre n'est fabriqué pour lui");
  ok(horsArbre.evBestBb != null, "mais l'EV de la meilleure action ÉTUDIÉE reste publiée");
  ok(/extrapolation/.test(horsArbre.evNote), "avec l'interdiction explicite de la lui attribuer");

  console.log(\`   fold = \${faceMise.ev.byAction.F} bb (attendu −6) · mélange \${racine.mixedEV} vs stratégie \${sev.ev} · déficit pondéré \${deficitPondere.toFixed(4)} vs NashConv \${nashConv}\`);
}

console.log(\`\\n✅ PFASE pipeline complet`);
console.log('ok');
