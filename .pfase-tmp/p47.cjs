const fs=require('fs');
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
const repFile=(p,pairs)=>{let s=fs.readFileSync(p,'utf8');
  for(const [a,b] of pairs){let d=false;
    for(const [pat,r2] of [[a,b],[a.split(LF).join(CRLF),b.split(LF).join(CRLF)]]){if(s.includes(pat)){s=s.replace(pat,r2);d=true;break;}}
    if(!d){console.error('MISS ['+p+'] : '+a.slice(0,80));process.exit(1);}}
  fs.writeFileSync(p,s);};

/* ── nodeActionEVs : masse d'adversaire NON BLOQUÉE, par combo ──────────── */
repFile('src/solver/core/multistreet.js',[
  [`  const acc = node.actions.map(() => new Float64Array(nP));
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) { curB = sampleBoard(); }
    computeE(curB);
    node.actions.forEach((a, k) => {
      const v = walk(node.children[a], ro);
      for (let i = 0; i < nP; i++) acc[k][i] += v[i];
    });
  }
  const inv = 1 / nRuns;`,
   `  const acc = node.actions.map(() => new Float64Array(nP));
  /* ── LE DÉNOMINATEUR EST PAR COMBO, PAS GLOBAL ────────────────────────────
     Une main de l'adversaire qui partage une carte avec la nôtre n'existe pas :
     elle est écartée du numérateur. La compter au dénominateur écrase l'EV du
     rapport des combinaisons bloquées — et le symptôme est net : sur un river à
     pot mort de 12 bb, un FOLD doit valoir exactement −6 bb, or on lisait
     −5.93 bb. Un pour cent d'erreur, mais sur la seule valeur du tableau dont on
     connaît la réponse d'avance : le reste était faux dans les mêmes proportions.
     On accumule donc, par combo, la masse d'adversaire RÉELLEMENT rencontrée. */
  const mass = new Float64Array(nP);
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) { curB = sampleBoard(); }
    computeE(curB);
    for (let i = 0; i < nP; i++) {
      let m = 0;
      for (let j = 0; j < nO; j++) { const e = p === 0 ? E[i][j] : E[j][i]; if (e >= 0) m += ro[j]; }
      mass[i] += m;
    }
    node.actions.forEach((a, k) => {
      const v = walk(node.children[a], ro);
      for (let i = 0; i < nP; i++) acc[k][i] += v[i];
    });
  }
  const inv = 1 / nRuns;`],

  [`  const den = sumP * sumO;
  const byAction = {}, byClass = {};`,
   `  /* Masse totale rencontrée par la range du joueur — le dénominateur agrégé. */
  let den = 0;
  for (let i = 0; i < nP; i++) den += rp[i] * mass[i] * inv;
  if (!(den > 0)) return { available: false, reason: "aucune confrontation possible : les ranges se bloquent entièrement" };
  const byAction = {}, byClass = {};`],

  [`    node.actions.forEach((a, k) => {
      let num = 0;
      for (const i of idxs) num += rp[i] * acc[k][i] * inv;
      row[a] = Math.round((num / (dp * sumO)) * 10000) / 10000;
    });`,
   `    let dm = 0; for (const i of idxs) dm += rp[i] * mass[i] * inv;
    if (!(dm > 0)) continue;
    node.actions.forEach((a, k) => {
      let num = 0;
      for (const i of idxs) num += rp[i] * acc[k][i] * inv;
      row[a] = Math.round((num / dm) * 10000) / 10000;
    });`],
  [`    let dp = 0; for (const i of idxs) dp += rp[i];
    if (!(dp > 0)) continue;
    const row = {};`,
   `    let dp = 0; for (const i of idxs) dp += rp[i];
    if (!(dp > 0)) continue;
    const row = {};`],
]);

/* ── strategyEV : même correction ───────────────────────────────────────── */
repFile('src/solver/core/multistreet.js',[
  [`  const sumWH = wH.reduce((a, b) => a + b, 0), sumWV = wV.reduce((a, b) => a + b, 0);
  let total = 0;
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) curB = sampleBoard();
    computeE(curB);
    const v = walk(tree, Float64Array.from(wV));
    let num = 0; for (let i = 0; i < nH; i++) num += wH[i] * v[i];
    total += num / (sumWH * sumWV);
  }
  return { ev: Math.round((total / nRuns) * 100000) / 100000, exact: need === 0, samples: nRuns };`,
   `  /* Dénominateur : la masse d'affrontements RÉELLEMENT possibles (cf. la même
     correction dans \`nodeActionEVs\`). \`solveTree.ev\` divise, lui, par
     \`sumWH·sumWV\` — donc par des paires bloquées qui n'ont jamais lieu — et
     sous-estime l'EV du rapport des combinaisons impossibles. C'est un écart de
     l'ordre du pour cent ici, davantage sur des ranges larges et un board chargé.
     Les deux conventions ne sont donc pas interchangeables ; celle-ci est la
     bonne, et c'est elle que PFASE rapporte. */
  let total = 0, totalMass = 0;
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) curB = sampleBoard();
    computeE(curB);
    const v = walk(tree, Float64Array.from(wV));
    let num = 0, m = 0;
    for (let i = 0; i < nH; i++) {
      num += wH[i] * v[i];
      let mi = 0; for (let j = 0; j < nV; j++) if (E[i][j] >= 0) mi += wV[j];
      m += wH[i] * mi;
    }
    total += num; totalMass += m;
  }
  if (!(totalMass > 0)) return null;
  return { ev: Math.round((total / totalMass) * 100000) / 100000, exact: need === 0, samples: nRuns };`],
]);
console.log('ok');
