const fs=require('fs');const p='src/solver/core/multistreet.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,70));process.exit(1);} s=s.replace(a,b);};
rep(`  node.actions.forEach((a, k) => {
    let num = 0;
    for (let i = 0; i < nP; i++) num += rp[i] * acc[k][i] * inv;
    byAction[a] = Math.round((num / den) * 10000) / 10000;
  });`,
`  node.actions.forEach((a, k) => {
    let num = 0;
    for (let i = 0; i < nP; i++) num += rp[i] * acc[k][i] * inv;
    byAction[a] = Math.round((num / den) * 10000) / 10000;
  });

  /* ── AUTO-CONTRÔLE : l'EV MÉLANGÉE doit valoir l'EV de la stratégie ────────
     Le mélange se fait PAR COMBO — chaque main a ses propres fréquences. Mélanger
     les fréquences agrégées de la range avec les EV agrégées donnerait un autre
     nombre (la moyenne d'un produit n'est pas le produit des moyennes) ; c'est une
     erreur facile, et \`mixedEV\` sert précisément à la rendre visible : à la
     racine, il doit égaler \`sol.ev\`. */
  let mixNum = 0;
  for (let i = 0; i < nP; i++) {
    const d = sol.avgOf(node, i, "");
    let vi = 0;
    for (let k = 0; k < node.actions.length; k++) vi += d[k] * acc[k][i] * inv;
    mixNum += rp[i] * vi;
  }
  const mixedEV = Math.round((mixNum / den) * 10000) / 10000;`);
rep(`    byAction, byClass,
    reachShare:`,
`    byAction, byClass,
    /* EV de la stratégie AU NŒUD, mélangée par combo. À la racine, elle vaut
       l'EV de la solution — c'est l'auto-contrôle du calcul. */
    mixedEV,
    reachShare:`);
fs.writeFileSync(p,s);console.log('ok');
