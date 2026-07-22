import assert from "node:assert/strict";
import {
  ANIM,
  ANIM_SPEED,
  buildSpotIntroSequence,
  buildActionSequence,
  buildStreetChangeSequence,
  buildShowdownSequence,
  createAnimationQueue,
  createImmersionController,
} from "./src/immersionEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const types = (seq) => seq.map((e) => e.type);
const drain = async (q) => { for (let i = 0; i < 200 && (q.isRunning || q.pending); i++) await new Promise((r) => setTimeout(r, 0)); };

/* ── 1. Séquence d'intro : blindes → héro → actions → board (§31-38) ── */
{
  const spot = {
    schema: {
      street: "Flop", blinds: { sb: 0.5, bb: 1 },
      hero: { hand: [{ r: "A", s: "s" }, { r: "K", s: "s" }] },
      board: [{ r: "Q" }, { r: "J" }, { r: "T" }],
      actionHistory: [
        { position: "CO", actionType: "FOLD", amountBb: 0 },
        { position: "BTN", actionType: "RAISE", amountBb: 2.5, potAfterAction: 4 },
      ],
    },
  };
  const t = types(buildSpotIntroSequence(spot));
  eq(t[0], ANIM.POST_BLIND, "1er = post blind SB");
  eq(t[1], ANIM.POST_BLIND, "2e = post blind BB");
  eq(t[2], ANIM.DEAL_HERO, "3e = cartes héro");
  ok(!t.includes(ANIM.FOLD), "les folds ne génèrent pas d'anim de jetons");
  ok(t.includes(ANIM.RAISE), "l'open Villain est rejoué");
  ok(t.includes(ANIM.MOVE_BETS_TO_POT), "collecte avant le flop");
  ok(t.includes(ANIM.DEAL_FLOP), "flop distribué");
  ok(!t.includes(ANIM.DEAL_TURN), "pas de turn (street=flop)");
}

/* ── 2. Intro préflop : pas de board ── */
{
  const spot = { schema: { street: "Preflop", board: [], actionHistory: [], hero: { hand: [] } } };
  const t = types(buildSpotIntroSequence(spot));
  ok(!t.some((x) => /DEAL_(FLOP|TURN|RIVER)/.test(x)), "aucun board en préflop");
  eq(t[t.length - 1], ANIM.DEAL_HERO, "se termine sur la distribution héro");
}

/* ── 3. Intro river : flop+turn+river distribués ── */
{
  const spot = { schema: { street: "River", board: [1, 2, 3, 4, 5], actionHistory: [{ position: "BTN", actionType: "RAISE", amountBb: 2 }], hero: { hand: [] } } };
  const t = types(buildSpotIntroSequence(spot));
  ok(t.includes(ANIM.DEAL_FLOP) && t.includes(ANIM.DEAL_TURN) && t.includes(ANIM.DEAL_RIVER), "flop+turn+river");
}

/* ── 4. buildActionSequence ── */
{
  eq(types(buildActionSequence({ actionType: "CALL", amountBb: 2 })), [ANIM.CALL], "call → CALL");
  eq(types(buildActionSequence({ actionType: "3BET", amountBb: 9 }, { closesRound: true })), [ANIM.RAISE, ANIM.MOVE_BETS_TO_POT], "3bet + collecte");
  eq(types(buildActionSequence({ actionType: "CHECK" })), [ANIM.CHECK], "check → CHECK");
}

/* ── 5. buildStreetChangeSequence / showdown ── */
{
  eq(types(buildStreetChangeSequence("turn", [1, 2, 3, 4])), [ANIM.MOVE_BETS_TO_POT, ANIM.DEAL_TURN], "turn : collecte + carte");
  eq(buildStreetChangeSequence("preflop"), [], "pas de distribution en préflop");
  eq(types(buildShowdownSequence({ winner: "hero" })), [ANIM.MOVE_BETS_TO_POT, ANIM.SHOWDOWN, ANIM.POT_TO_WINNER], "showdown complet");
}

