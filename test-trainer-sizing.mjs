/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-sizing — C4 · C5 · C6 · C7 · C8 : LE MONTANT D'UNE ACTION

   Défauts mesurés que ce fichier verrouille :
     M2  le sélecteur ne pilotait rien ; « 3× » multipliait le POT (4.5bb pour
         un open) ; MIN valait 0.5 × pot, soit 0.75bb — sous la grosse blinde ;
     M3  un bouton portait DEUX montants (libellé 12bb / sélecteur 19.5) ;
     M4  cinq préréglages sur six pouvaient proposer 109.5bb à un tapis de 40 ;
     M5  l'indice venait de l'IDENTIFIANT : « Bet 50% » affichait « 33 % pot » ;
     M8  « Bet ½ » tronquait à l'entier alors que le moteur arrondissait.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  sizingContext, sizingPresets, clampRaiseTo, stepRaiseTo, resolveTrainerAction,
  actionHint, sizingSelectorVisible, roundStep, floorStep, fmtBbNum, actionFamily, followsSizingSelector,
  villainThreeBetTo, villainIsolateTo, villainBetTo, TRAINER_BB_STEP, BB,
} from "./src/trainerSizing.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 0.011) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

/* Contextes de référence. */
const OPEN = sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, BB: 1 }, heroPos: "CO", heroRemaining: 100, potBefore: 1.5, toCall: 0 });
const VS_OPEN = sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, BB: 1, CO: 2.5 }, heroPos: "BTN", heroRemaining: 100, potBefore: 4, toCall: 2.5 });
const VS_3BET = sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, CO: 2.5, BB: 9 }, heroPos: "CO", heroRemaining: 97.5, potBefore: 12, toCall: 6.5 });
const FLOP = sizingContext({ street: "Flop", streetCommitted: {}, heroPos: "BTN", heroRemaining: 89.5, potBefore: 21, toCall: 0 });
const FLOP_VS_BET = sizingContext({ street: "Flop", streetCommitted: { BB: 14 }, heroPos: "BTN", heroRemaining: 89.5, potBefore: 21, toCall: 14 });

/* ── 1. Le pas d'arrondi est unique ─────────────────────────────────────── */
{
  eq(TRAINER_BB_STEP, 0.5, "le pas officiel est le demi-blind");
  eq(roundStep(3.4), 3.5, "3.4 → 3.5");
  eq(roundStep(3.24), 3, "3.24 → 3");
  eq(roundStep(3.5), 3.5, "3.5 inchangé");
  /* Le défaut M8 : `pot*.5|0` tronquait. Le pas unique arrondit. */
  eq(roundStep(7 * 0.5), 3.5, "pot 7bb → demi-pot 3.5bb (l'ancien libellé disait 3)");
  eq(fmtBbNum(3), "3", "un entier ne porte pas de décimale");
  eq(fmtBbNum(3.5), "3.5", "un demi-blind la porte");
}

/* ── 2. MIN est le minimum LÉGAL, pas une fraction du pot ───────────────── */
{
  near(OPEN.minTo, 2, "ouverture minimale préflop = 2bb (BB + BB), pas 0.75bb");
  near(VS_OPEN.minTo, 4, "face à un open à 2.5bb : relance minimale « to 4bb » (2.5 + 1.5)");
  near(VS_3BET.minTo, 15.5, "face à un 3-bet à 9bb sur open 2.5 : 4-bet minimal « to 15.5bb »");
  near(FLOP.minTo, 1, "mise minimale postflop = 1bb");
  near(FLOP_VS_BET.minTo, 28, "face à une mise de 14bb : relance minimale « to 28bb »");
  const min = sizingPresets(OPEN).find(p => p.id === "MIN");
  near(min.raiseTo, 2, "le préréglage MIN vaut le minimum légal");
  ok(min.raiseTo >= BB, "MIN n'est jamais sous la grosse blinde");
}

