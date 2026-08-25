const fs=require('fs');const p='src/sizing/solverAdapter.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,80));process.exit(1);} s=s.replace(a,b);};

rep(`import { EQ_RANKVAL, EQ_SUITIDX } from "../solver/core/combos.js";`,
    `import { EQ_RANKVAL, EQ_SUITIDX, rangeComboList } from "../solver/core/combos.js";`);

rep(`    const guard = withDefaults(DEFAULT_MEMORY_GUARD, cfg.memoryGuard);
    if (guard.enabled) {
      const budget = guard.maxEstimatedBytes;
      for (;;) {
        const est = estimateSolveMemory({ state, treeSpec, depth, maxCombos, iterations: cfg.maxIterations });`,
`    const guard = withDefaults(DEFAULT_MEMORY_GUARD, cfg.memoryGuard);
    if (guard.enabled) {
      const budget = guard.maxEstimatedBytes;
      /* ── COMPTER LES COMBOS RÉELS, PAS LE PLAFOND ──────────────────────
         \`maxCombos: 0\` signifie « range NON plafonnée » côté solveur. L'estimateur
         le lisait comme « zéro combo » et concluait donc à un coût nul : le
         garde-fou ne se déclenchait jamais, et le banc d'essai tombait à court
         de tas sur les flops. Le nombre de tables allouées dépend du nombre de
         combos EFFECTIVEMENT solvés — on le mesure. */
      const comboCount = (range) => {
        try { return rangeComboList(range).filter(e => !board.includes(e.cards[0]) && !board.includes(e.cards[1])).length; }
        catch { return 0; }
      };
      const cap = maxCombos > 0 ? maxCombos : Infinity;
      const effCombos = Math.max(1, Math.min(cap, Math.max(comboCount(heroRange), comboCount(villainRange))));
      for (;;) {
        const est = estimateSolveMemory({ state, treeSpec, depth, maxCombos: effCombos, iterations: cfg.maxIterations });`);
rep(`        if (maxCombos > 60) {
          const next = Math.max(60, Math.floor(maxCombos / 2));
          guardNotes.push(\`plafond de combos ramené de \${maxCombos} à \${next} — coût mémoire estimé \${mb(est.bytes)} > budget \${mb(budget)}\`);
          maxCombos = next;
          continue;
        }`,
`        const currentCap = maxCombos > 0 ? maxCombos : effCombos;
        if (currentCap > 60) {
          const next = Math.max(60, Math.floor(currentCap / 2));
          guardNotes.push(\`plafond de combos ramené de \${currentCap} à \${next} — coût mémoire estimé \${mb(est.bytes)} > budget \${mb(budget)}\`);
          maxCombos = next;
          continue;
        }`);
fs.writeFileSync(p,s);console.log('ok');
