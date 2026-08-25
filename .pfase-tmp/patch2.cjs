const fs=require('fs');
let p='src/sizing/dynamicOptimizer.js';let s=fs.readFileSync(p,'utf8');
const rep=(f,a,b)=>{if(!f.includes(a)){console.error('MISS: '+a.slice(0,70));process.exit(1);}return f.replace(a,b);};
s=rep(s,"  cache = null, signal, onProgress,\n} = {}) {",
`  cache = null, signal, onProgress,
  /* Solveur INJECTABLE (§61). Les tests doivent pouvoir fournir des EV connues
     pour vérifier la LOGIQUE DE SÉLECTION indépendamment du CFR : si l'on ne
     teste la sélection qu'à travers un vrai solve, on ne sait jamais si un
     mauvais choix vient de l'algorithme ou du bruit du solveur. Défaut =
     le vrai solveur. */
  solveFn = solveTreeSpec,
} = {}) {`);
s=rep(s,"    const r = solveTreeSpec({ state, heroRange, villainRange, treeSpec, config: c, optimizeFor, signal });",
       "    const r = solveFn({ state, heroRange, villainRange, treeSpec, config: c, optimizeFor, signal });");
fs.writeFileSync(p,s);

p='src/sizing/pfase.js';s=fs.readFileSync(p,'utf8');
s=rep(s,"    cache: request.cache, signal: request.signal, onProgress: request.onProgress,\n  });",
       "    cache: request.cache, signal: request.signal, onProgress: request.onProgress,\n    ...(request.solveFn ? { solveFn: request.solveFn } : {}),\n  });");
s=rep(s,"  const finalSolve = solveTreeSpec({\n    state, heroRange, villainRange, treeSpec: finalTreeSpec,\n    config: finalCfg, optimizeFor, signal: request.signal,\n  });",
       "  const finalSolve = (request.solveFn || solveTreeSpec)({\n    state, heroRange, villainRange, treeSpec: finalTreeSpec,\n    config: finalCfg, optimizeFor, signal: request.signal,\n  });");
fs.writeFileSync(p,s);
console.log('ok');
