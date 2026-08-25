const fs=require('fs');const p='test-sizing-trainer.mjs';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,60));process.exit(1);} s=s.replace(a,b);};
rep(`  const labels = ["X", ...sizings.map((_, i) => (sizings.length === 1 ? "B" : "B" + i))];`,
`  /* Labels calqués sur ceux que produit réellement \`extractStreetStrategy\` :
     "B" seul quand il n'y a qu'un sizing, "B0"/"B1"… sinon, et "J" pour le jam —
     qui est une ACTION à part (§74), pas une mise parmi d'autres. */
  const nonJam = sizings.filter(sp => sp.type !== "jam");
  const labels = ["X", ...sizings.map((sp, i) => (sp.type === "jam" ? "J" : (nonJam.length === 1 ? "B" : "B" + i)))];`);
rep(`          actionTypes: Object.fromEntries(labels.map(l => [l, l === "X" ? "CHECK" : "BET"])),`,
    `          actionTypes: Object.fromEntries(labels.map(l => [l, l === "X" ? "CHECK" : l === "J" ? "ALL_IN" : "BET"])),`);
fs.writeFileSync(p,s);console.log('ok');
