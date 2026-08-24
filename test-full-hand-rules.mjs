/* ══════════════════════════════════════════════════════════════════════════
   test-full-hand-rules — C3 / C7 / C8 : RÈGLES DE NO-LIMIT ET COMPTABILITÉ

   Ce que ce fichier prouve, main par main :
     ① aucun jeton n'est créé ni détruit — tapis + pot est constant ;
     ② les tapis entrent au flop DÉJÀ débités du préflop ;
     ③ la portion non suivie d'une mise revient à son propriétaire ;
     ④ une relance sous le minimum légal est REFUSÉE ;
     ⑤ un all-in incomplet ne rouvre pas l'action ;
     ⑥ une égalité partage le pot, elle ne le donne pas ;
     ⑦ le pot est versé aux tapis — jamais orphelin ;
     ⑧ le résultat net en bb se dérive du ledger.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  createFullHand, applyAction, legalActions, amountToCall, raiseBounds,
  auditLedger, splitPot, playVillain, defaultVillainPolicy, stackOf,
} from "./src/fullHandEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 0.001) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

const C = (r, s) => ({ r, s });
/* Board fixe : Hero touche la quinte, le Vilain a une petite paire. */
const BOARD = [C("Q", "♠"), C("J", "♦"), C("T", "♣"), C("2", "♥"), C("7", "♠")];
const HERO_FORT = [C("A", "♥"), C("K", "♥")];        // AKQJT — quinte
const VIL_FAIBLE = [C("3", "♠"), C("3", "♦")];       // brelan de 3 ? non : paire de 3
const HERO_EGAL = [C("A", "♥"), C("K", "♥")];
const VIL_EGAL = [C("A", "♠"), C("K", "♣")];         // même quinte → split

const conserve = (s, m) => { eq(auditLedger(s), [], m); };

/* ── 1. Conservation : rien n'est créé, rien ne disparaît ───────────────── */
{
  let s = createFullHand({ heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD, startPot: 8, heroStack: 16, villStack: 16, firstToAct: "hero" });
  near(s.totalChips, 40, "total = 16 + 16 + 8");
  conserve(s, "conservation à la création");
  s = applyAction(s, "hero", { type: "BET", amount: 4 });
  near(s.heroStack, 12, "tapis Hero débité de 4");
  near(s.pot, 12, "pot = 8 + 4");
  conserve(s, "conservation après la mise");
  s = applyAction(s, "villain", { type: "CALL" });
  near(s.pot, 16, "pot = 8 + 4 + 4");
  near(s.villStack, 12, "tapis Vilain débité de 4");
  conserve(s, "conservation après le call");
  eq(s.street, "turn", "la street s'est fermée");
  eq(s.contrib, { hero: 0, villain: 0 }, "engagements de street remis à zéro sans recrédit");
}

/* ── 2. C3 — les tapis entrent au flop DÉJÀ débités du préflop ──────────── */
{
  /* Le cas de l'audit : deux joueurs à 20bb, 2.5bb chacun engagés au préflop.
     Pot 5bb… mais chaque tapis ne vaut plus que 17.5bb. */
  const depart = 20, engage = 2.5;
  const s = createFullHand({
    heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD,
    startPot: engage * 2, heroStack: depart - engage, villStack: depart - engage,
    heroCommittedBefore: engage, villCommittedBefore: engage, firstToAct: "hero",
  });
  near(s.heroStack, 17.5, "tapis Hero au flop = 20 − 2.5");
  near(s.villStack, 17.5, "tapis Vilain au flop = 20 − 2.5");
  near(s.heroStack + s.villStack + s.pot, depart * 2, "aucun jeton créé : 40bb pour deux tapis de 20bb");
  conserve(s, "conservation avec engagements préflop");
}

