const fs=require('fs');const p='src/sizing/solverAdapter.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,80));process.exit(1);} s=s.replace(a,b);};
rep(`      const cap = maxCombos > 0 ? maxCombos : Infinity;
      const effCombos = Math.max(1, Math.min(cap, Math.max(comboCount(heroRange), comboCount(villainRange))));
      for (;;) {
        const est = estimateSolveMemory({ state, treeSpec, depth, maxCombos: effCombos, iterations: cfg.maxIterations });`,
`      const rangeCombos = Math.max(comboCount(heroRange), comboCount(villainRange));
      /* Recalculé à CHAQUE tour : abaisser le plafond doit effectivement réduire
         l'estimation, sinon la boucle de dégradation tournerait sans effet. */
      const effCombos = () => Math.max(1, Math.min(maxCombos > 0 ? maxCombos : Infinity, rangeCombos));
      for (;;) {
        const est = estimateSolveMemory({ state, treeSpec, depth, maxCombos: effCombos(), iterations: cfg.maxIterations });`);
rep(`        const currentCap = maxCombos > 0 ? maxCombos : effCombos;`,
    `        const currentCap = effCombos();`);
fs.writeFileSync(p,s);console.log('ok');
