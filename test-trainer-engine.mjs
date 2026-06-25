import assert from "node:assert/strict";
import {
  resolveTrainerRoundState,
  trainerRoundCloseDecision,
  TRAINER_STREETS,
} from "./src/trainerRoundEngine.js";
import {
  getTrainerVisualLayoutConfig,
  trainerBoardPosition,
  trainerBoardCollisionZone,
  trainerChipValueBand,
  trainerPotPosition,
  trainerTableGeometry,
} from "./src/trainerVisualConfig.js";
import {
  normalizeTrainerActionEvent,
  trainerChipPileCount,
  validateSpotConsistency,
} from "./src/trainerActionEvent.js";
import {
  SpotTemplateEngine,
  SpotGenerationEngine,
  PopulationModelEngine,
  buildTrainerIntegrationQueue,
  countEvolutiveSpots,
  createTrainingSpotFromHand,
  describeCoachSpot,
} from "./src/spotAiEngine.js";

function callTransition({ spot, ctx, state = {}, autoFull = false }) {
  return resolveTrainerRoundState({
    spot,
    ctx,
    state,
    heroAction: { id: "CALL", l: "Call" },
    autoFull,
  });
}

{
  const ctx = {
    facing: { kind: "open", label: "Open", amount: 4.5, position: "CO" },
    heroCommitted: 1,
    preActions: [
      { position: "CO", actionType: "RAISE", amountBb: 4.5, street: "Preflop" },
      { position: "SB", actionType: "FOLD", amountBb: 0, street: "Preflop" },
    ],
  };
  const transition = callTransition({
    spot: { street: "Preflop", hpos: "BB", vpos: "CO", board: [], toCall: 3.5 },
    ctx,
    state: { potTotal: 0, investedThisStreet: { SB: 0.5, BB: 1 }, playersInHand: ["CO", "BB"] },
    autoFull: true,
  });

  assert.equal(transition.currentStreet, TRAINER_STREETS.FLOP, "CO open / BB call must go to flop");
  assert.equal(transition.board.length, 3, "flop must deal exactly 3 cards");
  assert.equal(transition.currentBetToCall, 0, "call-closing street must reset currentBetToCall");
  assert.deepEqual(transition.actionQueue, [], "no CO ghost action must remain queued");
  assert.deepEqual(transition.pendingActions, [], "no pending villain action after a matched call");
  assert.equal(transition.ghostActionPrevented, true, "matched call must explicitly block ghost rebet");
  assert.equal(transition.potTotal, 9.5, "pot must consolidate CO 4.5 + BB 4.5 + SB 0.5");
  assert.equal(transition.nextActor, "BB", "BB acts first postflop versus CO");

  const decision = trainerRoundCloseDecision({
    spot: { street: "Preflop", hpos: "BB", vpos: "CO" },
    ctx,
    heroAction: { id: "CALL" },
    autoFull: true,
  });
  assert.equal(decision.closesRound, true, "legacy close decision still protects the UI path");
  assert.equal(decision.startFullHand, true, "preflop call may start the full-hand sequence");
}

{
  const transition = resolveTrainerRoundState({
    spot: { street: "Preflop", hpos: "BB", vpos: "BTN", board: [], toCall: 1.5 },
    ctx: {
      facing: { kind: "open", label: "Open", amount: 2.5, position: "BTN" },
      heroCommitted: 1,
      preActions: [
        { position: "BTN", actionType: "RAISE", amountBb: 2.5, street: "Preflop" },
        { position: "SB", actionType: "FOLD", amountBb: 0, street: "Preflop" },
      ],
    },
    state: { potTotal: 0, playersInHand: ["BTN", "BB"] },
    heroAction: { id: "FOLD", l: "Fold" },
  });

  assert.equal(transition.currentStreet, TRAINER_STREETS.HAND_COMPLETE, "BTN open / SB fold / BB fold must complete the hand");
  assert.equal(transition.handComplete, true);
  assert.equal(transition.board.length, 0, "no flop is dealt after both blinds fold");
  assert.equal(transition.currentBetToCall, 0);
}

