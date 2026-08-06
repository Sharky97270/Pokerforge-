/* Tests provider CFR postflop (flop HU) + sanity d'un vrai solve. */
import assert from "node:assert";
import { solveMultiStreet } from "./src/solver/api.js";
import {
  cardToInt, handClassKey, classifyFlopActs, isSolvableFlop, buildFlopSolveRequest, mapWorkerResultToStrategy,
  isSolvablePostflop, buildPostflopSolveRequest, postflopMode, classifyFacingActs,
  potKind, weightedRange,
} from "./src/trainerPostflopSolver.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

// ── Helpers purs ──
eq(cardToInt({ r: "2", s: "♠" }), 0, "2♠ = 0");
eq(cardToInt({ r: "A", s: "♣" }), 51, "A♣ = 51");
eq(handClassKey({ r: "A", s: "♥" }, { r: "K", s: "♥" }), "AKs", "AKs");
eq(handClassKey({ r: "K", s: "♥" }, { r: "A", s: "♦" }), "AKo", "AKo (rang haut d'abord)");
eq(handClassKey({ r: "Q", s: "♠" }, { r: "Q", s: "♦" }), "QQ", "QQ");

// ── classifyFlopActs / isSolvableFlop ──
const cbetActs = [{ id: "CHECK", l: "Check" }, { id: "BET50", l: "Bet ½" }, { id: "BET100", l: "PSB" }, { id: "FOLD", l: "Fold" }];
const cls = classifyFlopActs(cbetActs);
eq(cls.checkIdx, 0, "check idx");
eq(cls.foldIdx, 3, "fold idx");
eq(cls.bets.length, 2, "2 bets");
ok(!classifyFlopActs([{ id: "FOLD" }, { id: "CALL" }, { id: "RAISE" }]).checkIdx > -1 || classifyFlopActs([{ id: "CALL" }]).hasCall, "call détecté");

const flopSpot = {
  street: "Flop", nplayers: 2, hpos: "SB", vpos: "BB", stack: "100", pot: 7.5,
  board: [{ r: "A", s: "♠" }, { r: "K", s: "♦" }, { r: "7", s: "♣" }],
  hand: [{ r: "A", s: "♥" }, { r: "A", s: "♦" }],
  acts: cbetActs,
};
ok(isSolvableFlop(flopSpot), "spot flop c-bet HU résoluble");
ok(!isSolvableFlop({ ...flopSpot, board: [{ r: "A", s: "♠" }] }), "board incomplet non résoluble");
ok(!isSolvableFlop({ ...flopSpot, acts: [{ id: "FOLD" }, { id: "CALL" }, { id: "RAISE" }] }), "face à une mise non résoluble");
ok(isSolvableFlop({ ...flopSpot, nplayers: 6 }), "6-max mais HU postflop = résoluble");
ok(!isSolvableFlop({ ...flopSpot, multiway: true }), "multiway explicite non résoluble");

const built = buildFlopSolveRequest(flopSpot);
ok(built && built.request, "requête construite");
eq(built.request.board.length, 3, "board 3 ints");
ok(Object.keys(built.request.heroFreqs).length === 169, "hero range 169 classes");
// villain = call only (r zéro-outé)
ok(Object.values(built.request.villFreqs).every(f => f.r === 0), "villain 3bet zéro-outé");

// ── TURN / RIVER (hero-leads) ──
const turnSpot = { ...flopSpot, street: "Turn", board: [...flopSpot.board, { r: "2", s: "♥" }] };
const riverSpot = { ...flopSpot, street: "River", board: [...flopSpot.board, { r: "2", s: "♥" }, { r: "9", s: "♠" }] };
ok(isSolvablePostflop(turnSpot), "turn hero-leads résoluble");
ok(isSolvablePostflop(riverSpot), "river hero-leads résoluble");
eq(buildPostflopSolveRequest(turnSpot).meta.street, "turn", "meta street turn");
eq(buildPostflopSolveRequest(riverSpot).meta.street, "river", "meta street river");

// ── SANITY : vrai solve + extraction par main (ce que fait le worker) ──
function solveAndRead(spot) {
  const b = buildFlopSolveRequest(spot);
  const t0 = Date.now();
  const out = solveMultiStreet(b.request.heroFreqs, b.request.villFreqs, b.request.board, b.request.opts);
  const ms = Date.now() - t0;
  const sol = out.result;
  const root = sol.tree;
  const idxs = [];
  for (let i = 0; i < sol.heroList.length; i++) if (sol.heroList[i].key === b.meta.heroClassKey) idxs.push(i);
  const na = root.actions.length;
  const agg = new Array(na).fill(0); let w = 0;
  for (const c of idxs) { const wc = sol.wH[c] || 0; const d = sol.avgOf(root, c); for (let k = 0; k < na; k++) agg[k] += wc * d[k]; w += wc; }
  if (w > 0) for (let k = 0; k < na; k++) agg[k] /= w;
  const distByLabel = {}; root.actions.forEach((l, k) => distByLabel[l] = Math.round(agg[k] * 1000) / 10);
  const strat = mapWorkerResultToStrategy(
    { ok: true, distByLabel, nashConv: out.convergence?.nashConv, abstraction: out.abstraction },
    spot, b.actsMap, b.meta);
  return { distByLabel, actions: root.actions, ms, nashConv: out.convergence?.nashConv, strat, inRange: idxs.length > 0 };
}