/* ── 3. « 3× » désigne la grosse blinde à l'ouverture ───────────────────── */
{
  const p = sizingPresets(OPEN);
  const get = l => p.find(x => x.label === l);
  near(get("2.5×").raiseTo, 2.5, "2.5× = 2.5bb (et non 2.5 × pot = 3.75bb)");
  near(get("3×").raiseTo, 3, "3× = 3bb (l'ancien calcul donnait 4.5bb)");
  near(get("4×").raiseTo, 4, "4× = 4bb");
  eq(get("3×").unite, "3× BB", "l'unité est DITE : multiples de la grosse blinde");

  /* Face à une relance, le multiple porte sur la MISE ADVERSE, et c'est écrit. */
  const q = sizingPresets(VS_OPEN);
  near(q.find(x => x.label === "3×").raiseTo, 7.5, "face à un open de 2.5bb, 3× = 7.5bb");
  eq(q.find(x => x.label === "3×").unite, "3× la mise adverse", "l'unité change AVEC le contexte et le dit");

  /* Postflop, ce sont des fractions de pot, également dites. */
  const r = sizingPresets(FLOP);
  near(r.find(x => x.label === "50%").raiseTo, 10.5, "50 % d'un pot de 21bb = 10.5bb");
  eq(r.find(x => x.label === "50%").unite, "50% du pot", "l'unité postflop est la fraction de pot");
}

/* ── 4. C7 — aucune proposition ne dépasse le tapis ─────────────────────── */
{
  /* Le cas de l'audit : face à un 4-bet, Hero a 40bb et on lui proposait 109.5. */
  const court = sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, CO: 9, BB: 27 }, heroPos: "CO", heroRemaining: 31, potBefore: 36.5, toCall: 18 });
  const presets = sizingPresets(court);
  for (const p of presets) {
    ok(p.raiseTo <= court.maxTo + 0.011, `${p.label} (${p.raiseTo}bb) ≤ tapis (${court.maxTo}bb)`);
  }
  const allin = presets.find(p => p.id === "ALLIN");
  near(allin.raiseTo, 40, "ALL-IN engage exactement le tapis : 9 déjà posés + 31 restants");
  ok(allin.allIn, "et il est marqué comme tapis");
  /* Un préréglage qui atteint le tapis DEVIENT un all-in, et le dit. */
  const gros = presets.filter(p => p.raiseTo >= court.maxTo - 0.011);
  ok(gros.every(p => p.allIn), `${gros.length} préréglage(s) atteignant le tapis sont étiquetés all-in`);
  /* Et il est borné, avec la raison. */
  const hors = clampRaiseTo(court, 109.5);
  near(hors.raiseTo, 40, "une demande de 109.5bb est ramenée à 40bb");
  eq(hors.raison, "plafonné au tapis", "la raison du bornage est dite");
  ok(hors.allIn, "et l'action devient un tapis");
}

/* ── 5. Le pas à pas respecte les bornes ────────────────────────────────── */
{
  const bas = stepRaiseTo(VS_OPEN, VS_OPEN.minTo, -1);
  near(bas.raiseTo, VS_OPEN.minTo, "− ne descend pas sous le minimum légal");
  const haut = stepRaiseTo(VS_OPEN, VS_OPEN.maxTo, +1);
  near(haut.raiseTo, VS_OPEN.maxTo, "+ ne monte pas au-dessus du tapis");
  near(stepRaiseTo(VS_OPEN, 8, +1).raiseTo, 8.5, "un pas monte de 0.5bb");
  near(stepRaiseTo(VS_OPEN, 8, -1).raiseTo, 7.5, "un pas descend de 0.5bb");
  /* L'ancien pas plafonnait par le bas à `currentPotBb` — 1.5bb au préflop,
     donc sous la relance minimale légale de 2bb. */
  ok(stepRaiseTo(OPEN, 2, -1).raiseTo >= 2, "le pas ne peut plus produire une mise illégale");
}