/* ── 3. C8① — la mise non suivie revient à son propriétaire ─────────────── */
{
  /* Hero mise 40bb ; le Vilain n'a que 5bb et paie à tapis. */
  let s = createFullHand({ heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD, startPot: 10, heroStack: 60, villStack: 5, firstToAct: "hero" });
  s = applyAction(s, "hero", { type: "BET", amount: 40 });
  near(s.pot, 50, "pot intermédiaire = 10 + 40");
  s = applyAction(s, "villain", { type: "CALL" });
  ok(s.done, "un tapis payé mène au showdown");
  /* Le pot disputé vaut 10 + 5 + 5 = 20bb ; les 35bb non suivis reviennent. */
  const remb = s.ledger.filter(l => l.kind === "return");
  eq(remb.length, 1, "un remboursement enregistré au ledger");
  near(remb[0].amount, 35, "35bb non suivis rendus à Hero");
  near(s.result.potAwarded, 20, "pot réellement disputé = 20bb, pas 55bb");
  near(s.heroStack, 60 - 5 + 20, "Hero : 60 − 5 misés + 20 gagnés");
  near(s.villStack, 0, "le Vilain a payé son tapis");
  conserve(s, "conservation après remboursement et attribution");

  /* Le même coup gagné par le Vilain ne peut PAS lui rapporter 55bb. */
  let t = createFullHand({ heroHand: VIL_FAIBLE, villHand: HERO_FORT, fullBoard: BOARD, startPot: 10, heroStack: 60, villStack: 5, firstToAct: "hero" });
  t = applyAction(t, "hero", { type: "BET", amount: 40 });
  t = applyAction(t, "villain", { type: "CALL" });
  eq(t.result.winner, "villain", "le Vilain gagne l'abattage");
  near(t.villStack, 20, "un tapis de 5bb encaisse 20bb, pas 55bb");
  conserve(t, "conservation quand le court double");
}

/* ── 4. C8② — la relance minimale est contrôlée ─────────────────────────── */
{
  let s = createFullHand({ heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD, startPot: 10, heroStack: 100, villStack: 100, firstToAct: "hero" });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  const b = raiseBounds(s, "villain");
  near(b.minTo, 12, "face à 6bb, la relance minimale est « to 12bb »");
  near(b.maxTo, 100, "plafond = tapis");
  const refus = applyAction(s, "villain", { type: "RAISE", amount: 6.5 });
  eq(refus, s, "une « relance » à 6.5bb face à 6bb est REFUSÉE");
  const ok12 = applyAction(s, "villain", { type: "RAISE", amount: 12 });
  near(ok12.contrib.villain, 12, "« to 12bb » accepté");
  near(amountToCall(ok12, "hero"), 6, "Hero doit 6bb de plus");
  conserve(ok12, "conservation après relance minimale");
  /* La relance suivante repart de l'incrément de 6bb : minimum « to 18 ». */
  near(raiseBounds(ok12, "hero").minTo, 18, "re-relance minimale = 12 + 6");
  eq(applyAction(ok12, "hero", { type: "RAISE", amount: 15 }), ok12, "« to 15bb » refusé (incrément incomplet)");
}

/* ── 5. C7 — aucune proposition ne dépasse le tapis ─────────────────────── */
{
  let s = createFullHand({ heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD, startPot: 10, heroStack: 14, villStack: 100, firstToAct: "hero" });
  const b = raiseBounds(s, "hero");
  near(b.maxTo, 14, "plafond = tapis restant");
  const s2 = applyAction(s, "hero", { type: "BET", amount: 999 });
  near(s2.contrib.hero, 14, "une demande de 999bb est ramenée au tapis");
  near(s2.heroStack, 0, "tapis à zéro, jamais négatif");
  conserve(s2, "conservation malgré une demande hors tapis");
  ok(s2.heroStack >= 0 && s2.villStack >= 0, "aucun tapis négatif");
}

