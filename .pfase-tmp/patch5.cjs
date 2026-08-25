const fs=require('fs');const p='test-sizing-trainer.mjs';let s=fs.readFileSync(p,'utf8');
const a=`  const compteurs = {};
  for (const id of tablesIds) {
    const rng = seededRng(id.charCodeAt(0));
    compteurs[id] = new Set();
    for (let k = 0; k < 100; k++) {
      const v = villainActionFromSolution({ solution: sols[id], handClass: "AKs", rng });
      ok(v.ok || k < 0, "");   // décompté une seule fois ci-dessous
      compteurs[id].add(v.toBb);
    }
  }
  passed -= 400;  // les 400 assertions muettes ci-dessus ne comptent pas`;
const b=`  const compteurs = {};
  let echecs = 0;
  for (const id of tablesIds) {
    const rng = seededRng(id.charCodeAt(0));
    compteurs[id] = new Set();
    for (let k = 0; k < 100; k++) {
      const v = villainActionFromSolution({ solution: sols[id], handClass: "AKs", rng });
      if (!v.ok) echecs++;
      compteurs[id].add(v.toBb);
    }
  }
  eq(echecs, 0, "400 décisions (4 tables × 100) résolues sans un seul échec");`;
if(!s.includes(a)){console.error('MISS');process.exit(1);}
fs.writeFileSync(p,s.replace(a,b));console.log('ok');