/* ── 6. C5 — un bouton, un montant ──────────────────────────────────────── */
{
  const action = { id: "3BET", l: "3-bet 9bb", s: "9bb" };
  const r = resolveTrainerAction({ action, ctx: VS_OPEN });
  near(r.raiseTo, 9, "sans sélection, la taille prescrite du spot est conservée");
  ok(r.label.includes("9"), `le libellé porte le montant résolu (${r.label})`);
  eq(r.sizingText, "9bb", "la ligne de sizing porte le MÊME montant");
  const montantLibelle = parseFloat((r.label.match(/(\d+(?:\.\d+)?)\s*bb/) || [])[1]);
  near(montantLibelle, parseFloat(r.sizingText), "libellé et sizing ne peuvent plus se contredire");

  /* Une sélection remplace la taille — et le libellé suit. */
  const choisi = resolveTrainerAction({ action, ctx: VS_OPEN, selectedRaiseTo: 12 });
  near(choisi.raiseTo, 12, "la taille choisie devient le montant");
  ok(choisi.label.includes("12"), `le libellé se met à jour (${choisi.label})`);
  near(choisi.additionalChips, 12, "Hero n'avait rien posté : 12bb à ajouter");
  /* Hero en BB a déjà 1bb devant lui : le complément n'est pas le total. */
  const bb = sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, BB: 1, CO: 2.5 }, heroPos: "BB", heroRemaining: 99, potBefore: 4, toCall: 1.5 });
  const r3 = resolveTrainerAction({ action: { id: "3BET", l: "3-bet" }, ctx: bb, selectedRaiseTo: 12 });
  near(r3.raiseTo, 12, "raiseTo = total atteint");
  near(r3.additionalChips, 11, "additionalChips = 11bb (12 − la blinde déjà posée)");
  ok(r3.hint.includes("11"), `l'indice annonce le complément (${r3.hint})`);
}

/* ── 7. C6 — l'indice découle du montant, jamais de l'identifiant ───────── */
{
  /* Le cas exact de l'audit : un bouton d'ID `BET33` libellé « Bet 50% ».
     L'ancienne table affichait « 33 % pot » ; l'indice doit dire 50 %. */
  const r = resolveTrainerAction({ action: { id: "BET33", l: "Bet 50%", s: "10.5bb" }, ctx: FLOP });
  near(r.raiseTo, 10.5, "le montant reste celui du spot");
  ok(/50\s*%/.test(r.hint), `l'indice dit 50 % du pot, pas 33 % (${r.hint})`);

  /* « Open 3bb » ne doit pas s'annoncer « 75 % pot » : la référence préflop
     est la grosse blinde. */
  const open = resolveTrainerAction({ action: { id: "BET75", l: "Open 3bb", s: "3bb" }, ctx: OPEN });
  ok(!/%/.test(open.hint), `pas de pourcentage de pot sur une ouverture (${open.hint})`);
  ok(/×\s*BB/.test(open.hint), `la référence est la grosse blinde (${open.hint})`);

  /* « Overbet » à 46bb dans un pot de 38 : l'indice doit dire 121 %, pas « Pot ». */
  const gros = sizingContext({ street: "River", streetCommitted: {}, heroPos: "BTN", heroRemaining: 60, potBefore: 38, toCall: 0 });
  const over = resolveTrainerAction({ action: { id: "BET100", l: "Overbet", s: "46bb" }, ctx: gros });
  const pct = parseInt((over.hint.match(/(\d+)\s*%/) || [])[1], 10);
  near(pct, Math.round(46 / 38 * 100), `l'indice dit la fraction RÉELLE (${over.hint})`);

  /* Un call annonce son prix ET sa cote. */
  const call = resolveTrainerAction({ action: { id: "CALL", l: "Call" }, ctx: FLOP_VS_BET });
  near(call.additionalChips, 14, "le call vaut 14bb");
  ok(/cote\s*40\s*%/.test(call.hint), `la cote du pot est exacte (${call.hint})`);
}