{
  const transition = callTransition({
    spot: { street: "Preflop", hpos: "BB", vpos: "SB", board: [], toCall: 2 },
    ctx: {
      facing: { kind: "open", label: "Raise", amount: 3, position: "SB" },
      heroCommitted: 1,
      preActions: [{ position: "SB", actionType: "RAISE", amountBb: 3, street: "Preflop" }],
    },
    state: { potTotal: 0, playersInHand: ["SB", "BB"] },
  });

  assert.equal(transition.currentStreet, TRAINER_STREETS.FLOP, "SB raise / BB call must go to flop");
  assert.equal(transition.currentBetToCall, 0);
  assert.notEqual(transition.nextActor, "BB", "BB must not receive a second preflop decision after calling");
  assert.equal(transition.nextActor, "SB", "SB is first actor postflop in the app's seat order");
}

{
  const transition = callTransition({
    spot: { street: "Flop", hpos: "BB", vpos: "BTN", board: ["As", "Kd", "7c"], toCall: 2 },
    ctx: {
      facing: { kind: "cbet", label: "C-Bet", amount: 2, position: "BTN" },
      preActions: [{ position: "BTN", actionType: "BET", amountBb: 2, street: "Flop" }],
    },
    state: { potTotal: 7, playersInHand: ["BTN", "BB"] },
  });

  assert.equal(transition.currentStreet, TRAINER_STREETS.TURN, "flop bet / call must go to turn");
  assert.equal(transition.board.length, 4, "turn board must contain 4 cards");
  assert.equal(transition.currentBetToCall, 0);
  assert.equal(transition.potTotal, 11, "flop pot must add bet + call");
}

{
  const transition = resolveTrainerRoundState({
    spot: { street: "Flop", hpos: "BTN", vpos: "BB", board: ["As", "Kd", "7c"], toCall: 0 },
    ctx: {
      facing: null,
      preActions: [{ position: "BB", actionType: "CHECK", amountBb: 0, street: "Flop" }],
    },
    state: { potTotal: 6, playersInHand: ["BTN", "BB"] },
    heroAction: { id: "CHECK", l: "Check" },
  });

  assert.equal(transition.currentStreet, TRAINER_STREETS.TURN, "flop check/check must go to turn");
  assert.equal(transition.board.length, 4);
  assert.equal(transition.currentBetToCall, 0);
}

{
  const transition = callTransition({
    spot: { street: "Turn", hpos: "BB", vpos: "BTN", board: ["As", "Kd", "7c", "2h"], toCall: 6 },
    ctx: {
      facing: { kind: "bet", label: "Bet", amount: 6, position: "BTN" },
      preActions: [{ position: "BTN", actionType: "BET", amountBb: 6, street: "Turn" }],
    },
    state: { potTotal: 15, playersInHand: ["BTN", "BB"] },
  });

  assert.equal(transition.currentStreet, TRAINER_STREETS.RIVER, "turn bet / call must go to river");
  assert.equal(transition.board.length, 5);
  assert.equal(transition.currentBetToCall, 0);
}

{
  const transition = callTransition({
    spot: { street: "River", hpos: "BB", vpos: "BTN", board: ["As", "Kd", "7c", "2h", "9s"], toCall: 12 },
    ctx: {
      facing: { kind: "bet", label: "Bet", amount: 12, position: "BTN" },
      preActions: [{ position: "BTN", actionType: "BET", amountBb: 12, street: "River" }],
    },
    state: { potTotal: 30, playersInHand: ["BTN", "BB"] },
  });

  assert.equal(transition.currentStreet, TRAINER_STREETS.SHOWDOWN, "river bet / call must resolve to showdown");
  assert.equal(transition.showdown, true);
  assert.equal(transition.board.length, 5);
  assert.equal(transition.currentBetToCall, 0);
  assert.deepEqual(transition.actionQueue, []);
}

