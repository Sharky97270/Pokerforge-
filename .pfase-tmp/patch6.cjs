const fs=require('fs');const p='src/sizing/dynamicOptimizer.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,70));process.exit(1);} s=s.replace(a,b);};

rep(`    const seedNoise = probes.length ? Math.max(...probes.map(v => Math.abs(v - referenceEV))) : 0;
    /* Le plancher de mesure est le PIRE des deux : on ne peut pas être plus
       précis que la moins bonne de ses sources d'incertitude. */
    const noiseFloor = roundEv(Math.max(seedNoise, drift == null ? 0 : drift));`,
`    const seedNoise = probes.length ? Math.max(...probes.map(v => Math.abs(v - referenceEV))) : 0;

    /* ── LE PLANCHER DE MESURE, ET POURQUOI LA DÉRIVE NE SUFFIT PAS ────────
       La dérive entre N et 2N itérations mesure le DERNIER pas de convergence,
       pas la distance restante à l'équilibre. Pour une convergence en 1/√T, la
       somme des pas restants vaut plusieurs fois le dernier : mesuré sur un
       river à ranges réduites, la dérive annonçait 0.003 bb là où l'écart réel
       à l'équilibre valait ~0.011 bb — et une perte d'EV négative de 0.011 était
       alors déclarée « distinguable », c'est-à-dire qu'un Single Size battait le
       solve complet. Faux, et exactement le genre d'affirmation que §0 interdit.

       Sur BOARD COMPLET, on dispose de mieux qu'une extrapolation : NashConv est
       calculable exactement, et dans un jeu à somme nulle il BORNE l'écart entre
       l'EV d'un profil et la valeur du jeu. L'erreur sur une DIFFÉRENCE d'EV est
       donc bornée par la somme des deux NashConv (référence + sous-arbre) — c'est
       le plancher rigoureux, appliqué par évaluation dans \`makeEvaluation\`.

       Hors board complet, NashConv est indisponible ; on retombe sur la dérive
       assortie d'un facteur de sécurité déclaré. */
    const refNashConv = refSolve.convergence ? refSolve.convergence.nashConv : null;
    const noiseFloor = roundEv(Math.max(
      seedNoise,
      drift == null ? 0 : drift * DRIFT_SAFETY_FACTOR,
      refNashConv == null ? 0 : refNashConv,
    ));`);

rep("      const rec = makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor);",
    "      const rec = makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor, refNashConv);");
rep("        evaluations.push(makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor));",
    "        evaluations.push(makeEvaluation(entry, spec, r, referenceEV, state.pot, noiseFloor, refNashConv));");

rep(`function makeEvaluation(entry, treeSpec, solve, referenceEV, pot, noiseFloor) {
  const ok = !!solve.ok;
  const metrics = ok
    ? simplificationMetrics({ referenceEV, simplifiedEV: solve.ev, pot })
    : simplificationMetrics({ referenceEV, simplifiedEV: null, pot });
  /* La perte est-elle plus grande que le bruit de mesure ? Sinon on ne peut PAS
     affirmer qu'un sizing est meilleur qu'un autre — on le dit (§14/§21). */
  const distinguishable = ok && (noiseFloor <= EPS.ev || Math.abs(metrics.absoluteEVLoss) > noiseFloor);`,
`function makeEvaluation(entry, treeSpec, solve, referenceEV, pot, noiseFloor, refNashConv) {
  const ok = !!solve.ok;
  const metrics = ok
    ? simplificationMetrics({ referenceEV, simplifiedEV: solve.ev, pot })
    : simplificationMetrics({ referenceEV, simplifiedEV: null, pot });
  /* Plancher PROPRE à cette évaluation quand l'exploitabilité des deux arbres
     est mesurable : |Δ mesuré − Δ vrai| ≤ NashConv(réf) + NashConv(sous-arbre).
     Sinon, le plancher global (dérive + bruit d'échantillonnage). */
  const evalNashConv = solve.convergence ? solve.convergence.nashConv : null;
  const measurementFloor = (ok && refNashConv != null && evalNashConv != null)
    ? roundEv(Math.max(noiseFloor, refNashConv + evalNashConv))
    : noiseFloor;
  /* La perte est-elle plus grande que le bruit de mesure ? Sinon on ne peut PAS
     affirmer qu'un sizing est meilleur qu'un autre — on le dit (§14/§21). */
  const distinguishable = ok && (measurementFloor <= EPS.ev || Math.abs(metrics.absoluteEVLoss) > measurementFloor);`);

rep(`    ev: ok ? solve.ev : null,
    metrics, distinguishable,`,
`    ev: ok ? solve.ev : null,
    metrics, distinguishable, measurementFloor,
    nashConv: evalNashConv,`);

rep("import { roundEv } from \"./sizingSpec.js\";",
`import { roundEv } from "./sizingSpec.js";

/* Facteur appliqué à la dérive de convergence pour en faire un plancher de
   mesure lorsque NashConv est indisponible (board incomplet). La dérive mesure
   le dernier pas ; la distance restante en vaut plusieurs. 2 est un choix
   CONSERVATEUR et DÉCLARÉ, pas une constante magique — quand NashConv existe,
   c'est lui qui prime, et il est exact. */
export const DRIFT_SAFETY_FACTOR = 2;`);

// le départage par simplicité doit utiliser le plancher, déjà le cas via noiseFloor
fs.writeFileSync(p,s);console.log('ok');
