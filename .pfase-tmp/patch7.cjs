const fs=require('fs');const p='src/sizing/dynamicOptimizer.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,70));process.exit(1);} s=s.replace(a,b);};
rep(`    const wantProbe = effCfg.convergenceProbe !== false;
    while (wantProbe) {
      if (signal && signal.aborted) throw new SolveCancelled();
      const doubled = runSolve(refSpec, { maxIterations: effCfg.maxIterations * 2 }, "convergence-probe");
      if (!doubled.ok) break;
      drift = Math.abs(doubled.ev - refSolve.ev);
      if (!autoEscalate) break;                       // mesuré, mais on n'escalade pas
      /* On adopte la mesure la plus précise : elle est strictement meilleure. */
      effCfg = { ...effCfg, maxIterations: effCfg.maxIterations * 2 };
      refSolve = doubled;
      escalations++;
      if (drift <= target || effCfg.maxIterations * 2 > ceiling) break;
      progress(SolveStatus.SOLVING, { step: "convergence", iterations: effCfg.maxIterations, drift });
    }`,
`    const wantProbe = effCfg.convergenceProbe !== false;
    /* CRITÈRE D'ARRÊT — le meilleur disponible, et il n'est pas toujours le même :
         board complet  → NashConv, qui BORNE l'écart à l'équilibre (exact) ;
         board incomplet → la dérive d'EV entre N et 2N, faute de mieux.
       Viser la dérive quand NashConv existe reviendrait à ignorer une mesure
       rigoureuse au profit d'une extrapolation. */
    const errorOf = (solve, d) => {
      const nc = solve && solve.convergence ? solve.convergence.nashConv : null;
      return nc != null ? nc : (d == null ? null : d * DRIFT_SAFETY_FACTOR);
    };
    while (wantProbe) {
      if (signal && signal.aborted) throw new SolveCancelled();
      const doubled = runSolve(refSpec, { maxIterations: effCfg.maxIterations * 2 }, "convergence-probe");
      if (!doubled.ok) break;
      drift = Math.abs(doubled.ev - refSolve.ev);
      if (!autoEscalate) break;                       // mesuré, mais on n'escalade pas
      /* On adopte la mesure la plus précise : elle est strictement meilleure. */
      effCfg = { ...effCfg, maxIterations: effCfg.maxIterations * 2 };
      refSolve = doubled;
      escalations++;
      const err = errorOf(refSolve, drift);
      if (err == null || err <= target || effCfg.maxIterations * 2 > ceiling) break;
      progress(SolveStatus.SOLVING, { step: "convergence", iterations: effCfg.maxIterations, drift, exploitability: refSolve.convergence ? refSolve.convergence.nashConv : null });
    }`);
fs.writeFileSync(p,s);console.log('ok');