/* ── 6. AnimationQueue : ordre d'exécution (§62) ── */
{
  const seen = [];
  const q = createAnimationQueue({ run: (e) => seen.push(e.type), delay: () => Promise.resolve() });
  q.enqueue([{ type: "A", duration: 0 }, { type: "B", duration: 0 }, { type: "C", duration: 0 }]);
  await drain(q);
  eq(seen, ["A", "B", "C"], "exécution dans l'ordre");
  ok(!q.isRunning && q.pending === 0, "queue vidée en fin");
}

/* ── 7. cancel() vide la file et stoppe (§63) ──
   delay ne se résout jamais → A reste « en cours » jusqu'à ce qu'on la résolve,
   simulant une vraie animation bloquante interrompue par « Main suivante ». */
{
  const seen = [];
  let resolveFirst;
  const q = createAnimationQueue({
    run: (e) => { seen.push(e.type); if (e.type === "A") return new Promise((r) => { resolveFirst = r; }); },
    delay: () => new Promise(() => {}), // pending (ni pacing ni safety ne se déclenchent)
  });
  q.enqueue([{ type: "A", duration: 5 }, { type: "B", duration: 5 }, { type: "C", duration: 5 }]);
  await new Promise((r) => setTimeout(r, 0)); // laisse démarrer A (bloquée)
  eq(seen, ["A"], "seule A a démarré");
  q.cancel();
  eq(q.pending, 0, "file vidée par cancel");
  if (resolveFirst) resolveFirst();
  await new Promise((r) => setTimeout(r, 5));
  ok(!seen.includes("B") && !seen.includes("C"), "les événements suivant l'annulation ne s'exécutent pas");
}

/* ── 8. Une anim qui échoue ne bloque pas la suite (§61) ── */
{
  const seen = [];
  const errs = [];
  const q = createAnimationQueue({
    run: (e) => { if (e.type === "BOOM") throw new Error("fail"); seen.push(e.type); },
    delay: () => Promise.resolve(),
    onError: (e, err) => errs.push(e.type),
  });
  q.enqueue([{ type: "X", duration: 0 }, { type: "BOOM", duration: 0 }, { type: "Y", duration: 0 }]);
  await drain(q);
  eq(seen, ["X", "Y"], "l'événement suivant s'exécute malgré l'échec");
  eq(errs, ["BOOM"], "erreur journalisée via onError");
}

/* ── 9. Vitesse : IMMERSIVE dure plus longtemps que FAST ── */
{
  ok(ANIM_SPEED.IMMERSIVE > ANIM_SPEED.NORMAL && ANIM_SPEED.NORMAL > ANIM_SPEED.FAST, "échelle des vitesses");
  const durs = [];
  const q = createAnimationQueue({ speed: "FAST", run: () => {}, delay: (ms) => { durs.push(ms); return Promise.resolve(); } });
  q.enqueue([{ type: "A", duration: 100 }]);
  await drain(q);
  ok(durs.some((d) => d <= 50 + 1), "FAST met la durée à l'échelle 0.5 (~50ms)");
}

/* ── 10. Controller multi-table : queues indépendantes (§64) ── */
{
  const ctrl = createImmersionController({ delay: () => Promise.resolve() });
  const a = [], b = [];
  ctrl.queue(0);  // crée
  const q0 = createAnimationQueue({ run: (e) => a.push(e.type), delay: () => Promise.resolve() });
  // via controller
  const seenByTable = { 0: [], 1: [] };
  const ctrl2 = createImmersionController({ delay: () => Promise.resolve(), run: (e, o) => { seenByTable[o.tableId].push(e.type); } });
  ctrl2.enqueue(0, [{ type: "T0a", duration: 0 }]);
  ctrl2.enqueue(1, [{ type: "T1a", duration: 0 }]);
  await new Promise((r) => setTimeout(r, 5));
  eq(ctrl2.size, 2, "deux queues créées");
  eq(seenByTable[0], ["T0a"], "table 0 reçoit ses events");
  eq(seenByTable[1], ["T1a"], "table 1 reçoit ses events");
  ctrl2.cancel(0);
  eq(seenByTable[1].length, 1, "annuler table 0 n'affecte pas table 1");
}

console.log(`✅ immersionEngine — ${passed} assertions OK`);
