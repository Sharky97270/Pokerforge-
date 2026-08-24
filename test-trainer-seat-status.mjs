/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-seat-status — C9 : AUCUN SIÈGE COUCHÉ AVANT D'AVOIR PARLÉ

   Le défaut corrigé : le rendu terminait par
       allPositions.forEach(pos => { if(!inHand && !folded) folded = true; })
   donc tout siège qui n'était ni Hero ni le vilain portait le badge FOLD.
   Mesuré à l'écran : spot « CO premier à parler » → BTN, SB et BB marqués FOLD
   alors que le BTN parle APRÈS le CO.

   Règle verrouillée ici : le badge FOLD n'apparaît QUE derrière une action de
   fold réellement enregistrée.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { trainerSeatStatuses, canShowFoldBadge, SEAT_STATUS } from "./src/trainerSeatStatus.js";
import { POSITIONS_BY_SIZE } from "./src/data/content.js";
import { buildPreflopLine } from "./src/preflopLine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const SIX = POSITIONS_BY_SIZE[6];

/* ── 1. RFI au CO : personne après lui n'est couché ─────────────────────── */
{
  const spot = { hpos: "CO", vpos: "BB", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 0, acts: [{ id: "FOLD" }, { id: "RAISE" }] };
  const ctx = { preActions: [
    { position: "UTG", actionType: "FOLD", amountBb: 0 },
    { position: "HJ", actionType: "FOLD", amountBb: 0 },
  ] };
  const st = trainerSeatStatuses({ spot, ctx, seatOrder: SIX, activePlayerId: "hero" });
  eq(st.UTG.status, SEAT_STATUS.FOLDED, "UTG s'est réellement couché");
  eq(st.HJ.status, SEAT_STATUS.FOLDED, "HJ aussi");
  eq(st.CO.status, SEAT_STATUS.TO_ACT, "c'est au CO de parler");
  for (const p of ["BTN", "SB", "BB"]) {
    ok(!st[p].folded, `${p} parle après le CO : il n'est PAS couché`);
    eq(st[p].badge, null, `${p} ne porte aucun badge`);
    eq(st[p].status, SEAT_STATUS.WAITING, `${p} est en attente`);
    ok(!canShowFoldBadge(st[p]), `${p} n'a pas le droit au badge FOLD`);
  }
}

/* ── 2. RFI au BTN : la SB ne doit pas afficher FOLD ────────────────────── */
{
  const spot = { hpos: "BTN", vpos: "BB", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 0, acts: [{ id: "FOLD" }, { id: "RAISE" }] };
  const ctx = { preActions: ["UTG", "HJ", "CO"].map(p => ({ position: p, actionType: "FOLD", amountBb: 0 })) };
  const st = trainerSeatStatuses({ spot, ctx, seatOrder: SIX, activePlayerId: "hero" });
  ok(!st.SB.folded, "la SB parle après le BTN : elle n'est pas couchée (défaut relevé à l'écran)");
  ok(!st.BB.folded, "la BB non plus");
  eq(["UTG", "HJ", "CO"].filter(p => st[p].folded).length, 3, "les trois sièges qui ont fold le sont");
}

/* ── 3. Un fold enregistré est respecté ─────────────────────────────────── */
{
  const spot = { hpos: "BB", vpos: "CO", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 2.5, acts: [{ id: "FOLD" }, { id: "CALL" }] };
  const ctx = { preActions: [
    { position: "UTG", actionType: "FOLD" }, { position: "HJ", actionType: "FOLD" },
    { position: "CO", actionType: "RAISE", amountBb: 2.5 },
    { position: "BTN", actionType: "FOLD" }, { position: "SB", actionType: "FOLD" },
  ] };
  const st = trainerSeatStatuses({ spot, ctx, seatOrder: SIX, activePlayerId: "hero" });
  eq(st.BTN.status, SEAT_STATUS.FOLDED, "le BTN a une action de fold : il est couché");
  eq(st.BTN.badge, "FOLD", "et il porte le badge");
  eq(st.CO.status, SEAT_STATUS.ACTIVE, "le CO a ouvert : il est actif");
  eq(st.BB.status, SEAT_STATUS.TO_ACT, "c'est à la BB de parler");
}

/* ── 4. Hero qui se couche est marqué couché ────────────────────────────── */
{
  const spot = { hpos: "CO", vpos: "BB", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 0, acts: [{ id: "FOLD", l: "Fold" }, { id: "RAISE", l: "Open" }] };
  const st = trainerSeatStatuses({ spot, ctx: { preActions: [] }, seatOrder: SIX, answered: 0 });
  eq(st.CO.status, SEAT_STATUS.FOLDED, "Hero a choisi Fold : il est couché");
  const st2 = trainerSeatStatuses({ spot, ctx: { preActions: [] }, seatOrder: SIX, answered: 1 });
  ok(!st2.CO.folded, "Hero a ouvert : il n'est pas couché");
}

