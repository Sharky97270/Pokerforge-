const fs=require('fs');
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
const repFile=(p,pairs)=>{let s=fs.readFileSync(p,'utf8');
  for(const [a,b] of pairs){let d=false;
    for(const [pat,r2] of [[a,b],[a.split(LF).join(CRLF),b.split(LF).join(CRLF)]]){if(s.includes(pat)){s=s.replace(pat,r2);d=true;break;}}
    if(!d){console.error('MISS ['+p+'] : '+a.slice(0,80));process.exit(1);}}
  fs.writeFileSync(p,s);};

repFile('src/sizing/solverAdapter.js',[
  [`import { treeStats, buildPostflopTree } from "../solver/core/gametree.js";`,
   `import { treeStats, buildPostflopTree } from "../solver/core/gametree.js";
import { strategyEV } from "../solver/core/multistreet.js";`],
  [`    const sol = out.result;
    const ev = evForPlayer(sol, optimizeFor);
    if (ev == null) {`,
   `    const sol = out.result;
    /* ── QUELLE EV ? CELLE DE LA STRATÉGIE QU'ON SERT ────────────────────────
       \`solveTree.ev\` est la moyenne, SUR LES ITÉRATIONS, de la valeur de la
       stratégie courante de chaque itération. Ce n'est pas la valeur de la
       stratégie MOYENNE — celle qui est stockée, affichée et jouée.

       L'écart n'est pas cosmétique. Mesuré sur un river à ranges réduites :

         itérations   sol.ev    EV(stratégie moyenne)   NashConv
             100       0.837           1.074             0.580
             800       1.167           1.243             0.093
            3200       1.243           1.270             0.019

       Entre 1600 et 3200 itérations, \`sol.ev\` bouge encore de 0.026 bb quand
       l'EV de la stratégie moyenne ne bouge que de 0.003 — près de dix fois plus
       stable. La « dérive de convergence » qu'on mesurait était donc en grande
       partie l'inertie d'une moyenne qui traîne ses premières itérations, pas
       une imprécision de la stratégie.

       PFASE mesure donc l'EV de la stratégie moyenne : c'est celle qui décrit ce
       que le joueur va réellement jouer, et son plancher de mesure est bien plus
       bas. \`useAverageStrategyEV:false\` restitue le comportement historique. */
    const avgEv = cfg.useAverageStrategyEV === false ? null
      : strategyEV(sol, { samples: cfg.strategyEvSamples || undefined });
    const zeroSum = !sol.utility || sol.utility.zeroSum !== false;
    const ev = avgEv
      ? (optimizeFor === 0 ? avgEv.ev : (zeroSum ? -avgEv.ev : null))
      : evForPlayer(sol, optimizeFor);
    if (ev == null) {`],
  [`      ev: roundEv(ev),
      optimizeFor,`,
   `      ev: roundEv(ev),
      /* D'où vient ce nombre — l'UI et le Coach doivent pouvoir le dire (§21). */
      evSource: avgEv ? "average-strategy" : "iterate-mean",
      evIterateMean: roundEv(evForPlayer(sol, optimizeFor) ?? 0),
      evExact: avgEv ? avgEv.exact : !sol.sampled,
      optimizeFor,`],
]);

/* Échantillonnage de l'EV de stratégie sur board incomplet : borné, et déclaré. */
repFile('src/sizing/config.js',[
  [`  /* ── NOMBRES ALÉATOIRES COMMUNS (CRN) ─────────────────────────────────`,
   `  /* EV mesurée sur la STRATÉGIE MOYENNE plutôt que sur la moyenne des
     itérations (voir solverAdapter). \`false\` restitue l'historique. */
  useAverageStrategyEV: true,
  /* Runouts utilisés pour cette mesure quand le board est incomplet. 60 suffit :
     tous les sous-arbres partagent la même graine, donc les mêmes runouts, et la
     comparaison reste appariée. */
  strategyEvSamples: 60,

  /* ── NOMBRES ALÉATOIRES COMMUNS (CRN) ─────────────────────────────────`],
]);
console.log('ok');
