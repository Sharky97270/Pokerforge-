const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const P = 'src/solver/core/multistreet.js';
const rep = (a, b) => {
  let s = fs.readFileSync(P, 'utf8');
  for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
    if (s.includes(pat)) { fs.writeFileSync(P, s.replace(pat, r2)); return; }
  }
  console.error('MISS : ' + a.slice(0, 90)); process.exit(1);
};

/* 1. Le modèle de rake, en tête de module. */
let s = fs.readFileSync(P, 'utf8');
s = s.replace('import { CHIP_UTILITY, makeIcmUtility, makePkoUtility } from "./icm.js";',
  'import { CHIP_UTILITY, makeIcmUtility, makePkoUtility } from "./icm.js";\n'
  + fs.readFileSync('.pfase-tmp/rake.txt', 'utf8'));
fs.writeFileSync(P, s);

/* 2. Construction du modèle + refus explicite de la combinaison ICM/PKO. */
rep(`  const U=opts.utility||CHIP_UTILITY;
  const tree=buildPostflopTree({...opts,startPot,streets:opts.streets||1,ipProbe:opts.ipProbe!==false});`,
`  const U=opts.utility||CHIP_UTILITY;
  /* Rake : actif seulement s'il est explicitement DÉCLARÉ appliqué. Sans cela le
     chemin de code est rigoureusement celui d'avant — le rake n'est pas une
     option qu'on active « au cas où ». */
  const rakeModel=makeRakeModel(startPot,opts.rake,{rakeUncontested:opts.rakeUncontested!==false});
  if(rakeModel&&(opts.icm||opts.pko)){
    /* Refus net plutôt qu'un nombre inventé : voir l'en-tête de makeRakeModel. */
    return{ok:false,reason:"rake et ICM/PKO ne se combinent pas : l'utilité ICM transforme un TRANSFERT de jetons, or le rake en fait sortir une part de la table. Aucune convention ne fonde ce mélange — résoudre en chip-EV, ou sans rake."};
  }
  const tree=buildPostflopTree({...opts,startPot,streets:opts.streets||1,ipProbe:opts.ipProbe!==false});`);

/* 3. Le nœud terminal, dans la boucle chaude de traverse. */
rep(`      for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=reachV[j]*U.h(terminalUtility(node,startPot,e));}vH[i]=acc;}
      for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=reachH[i]*U.v(terminalUtility(node,startPot,e));}vV[j]=acc;}`,
`      if(!rakeModel){
        for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=reachV[j]*U.h(terminalUtility(node,startPot,e));}vH[i]=acc;}
        for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=reachH[i]*U.v(terminalUtility(node,startPot,e));}vV[j]=acc;}
        return{vH,vV};
      }
      /* Avec rake, chaque camp paie SA part : les deux valeurs ne sont plus
         opposées, et c'est précisément ce qui rend le jeu non à somme nulle. */
      for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=reachV[j]*U.h(terminalUtility(node,startPot,e)-rakeModel.shareH(node,e));}vH[i]=acc;}
      for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=reachH[i]*U.v(terminalUtility(node,startPot,e)+rakeModel.shareV(node,e));}vV[j]=acc;}`);

/* 4. Le descripteur : la solution doit SAVOIR qu'elle est rakée. */
rep(`    utilityKind:opts.pko?"pko":opts.icm?"icm":"chip",
    icmParams:opts.icm||null,
    pkoParams:opts.pko||null,`,
`    utilityKind:opts.pko?"pko":opts.icm?"icm":"chip",
    icmParams:opts.icm||null,
    pkoParams:opts.pko||null,
    /* Sérialisable, et suffisant pour reconstruire le modèle à la relecture. */
    rakeParams:rakeModel?{pct:rakeModel.pct,cap:rakeModel.cap===Infinity?null:rakeModel.cap,applied:true,rakeUncontested:rakeModel.rakeUncontested}:null,
    /* La conséquence, portée par la solution elle-même : plus aucune mesure
       fondée sur la somme nulle n'est légitime au-dessus de ce résultat. */
    zeroSum:!rakeModel&&(U.zeroSum!==false),`);

