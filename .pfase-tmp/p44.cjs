const fs=require('fs');
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
const repFile=(p,pairs)=>{let s=fs.readFileSync(p,'utf8');
  for(const [a,b] of pairs){let d=false;
    for(const [pat,r2] of [[a,b],[a.split(LF).join(CRLF),b.split(LF).join(CRLF)]]){if(s.includes(pat)){s=s.replace(pat,r2);d=true;break;}}
    if(!d){console.error('MISS ['+p+'] : '+a.slice(0,80));process.exit(1);}}
  fs.writeFileSync(p,s);};

repFile('src/sizing/dynamicOptimizer.js',[
  [`    const refNashConv = refSolve.convergence ? refSolve.convergence.nashConv : null;
    const noiseFloor = roundEv(Math.max(
      seedNoise,
      drift == null ? 0 : drift * DRIFT_SAFETY_FACTOR,
      refNashConv == null ? 0 : refNashConv,
    ));`,
   `    const refNashConv = refSolve.convergence ? refSolve.convergence.nashConv : null;

    /* ── DEUX PLANCHERS, PARCE QU'IL Y A DEUX QUESTIONS ────────────────────
       « Cette perte est-elle MESURABLE ? » et « est-elle GARANTIE ? » n'ont pas
       la même réponse, et n'en donner qu'une trompe dans un sens ou dans l'autre.

       PLANCHER MESURÉ — la dérive observée de l'EV entre N et 2N itérations,
       assortie d'un facteur de sécurité, plus le bruit d'échantillonnage. C'est
       ce que l'on constate.

       PLANCHER GARANTI — NashConv(référence) + NashConv(sous-arbre). Dans un jeu
       à somme nulle, l'écart entre l'EV d'un profil et la valeur du jeu est borné
       par son exploitabilité ; l'erreur sur une DIFFÉRENCE l'est par la somme.
       C'est rigoureux, mais lâche : mesuré sur un river, la borne annonçait
       0.041 bb là où l'erreur réelle valait 0.003 — un facteur 13.

       N'utiliser que la borne rigoureuse déclarerait presque tout indistinguable
       et masquerait des écarts réels. N'utiliser que la dérive surestimerait la
       précision. On rapporte donc les deux, et l'interface dit laquelle est
       franchie. */
    const empiricalFloor = roundEv(Math.max(
      seedNoise,
      drift == null ? 0 : drift * DRIFT_SAFETY_FACTOR,
    ));
    const guaranteedFloor = roundEv(Math.max(
      empiricalFloor,
      refNashConv == null ? 0 : refNashConv,
    ));
    /* Le plancher OPÉRATIONNEL — celui qui décide de \`distinguishable\` — est le
       plancher mesuré. Le garanti l'accompagne toujours. */
    const noiseFloor = empiricalFloor;`],
  [`  const measurementFloor = (ok && refNashConv != null && evalNashConv != null)
    ? roundEv(Math.max(noiseFloor, refNashConv + evalNashConv))
    : noiseFloor;
  /* La perte est-elle plus grande que le bruit de mesure ? Sinon on ne peut PAS
     affirmer qu'un sizing est meilleur qu'un autre — on le dit (§14/§21). */
  const distinguishable = ok && (measurementFloor <= EPS.ev || Math.abs(metrics.absoluteEVLoss) > measurementFloor);`,
   `  /* Plancher GARANTI propre à cette évaluation : NashConv(réf) + NashConv(sous-arbre). */
  const guaranteedFloor = (ok && refNashConv != null && evalNashConv != null)
    ? roundEv(Math.max(noiseFloor, refNashConv + evalNashConv))
    : noiseFloor;
  const measurementFloor = noiseFloor;
  /* MESURÉE : la perte dépasse ce qu'on observe comme bruit.
     GARANTIE : elle dépasse aussi la borne rigoureuse d'exploitabilité.
     Les deux sont rapportées ; aucune n'est présentée pour l'autre (§14/§21). */
  const distinguishable = ok && (measurementFloor <= EPS.ev || Math.abs(metrics.absoluteEVLoss) > measurementFloor);
  const guaranteed = ok && (guaranteedFloor <= EPS.ev || Math.abs(metrics.absoluteEVLoss) > guaranteedFloor);`],
  [`    metrics, distinguishable, measurementFloor,
    nashConv: evalNashConv,`,
   `    metrics, distinguishable, guaranteed, measurementFloor, guaranteedFloor,
    nashConv: evalNashConv,`],
  [`        noise: { floor: noiseFloor, seedNoise: roundEv(seedNoise), convergenceDrift: drift==null?null:roundEv(drift), escalations, iterations: effCfg.maxIterations, probes, sampled },
        planner: { entries: 0`,
   `        noise: { floor: noiseFloor, empiricalFloor, guaranteedFloor, seedNoise: roundEv(seedNoise), convergenceDrift: drift==null?null:roundEv(drift), refNashConv, escalations, iterations: effCfg.maxIterations, probes, sampled },
        planner: { entries: 0`],
  [`      noise: { floor: noiseFloor, seedNoise: roundEv(seedNoise), convergenceDrift: drift==null?null:roundEv(drift), escalations, iterations: effCfg.maxIterations, probes, sampled },
      planner: {`,
   `      noise: { floor: noiseFloor, empiricalFloor, guaranteedFloor, seedNoise: roundEv(seedNoise), convergenceDrift: drift==null?null:roundEv(drift), refNashConv, escalations, iterations: effCfg.maxIterations, probes, sampled },
      planner: {`],
  [`        complexityCost: sel.betKeys.length + sel.raiseKeys.length,
        distinguishable: sel.distinguishable,
      },`,
   `        complexityCost: sel.betKeys.length + sel.raiseKeys.length,
        distinguishable: sel.distinguishable,
        guaranteed: sel.guaranteed,
        measurementFloor: sel.measurementFloor,
        guaranteedFloor: sel.guaranteedFloor,
      },`],
]);

repFile('src/sizing/pfase.js',[
  [`  solution.distinguishable = opt.selected.distinguishable;`,
   `  solution.distinguishable = opt.selected.distinguishable;
  solution.guaranteed = opt.selected.guaranteed;`],
]);
console.log('ok');