{
  const boardZone = trainerBoardCollisionZone(true);
  const inside = (pt, zone) => pt.x >= zone.xMin && pt.x <= zone.xMax && pt.y >= zone.yMin && pt.y <= zone.yMax;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cardAnchorFor = (seat) => {
    if (seat.y <= 28) return { x: seat.x, y: seat.y - 7 };
    if (seat.y >= 74) return { x: seat.x, y: seat.y - 9 };
    if (seat.x <= 18) return { x: seat.x - 6, y: seat.y - 4 };
    if (seat.x >= 82) return { x: seat.x + 6, y: seat.y - 4 };
    return { x: seat.x, y: seat.y - 6 };
  };
  const trainingModes = ["spot", "street", "mix", "full", "session"];

  for (const trainingMode of trainingModes) {
    for (const mode of [1, 2, 3, 4]) {
      const cfg = getTrainerVisualLayoutConfig(mode);
      const geom = trainerTableGeometry(mode);
      const boardPt = trainerBoardPosition(mode);
      const preflopPot = trainerPotPosition(mode, false);
      const postflopPot = trainerPotPosition(mode, true);
      assert.ok(Math.abs(geom.left - geom.right) <= 2, `${trainingMode}/${mode}T table geometry must be symmetrical enough for the maquette oval`);
      assert.ok(geom.top >= 8 && geom.bottom >= 10, `${trainingMode}/${mode}T felt must keep premium vertical breathing room`);
      assert.deepEqual(boardPt, { x: 50, y: 54 }, `${trainingMode}/${mode}T board must stay centered below the pot`);
      assert.deepEqual(preflopPot, { x: 50, y: 50 }, `${trainingMode}/${mode}T preflop pot must stay centered`);
      assert.deepEqual(postflopPot, { x: 50, y: 29 }, `${trainingMode}/${mode}T postflop pot must sit above the board`);
      assert.ok(cfg.seatPositions.HJ.x < 50, `${trainingMode}/${mode}T HJ must stay left of center`);
      assert.ok(cfg.seatPositions.CO.x > 50, `${trainingMode}/${mode}T CO must stay right of center`);
      assert.ok(cfg.anchorOverrides.BB.blindAnchor.y >= cfg.seatPositions.BB.y - 10, `${trainingMode}/${mode}T BB blind must stay near BB seat`);
      assert.ok(cfg.anchorOverrides.SB.blindAnchor.y >= cfg.seatPositions.SB.y - 10, `${trainingMode}/${mode}T SB blind must stay near SB seat`);
      for (const [pos, seat] of Object.entries(cfg.seatPositions)) {
        assert.ok(seat.x >= geom.left && seat.x <= 100 - geom.right, `${trainingMode}/${mode}T ${pos} seat must sit inside felt horizontal bounds`);
        assert.ok(seat.y >= geom.top && seat.y <= 100 - geom.bottom, `${trainingMode}/${mode}T ${pos} seat must sit inside felt vertical bounds`);
      }
      for (const pos of ["HJ", "CO", "BTN", "SB", "BB", "UTG"]) {
        const betAnchor = cfg.anchorOverrides[pos]?.betAnchor;
        const postflopBetAnchor = cfg.anchorOverrides[pos]?.postflopBetAnchor || betAnchor;
        if (betAnchor) assert.equal(inside(betAnchor, boardZone), false, `${trainingMode}/${mode}T ${pos} bet anchor must avoid board zone`);
        if (postflopBetAnchor) assert.equal(inside(postflopBetAnchor, boardZone), false, `${trainingMode}/${mode}T ${pos} postflop bet anchor must avoid board zone`);
      }
      for (const pos of ["BB", "SB"]) {
        const seat = cfg.seatPositions[pos];
        const cards = cardAnchorFor(seat);
        const blind = cfg.anchorOverrides[pos].blindAnchor;
        const preflopBet = cfg.anchorOverrides[pos].preflopBetAnchor || cfg.anchorOverrides[pos].betAnchor;
        const postflopBet = cfg.anchorOverrides[pos].postflopBetAnchor || cfg.anchorOverrides[pos].betAnchor;
        for (const [slotName, bet] of [["preflop", preflopBet], ["postflop", postflopBet]]) {
          assert.ok(dist(bet, blind) >= 10, `${trainingMode}/${mode}T ${pos} ${slotName} bet must not touch blind`);
          assert.ok(dist(bet, cards) >= 12, `${trainingMode}/${mode}T ${pos} ${slotName} bet must not touch cards`);
          assert.ok(dist(bet, seat) >= 10, `${trainingMode}/${mode}T ${pos} ${slotName} bet must not touch avatar seat`);
        }
      }
    }
  }

  assert.equal(trainerChipValueBand(0.5), "forced");
  assert.equal(trainerChipValueBand(4.5), "small");
  assert.equal(trainerChipValueBand(12), "medium");
  assert.equal(trainerChipValueBand(36), "large");
  assert.equal(trainerChipValueBand(80), "monster");
}

