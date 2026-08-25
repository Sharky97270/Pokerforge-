const fs=require('fs');
const rep=(f,a,b)=>{if(!f.includes(a)){console.error('MISS: '+a.slice(0,80));process.exit(1);}return f.replace(a,b);};

let p='src/solver/api.js';
let lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
const i=lines.findIndex((l,idx)=>idx>150&&l.trim()==='storeSolution(solveId,out);');
if(i<0){console.error('storeSolution multi-rue introuvable');process.exit(1);}
lines.splice(i,1,
"  /* ── `noStore` : NE PAS entrer en bibliothèque ────────────────────────────",
"     La Solution Library garde jusqu'à 500 solutions COMPLÈTES en mémoire, tables",
"     de stratégie comprises. C'est un bon compromis pour des solves d'analyse,",
"     que l'on relit. Ce n'en est pas un pour les micro-solves d'évaluation de",
"     l'Adaptive Sizing Engine : il en enchaîne dix à quarante par spot, dont",
"     aucun n'est une solution (§13 — « ne pas considérer les micro-solves de",
"     sélection comme équivalents à la solution finale »). Les conserver a fait",
"     tomber le banc d'essai à court de tas dès le dixième spot.",
"     L'appelant qui produit du jetable le déclare. */",
"  if(!opts.noStore)storeSolution(solveId,out);");
let s=lines.join("\n");
fs.writeFileSync(p,s);

p='src/sizing/solverAdapter.js';s=fs.readFileSync(p,'utf8');
s=rep(s,`      ...(cfg.seed != null ? { seed: cfg.seed } : {}),`,
`      ...(cfg.seed != null ? { seed: cfg.seed } : {}),
      /* Un solve d'ÉVALUATION est jetable : il ne doit pas peupler la Solution
         Library (cf. \`noStore\` dans solver/api.js). Seul le solve final, qui
         produit la PFSolution, mérite d'y entrer. */
      ...(cfg.persistSolve === true ? {} : { noStore: true }),`);
fs.writeFileSync(p,s);

p='src/sizing/config.js';s=fs.readFileSync(p,'utf8');
s=rep(s,`export const DEFAULT_FINAL_SOLVE_CONFIG = Object.freeze({
  /* Seul le solve FINAL entre en bibliothèque : c'est lui qui est une solution. */`,`__ALREADY__`);
fs.writeFileSync(p,s);
console.log('ok');
