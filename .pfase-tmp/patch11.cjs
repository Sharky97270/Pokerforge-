const fs=require('fs');
const rep=(f,a,b)=>{if(!f.includes(a)){console.error('MISS: '+a.slice(0,70));process.exit(1);}return f.replace(a,b);};

/* 1. L'étage 1 est le MINIMUM VITAL : sans lui, aucune sélection n'est possible. */
let p='src/sizing/dynamicOptimizer.js';let s=fs.readFileSync(p,'utf8');
s=rep(s,`  /* Budget temps : consulté avant chaque solve. \`null\` = illimité. */
  const budgetMs = cfg.timeBudgetMs;
  const budgetSpent = () => budgetMs != null && Date.now() - t0 > budgetMs;
  const budgetNotes = [];`,
`  /* ── BUDGET TEMPS, À DEUX ÉTAGES ────────────────────────────────────────
     L'étage 1 (chaque candidat évalué seul) est le MINIMUM VITAL : sans lui, il
     n'y a aucun classement, donc rien à sélectionner. Le couper revient à ne
     rien rendre du tout — c'est ce qui s'est produit au premier essai en
     navigateur sur un flop : le budget était consommé par la référence et son
     escalade de convergence, l'étage 1 était intégralement sauté, et
     l'optimisation échouait au lieu de rendre un résultat partiel.
     Le budget nominal borne donc l'étage 2 (les sous-ensembles, qui affinent) ;
     un plafond DUR, plus large, protège l'étage 1 contre les cas extrêmes. */
  const budgetMs = cfg.timeBudgetMs;
  const hardBudgetMs = budgetMs == null ? null : budgetMs * 4;
  const budgetSpent = () => budgetMs != null && Date.now() - t0 > budgetMs;
  const hardBudgetSpent = () => hardBudgetMs != null && Date.now() - t0 > hardBudgetMs;
  const budgetNotes = [];`);
s=rep(s,`      if (budgetSpent()) { stage1Skipped++; continue; }`,
       `      if (hardBudgetSpent()) { stage1Skipped++; continue; }`);
s=rep(s,`    if (stage1Skipped) budgetNotes.push(\`\${stage1Skipped} candidat(s) non évalué(s) seuls : budget temps atteint\`);`,
       `    if (stage1Skipped) budgetNotes.push(\`\${stage1Skipped} candidat(s) non évalué(s) seuls : plafond temps dur de \${hardBudgetMs} ms atteint\`);`);
s=rep(s,`    if (!eligible.length) {
      return fail("aucun sous-arbre conforme au niveau de complexité n'a pu être résolu", t0,
        { candidates: cand, reference: { ev: referenceEV, solve: refSolve }, evaluations });
    }`,
`    if (!eligible.length) {
      /* Message PRÉCIS : « rien n'a pu être résolu » et « le temps a manqué avant
         la première comparaison » appellent des gestes différents de l'utilisateur. */
      const raison = stage1Skipped
        ? \`budget temps épuisé avant toute comparaison (\${stage1Skipped} candidat(s) non évalués) — augmentez le budget, réduisez le nombre de candidats, ou baissez la précision d'évaluation\`
        : "aucun sous-arbre conforme au niveau de complexité n'a pu être résolu";
      return fail(raison, t0, {
        candidates: cand,
        reference: { entry: refEntry, treeSpec: refSpec, ev: referenceEV, solve: refSolve },
        evaluations, budgetNotes,
      });
    }`);
fs.writeFileSync(p,s);

/* 2. Le nettoyage du Worker ne doit JAMAIS planter sur un résultat d'échec. */
p='src/sizing/pfase.worker.js';s=fs.readFileSync(p,'utf8');
s=rep(s,`      reference: o.reference ? { ev: o.reference.ev, betKeys: o.reference.entry.betKeys, raiseKeys: o.reference.entry.raiseKeys } : null,`,
`      /* Défensif par nécessité : sur un ÉCHEC, l'optimisation renvoie un objet
         partiel (pas toujours d'\`entry\`). Une exception ici masquerait le vrai
         motif d'échec derrière un « Cannot read properties of undefined » —
         c'est exactement ce qui est arrivé en QA navigateur. */
      reference: o.reference ? {
        ev: o.reference.ev,
        betKeys: o.reference.entry ? o.reference.entry.betKeys : null,
        raiseKeys: o.reference.entry ? o.reference.entry.raiseKeys : null,
      } : null,`);
s=rep(s,`      selected: o.selected ? {`,`      budgetNotes: o.budgetNotes || [],
      selected: o.selected ? {`);
fs.writeFileSync(p,s);

/* 3. Le motif d'échec de l'optimisation doit remonter jusqu'à l'écran. */
p='src/sizing/pfase.js';s=fs.readFileSync(p,'utf8');
s=rep(s,`  if (!opt.ok) {
    return { ok: false, status: opt.status, reason: opt.reason, optimization: opt, elapsedMs: Date.now() - t0 };
  }`,
`  if (!opt.ok) {
    return {
      ok: false, status: opt.status,
      reason: opt.reason, problems: opt.budgetNotes || [],
      optimization: opt, elapsedMs: Date.now() - t0,
    };
  }`);
fs.writeFileSync(p,s);
console.log('ok');