/* ── 8. Toutes les actions restent dans le tapis (balayage) ─────────────── */
{
  const actions = [
    { id: "FOLD", l: "Fold" }, { id: "CALL", l: "Call" }, { id: "CHECK", l: "Check" },
    { id: "BET33", l: "Bet 33%", s: "7bb" }, { id: "BET50", l: "Bet 50%", s: "10.5bb" },
    { id: "BET75", l: "Bet 75%", s: "16bb" }, { id: "BET100", l: "Pot", s: "21bb" },
    { id: "RAISE", l: "X/R 14bb", s: "14bb" }, { id: "3BET", l: "3-bet 9bb", s: "9bb" },
    { id: "4BET", l: "4-bet 22bb", s: "22bb" }, { id: "ALLIN", l: "All-in" },
  ];
  const contextes = [OPEN, VS_OPEN, VS_3BET, FLOP, FLOP_VS_BET,
    sizingContext({ street: "Turn", streetCommitted: { BB: 20 }, heroPos: "BTN", heroRemaining: 12, potBefore: 60, toCall: 20 }),
    sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, BB: 1 }, heroPos: "BTN", heroRemaining: 8, potBefore: 1.5, toCall: 0 }),
  ];
  let controles = 0, horsTapis = 0, deuxMontants = 0, indicesFaux = 0, sousMinimum = 0;
  for (const ctx of contextes) {
    for (const a of actions) {
      for (const sel of [null, ctx.minTo, ctx.maxTo, roundStep((ctx.minTo + ctx.maxTo) / 2)]) {
        const fam = actionFamily(a, ctx);
        const r = resolveTrainerAction({ action: a, ctx, selectedRaiseTo: followsSizingSelector(fam) ? sel : null });
        controles++;
        if (r.raiseTo > ctx.maxTo + 0.011) horsTapis++;
        if (r.sized && r.raiseTo < ctx.minTo - 0.011) sousMinimum++;
        if (r.additionalChips > ctx.heroRemaining + 0.011) horsTapis++;
        /* I7 : le libellé et la ligne de sizing portent le même nombre. */
        const l = (r.label.match(/(\d+(?:\.\d+)?)\s*bb/) || [])[1];
        const s = (r.sizingText.match(/(\d+(?:\.\d+)?)\s*bb/) || [])[1];
        if (l && s && Math.abs(parseFloat(l) - parseFloat(s)) > 0.011) deuxMontants++;
        /* I4 : un pourcentage annoncé doit correspondre au montant. */
        const pct = (r.hint.match(/(\d+)\s*%/) || [])[1];
        if (pct && ctx.potBefore > 0 && !/cote/.test(r.hint)) {
          const reel = Math.round((r.additionalChips / ctx.potBefore) * 100);
          if (Math.abs(+pct - reel) > 6) indicesFaux++;
        }
      }
    }
  }
  ok(controles >= 300, `${controles} combinaisons action × contexte × sélection`);
  eq(horsTapis, 0, "0 proposition au-dessus du tapis");
  eq(sousMinimum, 0, "0 proposition sous le minimum légal");
  eq(deuxMontants, 0, "0 bouton portant deux montants");
  eq(indicesFaux, 0, "0 indice contredisant le montant");
}

/* ── 9. Le sélecteur ne s'affiche que s'il peut agir (C4) ───────────────── */
{
  ok(sizingSelectorVisible(VS_OPEN, [{ id: "RAISE", l: "3-bet" }]), "affiché quand une relance est dimensionnable");
  ok(!sizingSelectorVisible(VS_OPEN, [{ id: "FOLD", l: "Fold" }, { id: "CALL", l: "Call" }]),
    "masqué quand aucune action ne se dimensionne");
  /* Tapis pile au minimum légal : une seule valeur possible (4bb), donc rien à
     choisir — mais c'est une relance COMPLÈTE, pas un all-in contraint. */
  const pile = sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, BB: 1, CO: 2.5 }, heroPos: "BTN", heroRemaining: 4, potBefore: 4, toCall: 2.5 });
  near(pile.minTo, pile.maxTo, "minimum et maximum se rejoignent");
  ok(!sizingSelectorVisible(pile, [{ id: "RAISE", l: "3-bet" }]),
    "masqué quand une seule valeur est possible — pas de contrôle inactif");
  ok(!pile.allInOnly, "une relance minimale exactement couverte reste une relance complète");
  /* Tapis SOUS le minimum légal : seul le tapis est jouable, et il ne rouvre
     pas l'action. */
  const fige = sizingContext({ street: "Preflop", streetCommitted: { SB: 0.5, BB: 1, CO: 2.5 }, heroPos: "BTN", heroRemaining: 3, potBefore: 4, toCall: 2.5 });
  ok(fige.allInOnly, "relance complète impossible : le contexte le dit");
  near(fige.minTo, 3, "le minimum est ramené au tapis");
  ok(!sizingSelectorVisible(fige, [{ id: "RAISE", l: "3-bet" }]), "et le sélecteur est masqué");
}