{
  let gameplayQa = 0;
  const check = (label, fn) => {
    fn();
    gameplayQa += 1;
  };
  const ev = (rawAction, extra = {}) => normalizeTrainerActionEvent({
    rawAction,
    actorSeat: extra.actorSeat || "BTN",
    actorId: extra.actorId || "hero",
    playerId: extra.playerId || "hero",
    street: extra.street || "Preflop",
    potBefore: extra.potBefore ?? 1.5,
    amountToCallBeforeAction: extra.toCall ?? 0,
    stack: extra.stack ?? "100bb",
    defaultAmount: extra.defaultAmount,
  });

  const open = ev({ id: "RAISE", l: "Open 2.5bb", s: "Standard" });
  check("open action type", () => assert.equal(open.actionType, "OPEN"));
  check("open committed amount", () => assert.equal(open.committedAmount, 2.5));
  check("open display amount", () => assert.equal(open.displayAmount, 2.5));
  check("open pot", () => assert.equal(open.resultingPot, 4));
  check("open label", () => assert.equal(open.displayLabel, "Open 2.5bb"));

  const call = ev({ id: "CALL", l: "Call" }, { toCall: 2, potBefore: 4 });
  check("call action type", () => assert.equal(call.actionType, "CALL"));
  check("call amount", () => assert.equal(call.displayAmount, 2));
  check("call toCall before", () => assert.equal(call.amountToCallBeforeAction, 2));
  check("call pot", () => assert.equal(call.resultingPot, 6));
  check("call is not bet", () => assert.notEqual(call.actionType, "BET"));

  const threeBet = ev({ id: "RAISE", l: "3-bet 9bb" }, { toCall: 2.5, potBefore: 4 });
  check("3bet action type", () => assert.equal(threeBet.actionType, "3BET"));
  check("3bet amount", () => assert.equal(threeBet.displayAmount, 9));
  check("3bet label amount", () => assert.equal(threeBet.displayLabel, "3-bet 9bb"));

  const fourBet = ev({ id: "RAISE", l: "4-bet 22bb" }, { toCall: 9, potBefore: 13 });
  check("4bet action type", () => assert.equal(fourBet.actionType, "4BET"));
  check("4bet amount", () => assert.equal(fourBet.displayAmount, 22));
  check("4bet pot", () => assert.equal(fourBet.resultingPot, 35));

  const fiveBet = ev({ id: "RAISE", l: "5-bet 45bb" }, { toCall: 22, potBefore: 35 });
  check("5bet action type", () => assert.equal(fiveBet.actionType, "5BET"));
  check("5bet amount", () => assert.equal(fiveBet.displayAmount, 45));

  const cbet = ev({ id: "BET33", l: "Cbet 33%", s: "1.7bb" }, { street: "Flop", toCall: 0, potBefore: 5 });
  check("cbet action type", () => assert.equal(cbet.actionType, "BET"));
  check("cbet uses bb sizing not percent as amount", () => assert.equal(cbet.displayAmount, 1.7));
  check("cbet resulting pot", () => assert.equal(cbet.resultingPot, 6.7));

  const shoveFromLabel = ev({ id: "ALLIN", l: "Push 25bb", s: "Nash HU" }, { stack: "17bb", potBefore: 1.5 });
  check("push keeps committed 25 not remaining stack 17", () => assert.equal(shoveFromLabel.displayAmount, 25));
  check("push action type allin", () => assert.equal(shoveFromLabel.actionType, "ALLIN"));
  check("push label", () => assert.equal(shoveFromLabel.displayLabel, "Push 25bb"));
  check("push all-in flag", () => assert.equal(shoveFromLabel.isAllIn, true));
  check("push pot", () => assert.equal(shoveFromLabel.resultingPot, 26.5));

  const callAllIn = ev({ id: "CALL", l: "Call all-in" }, { actorSeat: "BB", toCall: 25, stack: "25bb", potBefore: 26.5 });
  check("call all-in stays call", () => assert.equal(callAllIn.actionType, "CALL"));
  check("call all-in amount", () => assert.equal(callAllIn.displayAmount, 25));
  check("call all-in label", () => assert.equal(callAllIn.displayLabel, "Call all-in 25bb"));
  check("call all-in flag", () => assert.equal(callAllIn.isAllIn, true));
  check("observed all-in pot equals 51.5bb", () => assert.equal(callAllIn.resultingPot, 51.5));

  const fold = ev({ id: "FOLD", l: "Fold" }, { potBefore: 9, toCall: 3 });
  check("fold amount zero", () => assert.equal(fold.displayAmount, 0));
  check("fold pot unchanged", () => assert.equal(fold.resultingPot, 9));
  check("fold contributes false", () => assert.equal(fold.contributes, false));

  const checkBack = ev({ id: "CHECK", l: "Check" }, { street: "Flop", potBefore: 7, toCall: 0 });
  check("check type", () => assert.equal(checkBack.actionType, "CHECK"));
  check("check amount zero", () => assert.equal(checkBack.displayAmount, 0));
  check("check pot unchanged", () => assert.equal(checkBack.resultingPot, 7));

  check("0.5-2bb one pile", () => assert.equal(trainerChipPileCount(1), 1));
  check("2.5-8bb two piles", () => assert.equal(trainerChipPileCount(2.5), 2));
  check("8.5-20bb three piles", () => assert.equal(trainerChipPileCount(8.5), 3));
  check("20bb+ four piles", () => assert.equal(trainerChipPileCount(25), 4));
  check("all-in always four piles", () => assert.equal(trainerChipPileCount(8, true), 4));

  const validPushSpot = {
    id: "qa-push-25",
    street: "Preflop",
    hpos: "BTN",
    vpos: "BB",
    stack: "25bb",
    board: [],
    pot: 1.5,
    toCall: 0,
    acts: [{ id: "ALLIN", l: "Push 25bb", s: "Nash" }],
  };
  const valid = validateSpotConsistency(validPushSpot, { facing: null });
  check("valid push spot accepted", () => assert.equal(valid.ok, true));
  check("valid push snapshot id", () => assert.equal(valid.snapshot.spotId, "qa-push-25"));

  const invalidCall = validateSpotConsistency({ ...validPushSpot, acts: [{ id: "CALL", l: "Call" }] }, { facing: null });
  check("call without bet rejected", () => assert.equal(invalidCall.ok, false));
  check("call without bet reason", () => assert.ok(invalidCall.errors.includes("call without current bet")));

  const invalidBetFacing = validateSpotConsistency({ ...validPushSpot, toCall: 3, acts: [{ id: "BET33", l: "Bet 33%", s: "3bb" }] }, { facing: { amount: 3 } });
  check("bet facing bet rejected", () => assert.equal(invalidBetFacing.ok, false));
  check("bet facing reason", () => assert.ok(invalidBetFacing.errors.includes("bet while facing a bet")));

  const invalidRaise = validateSpotConsistency({ ...validPushSpot, acts: [{ id: "RAISE", l: "Raise 9bb" }] }, { facing: null });
  check("raise without previous bet rejected", () => assert.equal(invalidRaise.ok, false));
  check("raise without previous bet reason", () => assert.ok(invalidRaise.errors.includes("raise without previous bet")));

  const invalidRiver = validateSpotConsistency({ ...validPushSpot, street: "River", board: ["As", "Kd", "7c"], acts: [{ id: "CALL", l: "Call", s: "2bb" }], toCall: 2 }, { facing: { amount: 2 } });
  check("river missing board rejected", () => assert.equal(invalidRiver.ok, false));
  check("river board reason", () => assert.ok(invalidRiver.errors.some((e) => e.includes("requires 5 board cards"))));

  const invalidPosition = validateSpotConsistency({ ...validPushSpot, hpos: "XYZ" }, {});
  check("invalid position rejected", () => assert.equal(invalidPosition.ok, false));
  check("invalid position reason", () => assert.ok(invalidPosition.errors.some((e) => e.includes("invalid hero position"))));

  const invalidStack = validateSpotConsistency({ ...validPushSpot, stack: "-1bb" }, {});
  check("negative stack rejected", () => assert.equal(invalidStack.ok, false));
  check("negative stack reason", () => assert.ok(invalidStack.errors.includes("effective stack invalid")));

  const invalidOverstack = validateSpotConsistency({ ...validPushSpot, stack: "10bb", acts: [{ id: "RAISE", l: "3-bet 30bb" }], toCall: 2 }, { facing: { amount: 2 } });
  check("over stack rejected", () => assert.equal(invalidOverstack.ok, false));
  check("over stack reason", () => assert.ok(invalidOverstack.errors.includes("action exceeds stack")));

  check("qa coverage has more than 40 rules", () => assert.ok(gameplayQa >= 48));
}

