/* test-trainer-solution-scope.mjs — PÉRIMÈTRE DE VALIDITÉ DU SOLVEUR (Lot 3)

   Ce que ce fichier prouve, et pourquoi il existe :
   le moteur push/fold embarqué déclare lui-même « HEADS-UP uniquement » et
   « chip-EV pur » (src/solver/core/pushfold.js). Avant correction, le Trainer
   l'appliquait à n'importe quel spot préflop de tapis entier ≤ 30bb — donc à un
   BTN de Cash 6-max et à un Spin & Go — puis affichait « calcul exact ».
   Les cas ci-dessous verrouillent la frontière dans les DEUX sens : ce qui doit
   rester résolu l'est, ce qui sort du modèle est refusé AVEC un motif lisible. */
import assert from "node:assert/strict";
import {
  pushFoldDomain, livePositionsAtDecision, payoutModelOf, tableSizeOf,
  scopeLimitLabel, PAYOUT, PUSHFOLD_MAX_BB,
} from "./src/trainerSolutionScope.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

const jamSpot = (o = {}) => ({
  street: "Preflop", stack: "10bb", toCall: 0, hpos: "SB", vpos: "BB",
  fmt: "Cash HU", nplayers: 2, acts: [{ id: "FOLD" }, { id: "ALLIN" }], ...o,
});
const callSpot = (o = {}) => ({
  street: "Preflop", stack: "10bb", toCall: 10, hpos: "BB", vpos: "SB",
  fmt: "Cash HU", nplayers: 2, acts: [{ id: "FOLD" }, { id: "CALL" }], ...o,
});

/* ── 1. Barème de gains ── */
{
  eq(payoutModelOf("Cash 6-max"), PAYOUT.CHIP_EV, "cash = chipEV");
  eq(payoutModelOf("MTT ChipEV"), PAYOUT.CHIP_EV, "MTT ChipEV = chipEV");
  eq(payoutModelOf("MTT ICM"), PAYOUT.ICM, "MTT ICM = ICM");
  eq(payoutModelOf("MTT Bounty/PKO"), PAYOUT.PKO, "PKO reconnu");
  eq(payoutModelOf("Spin & Go"), PAYOUT.ICM, "Spin & Go = ICM (prize pool, jamais chipEV)");
  eq(payoutModelOf(""), null, "format vide = indéterminé, PAS chipEV par défaut");
  eq(payoutModelOf("Format maison inconnu"), null, "format inconnu = indéterminé");
}

/* ── 2. Taille de table ── */
{
  eq(tableSizeOf({ nplayers: 4 }), 4, "nplayers fait foi");
  eq(tableSizeOf({ fmt: "Cash 6-max" }), 6, "6-max lu dans le format");
  eq(tableSizeOf({ fmt: "Cash 9-max" }), 9, "9-max lu dans le format");
  eq(tableSizeOf({ fmt: "Spin & Go" }), 3, "Spin & Go = 3 joueurs");
  eq(tableSizeOf({ fmt: "Bidule" }), null, "inconnu = null (jamais supposé heads-up)");
}

/* ── 3. Joueurs encore dans le coup — le défaut central ──
   Hero ouvre au BTN : SB et BB n'ont PAS encore parlé. Les compter couchés
   transformait un pot à trois en pot heads-up imaginaire. */
{
  const btn = { street: "Preflop", hpos: "BTN", vpos: "BB", fmt: "Cash 6-max" };
  const live = livePositionsAtDecision(btn);
  ok(live.includes("BTN") && live.includes("SB") && live.includes("BB"),
    `BTN qui ouvre : SB et BB sont vivants (obtenu [${live}])`);
  eq(live.length, 3, "BTN RFI 6-max = 3 joueurs concernés");

  const sb = livePositionsAtDecision({ street: "Preflop", hpos: "SB", vpos: "BB", nplayers: 6, fmt: "Cash 6-max" });
  eq(sb.sort(), ["BB", "SB"], "SB qui ouvre : seule la BB parle encore");

  const utg = livePositionsAtDecision({ street: "Preflop", hpos: "UTG", vpos: "BB", fmt: "Cash 6-max" });
  eq(utg.length, 6, "UTG premier de parole : toute la table est encore concernée");

  // Un fold EXPLICITE dans la ligne retire bien le siège.
  const folded = livePositionsAtDecision({
    street: "Preflop", hpos: "BTN", vpos: "BB", fmt: "Cash 6-max",
    preActions: [{ position: "SB", actionType: "FOLD" }],
  });
  ok(!folded.includes("SB"), "SB explicitement couchée est retirée");
}

/* ── 4. DANS le domaine : les deux seuls cas réellement résolus ── */
{
  const jam = pushFoldDomain(jamSpot());
  ok(jam.inDomain, `SB jam 10bb HU chipEV = dans le domaine (motifs: ${jam.reasons})`);
  eq(jam.scope.headsUp, true, "scope heads-up");
  eq(jam.scope.payout, PAYOUT.CHIP_EV, "scope chipEV");
  eq(scopeLimitLabel(jam), null, "aucune limite à afficher quand on est dans le domaine");

  const call = pushFoldDomain(callSpot());
  ok(call.inDomain, `BB call d'un jam 10bb HU = dans le domaine (motifs: ${call.reasons})`);
  eq(call.scope.facing, "jam", "scope: face à un jam");
}

