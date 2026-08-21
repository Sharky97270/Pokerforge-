/* test-strategy-provider.mjs — StrategyProvider §28 (solveur branché au Trainer) */
import assert from "node:assert/strict";
import {
  handNotation, isSolvablePushFold, resolveSpotStrategy, applySolverStrategy,
} from "./src/trainerStrategyProvider.js";
import { solvePreflopPushFold } from "./src/solver/api.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const C = (r, s) => ({ r, s });

/* ── 1. Notation de main ── */
{
  eq(handNotation([C("A","♠"), C("A","♥")]), "AA", "paire");
  eq(handNotation([C("K","♠"), C("A","♠")]), "AKs", "AK suited (rang haut premier)");
  eq(handNotation([C("A","♠"), C("K","♥")]), "AKo", "AK offsuit");
  eq(handNotation([C("2","♦"), C("7","♣")]), "72o", "72o");
  eq(handNotation([]), null, "sans cartes → null");
}

/* ── 2. Détection push/fold résoluble ──
   Les spots portent désormais la STRUCTURE du coup (positions, format, nombre de
   joueurs) : sans elle, on ne peut pas savoir si le modèle heads-up chip-EV du
   solveur s'applique. Les spots de l'ancienne version de ce test étaient muets
   là-dessus — c'est précisément pour ça qu'un BTN de 6-max passait le contrôle. */
{
  const HU = { hpos: "SB", vpos: "BB", fmt: "Cash HU", nplayers: 2 };
  const jam = { street: "Preflop", stack: "12bb", toCall: 0, ...HU, acts: [{ id: "FOLD", l: "Fold" }, { id: "ALLIN", l: "Push 12bb" }] };
  ok(isSolvablePushFold(jam), "jam SB 12bb heads-up = résoluble");
  const call = { street: "Preflop", stack: "10bb", toCall: 10, hpos: "BB", vpos: "SB", fmt: "Cash HU", nplayers: 2, acts: [{ id: "FOLD", l: "Fold" }, { id: "CALL", l: "Call" }] };
  ok(isSolvablePushFold(call), "call BB d'un jam 10bb heads-up = résoluble");
  ok(!isSolvablePushFold({ street: "Flop", stack: "10bb", ...HU, acts: [{ id: "FOLD" }, { id: "ALLIN" }] }), "postflop non résoluble ici");
  ok(!isSolvablePushFold({ street: "Preflop", stack: "100bb", toCall: 0, ...HU, acts: [{ id: "FOLD" }, { id: "ALLIN" }] }), "100bb hors zone push/fold");
  ok(!isSolvablePushFold({ street: "Preflop", stack: "12.5bb", toCall: 0, ...HU, acts: [{ id: "FOLD" }, { id: "ALLIN" }] }), "tapis fractionnaire non tabulé");
  ok(!isSolvablePushFold({ street: "Preflop", stack: "10bb", toCall: 0, ...HU, acts: [{ id: "FOLD" }, { id: "RAISE" }] }), "open (non jam) non résoluble");

  /* ── Les refus AJOUTÉS : le moteur est heads-up et chip-EV, il doit le rester ── */
  ok(!isSolvablePushFold({ street: "Preflop", stack: "25bb", toCall: 0, hpos: "BTN", vpos: "BB", fmt: "Cash 6-max", acts: [{ id: "FOLD" }, { id: "ALLIN" }] }),
    "BTN 25bb Cash 6-max REFUSÉ — trois joueurs peuvent encore payer");
  ok(!isSolvablePushFold({ street: "Preflop", stack: "12bb", toCall: 0, ...HU, fmt: "MTT ICM", acts: [{ id: "FOLD" }, { id: "ALLIN" }] }),
    "MTT ICM refusé — le moteur n'a aucune contrainte ICM");
  ok(!isSolvablePushFold({ street: "Preflop", stack: "12bb", toCall: 0, ...HU, fmt: "Spin & Go", acts: [{ id: "FOLD" }, { id: "ALLIN" }] }),
    "Spin & Go refusé — barème de gains ICM");
  ok(!isSolvablePushFold({ street: "Preflop", stack: "12bb", toCall: 0, hpos: "SB", vpos: "BB", acts: [{ id: "FOLD" }, { id: "ALLIN" }] }),
    "format absent refusé — on ne suppose pas chipEV");
}

