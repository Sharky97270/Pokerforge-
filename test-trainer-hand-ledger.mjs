/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-hand-ledger — C2 : TAPIS RÉELS PAR SIÈGE, ENGAGEMENTS DÉBITÉS

   Le défaut corrigé : `const displayStack = isH ? spot.stack : 60`. Le tapis
   adverse n'était pas lu, il était écrit en dur — 58 mains sur 60 portaient
   « 60bb » sur tous les sièges non-Hero, quel que soit le spot, le format ou le
   filtre de profondeur. D'où 29 SPR sur 60 incohérents avec les tapis peints.

   Invariants verrouillés ici :
     ① stackInitial = stackRestant + engagementTotal, pour CHAQUE siège ;
     ② aucun tapis négatif ;
     ③ Σ engagements = pot (le pot est reconstructible depuis les sièges) ;
     ④ SPR = plus petit tapis actif restant / pot courant ;
     ⑤ le tapis adverse SUIT le spot (profondeur, filtre, engagement).
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { trainerHandLedger, auditHandLedger, parseDepthBb, LEDGER_EPSILON } from "./src/trainerHandLedger.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 0.011) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

const SEATS6 = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

/* Contrôle systématique : les trois invariants de conservation. */
function conserve(l, m) {
  eq(auditHandLedger({ seats: l.seats, pot: l.pot }), [], m);
  for (const p of Object.keys(l.seats)) {
    const s = l.seats[p];
    near(s.remaining + s.total, s.initial, `${m} — ${p} : initial = restant + engagé`);
    ok(s.remaining >= -LEDGER_EPSILON, `${m} — ${p} : tapis non négatif`);
  }
}

/* ── 1. Préflop : un open du CO, tapis de 100bb ─────────────────────────── */
{
  const spot = { hpos: "BTN", vpos: "CO", street: "Preflop", stack: "100bb", pot: 4.5, toCall: 2.5, nplayers: 6 };
  const l = trainerHandLedger({
    spot, ctx: { preActions: [] }, seatOrder: SEATS6,
    streetContributions: { SB: 0.5, BB: 1, CO: 2.5 }, pot: 4,
    seatStates: {}, toCall: 2.5,
  });
  near(l.depthBb, 100, "profondeur lue sur le spot");
  near(l.seats.CO.remaining, 97.5, "le CO qui a ouvert à 2.5bb n'a plus que 97.5bb");
  near(l.seats.SB.remaining, 99.5, "la SB est débitée de sa blinde");
  near(l.seats.BB.remaining, 99, "la BB est débitée de sa blinde");
  near(l.seats.BTN.remaining, 100, "Hero au BTN n'a rien engagé");
  near(l.seats.UTG.remaining, 100, "un siège qui n'a rien mis garde son tapis");
  ok(l.seats.CO.remaining !== 60 && l.seats.SB.remaining !== 60, "aucun siège ne porte la constante 60");
  conserve(l, "open préflop");
}

/* ── 2. Le tapis adverse SUIT le spot (le cœur de M1) ───────────────────── */
{
  const mesure = depth => {
    const spot = { hpos: "BTN", vpos: "CO", street: "Preflop", stack: `${depth}bb`, pot: 4, toCall: 2.5, nplayers: 6 };
    return trainerHandLedger({
      spot, ctx: { preActions: [] }, seatOrder: SEATS6,
      streetContributions: { SB: 0.5, BB: 1, CO: 2.5 }, pot: 4, seatStates: {},
    });
  };
  const tapis = [10, 20, 60, 100, 200].map(d => ({ d, co: mesure(d).seats.CO.remaining }));
  for (const t of tapis) near(t.co, t.d - 2.5, `profondeur ${t.d}bb → tapis adverse ${t.d - 2.5}bb`);
  eq(new Set(tapis.map(t => t.co)).size, tapis.length, "cinq profondeurs, cinq tapis DIFFÉRENTS (plus de constante)");

  /* Un vilain qui vient de 4-better à 27bb ne peut pas afficher 60bb. */
  const spot4b = { hpos: "BTN", vpos: "CO", street: "Preflop", stack: "100bb", pot: 36.5, toCall: 18, nplayers: 6 };
  const l = trainerHandLedger({
    spot: spot4b, ctx: { preActions: [] }, seatOrder: SEATS6,
    streetContributions: { SB: 0.5, BB: 1, CO: 27, BTN: 9 }, pot: 37.5, seatStates: {}, toCall: 18,
  });
  near(l.seats.CO.remaining, 73, "le 4-betteur à 27bb affiche 73bb, pas 60bb");
  near(l.seats.BTN.remaining, 91, "Hero a 9bb engagés : 91bb restants");
  conserve(l, "face à un 4-bet");
}