/* ── 5. HORS domaine — chaque motif est vérifié séparément ── */
{
  // ① Le cas observé à l'écran le 2026-08-21 en 2T.
  const btn = pushFoldDomain({
    street: "Preflop", stack: "25bb", toCall: 0, hpos: "BTN", vpos: "BB",
    fmt: "Cash 6-max", acts: [{ id: "FOLD" }, { id: "ALLIN" }],
  });
  ok(!btn.inDomain, "BTN 25bb Cash 6-max REFUSÉ (c'est le spot qui affichait « calcul exact »)");
  ok(btn.reasons.some(r => /heads-up/.test(r)), `motif heads-up donné (${btn.reasons})`);
  ok(scopeLimitLabel(btn), "une limite lisible est fournie");

  // ② ICM / PKO non modélisés.
  const icm = pushFoldDomain(jamSpot({ fmt: "MTT ICM" }));
  ok(!icm.inDomain, "MTT ICM refusé");
  ok(icm.reasons.some(r => /ICM/.test(r)), `motif ICM (${icm.reasons})`);
  const pko = pushFoldDomain(jamSpot({ fmt: "MTT Bounty/PKO" }));
  ok(!pko.inDomain, "PKO refusé");
  const spin = pushFoldDomain(jamSpot({ fmt: "Spin & Go", nplayers: 2 }));
  ok(!spin.inDomain, "Spin & Go refusé même en tête-à-tête (barème ICM)");

  // ③ Profondeur.
  ok(!pushFoldDomain(jamSpot({ stack: "40bb" })).inDomain, "40bb hors profondeur résolue");
  ok(!pushFoldDomain(jamSpot({ stack: "12.5bb" })).inDomain, "tapis fractionnaire non tabulé");
  ok(pushFoldDomain(jamSpot({ stack: PUSHFOLD_MAX_BB + "bb" })).inDomain, `${PUSHFOLD_MAX_BB}bb = borne incluse`);
  ok(!pushFoldDomain(jamSpot({ stack: (PUSHFOLD_MAX_BB + 1) + "bb" })).inDomain, `${PUSHFOLD_MAX_BB + 1}bb = hors borne`);

  // ④ Street.
  ok(!pushFoldDomain(jamSpot({ street: "Flop" })).inDomain, "postflop refusé");

  // ⑤ Structure de blindes : BTN vs BB après fold de SB reste hors modèle —
  //    deux joueurs, mais Hero n'a rien posté, donc le risque du jam n'est pas −0.5bb.
  const btnVsBb = pushFoldDomain({
    street: "Preflop", stack: "12bb", toCall: 0, hpos: "BTN", vpos: "BB", fmt: "Cash 6-max", nplayers: 3,
    preActions: [{ position: "SB", actionType: "FOLD" }],
    acts: [{ id: "FOLD" }, { id: "ALLIN" }],
  });
  ok(!btnVsBb.inDomain, "BTN vs BB (SB couchée) refusé : ce n'est pas SB vs BB");
  ok(btnVsBb.reasons.some(r => /structure|jam de SB|ouvre/.test(r)), `motif de structure (${btnVsBb.reasons})`);

  // ⑥ Mauvais côté du jam.
  const sbFacing = pushFoldDomain(callSpot({ hpos: "SB", vpos: "BB" }));
  ok(!sbFacing.inDomain, "SB face à un jam : non résolu par ce modèle");

  // ⑦ Format absent = indéterminé, donc refusé (on ne parie pas sur chipEV).
  const noFmt = pushFoldDomain(jamSpot({ fmt: undefined }));
  ok(!noFmt.inDomain, "format absent refusé");
  ok(noFmt.reasons.some(r => /barème/.test(r)), `motif barème indéterminé (${noFmt.reasons})`);
}

/* ── 6. Un refus doit TOUJOURS être motivé (jamais un « non » muet) ── */
{
  const spots = [
    { street: "Preflop", stack: "25bb", toCall: 0, hpos: "BTN", vpos: "BB", fmt: "Cash 6-max", acts: [{ id: "FOLD" }, { id: "ALLIN" }] },
    jamSpot({ fmt: "MTT ICM" }), jamSpot({ stack: "80bb" }), jamSpot({ street: "River" }), {},
  ];
  for (const s of spots) {
    const d = pushFoldDomain(s);
    if (!d.inDomain) ok(d.reasons.length > 0 && d.reasons.every(r => typeof r === "string" && r.length > 5),
      "chaque refus porte au moins un motif lisible");
  }
}

console.log(`✅ trainerSolutionScope (Lot 3 — périmètre de validité) — ${passed} assertions OK`);