/* ── 5. Le tapis engagé fait un statut ALL-IN ───────────────────────────── */
{
  const spot = { hpos: "BTN", vpos: "BB", street: "Preflop", stack: "10bb", nplayers: 6, toCall: 0, acts: [{ id: "FOLD" }, { id: "ALLIN" }] };
  const ledgerSeats = {
    BTN: { remaining: 0, total: 10 }, BB: { remaining: 9, total: 1 }, SB: { remaining: 9.5, total: 0.5 },
    UTG: { remaining: 10, total: 0 }, HJ: { remaining: 10, total: 0 }, CO: { remaining: 10, total: 0 },
  };
  const st = trainerSeatStatuses({ spot, ctx: { preActions: [] }, seatOrder: SIX, ledgerSeats });
  eq(st.BTN.status, SEAT_STATUS.ALL_IN, "un tapis entièrement engagé donne ALL-IN");
  eq(st.BTN.badge, "ALL-IN", "et le badge correspondant");
  ok(!st.BTN.folded, "un joueur à tapis n'est pas couché");
  ok(!st.SB.allIn, "un siège qui a seulement posté sa blinde n'est pas à tapis");
}

/* ── 6. Le vilain qui se couche pendant la main ─────────────────────────── */
{
  const spot = { hpos: "CO", vpos: "BB", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 0, acts: [{ id: "RAISE" }] };
  const st = trainerSeatStatuses({ spot, ctx: { preActions: [] }, seatOrder: SIX, vact: { action: "FOLD" } });
  eq(st.BB.status, SEAT_STATUS.FOLDED, "le vilain a fold : il est couché");
  const st2 = trainerSeatStatuses({ spot, ctx: { preActions: [] }, seatOrder: SIX, vact: { action: "CALL" } });
  ok(!st2.BB.folded, "le vilain a suivi : il reste dans le coup");
}

/* ── 7. Balayage 6-max : jamais de FOLD sans action de fold ─────────────── */
{
  let controles = 0, badgesInjustifies = 0, waiting = 0;
  for (const hpos of SIX) {
    const idx = SIX.indexOf(hpos);
    /* La ligne enregistre désormais AUSSI le fold des blindes qui parlent avant
       Hero (correction apportée à `buildPreflopLine` et `buildSpotContext`) :
       aucun siège ne sort du coup sans action tracée. */
    const avant = SIX.slice(0, idx);
    const ctx = { preActions: avant.map(p => ({ position: p, actionType: "FOLD", amountBb: 0 })) };
    const vpos = SIX[(idx + 1) % SIX.length];
    const spot = { hpos, vpos, street: "Preflop", stack: "100bb", nplayers: 6, toCall: 0, acts: [{ id: "FOLD" }, { id: "RAISE" }] };
    const st = trainerSeatStatuses({ spot, ctx, seatOrder: SIX, activePlayerId: "hero" });
    const foldes = new Set(avant);
    for (const p of SIX) {
      controles++;
      if (st[p].badge === "FOLD" && !foldes.has(p)) badgesInjustifies++;
      if (st[p].status === SEAT_STATUS.WAITING) waiting++;
    }
  }
  eq(controles, 36, "36 contrôles (6 positions Hero × 6 sièges)");
  eq(badgesInjustifies, 0, "0 badge FOLD sans action de fold enregistrée");
  ok(waiting > 0, `${waiting} sièges correctement marqués « en attente » (statut qui n'existait pas)`);
}

/* ── 8. Tables denses (9-max) : l'ordre de parole reste celui du 9-max ──── */
{
  const NEUF = POSITIONS_BY_SIZE[9];
  const spot = { hpos: "MP", vpos: "BB", street: "Preflop", stack: "100bb", nplayers: 9, toCall: 0, acts: [{ id: "FOLD" }, { id: "RAISE" }] };
  const idx = NEUF.indexOf("MP");
  const ctx = { preActions: NEUF.slice(0, idx).map(p => ({ position: p, actionType: "FOLD", amountBb: 0 })) };
  const st = trainerSeatStatuses({ spot, ctx, seatOrder: NEUF, activePlayerId: "hero" });
  for (const p of NEUF.slice(idx + 1)) ok(!st[p].folded, `${p} parle après MP en 9-max : pas de fold`);
  for (const p of NEUF.slice(0, idx)) eq(st[p].folded, true, `${p} parle avant MP et a fold`);
}

/* ── 9. La ligne préflop ENREGISTRE le fold des blindes (source du C9) ──── */
{
  /* « BB défend face à un open du CO » : la SB parle avant Hero et sort du
     coup. Sans action enregistrée, le rendu ne pouvait que le DEVINER. */
  const spot = { hpos: "BB", vpos: "CO", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 1.5, cat: "Vs Open", acts: [{ id: "FOLD" }, { id: "CALL" }] };
  const ligne = buildPreflopLine(spot);
  ok(!!ligne, "la ligne est construite");
  const foldSB = ligne.actions.find(a => a.position === "SB" && a.actionType === "FOLD");
  ok(!!foldSB, "le fold de la SB est enregistré dans la ligne");
  eq(foldSB.amountBb, 0, "un fold vaut 0bb : il ne retire pas la blinde du pot");
  eq(ligne.committed.SB, 0.5, "la blinde de la SB reste dans sa colonne d'engagement");
  const st = trainerSeatStatuses({ spot: { ...spot, preActions: ligne.actions }, ctx: { preActions: ligne.actions }, seatOrder: SIX, activePlayerId: "hero" });
  eq(st.SB.status, SEAT_STATUS.FOLDED, "la SB est couchée SUR UNE ACTION, pas par déduction");
  eq(st.CO.status, SEAT_STATUS.ACTIVE, "le CO qui a ouvert reste actif");
  eq(st.BB.status, SEAT_STATUS.TO_ACT, "c'est à Hero de parler");
}

console.log(`✅ statuts de siège du Trainer (C9) — ${passed} assertions OK`);