/* ── 6. C8③ — un all-in incomplet ne rouvre pas l'action ────────────────── */
{
  let s = createFullHand({ heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD, startPot: 10, heroStack: 100, villStack: 9, firstToAct: "hero" });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  const bv = raiseBounds(s, "villain");
  ok(bv.allInOnly, "le Vilain ne peut pas faire de relance complète (9 < 12)");
  s = applyAction(s, "villain", { type: "RAISE", amount: 9 });   // tapis, incomplet
  near(s.contrib.villain, 9, "all-in incomplet accepté à sa valeur exacte");
  eq(s.raiseLocked, true, "l'action n'est pas rouverte");
  const types = legalActions(s, "hero").map(a => a.type);
  ok(!types.includes("RAISE"), `Hero ne peut plus relancer (${types.join("/")})`);
  eq(applyAction(s, "hero", { type: "RAISE", amount: 20 }), s, "une re-relance est refusée");
  const suivi = applyAction(s, "hero", { type: "CALL" });
  ok(suivi.done, "Hero suit → abattage");
  conserve(suivi, "conservation après all-in incomplet");
}

/* ── 7. C8④ — une égalité partage le pot ────────────────────────────────── */
{
  let s = createFullHand({ heroHand: HERO_EGAL, villHand: VIL_EGAL, fullBoard: BOARD, startPot: 10, heroStack: 20, villStack: 20, firstToAct: "hero" });
  s = applyAction(s, "hero", { type: "CHECK" });
  s = applyAction(s, "villain", { type: "CHECK" });
  while (!s.done && s.toAct) s = applyAction(s, s.toAct, { type: "CHECK" });
  eq(s.result.winner, "split", "même quinte → split");
  near(s.result.payout.hero, 5, "Hero reçoit la moitié");
  near(s.result.payout.villain, 5, "le Vilain reçoit la moitié");
  near(s.heroStack, 25, "le partage atteint réellement le tapis");
  near(s.villStack, 25, "idem côté Vilain");
  near(s.result.netBb.hero, 0, "résultat net nul sur un split symétrique");
  conserve(s, "conservation sur un split");

  /* Jeton indivisible : un pot de 9bb se coupe en 4.5 / 4.5 ; un pot de 9.5bb
     en 4.5 / 5, le demi-blind allant à l'OOP. */
  eq(splitPot(9, "villain"), { hero: 4.5, villain: 4.5 }, "pot pair : moitié / moitié");
  const impair = splitPot(9.5, "villain");
  near(impair.hero + impair.villain, 9.5, "le partage impair conserve le pot");
  near(impair.villain, 5, "le demi-blind indivisible va à l'OOP");
}

/* ── 8. C8⑤ — le pot est versé, jamais orphelin ─────────────────────────── */
{
  let s = createFullHand({ heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD, startPot: 6, heroStack: 30, villStack: 30, heroCommittedBefore: 3, villCommittedBefore: 3, firstToAct: "villain" });
  s = applyAction(s, "villain", { type: "BET", amount: 4 });
  s = applyAction(s, "hero", { type: "FOLD" });
  eq(s.result.winner, "villain", "Hero se couche");
  near(s.pot, 0, "le pot est vidé vers un tapis");
  const remb = s.ledger.filter(l => l.kind === "return");
  near(remb[0].amount, 4, "la mise non suivie de 4bb revient au Vilain avant l'attribution");
  near(s.villStack, 36, "le Vilain récupère sa mise puis encaisse les 6bb du pot");
  near(s.result.netBb.hero, -3, "Hero perd exactement ses 3bb engagés au préflop");
  near(s.result.netBb.villain, 3, "le Vilain gagne exactement 3bb");
  near(s.result.netBb.hero + s.result.netBb.villain, 0, "jeu à somme nulle");
  conserve(s, "conservation sur un fold");
  ok(s.ledger.some(l => l.kind === "award"), "l'attribution figure au ledger");
}