/* ── 3. Jam : AA jam ~100%, 72o fold — solution SOLVEUR ── */
{
  const spot = (hand) => ({ street: "Preflop", stack: "10bb", toCall: 0, hpos: "SB", vpos: "BB", fmt: "Cash HU", nplayers: 2, hand,
    acts: [{ id: "FOLD", l: "Fold" }, { id: "ALLIN", l: "Push 10bb" }], ok: 0, freq: {} });
  const aa = resolveSpotStrategy(spot([C("A","♠"), C("A","♥")]));
  eq(aa.source, "solver", "AA : source solveur");
  eq(aa.ok, 1, "AA : action correcte = jam (index 1)");
  ok(aa.freq.ALLIN >= 90, `AA : jam ~100% (${aa.freq.ALLIN})`);
  const trash = resolveSpotStrategy(spot([C("7","♦"), C("2","♣")]));
  eq(trash.ok, 0, "72o : action correcte = fold (index 0)");
  ok(trash.freq.FOLD >= 60, `72o : fold majoritaire (${trash.freq.FOLD})`);
  ok(aa.provenance.startsWith("solver"), "provenance solveur");
}

/* ── 4. Call d'un jam : utilise bbCall (AA call, 72o fold) ── */
{
  const spot = (hand) => ({ street: "Preflop", stack: "10bb", toCall: 10, hpos: "BB", vpos: "SB", fmt: "Cash HU", nplayers: 2, hand,
    acts: [{ id: "FOLD", l: "Fold" }, { id: "CALL", l: "Call 10bb" }], ok: 0, freq: {} });
  const aa = resolveSpotStrategy(spot([C("A","♠"), C("A","♥")]));
  eq(aa.ok, 1, "AA face au jam : call");
  ok(aa.meta.facing, "meta.facing true");
  const trash = resolveSpotStrategy(spot([C("7","♦"), C("2","♣")]));
  eq(trash.ok, 0, "72o face au jam : fold");
}

/* ── 5. Spot non résoluble → provenance heuristique, ok/freq inchangés ── */
{
  const spot = { street: "Flop", stack: "60bb", hand: [C("A","♠"), C("K","♠")], acts: [{ id: "CHECK" }, { id: "BET33" }], ok: 1, freq: { BET33: 70 } };
  const r = resolveSpotStrategy(spot);
  eq(r.source, "heuristic", "postflop = heuristique");
  eq(r.ok, 1, "ok du template préservé");
  ok(!r.solved, "non solvé");
  ok(/Estimation heuristique/.test(r.note), `libellé honnête (${r.note})`);
  ok(Array.isArray(r.limits) && r.limits.length > 0, "le repli dit POURQUOI il n'a pas été résolu");
}

/* ── 6. applySolverStrategy : mute le spot + tag provenance ── */
{
  const spot = { street: "Preflop", stack: "8bb", toCall: 0, hpos: "SB", vpos: "BB", fmt: "Cash HU", nplayers: 2, hand: [C("A","♠"), C("A","♥")],
    acts: [{ id: "FOLD", l: "Fold" }, { id: "ALLIN", l: "Push 8bb" }], ok: 0, freq: {}, best: "Fold" };
  applySolverStrategy(spot);
  eq(spot.strategySource, "solver", "tag source solveur");
  eq(spot.ok, 1, "ok corrigé par le solveur (jam AA)");
  eq(spot.best, "Push 8bb", "best mis à jour");
  ok(spot.solverMeta && spot.solverMeta.stack === 8, "solverMeta présent");
}
{
  const spot = { street: "River", stack: "50bb", hand: [C("A","♠"), C("K","♠")], acts: [{ id: "CHECK" }, { id: "BET" }], ok: 1, freq: {} };
  applySolverStrategy(spot);
  eq(spot.strategySource, "heuristic", "postflop tag heuristique");
  eq(spot.ok, 1, "ok inchangé (non solvé)");
}

/* ── 7. Cohérence avec la Solver API brute (même source de vérité) ── */
{
  const sol = solvePreflopPushFold(15);
  ok(sol.sbJam["AA"].r >= 99, "API : AA jam ~100% à 15bb");
  const spot = { street: "Preflop", stack: "15bb", toCall: 0, hpos: "SB", vpos: "BB", fmt: "Cash HU", nplayers: 2, hand: [C("A","♠"), C("A","♥")],
    acts: [{ id: "FOLD" }, { id: "ALLIN", l: "Push" }], ok: 0, freq: {} };
  const r = resolveSpotStrategy(spot);
  eq(r.freq.ALLIN, Math.round(sol.sbJam["AA"].r * 10) / 10, "fréquence Trainer = fréquence API");
}

console.log(`✅ trainerStrategyProvider (§28) — ${passed} assertions OK`);