/* ── 10. C12 — les tailles du Vilain sont contextuelles ─────────────────── */
{
  const ip = villainThreeBetTo({ openTo: 2.5, isIP: true });
  const oop = villainThreeBetTo({ openTo: 2.5, isIP: false });
  near(ip.raiseTo, 7.5, "3-bet en position ≈ 3× l'ouverture");
  near(oop.raiseTo, 10, "3-bet hors de position ≈ 4× l'ouverture");
  ok(ip.raiseTo < oop.raiseTo, "la position change la taille");
  /* L'ancienne formule `pot*2.8 + 1.5` donnait 13bb, soit 5.2× l'open. */
  ok(oop.ratio <= 4.5, `ratio ${oop.ratio}× — l'ancienne formule donnait 5.2×`);
  near(villainThreeBetTo({ openTo: 2.5, isIP: false, callers: 1 }).raiseTo, 12.5, "squeeze : +1× par suiveur");
  near(villainThreeBetTo({ openTo: 3, isIP: true }).raiseTo, 9, "la taille suit l'ouverture réelle");
  const court = villainThreeBetTo({ openTo: 2.5, isIP: false, effectiveStack: 8 });
  near(court.raiseTo, 8, "bornée par le tapis effectif");
  ok(court.allIn, "et annoncée comme un tapis");
  near(villainIsolateTo({ limpers: 1 }).raiseTo, 3, "iso sur 1 limpeur = 3× BB");
  near(villainIsolateTo({ limpers: 3 }).raiseTo, 5, "iso sur 3 limpeurs = 5× BB");
  const bet = villainBetTo({ potBefore: 20, pct: 66, effectiveStack: 5 });
  near(bet.raiseTo, 5, "la mise est bornée au tapis");
  eq(bet.pct, 25, "et le pourcentage ANNONCÉ est celui du montant réel, pas celui visé");
}

/* ── C7 bis — UNE CAPACITÉ NE S'ARRONDIT PAS VERS LE HAUT ────────────────
   Le ledger publie l'argent au dixième de blinde (le pot reporté se répartit à
   cette précision) ; les tailles de mise vivent au demi-blind. Faire passer une
   CAPACITÉ par l'arrondi au demi-blind pouvait la faire grandir : ledger 66.9bb,
   bouton « Tapis 67bb ». Mesuré au navigateur : 1 écart `I3-mise-hors-tapis` sur
   40 mains en 4T — rare, mais faux à chaque fois qu'il tombe. */
{
  near(floorStep(66.9), 66.5, "une capacité de 66.9bb est tronquée à 66.5, jamais relevée à 67");
  near(floorStep(67), 67, "une capacité déjà au pas ne bouge pas");
  near(floorStep(0.4), 0, "moins d'un demi-blind ne fait pas un demi-blind");
  near(roundStep(66.9), 67, "l'arrondi, lui, reste l'arrondi — il sert aux PROPOSITIONS");

  const ctx = sizingContext({
    street: "Turn", streetCommitted: { CO: 0, BB: 0 }, heroPos: "CO",
    heroRemaining: 66.9, potBefore: 20, toCall: 0,
  });
  ok(ctx.maxTo <= 66.9 + 0.001, `le plafond ne dépasse jamais le tapis réel (${ctx.maxTo} ≤ 66.9)`);
  near(ctx.maxTo, 66.5, "et il vaut le plus grand pas atteignable");
  for (const p of sizingPresets(ctx)) {
    ok(p.raiseTo <= 66.9 + 0.001, `le préréglage ${p.id} (${p.raiseTo}) reste dans le tapis`);
  }
  /* Même contrôle du côté de la capacité ADVERSE : proposer plus que ce que
     l'adversaire peut couvrir revient à proposer une mise qui se rembourserait
     aussitôt. */
  const ctx2 = sizingContext({
    street: "Turn", streetCommitted: { CO: 0, BB: 0 }, heroPos: "CO",
    heroRemaining: 200, potBefore: 20, toCall: 0, opponentCapacity: 33.4,
  });
  ok(ctx2.maxTo <= 33.4 + 0.001, `le plafond suit la capacité adverse réelle (${ctx2.maxTo} ≤ 33.4)`);
  near(ctx2.maxTo, 33, "tronquée au pas, pas relevée à 33.5");
}

console.log(`✅ tailles de mise du Trainer (C4→C8/C12) — ${passed} assertions OK`);