{
  let seed = 7;
  const seededRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const templateIds = SpotTemplateEngine.templates.map((template) => template.id);
  assert.ok(templateIds.includes("btn-shove-25-bb-call"), "evolutive engine must include BTN 25bb shove template");
  assert.ok(templateIds.includes("srp-btn-bb-flop-cbet"), "evolutive engine must include SRP cbet template");
  assert.ok(templateIds.includes("river-bluffcatch"), "evolutive engine must include river bluffcatch template");

  const queue = buildTrainerIntegrationQueue({
    count: 24,
    filters: { fmt: "Tous", hp: "Tous", vp: "Tous", vt: "Tous", adaptiveMode: "balanced" },
    adaptiveMode: "balanced",
    random: seededRandom,
  });
  assert.equal(queue.length, 24, "evolutive engine returns the requested queue size");
  for (const spot of queue.slice(0, 12)) {
    const strict = validateSpotConsistency(spot, spot.ctx || {}, { requireVillain: true });
    assert.equal(strict.ok, true, `generated spot must be strict-valid: ${spot.id} ${strict.errors?.join(", ") || ""}`);
    assert.ok(spot.aiMeta?.engine, "generated spot carries AI metadata for Coach integration");
  }

  const push = SpotGenerationEngine.generateSpot({
    templateId: "btn-shove-25-bb-call",
    stackDepth: 25,
    random: seededRandom,
  });
  assert.equal(push.stack, "25bb", "template request keeps the 25bb effective stack");
  assert.equal(validateSpotConsistency(push, push.ctx || {}, { requireVillain: true }).ok, true, "25bb shove spot is strict-valid");
  const allInAction = push.acts.find((action) => action.id === "ALLIN");
  const allInEvent = normalizeTrainerActionEvent({
    rawAction: allInAction,
    actorSeat: "BTN",
    street: "Preflop",
    potBefore: push.pot,
    amountToCallBeforeAction: 0,
    stack: push.stack,
  });
  assert.equal(allInEvent.displayAmount, 25, "AI shove keeps 25bb display amount");
  assert.equal(allInEvent.actionType, "ALLIN", "AI shove is normalized as all-in");

  const imported = createTrainingSpotFromHand({
    id: "hand-qa-1",
    heroPos: "BB",
    villainPos: "BTN",
    street: "Flop",
    board: ["As", "7d", "2c"],
    pot: 6,
    toCall: 2,
    hand: ["Ks", "Qs"],
    stack: 40,
    format: "Imported Hand",
  });
  assert.equal(validateSpotConsistency(imported, imported.ctx || {}, { requireVillain: true }).ok, true, "Replayer hand transforms into a strict-valid trainer spot");
  assert.ok(describeCoachSpot(imported).prompts.length >= 2, "Coach AI prompts are exposed for imported spots");

  const leakHistory = [
    { result: "err", hero: "BB", hpos: "BB", street: "River", cat: "River", evLoss: 2.2 },
    { result: "err", hero: "BB", hpos: "BB", street: "River", cat: "River", evLoss: 1.8 },
    { result: "err", hero: "BB", hpos: "BB", street: "Flop", cat: "Vs Open", evLoss: 1.1 },
  ];
  const leakQueue = buildTrainerIntegrationQueue({
    count: 30,
    filters: {},
    adaptiveMode: "leak-hunter",
    history: leakHistory,
    random: seededRandom,
  });
  assert.equal(leakQueue.length, 30, "leak hunter returns a full training queue");
  assert.ok(
    leakQueue.some((spot) => spot.aiMeta?.leakFocus?.position === "BB" || spot.aiMeta?.leakFocus?.street === "River"),
    "leak hunter stores the detected weak axis in generated spots"
  );

  const population = PopulationModelEngine.resolve({ field: "Micro-limites" }, "exploit", "winamax");
  assert.equal(population.id, "winamax-low", "population model resolves Winamax low-stakes exploit profile");
  assert.ok(countEvolutiveSpots({ filters: {} }) >= 20, "spot counter includes evolutive templates");
}

console.log("trainer round engine tests passed");
