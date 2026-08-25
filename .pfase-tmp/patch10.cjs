const fs=require('fs');
let p='src/sizing/config.js';let s=fs.readFileSync(p,'utf8');
const rep=(f,a,b)=>{if(!f.includes(a)){console.error('MISS: '+a.slice(0,60));process.exit(1);}return f.replace(a,b);};
s=rep(s,`  convergenceTarget: 0.02,
  timeBudgetMs: null,`,
`  convergenceTarget: 0.02,
  /* ── BUDGET TEMPS (§11/§12) ─────────────────────────────────────────────
     Il ne s'agit pas d'un confort. Mesuré au navigateur sur un flop à ranges
     complètes : l'optimisation dépassait 180 s sans jamais rendre la main, ce
     qui, du point de vue de l'utilisateur, est indiscernable d'un blocage.
     Le budget arrête l'exploration, rend la MEILLEURE solution mesurée jusque-là,
     et l'annonce en PARTIAL avec le nombre de sous-arbres non évalués — jamais
     en prétendant avoir tout comparé. */
  timeBudgetMs: 45000,`);
fs.writeFileSync(p,s);

p='src/sizing/dynamicOptimizer.js';s=fs.readFileSync(p,'utf8');
s=rep(s,`  try {
    /* ── 2. ARBRE DE RÉFÉRENCE (§9) ─────────────────────────────────────── */`,
`  /* Budget temps : consulté avant chaque solve. \`null\` = illimité. */
  const budgetMs = cfg.timeBudgetMs;
  const budgetSpent = () => budgetMs != null && Date.now() - t0 > budgetMs;
  const budgetNotes = [];

  try {
    /* ── 2. ARBRE DE RÉFÉRENCE (§9) ─────────────────────────────────────── */`);

s=rep(s,`      if (!doubled.ok) break;
      drift = Math.abs(doubled.ev - refSolve.ev);
      if (!autoEscalate) break;                       // mesuré, mais on n'escalade pas`,
`      if (!doubled.ok) break;
      drift = Math.abs(doubled.ev - refSolve.ev);
      if (!autoEscalate) break;                       // mesuré, mais on n'escalade pas
      if (budgetSpent()) { budgetNotes.push("escalade de convergence arrêtée par le budget temps"); break; }`);

s=rep(s,`    for (const entry of stage1) {
      if (signal && signal.aborted) throw new SolveCancelled();`,
`    let stage1Skipped = 0;
    for (const entry of stage1) {
      if (signal && signal.aborted) throw new SolveCancelled();
      if (budgetSpent()) { stage1Skipped++; continue; }`);

s=rep(s,`      for (const entry of plan.entries) {
        if (signal && signal.aborted) throw new SolveCancelled();
        if (evaluations.some(e => e.id === entry.id)) continue;   // déjà mesuré à l'étage 1`,
`      let stage2Skipped = 0;
      for (const entry of plan.entries) {
        if (signal && signal.aborted) throw new SolveCancelled();
        if (evaluations.some(e => e.id === entry.id)) continue;   // déjà mesuré à l'étage 1
        if (budgetSpent()) { stage2Skipped++; continue; }`);

s=rep(s,`        progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 2", done: evaluations.length, total: stage1.length + plan.entries.length });
      }
    }`,
`        progress(SolveStatus.OPTIMIZING_SIZINGS, { step: "étage 2", done: evaluations.length, total: stage1.length + plan.entries.length });
      }
      if (stage2Skipped) budgetNotes.push(\`\${stage2Skipped} sous-ensemble(s) non évalué(s) : budget temps de \${budgetMs} ms atteint\`);
    }
    if (stage1Skipped) budgetNotes.push(\`\${stage1Skipped} candidat(s) non évalué(s) seuls : budget temps atteint\`);`);

s=rep(s,`    return {
      ok: true,
      status: refSolve.status === SolveStatus.PARTIAL ? SolveStatus.PARTIAL : SolveStatus.COMPLETE,
      mode, complexity: effComplexity,`,
`    return {
      ok: true,
      /* Une exploration tronquée par le budget n'est PAS complète : le dire est
         la seule façon d'empêcher qu'on lise « meilleur sizing » là où il faut
         lire « meilleur des sizings qu'on a eu le temps de comparer ». */
      status: (refSolve.status === SolveStatus.PARTIAL || budgetNotes.length) ? SolveStatus.PARTIAL : SolveStatus.COMPLETE,
      budgetNotes,
      mode, complexity: effComplexity,`);
fs.writeFileSync(p,s);
console.log('ok');