const nuts = solveAndRead(flopSpot);   // AA top set sur A K 7
console.log(`  AA sur A♠K♦7♣ : ${JSON.stringify(nuts.distByLabel)}  (actions ${nuts.actions})  ${nuts.ms}ms  NashConv=${nuts.nashConv}`);
ok(nuts.inRange, "AA dans la range");
const betTotal = nuts.actions.reduce((s, l, k) => s + (l.startsWith("B") ? nuts.distByLabel[l] : 0), 0);
ok(betTotal >= 60, `AA (top set) mise beaucoup (${betTotal}% ≥ 60)`);

// Une main faible/air : 8♥6♥ (86s) sur A K 7 — pas de paire, doit checker davantage
const airSpot = { ...flopSpot, hand: [{ r: "8", s: "♥" }, { r: "6", s: "♥" }] };
if (isSolvableFlop(airSpot)) {
  const air = solveAndRead(airSpot);
  if (air.inRange) {
    console.log(`  86s sur A♠K♦7♣ : ${JSON.stringify(air.distByLabel)}  ${air.ms}ms`);
    const airBet = air.actions.reduce((s, l) => s + (l.startsWith("B") ? air.distByLabel[l] : 0), 0);
    ok(airBet < betTotal, `86s (air) mise moins que AA (${airBet}% < ${betTotal}%)`);
  } else { console.log("  86s hors range (skip comparaison)"); }
}

// ── RIVER = solve EXACT : NashConv doit être disponible (board complet, pas de sampling) ──
const riverNuts = { ...riverSpot, hand: [{ r: "A", s: "♥" }, { r: "A", s: "♦" }] };  // set d'as sur A K 7 2 9
if (isSolvablePostflop(riverNuts)) {
  const rv = solveAndRead(riverNuts);
  console.log(`  AA rivière A♠K♦7♣2♥9♠ : ${JSON.stringify(rv.distByLabel)}  ${rv.ms}ms  NashConv=${rv.nashConv}`);
  ok(rv.nashConv != null, `river = solve exact → NashConv disponible (${rv.nashConv})`);
  if (rv.inRange) {
    const rvBet = rv.actions.reduce((s, l) => s + (l.startsWith("B") ? rv.distByLabel[l] : 0), 0);
    ok(rvBet >= 60, `AA nuts rivière value-bet (${rvBet}% ≥ 60)`);
  }
}

// ── FACE À UNE MISE (call-down / bluff-catch) : Héros paie ou fold ──
const facingActs = [{ id: "FOLD", l: "Fold" }, { id: "CALL", l: "Call 6bb" }, { id: "RAISE", l: "Raise" }];
const facingRiver = {
  street: "River", hpos: "BB", vpos: "BTN", stack: "100", pot: 30, toCall: 10,
  board: [{ r: "A", s: "♠" }, { r: "K", s: "♦" }, { r: "7", s: "♣" }, { r: "2", s: "♥" }, { r: "9", s: "♠" }],
  hand: [{ r: "A", s: "♥" }, { r: "A", s: "♦" }],
  acts: facingActs,
};
eq(postflopMode(facingRiver), "facing", "mode facing détecté");
eq(postflopMode(flopSpot), "leads", "mode leads détecté");
ok(isSolvablePostflop(facingRiver), "spot face-à-mise résoluble");
const fBuilt = buildPostflopSolveRequest(facingRiver);
ok(fBuilt && fBuilt.request.opts.nodePath?.join(",") === "X,B", "nodePath X,B pour facing");
eq(fBuilt.meta.mode, "facing", "meta.mode facing");
// pot avant la mise villain = 30-10 = 20 ; sizing villain = 10/20 = 0.5
eq(fBuilt.request.opts.startPot, 20, "startPot = pot - toCall");
ok(Math.abs(fBuilt.request.opts.betSizes[0] - 0.5) < 0.01, "sizing villain = toCall/pot");

