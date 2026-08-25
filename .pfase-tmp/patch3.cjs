const fs=require('fs');const p='src/sizing/dynamicOptimizer.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,80));process.exit(1);} s=s.replace(a,b);};
rep(`    let drift = null, escalations = 0;
    const target = effCfg.convergenceTarget ?? 0.05;
    const ceiling = effCfg.maxIterationsCeiling ?? (effCfg.maxIterations * 8);
    const autoEscalate = effCfg.autoEscalate !== false;
    for (;;) {
      if (signal && signal.aborted) throw new SolveCancelled();
      const doubled = runSolve(refSpec, { maxIterations: effCfg.maxIterations * 2 }, "convergence-probe");
      if (!doubled.ok) break;
      drift = Math.abs(doubled.ev - refSolve.ev);
      if (!autoEscalate || drift <= target || effCfg.maxIterations * 2 > ceiling) {
        /* On adopte la mesure la plus précise disponible comme référence : elle
           est strictement meilleure que celle qu'on remplace. */
        effCfg = { ...effCfg, maxIterations: effCfg.maxIterations * 2 };
        refSolve = doubled;
        escalations++;
        break;
      }
      effCfg = { ...effCfg, maxIterations: effCfg.maxIterations * 2 };
      refSolve = doubled;
      escalations++;
      progress(SolveStatus.SOLVING, { step: "convergence", iterations: effCfg.maxIterations, drift });
    }`,
`    let drift = null, escalations = 0;
    const target = effCfg.convergenceTarget ?? 0.05;
    const ceiling = effCfg.maxIterationsCeiling ?? (effCfg.maxIterations * 8);
    const autoEscalate = effCfg.autoEscalate !== false;
    /* MESURER la dérive et AGIR dessus sont deux décisions distinctes.
       \`convergenceProbe:false\` coupe la mesure (utile quand le solveur est une
       fixture exacte : la sonde ne mesurerait rien et coûterait un solve).
       \`autoEscalate:false\` garde la mesure — donc le plancher honnête — mais
       laisse la précision demandée telle quelle. Les confondre revenait à
       doubler en silence la précision que l'appelant avait choisie. */
    const wantProbe = effCfg.convergenceProbe !== false;
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
    }`);
fs.writeFileSync(p,s);console.log('ok');