/* ── 3. SPR : le plus court tapis ACTIF divise le pot ───────────────────── */
{
  const spot = { hpos: "BTN", vpos: "BB", street: "Flop", stack: "100bb", pot: 21, toCall: 0, nplayers: 6 };
  const l = trainerHandLedger({
    spot,
    ctx: { preActions: [
      { position: "BTN", actionType: "RAISE", amountBb: 10, street: "Préflop" },
      { position: "BB", actionType: "CALL", amountBb: 10, street: "Préflop" },
      { position: "SB", actionType: "FOLD", amountBb: 0.5, street: "Préflop" },
    ] },
    seatOrder: SEATS6, streetContributions: {}, pot: 21,
    seatStates: { UTG: { folded: true }, HJ: { folded: true }, CO: { folded: true }, SB: { folded: true } },
  });
  near(l.potCarried, 21, "tout le pot vient des streets précédentes");
  near(l.seats.BTN.carried + l.seats.BB.carried + l.seats.SB.carried, 21,
    "le pot reporté est attribué aux joueurs de la ligne, blinde morte de la SB comprise");
  ok(l.seats.SB.carried > 0 && l.seats.SB.remaining < 100,
    `la blinde de la SB couchée est bien sortie de son tapis (${l.seats.SB.remaining}bb)`);
  near(l.effectiveStack, Math.min(l.seats.BTN.remaining, l.seats.BB.remaining), "tapis effectif = plus court ACTIF");
  ok(l.effectiveStack < 100, `le tapis effectif est débité (${l.effectiveStack}bb)`);
  near(l.spr, Math.round((l.effectiveStack / 21) * 10) / 10, "SPR = tapis effectif / pot");
  /* Le SPR d'avant (100/21 = 4.8) était plus haut que le vrai. */
  ok(l.spr < 100 / 21, `SPR ${l.spr} < 4.8 (l'ancien SPR ignorait les engagements)`);
  conserve(l, "spot de flop");
}

/* ── 4. Un siège couché ne fixe plus le tapis effectif ──────────────────── */
{
  const spot = { hpos: "BTN", vpos: "BB", street: "Preflop", stack: "50bb", pot: 4, toCall: 0, nplayers: 6 };
  const base = { spot, ctx: { preActions: [] }, seatOrder: SEATS6, streetContributions: { SB: 0.5, BB: 1, CO: 2.5 }, pot: 4 };
  const avec = trainerHandLedger({ ...base, seatStates: {} });
  const sans = trainerHandLedger({ ...base, seatStates: { CO: { folded: true } } });
  near(avec.effectiveStack, 47.5, "le CO engagé à 2.5bb est le plus court quand il est actif");
  near(sans.effectiveStack, 49, "couché, il ne compte plus : c'est la BB (49bb) qui est la plus courte");
  conserve(avec, "tapis effectif avec CO actif");
  conserve(sans, "tapis effectif avec CO couché");
}

/* ── 5. Coup complet : le moteur Full Hand est la source ────────────────── */
{
  const spot = { hpos: "BTN", vpos: "BB", street: "Flop", stack: "20bb", pot: 5, nplayers: 6 };
  const fh = {
    pot: 13, heroStack: 13.5, villStack: 13.5,
    contrib: { hero: 4, villain: 4 },
    committedBefore: { hero: 2.5, villain: 2.5 },
  };
  const l = trainerHandLedger({
    spot, ctx: { preActions: [] }, seatOrder: SEATS6, streetContributions: {},
    pot: 5, seatStates: {}, fullHandState: fh,
  });
  near(l.pot, 13, "le pot lu est celui du moteur");
  near(l.seats.BTN.remaining, 13.5, "tapis Hero = celui du moteur");
  near(l.seats.BB.remaining, 13.5, "tapis Vilain = celui du moteur");
  near(l.seats.BTN.initial, 20, "profondeur reconstituée : 13.5 + 2.5 + 4 = 20bb");
  near(l.seats.BTN.remaining + l.seats.BTN.total, 20, "conservation côté Hero");
  near(l.effectiveStack, 13.5, "tapis effectif du coup complet");
  near(l.spr, Math.round((13.5 / 13) * 10) / 10, "SPR du coup complet");
  /* Aucun jeton créé : deux tapis de 20bb, pot 13 + 13.5 + 13.5 = 40. */
  near(l.seats.BTN.remaining + l.seats.BB.remaining + l.pot, 40, "40bb pour deux joueurs à 20bb — rien de créé");
}

