const fs=require('fs');
const rep=(f,a,b)=>{if(!f.includes(a)){console.error('MISS: '+a.slice(0,80));process.exit(1);}return f.replace(a,b);};
let p='src/sizing/solverAdapter.js';let s=fs.readFileSync(p,'utf8');
if(!s.includes('noStore')){
  s=rep(s,`      ...(cfg.seed != null ? { seed: cfg.seed } : {}),`,
`      ...(cfg.seed != null ? { seed: cfg.seed } : {}),
      /* Un solve d'ÉVALUATION est jetable : il ne doit pas peupler la Solution
         Library (cf. \`noStore\` dans solver/api.js). Seul le solve final, qui
         produit la PFSolution, mérite d'y entrer. */
      ...(cfg.persistSolve === true ? {} : { noStore: true }),`);
  fs.writeFileSync(p,s);
}
p='src/sizing/config.js';s=fs.readFileSync(p,'utf8');
if(!s.includes('persistSolve')){
  s=rep(s,`export const DEFAULT_FINAL_SOLVE_CONFIG = Object.freeze({`,
`export const DEFAULT_FINAL_SOLVE_CONFIG = Object.freeze({
  /* Seul le solve FINAL entre en bibliothèque : c'est lui qui EST une solution.
     Les micro-solves d'évaluation sont jetables (§13). */
  persistSolve: true,`);
  fs.writeFileSync(p,s);
}
console.log('ok');
