const fs=require('fs');const p='src/sizing/dynamicOptimizer.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,80));process.exit(1);} s=s.replace(a,b);};
rep(`  const runSolve = (treeSpec, cfgOverride, tag) => {
    const c = cfgOverride ? { ...effCfg, ...cfgOverride } : effCfg;
    const key = evaluationKey(baseHash, treeSpec, c);
    const hit = evalCache.get(key);
    if (hit) { evalCache.stats.hits++; return { ...hit, cacheHit: true }; }
    evalCache.stats.misses++;
    const r = solveFn({ state, heroRange, villainRange, treeSpec, config: c, optimizeFor, signal });
    solves.push({ tag, ok: r.ok, ms: r.instrumentation ? r.instrumentation.elapsedMs : r.elapsedMs, ev: r.ev });
    evalCache.set(key, r);
    return r;
  };`,
`  /* ══ POURQUOI L'ÉVALUATION NE CONSERVE PAS LES SOLUTIONS ══════════════════
     Un résultat de \`solveTreeSpec\` porte \`solution\`, qui contient les tables de
     regret et de stratégie du CFR : des Float64Array indexés par (nœud, runout,
     combo, action). Sur un flop, c'est plusieurs centaines de mégaoctets par
     solve. L'optimiseur en enchaîne dix à quarante, et le cache les gardait
     TOUS — le banc d'essai (§83) est tombé à court de tas au dixième spot.

     Or la phase de sélection n'a besoin que de NOMBRES : l'EV, le statut, la
     convergence, la durée. La solution complète n'est nécessaire qu'au SOLVE
     FINAL, qui a lieu ailleurs (pfase.js) et une seule fois. On ne mémorise donc
     que l'essentiel, et l'objet lourd devient collectable immédiatement.

     \`sampled\` est extrait avant l'oubli : c'est lui qui décide s'il faut sonder
     le bruit d'échantillonnage. */
  const slim = (r) => ({
    ok: r.ok, ev: r.ev, reason: r.reason, status: r.status,
    partialReasons: r.partialReasons || [],
    convergence: r.convergence || null,
    instrumentation: r.instrumentation ? {
      elapsedMs: r.instrumentation.elapsedMs, treeNodes: r.instrumentation.treeNodes,
      iterations: r.instrumentation.iterations, maxCombos: r.instrumentation.maxCombos,
      depth: r.instrumentation.depth, depthLimited: r.instrumentation.depthLimited,
      guardNotes: r.instrumentation.guardNotes || [],
    } : null,
    elapsedMs: r.elapsedMs ?? (r.instrumentation ? r.instrumentation.elapsedMs : null),
    /* Un booléen à la place de tout l'objet solution. */
    sampled: !!(r.solution && r.solution.sampled),
    solution: null,
  });
  const runSolve = (treeSpec, cfgOverride, tag) => {
    const c = cfgOverride ? { ...effCfg, ...cfgOverride } : effCfg;
    const key = evaluationKey(baseHash, treeSpec, c);
    const hit = evalCache.get(key);
    if (hit) { evalCache.stats.hits++; return { ...hit, cacheHit: true }; }
    evalCache.stats.misses++;
    const full = solveFn({ state, heroRange, villainRange, treeSpec, config: c, optimizeFor, signal });
    const r = slim(full);
    solves.push({ tag, ok: r.ok, ms: r.instrumentation ? r.instrumentation.elapsedMs : r.elapsedMs, ev: r.ev });
    evalCache.set(key, r);
    return r;
  };`);
/* `refSolve.solution.sampled` devient `refSolve.sampled`. */
rep("    const sampled = !!(refSolve.solution && refSolve.solution.sampled);","    const sampled = !!refSolve.sampled;");
fs.writeFileSync(p,s);console.log('ok');