/* ── 6. Cotes du pot ────────────────────────────────────────────────────── */
{
  const spot = { hpos: "BB", vpos: "CO", street: "Preflop", stack: "100bb", pot: 36.5, toCall: 18, nplayers: 6 };
  const l = trainerHandLedger({ spot, ctx: { preActions: [] }, seatOrder: SEATS6, streetContributions: { SB: 0.5, BB: 9, CO: 27 }, pot: 36.5, seatStates: {}, toCall: 18 });
  eq(l.potOdds, 33, "à payer 18bb dans un pot de 36.5 → 33 %");
  const sansMise = trainerHandLedger({ spot: { ...spot, toCall: 0 }, ctx: { preActions: [] }, seatOrder: SEATS6, streetContributions: { SB: 0.5, BB: 1 }, pot: 1.5, seatStates: {}, toCall: 0 });
  eq(sansMise.potOdds, null, "rien à payer → pas de cote inventée");
}

/* ── 7. Robustesse : profondeur illisible, siège inconnu ────────────────── */
{
  eq(parseDepthBb("200bb"), 200, "profondeur parsée");
  eq(parseDepthBb(""), 0, "profondeur vide = 0, jamais une constante");
  eq(parseDepthBb(null), 0, "profondeur absente = 0");
  const l = trainerHandLedger({});
  eq(l.problems, [], "un appel vide ne produit pas d'incohérence");
  eq(l.spr, null, "pot nul → pas de SPR inventé");
}

/* ── 8. Balayage : 5 profondeurs × 4 lignes, conservation partout ───────── */
{
  const lignes = [
    { nom: "RFI", contrib: { SB: 0.5, BB: 1 }, pot: 1.5, hpos: "CO", vpos: "BB", toCall: 0 },
    { nom: "vs open", contrib: { SB: 0.5, BB: 1, CO: 2.5 }, pot: 4, hpos: "BTN", vpos: "CO", toCall: 2.5 },
    { nom: "vs 3-bet", contrib: { SB: 0.5, BB: 9, CO: 2.5 }, pot: 12, hpos: "CO", vpos: "BB", toCall: 6.5 },
    { nom: "vs 4-bet", contrib: { SB: 0.5, BB: 9, CO: 27 }, pot: 36.5, hpos: "BB", vpos: "CO", toCall: 18 },
  ];
  let controles = 0, ecarts = 0, tapisDistincts = new Set(), impossibles = 0;
  for (const depth of [10, 20, 40, 100, 200]) {
    for (const li of lignes) {
      /* Une ligne qui engage plus que la profondeur décrit un spot IMPOSSIBLE
         (4-bet à 27bb avec 10bb devant soi). Le ledger doit le SIGNALER, pas
         l'absorber : on le vérifie à part et on ne le compte pas comme une
         combinaison jouable. */
      const engageMax = Math.max(...Object.values(li.contrib));
      if (engageMax > depth) {
        const spotKo = { hpos: li.hpos, vpos: li.vpos, street: "Preflop", stack: `${depth}bb`, pot: li.pot, toCall: li.toCall, nplayers: 6 };
        const ko = trainerHandLedger({ spot: spotKo, ctx: { preActions: [] }, seatOrder: SEATS6, streetContributions: li.contrib, pot: li.pot, seatStates: {}, toCall: li.toCall });
        ok(ko.problems.some(p => p.code === "siege-non-conserve"),
          `${li.nom} à ${depth}bb est impossible et le ledger le dit`);
        impossibles++;
        continue;
      }
      const spot = { hpos: li.hpos, vpos: li.vpos, street: "Preflop", stack: `${depth}bb`, pot: li.pot, toCall: li.toCall, nplayers: 6 };
      const l = trainerHandLedger({ spot, ctx: { preActions: [] }, seatOrder: SEATS6, streetContributions: li.contrib, pot: li.pot, seatStates: {}, toCall: li.toCall });
      controles++;
      if (auditHandLedger({ seats: l.seats, pot: l.pot }).length) ecarts++;
      for (const p of SEATS6) {
        const s = l.seats[p];
        if (Math.abs(s.remaining + s.total - s.initial) > LEDGER_EPSILON) ecarts++;
        if (s.remaining < 0) ecarts++;
        tapisDistincts.add(`${p}:${s.remaining}`);
      }
      /* Le SPR affiché doit toujours être celui du plus court tapis actif. */
      const actifs = SEATS6.map(p => l.seats[p].remaining);
      const attendu = Math.round((Math.min(...actifs) / li.pot) * 10) / 10;
      if (l.spr !== attendu) ecarts++;
    }
  }
  eq(controles + impossibles, 20, "20 combinaisons profondeur × ligne mesurées");
  ok(impossibles === 2, `${impossibles} combinaison(s) impossible(s) détectée(s) et signalée(s)`);
  eq(ecarts, 0, "0 écart de conservation, de tapis négatif ou de SPR sur les 20 combinaisons");
  ok(tapisDistincts.size > 20, `${tapisDistincts.size} valeurs de tapis distinctes — plus aucune constante`);
}

console.log(`✅ ledger de main du Trainer (C2) — ${passed} assertions OK`);