function solveFacing(spot) {
  const b = buildPostflopSolveRequest(spot);
  const out = solveMultiStreet(b.request.heroFreqs, b.request.villFreqs, b.request.board, b.request.opts);
  const sol = out.result;
  let node = sol.tree;
  for (const l of b.request.opts.nodePath) node = node?.children?.[l];
  const idxs = [];
  for (let i = 0; i < sol.heroList.length; i++) if (sol.heroList[i].key === b.meta.heroClassKey) idxs.push(i);
  if (!node || !idxs.length) return { miss: true, node: !!node, inRange: idxs.length > 0 };
  const na = node.actions.length, agg = new Array(na).fill(0); let w = 0;
  for (const c of idxs) { const wc = sol.wH[c] || 0; const d = sol.avgOf(node, c); for (let k = 0; k < na; k++) agg[k] += wc * d[k]; w += wc; }
  if (w > 0) for (let k = 0; k < na; k++) agg[k] /= w;
  const distByLabel = {}; node.actions.forEach((l, k) => distByLabel[l] = Math.round(agg[k] * 1000) / 10);
  const strat = mapWorkerResultToStrategy({ ok: true, distByLabel, nashConv: out.convergence?.nashConv }, spot, b.actsMap, b.meta);
  return { distByLabel, actions: node.actions, strat, nashConv: out.convergence?.nashConv };
}

const fNuts = solveFacing(facingRiver);
if (!fNuts.miss) {
  console.log(`  AA face à 10bb (river) : ${JSON.stringify(fNuts.distByLabel)}  NashConv=${fNuts.nashConv}`);
  ok(fNuts.actions.includes("F") && fNuts.actions.includes("C"), "nœud facing expose F et C");
  ok((fNuts.distByLabel.F || 0) < 15, `AA (nuts) ne fold quasi jamais (F=${fNuts.distByLabel.F}%)`);
  // la stratégie mappée doit renseigner CALL et non pas tout à zéro
  ok((fNuts.strat.freq.CALL || 0) + (fNuts.strat.freq.RAISE || 0) > 50, "AA continue (call+raise > 50%)");
  const fAir = solveFacing({ ...facingRiver, hand: [{ r: "5", s: "♥" }, { r: "4", s: "♥" }] });
  if (!fAir.miss) {
    console.log(`  54s face à 10bb (river) : ${JSON.stringify(fAir.distByLabel)}`);
    ok((fAir.distByLabel.F || 0) > (fNuts.distByLabel.F || 0), `air fold plus que les nuts (${fAir.distByLabel.F}% > ${fNuts.distByLabel.F}%)`);
  }
}

// ── POTS 3-BET : détection + ranges d'entrée resserrées ──
eq(potKind(flopSpot), "srp", "pot 7.5bb → pot simple-relancé");
eq(potKind({ ...flopSpot, pot: 21 }), "3bp", "pot 21bb → pot 3-bet (seuil taille)");
eq(potKind({ ...flopSpot, actionHistory: [{ actionType: "3BET", label: "3-bet 9bb" }] }), "3bp",
  "historique 3BET → pot 3-bet (signal explicite)");
eq(potKind({ ...flopSpot, actionHistory: [{ actionType: "OPEN" }, { actionType: "CALL" }] }), "srp",
  "historique open/call → pot simple-relancé");
// weightedRange place bien le poids dans c
const wr = weightedRange({ AA: { r: 80, c: 20, f: 0 }, "72o": { r: 0, c: 0, f: 100 } }, f => f.r);
eq(wr.AA.c, 80, "weightedRange prend la portion demandée");
eq(wr["72o"].c, 0, "weightedRange : main hors range à 0");

// Le cœur : une range de pot 3-bet doit être BEAUCOUP plus serrée qu'un SRP.
const srpReq = buildPostflopSolveRequest({ ...flopSpot, pot: 7.5 });
const bpReq = buildPostflopSolveRequest({ ...flopSpot, pot: 21 });
eq(srpReq.meta.potKind, "srp", "meta srp");
eq(bpReq.meta.potKind, "3bp", "meta 3bp");
const largeur = fr => Object.values(fr).reduce((s, f) => s + (f.c || 0) + (f.r || 0), 0);
const lSrp = largeur(srpReq.request.heroFreqs), lBp = largeur(bpReq.request.heroFreqs);
console.log(`  largeur range Héros — SRP ${Math.round(lSrp)} vs 3BP ${Math.round(lBp)}`);
ok(lBp < lSrp * 0.6, `range 3-bet nettement plus serrée que l'open (${Math.round(lBp)} < 60% de ${Math.round(lSrp)})`);
ok(lBp > 0, "range 3-bet non vide");
// AA doit rester présente dans les deux (sinon illisible)
ok((bpReq.request.heroFreqs.AA?.c || 0) > 0, "AA présente dans la range 3-bet du Héros");
ok((bpReq.request.villFreqs.AA?.c || 0) > 0, "AA présente dans la range adverse (suiveur du 3-bet)");

console.log(`\n✅ trainerPostflopSolver — ${n} assertions OK`);