/* 5. Réhydratation. */
rep(`  }else{
    plain.utility=CHIP_UTILITY;
  }
  return attachStrategyAccessors(plain);`,
`  }else{
    plain.utility=CHIP_UTILITY;
  }
  /* Le rake se reconstruit à l'identique : sans lui, une solution rechargée
     rendrait des EV plus optimistes que celle qui l'a produite. */
  if(plain.rakeParams)plain.rakeModel=makeRakeModel(plain.startPot,plain.rakeParams,{rakeUncontested:plain.rakeParams.rakeUncontested!==false});
  return attachStrategyAccessors(plain);`);

/* 6. NashConv : la somme nulle est la condition de son existence. */
rep(`  if(sol&&sol.utility&&sol.utility.zeroSum===false)return null;`,
`  if(sol&&sol.utility&&sol.utility.zeroSum===false)return null;
  /* Le rake casse la somme nulle aussi sûrement que l'ICM : NashConv = BR(0) +
     BR(1) suppose que la somme des deux valeurs d'équilibre est nulle. Avec un
     pot taxé elle vaut −rake, et l'« exploitabilité » lue serait décalée d'un
     biais constant qu'aucun affichage ne pourrait distinguer d'une divergence. */
  if(sol&&(sol.rakeModel||sol.rakeParams))return null;`);

/* 7. bestResponseEV, nodeActionEVs et strategyEV doivent voir le même pot. */
rep(`      if(brPlayer===0){for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=oppReach[j]*U.h(terminalUtility(node,startPot,e));}v[i]=acc;}}
      else{for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=oppReach[i]*U.v(terminalUtility(node,startPot,e));}v[j]=acc;}}`,
`      const rm=sol.rakeModel||null;
      if(brPlayer===0){for(let i=0;i<nH;i++){let acc=0;for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;acc+=oppReach[j]*U.h(terminalUtility(node,startPot,e)-(rm?rm.shareH(node,e):0));}v[i]=acc;}}
      else{for(let j=0;j<nV;j++){let acc=0;for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;acc+=oppReach[i]*U.v(terminalUtility(node,startPot,e)+(rm?rm.shareV(node,e):0));}v[j]=acc;}}`);

rep(`          acc += oppReach[j] * (p === 0 ? U.h(terminalUtility(n, startPot, e)) : U.v(terminalUtility(n, startPot, e)));`,
`          acc += oppReach[j] * (p === 0
            ? U.h(terminalUtility(n, startPot, e) - (RM ? RM.shareH(n, e) : 0))
            : U.v(terminalUtility(n, startPot, e) + (RM ? RM.shareV(n, e) : 0)));`);

rep(`          acc += reachV[j] * U.h(terminalUtility(n, startPot, e)); }`,
`          acc += reachV[j] * U.h(terminalUtility(n, startPot, e) - (RM ? RM.shareH(n, e) : 0)); }`);

/* Les deux fonctions ont besoin de `RM` dans leur portée. */
rep(`  const U = sol.utility || CHIP_UTILITY;
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  /* 1. Localiser le nœud cible en suivant le chemin d'actions. */`,
`  const U = sol.utility || CHIP_UTILITY;
  const RM = sol.rakeModel || null;      // le pot vu par le joueur est le pot NET
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  /* 1. Localiser le nœud cible en suivant le chemin d'actions. */`);

rep(`  const U = sol.utility || CHIP_UTILITY;
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  const E = Array.from({ length: nH }, () => new Float32Array(nV));`,
`  const U = sol.utility || CHIP_UTILITY;
  const RM = sol.rakeModel || null;      // le pot vu par le joueur est le pot NET
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  const E = Array.from({ length: nH }, () => new Float32Array(nV));`);

console.log('ok');
