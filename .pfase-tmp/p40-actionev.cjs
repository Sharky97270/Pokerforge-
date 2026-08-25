const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const repFile = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    let done = false;
    for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
      if (s.includes(pat)) { s = s.replace(pat, r2); done = true; break; }
    }
    if (!done) { console.error('MISS [' + p + '] : ' + a.slice(0, 80)); process.exit(1); }
  }
  fs.writeFileSync(p, s);
};

/* La solution transporte son board et sa graine : sans eux, on ne peut pas
   ré-échantillonner les runouts pour calculer une EV par action. */
repFile('src/solver/core/multistreet.js', [
  [`    ev:Math.round(ev*1000)/1000,
    iters,sampled:need>0,boardCards:initLen,
  };`,
   `    ev:Math.round(ev*1000)/1000,
    iters,sampled:need>0,boardCards:initLen,
    /* Board et graine CONSERVÉS : \`nodeActionEVs\` en a besoin pour rejouer
       exactement les mêmes runouts que le solve (§36/§49 — l'EV par action). */
    board:board.slice(),seed:(opts.seed??123457)>>>0,
  };`],
]);

/* ── L'EV PAR ACTION ────────────────────────────────────────────────────── */
let s = fs.readFileSync('src/solver/core/multistreet.js', 'utf8');
s += `

/* ══════════════════════════════════════════════════════════════════════════
   nodeActionEVs — L'EV DE CHAQUE ACTION À UN NŒUD (mission §36, §49)

   « Après décision : afficher Action Hero · Action GTO · Sizing · Fréquence ·
     EV · EV loss » (§36) et « EV played · EV best · EV difference » (§49).

   Jusqu'ici PokerForge répondait « EV indisponible » : \`solveTree\` ne conserve
   pas les valeurs contrefactuelles après convergence. Cette fonction les
   RECALCULE, exactement, à partir de la stratégie moyenne déjà stockée.

   ── CE QUI EST CALCULÉ, PRÉCISÉMENT ────────────────────────────────────────
   Pour l'action a au nœud N, du point de vue du joueur qui y parle :

       EV(a) = Σᵢ rp[i]·v_a[i]  /  ( Σᵢ rp[i] · Σⱼ ro[j] )

   où rp est le reach du joueur jusqu'à N (ses propres probabilités d'action le
   long du chemin, pondérées par sa range), ro celui de l'adversaire, et v_a la
   valeur du sous-arbre atteint par a, les DEUX camps jouant ensuite leur
   stratégie moyenne.

   C'est donc une EV CONDITIONNELLE : « sachant que nous sommes ici, que vaut
   cette action ». C'est la grandeur qu'un joueur lit, et elle est comparable
   entre actions du même nœud. Elle n'est PAS comparable à \`sol.ev\`, qui est
   l'EV de la racine — deux questions différentes.

   ── PÉRIMÈTRE ──────────────────────────────────────────────────────────────
   Nœuds de la RUE COURANTE (street 0), ceux que \`extractStreetStrategy\`
   expose. Au-delà, la stratégie dépend de la carte tombée et la solution ne la
   couvre pas (voir LIMITATIONS L8) : on rend \`available:false\` avec le motif,
   jamais un nombre.

   Board complet → exact. Board incomplet → moyenne sur les runouts
   ré-échantillonnés avec LA MÊME GRAINE que le solve, donc reproductible ;
   \`exact:false\` le dit.
   ══════════════════════════════════════════════════════════════════════════ */
export function nodeActionEVs(sol, path = [], { samples = null } = {}) {
  if (!sol || !sol.tree || typeof sol.avgOf !== "function") {
    return { available: false, reason: "solution inexploitable" };
  }
  const { tree, heroList, villList, wH, wV, startPot, initLen } = sol;
  const U = sol.utility || CHIP_UTILITY;
  const nH = heroList.length, nV = villList.length;
  const board = sol.board || [];
  const need = 5 - (board.length || initLen);

  /* 1. Localiser le nœud cible en suivant le chemin d'actions. */
  let node = tree;
  for (const step of path) {
    if (!node || node.kind !== "decision" || !node.children[step]) {
      return { available: false, reason: \`chemin « \${path.join("|")} » absent de l'arbre\` };
    }
    node = node.children[step];
    if (node && node.kind === "chance") {
      return { available: false, reason: "le chemin traverse une carte à venir — la solution ne couvre que la rue courante (LIMITATIONS L8)" };
    }
  }
  if (!node || node.kind !== "decision") return { available: false, reason: "le chemin ne mène pas à un nœud de décision" };
  if (node.street !== 0) return { available: false, reason: "nœud hors de la rue courante" };

  const p = node.player;                        // joueur qui parle au nœud cible
  const nP = p === 0 ? nH : nV, nO = p === 0 ? nV : nH;
  const wP = p === 0 ? wH : wV, wO = p === 0 ? wV : wH;

  /* 2. Reaches jusqu'au nœud : chacun ne multiplie que SES propres probabilités. */
  const rp = Float64Array.from(wP), ro = Float64Array.from(wO);
  {
    let cur = tree;
    for (const step of path) {
      const k = cur.actions.indexOf(step);
      const mine = cur.player === p;
      const tgt = mine ? rp : ro;
      const n = mine ? nP : nO;
      for (let c = 0; c < n; c++) tgt[c] *= sol.avgOf(cur, c, "")[k];
      cur = cur.children[step];
    }
  }
  const sumP = rp.reduce((a, b) => a + b, 0);
  const sumO = ro.reduce((a, b) => a + b, 0);
  if (!(sumP > 0) || !(sumO > 0)) {
    return { available: false, reason: "nœud jamais atteint par les ranges solvées" };
  }

  /* 3. Valeur d'un sous-arbre, les deux camps jouant leur stratégie moyenne. */
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

  function walk(n, oppReach) {
    if (n.kind === "terminal") {
      const v = new Float64Array(nP);
      for (let i = 0; i < nP; i++) {
        let acc = 0;
        for (let j = 0; j < nO; j++) {
          const e = p === 0 ? E[i][j] : E[j][i];
          if (e < 0) continue;
          acc += oppReach[j] * (p === 0 ? U.h(terminalUtility(n, startPot, e)) : U.v(terminalUtility(n, startPot, e)));
        }
        v[i] = acc;
      }
      return v;
    }
    if (n.kind === "chance") {
      const ci = initLen + n.street;
      if (ci >= initLen && ci < 5) {
        const c = curB[ci];
        const list = p === 0 ? villList : heroList;
        const r = Float64Array.from(oppReach);
        for (let j = 0; j < nO; j++) { const cc = list[j].cards; if (cc[0] === c || cc[1] === c) r[j] = 0; }
        return walk(n.next, r);
      }
      return walk(n.next, oppReach);
    }
    const na = n.actions.length, key = keyFor(n);
    if (n.player === p) {
      /* Notre joueur : on MÉLANGE selon sa stratégie moyenne (on n'optimise pas —
         ce n'est pas une meilleure réponse, c'est la valeur de la stratégie). */
      const childs = n.actions.map(a => walk(n.children[a], oppReach));
      const v = new Float64Array(nP);
      for (let c = 0; c < nP; c++) {
        const d = sol.avgOf(n, c, key);
        let acc = 0;
        for (let a = 0; a < na; a++) acc += d[a] * childs[a][c];
        v[c] = acc;
      }
      return v;
    }
    /* L'adversaire : on scinde SON reach par action et on somme. */
    const v = new Float64Array(nP);
    for (let a = 0; a < na; a++) {
      const cr = new Float64Array(nO);
      for (let c = 0; c < nO; c++) cr[c] = oppReach[c] * sol.avgOf(n, c, key)[a];
      const cv = walk(n.children[n.actions[a]], cr);
      for (let c = 0; c < nP; c++) v[c] += cv[c];
    }
    return v;
  }

  /* 4. Une valeur par action, moyennée sur les runouts si le board est incomplet. */
  const nRuns = need > 0 ? Math.max(1, samples || Math.min(sol.iters || 200, 200)) : 1;
  const rng = mulberry32((sol.seed ?? 123457) >>> 0);
  const used = new Uint8Array(52);
  const sampleBoard = () => {
    used.fill(0); for (const c of board) used[c] = 1;
    const b = board.slice();
    while (b.length < 5) { const c = (rng() * 52) | 0; if (!used[c]) { used[c] = 1; b.push(c); } }
    return b;
  };
  const acc = node.actions.map(() => new Float64Array(nP));
  for (let t = 0; t < nRuns; t++) {
    if (need > 0) { curB = sampleBoard(); }
    computeE(curB);
    node.actions.forEach((a, k) => {
      const v = walk(node.children[a], ro);
      for (let i = 0; i < nP; i++) acc[k][i] += v[i];
    });
  }
  const inv = 1 / nRuns;

  /* 5. Agrégation : sur toute la range, puis par classe de main. */
  const den = sumP * sumO;
  const byAction = {}, byClass = {};
  const list = p === 0 ? heroList : villList;
  const classIdx = new Map();
  for (let i = 0; i < list.length; i++) {
    const k = list[i].key; if (!k) continue;
    if (!classIdx.has(k)) classIdx.set(k, []);
    classIdx.get(k).push(i);
  }
  node.actions.forEach((a, k) => {
    let num = 0;
    for (let i = 0; i < nP; i++) num += rp[i] * acc[k][i] * inv;
    byAction[a] = Math.round((num / den) * 10000) / 10000;
  });
  for (const [cls, idxs] of classIdx) {
    let dp = 0; for (const i of idxs) dp += rp[i];
    if (!(dp > 0)) continue;
    const row = {};
    node.actions.forEach((a, k) => {
      let num = 0;
      for (const i of idxs) num += rp[i] * acc[k][i] * inv;
      row[a] = Math.round((num / (dp * sumO)) * 10000) / 10000;
    });
    byClass[cls] = row;
  }

  return {
    available: true,
    exact: need === 0,
    samples: nRuns,
    note: need === 0
      ? "board complet — EV par action exacte"
      : \`board incomplet — moyenne sur \${nRuns} runouts ré-échantillonnés avec la graine du solve (reproductible, non exacte)\`,
    byAction, byClass,
    reachShare: Math.round((sumP / wP.reduce((a, b) => a + b, 0)) * 10000) / 10000,
  };
}
`;
fs.writeFileSync('src/solver/core/multistreet.js', s);
console.log('ok');