/* ── 9. Le ledger décrit chaque mouvement ───────────────────────────────── */
{
  let s = createFullHand({ heroHand: HERO_FORT, villHand: VIL_FAIBLE, fullBoard: BOARD, startPot: 6, heroStack: 40, villStack: 40, firstToAct: "hero" });
  s = applyAction(s, "hero", { type: "BET", amount: 4 });
  s = applyAction(s, "villain", { type: "RAISE", amount: 12 });
  s = applyAction(s, "hero", { type: "CALL" });
  const kinds = s.ledger.map(l => l.kind);
  ok(kinds.includes("carry") && kinds.includes("bet") && kinds.includes("raise") && kinds.includes("call") && kinds.includes("collect"),
     `le ledger trace chaque mouvement (${kinds.join(", ")})`);
  for (const l of s.ledger) ok(l.amount >= 0, "aucun montant négatif au ledger");
  conserve(s, "conservation après bet/raise/call");
}

/* ── 10. Mains complètes aléatoires : la conservation ne cède jamais ────── */
{
  let seed = 20260821 >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const RANKS = "23456789TJQKA", SUITS = "♠♥♦♣";
  let mains = 0, potsOrphelins = 0, tapisNegatifs = 0, ecarts = 0, splits = 0, folds = 0, abattages = 0;
  for (let t = 0; t < 400; t++) {
    const deck = new Set();
    while (deck.size < 9) deck.add(Math.floor(rnd() * 52));
    const cs = [...deck].map(i => ({ r: RANKS[i >> 2], s: SUITS[i & 3] }));
    const depth = [10, 20, 40, 100, 200][Math.floor(rnd() * 5)];
    const engage = Math.max(1, Math.round(depth * 0.05 * 2) / 2);
    let s = createFullHand({
      heroHand: cs.slice(0, 2), villHand: cs.slice(2, 4), fullBoard: cs.slice(4, 9),
      startPot: engage * 2, heroStack: depth - engage, villStack: depth - engage,
      heroCommittedBefore: engage, villCommittedBefore: engage,
      firstToAct: rnd() < 0.5 ? "hero" : "villain",
    });
    const attendu = depth * 2;
    let garde = 0;
    while (!s.done && garde++ < 40) {
      const actor = s.toAct;
      if (actor === "villain") { s = playVillain(s, defaultVillainPolicy, { random: rnd }); continue; }
      const acts = legalActions(s, "hero");
      const choix = acts[Math.floor(rnd() * acts.length)];
      const b = raiseBounds(s, "hero");
      const amount = choix.type === "BET" || choix.type === "RAISE"
        ? Math.min(b.maxTo, Math.max(b.minTo, Math.round((b.minTo + rnd() * b.maxTo) * 2) / 2))
        : undefined;
      const suivant = applyAction(s, "hero", { type: choix.type, ...(amount != null ? { amount } : {}) });
      if (suivant === s) { s = applyAction(s, "hero", { type: acts[0].type }); } else s = suivant;
      if (auditLedger(s).length) ecarts++;
      if (stackOf(s, "hero") < 0 || stackOf(s, "villain") < 0) tapisNegatifs++;
    }
    if (!s.done) continue;
    mains++;
    if (s.pot !== 0) potsOrphelins++;
    if (Math.abs(s.heroStack + s.villStack - attendu) > 0.001) ecarts++;
    if (Math.abs(s.result.netBb.hero + s.result.netBb.villain) > 0.001) ecarts++;
    if (s.result.winner === "split") splits++;
    if (s.result.reason === "fold") folds++; else abattages++;
  }
  ok(mains >= 350, `${mains} mains complètes jouées`);
  eq(ecarts, 0, `0 écart de conservation sur ${mains} mains`);
  eq(potsOrphelins, 0, "0 pot orphelin");
  eq(tapisNegatifs, 0, "0 tapis négatif");
  ok(folds > 0 && abattages > 0, `échantillon bilatéral : ${folds} folds / ${abattages} abattages (dont ${splits} splits)`);
}

console.log(`✅ Full Hand — règles No-Limit et comptabilité (C3/C7/C8) — ${passed} assertions OK`);
