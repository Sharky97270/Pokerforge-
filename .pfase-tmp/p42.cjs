const fs=require('fs');const p='src/solver/core/multistreet.js';let s=fs.readFileSync(p,'utf8');
s+=`

/* ══════════════════════════════════════════════════════════════════════════
   strategyEV — L'EV DE LA STRATÉGIE MOYENNE (celle qui est réellement servie)

   \`solveTree\` renvoie \`ev\` = moyenne, SUR LES ITÉRATIONS, de la valeur de la
   stratégie COURANTE de chaque itération. Ce n'est pas la même chose que la
   valeur de la stratégie MOYENNE — celle qui est stockée, affichée au Trainer
   et jouée. Deux conséquences :

     · la moyenne des itérations inclut les premières, très loin de l'équilibre,
       et met donc longtemps à s'en détacher : c'est l'essentiel de la « dérive »
       qu'on observait en doublant les itérations ;
     · l'EV annoncée ne décrivait pas la stratégie livrée.

   Cette fonction calcule la seconde. Une seule traversée par runout.
   ══════════════════════════════════════════════════════════════════════════ */
export function strategyEV(sol, { samples = null } = {}) {
  if (!sol || !sol.tree || typeof sol.avgOf !== "function") return null;
  const { tree, heroList, villList, wH, wV, startPot, initLen } = sol;
  const U = sol.utility || CHIP_UTILITY;
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  const E = Array.from({ length: nH }, () => new Float32Array(nV));
  const sH = new Float64Array(nH), sV = new Float64Array(nV);
  const computeE = (b) => {
    for (let i = 0; i < nH; i++) { const h = heroList[i].cards;
      sH[i] = (b.includes(h[0]) || b.includes(h[1])) ? -1 : eval7i([h[0], h[1], b[0], b[1], b[2], b[3], b[4]]); }
    for (let j = 0; j < nV; j++) { const v = villList[j].cards;
      sV[j] = (b.includes(v[0]) || b.includes(v[1])) ? -1 : eval7i([v[0], v[1], b[0], b[1], b[2], b[3], b[4]]); }
    for (let i = 0; i < nH; i++) { const h = heroList[i].cards; const row = E[i]; const hs = sH[i];
      for (let j = 0; j < nV; j++) { const v = villList[j].cards;
        if (hs < 0 || sV[j] < 0 || h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) { row[j] = -1; continue; }
        row[j] = hs > sV[j] ? 1 : hs === sV[j] ? 0.5 : 0;
      } }
  };
  let curB = board.slice();
  const keyFor = (n) => { const vis = initLen + n.street; return vis <= initLen ? "" : curB.slice(initLen, Math.min(5, vis)).join(","); };

  /* Valeur pour le joueur 0, les deux camps jouant leur stratégie moyenne. */
  function walk(n, reachV) {
    if (n.kind === "terminal") {
      const v = new Float64Array(nH);
      for (let i = 0; i < nH; i++) { let acc = 0;
        for (let j = 0; j < nV; j++) { const e = E[i][j]; if (e < 0) continue;
          acc += reachV[j] * U.h(terminalUtility(n, startPot, e)); }
        v[i] = acc; }
      return v;
    }
    if (n.kind === "chance") {
      const ci = initLen + n.street;
      if (ci >= initLen && ci < 5) {
        const c = curB[ci];
        const r = Float64Array.from(reachV);
        for (let j = 0; j < nV; j++) { const cc = villList[j].cards; if (cc[0] === c || cc[1] === c) r[j] = 0; }
        return walk(n.next, r);
      }
      return walk(n.next, reachV);
    }
    const na = n.actions.length, key = keyFor(n);
    if (n.player === 0) {
      const childs = n.actions.map(a => walk(n.children[a], reachV));
      const v = new Float64Array(nH);
      for (let i = 0; i < nH; i++) { const d = sol.avgOf(n, i, key); let acc = 0;
        for (let a = 0; a < na; a++) acc += d[a] * childs[a][i]; v[i] = acc; }
      return v;
    }
    const v = new Float64Array(nH);
    for (let a = 0; a < na; a++) {
      const cr = new Float64Array(nV);
      for (let j = 0; j < nV; j++) cr[j] = reachV[j] * sol.avgOf(n, j, key)[a];
      const cv = walk(n.children[n.actions[a]], cr);
      for (let i = 0; i < nH; i++) v[i] += cv[i];
    }
    return v;
  }

  const nRuns = need > 0 ? Math.max(1, samples || Math.min(sol.iters || 200, 200)) : 1;
  const rng = mulberry32((sol.seed ?? 123457) >>> 0);
  const used = new Uint8Array(52);
  const sampleBoard = () => {
    used.fill(0); for (const c of board) used[c] = 1;
    const b = board.slice();
    while (b.length < 5) { const c = (rng() * 52) | 0; if (!used[c]) { used[c] = 1; b.push(c); } }
    return b;
  };
  const sumWH = wH.reduce((a, b) => a + b, 0), sumWV = wV.reduce((a, b) => a + b, 0);
  let total = 0;
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) curB = sampleBoard();
    computeE(curB);
    const v = walk(tree, Float64Array.from(wV));
    let num = 0; for (let i = 0; i < nH; i++) num += wH[i] * v[i];
    total += num / (sumWH * sumWV);
  }
  return { ev: Math.round((total / nRuns) * 100000) / 100000, exact: need === 0, samples: nRuns };
}
`;
fs.writeFileSync(p,s);console.log('ok');
