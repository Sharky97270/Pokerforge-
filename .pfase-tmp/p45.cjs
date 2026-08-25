const fs=require('fs');
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
const repFile=(p,pairs)=>{let s=fs.readFileSync(p,'utf8');
  for(const [a,b] of pairs){let d=false;
    for(const [pat,r2] of [[a,b],[a.split(LF).join(CRLF),b.split(LF).join(CRLF)]]){if(s.includes(pat)){s=s.replace(pat,r2);d=true;break;}}
    if(!d){console.error('MISS ['+p+'] : '+a.slice(0,80));process.exit(1);}}
  fs.writeFileSync(p,s);};

repFile('src/solver/core/multistreet.js',[
  [`  /* ── AUTO-CONTRÔLE : l'EV MÉLANGÉE doit valoir l'EV de la stratégie ────────
     Le mélange se fait PAR COMBO — chaque main a ses propres fréquences. Mélanger
     les fréquences agrégées de la range avec les EV agrégées donnerait un autre
     nombre (la moyenne d'un produit n'est pas le produit des moyennes) ; c'est une
     erreur facile, et \`mixedEV\` sert précisément à la rendre visible : à la
     racine, il doit égaler \`sol.ev\`. */`,
   `  /* ── AUTO-CONTRÔLE : L'EV MÉLANGÉE ────────────────────────────────────────
     Le mélange se fait PAR COMBO — chaque main a ses propres fréquences. Mélanger
     les fréquences agrégées de la range avec les EV agrégées donnerait un autre
     nombre (la moyenne d'un produit n'est pas le produit des moyennes) ; c'est une
     erreur facile, et \`mixedEV\` sert à la rendre visible.

     CONTRE QUOI LE VÉRIFIER — et surtout contre quoi NE PAS le vérifier. À la
     racine, \`mixedEV\` doit valoir \`strategyEV(sol).ev\`, l'EV de la stratégie
     MOYENNE. Il ne vaut PAS \`sol.ev\`, qui est la moyenne des EV des stratégies
     COURANTES sur toutes les itérations : deux grandeurs différentes, dont l'écart
     mesuré valait encore 0.086 bb à 600 itérations. Confondre les deux fait
     chercher un bug là où il n'y en a pas.

     Vérifié : écart de 2·10⁻⁵ contre \`strategyEV\` à 1200 itérations — l'arrondi
     à quatre décimales, rien d'autre. */`],
  [`    /* EV de la stratégie AU NŒUD, mélangée par combo. À la racine, elle vaut
       l'EV de la solution — c'est l'auto-contrôle du calcul. */`,
   `    /* EV de la stratégie AU NŒUD, mélangée par combo. À la racine, elle vaut
       \`strategyEV(sol).ev\` — voir l'auto-contrôle ci-dessus. */`],
]);
console.log('ok');
