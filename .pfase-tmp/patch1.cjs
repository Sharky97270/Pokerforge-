const fs=require('fs');const p='src/sizing/dynamicOptimizer.js';
let lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
const i=lines.findIndex(l=>l.includes('MODE FIXED : aucun sizing'));
if(i<0){console.error('bloc FIXED introuvable');process.exit(1);}
lines.splice(i,2,
"    /* ── 3. AUCUNE SIMPLIFICATION À FAIRE (§4/§5) ─────────────────────────",
"       Deux cas distincts mènent au même endroit :",
"         · mode FIXED — « Le moteur ne supprime aucun sizing. Il résout l'arbre",
"           fourni. » (§4)",
"         · complexité FULL — « Arbre fourni entièrement par l'utilisateur ou le",
"           preset. Pas de simplification automatique obligatoire. » (§5)",
"       Dans les deux cas, la solution EST l'arbre de référence, et sa perte d'EV",
"       vaut zéro par définition : elle ne simplifie rien. Sans ce court-circuit,",
"       le niveau FULL retenait le meilleur sous-ensemble mesuré et livrait donc",
"       une simplification là où l'utilisateur en demandait précisément l'absence. */",
"    if (mode === BettingTreeMode.FIXED || effComplexity === SizingComplexity.FULL) {");
let s=lines.join("\n");
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,60));process.exit(1);} s=s.replace(a,b);};
rep("status: refSolve.status, mode, complexity: SizingComplexity.FULL,","status: refSolve.status, mode, complexity: effComplexity,");
rep(`note: "mode FIXED — l'arbre fourni est résolu tel quel, aucun sous-ensemble n'est évalué." }`,
    `note: mode === BettingTreeMode.FIXED ? "mode FIXED — l'arbre fourni est résolu tel quel, aucun sous-ensemble n'est évalué." : "complexité FULL — aucune simplification automatique ; l'arbre complet des candidats est retenu." }`);
rep(`note: "mode FIXED — pas de simplification" }`,`note: "aucune simplification — perte d'EV nulle par définition" }`);
rep("      maxAcceptableEVLoss\n    );","      maxAcceptableEVLoss,\n      { tieToleranceBb: noiseFloor }\n    );");
fs.writeFileSync(p,s);console.log('ok');
