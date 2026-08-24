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
import { trainerHandLedger, auditHandLedger, parseDepthBb, seatDepth,
  assignSeatStacks, auditSeatStacks, LEDGER_EPSILON } from "./src/trainerHandLedger.js";
import { carriedLineForPostflopSpot } from "./src/potAccounting.js";

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


/* ── 9. TAPIS INÉGAUX PAR SIÈGE ─────────────────────────────────────────── */
{
  /* Le modèle supposait UNE profondeur pour toute la table. À une vraie table,
     personne n a le même tapis — et le tapis effectif, celui qui décide du SPR,
     naît précisément de cette inégalité. */
  const seatStacks = { UTG: 120, HJ: 95, CO: 60, BTN: 40, SB: 75, BB: 40 };
  const spot = { hpos: "BTN", vpos: "CO", street: "Preflop", stack: "40bb", pot: 4, toCall: 2.5, nplayers: 6, seatStacks };
  const l = trainerHandLedger({
    spot, ctx: { preActions: [] }, seatOrder: SEATS6,
    streetContributions: { SB: 0.5, BB: 1, CO: 2.5 }, pot: 4, seatStates: {}, toCall: 2.5,
  });
  near(l.seats.UTG.initial, 120, "UTG part de son propre tapis");
  near(l.seats.BTN.initial, 40, "Hero part du sien");
  near(l.seats.CO.initial, 60, "le vilain aussi");
  near(l.seats.CO.remaining, 57.5, "le vilain qui a ouvert à 2.5bb : 60 − 2.5");
  near(l.seats.BB.remaining, 39, "la BB : 40 − 1");
  eq(new Set(SEATS6.map(p => l.seats[p].initial)).size >= 4, true, "les profondeurs initiales DIFFÈRENT d un siège à l autre");
  conserve(l, "conservation avec des tapis inégaux");
  /* Le tapis effectif est le plus court des RESTANTS, pas la profondeur d Hero. */
  near(l.effectiveStack, Math.min(...SEATS6.map(p => l.seats[p].remaining)), "tapis effectif = plus court restant");
  ok(l.effectiveStack <= 40, "il ne peut pas dépasser le plus petit tapis initial");

  /* Un spot SANS seatStacks garde le comportement d avant : profondeur commune. */
  const ancien = trainerHandLedger({
    spot: { ...spot, seatStacks: undefined }, ctx: { preActions: [] }, seatOrder: SEATS6,
    streetContributions: { SB: 0.5, BB: 1, CO: 2.5 }, pot: 4, seatStates: {}, toCall: 2.5,
  });
  eq(new Set(SEATS6.map(p => ancien.seats[p].initial)).size, 1, "sans seatStacks : une seule profondeur, comme avant");
  eq(seatDepth({ seatStacks }, "CO", 999), 60, "seatDepth lit la table quand elle existe");
  eq(seatDepth({}, "CO", 999), 999, "et retombe sur la profondeur commune sinon");
  eq(seatDepth({ seatStacks: { CO: 0 } }, "CO", 999), 999, "une valeur nulle ne met pas un siège à zéro");
}

/* ── 10. Le filtre « stack effectif » reste tenu ────────────────────────── */
{
  /* Contrat : personne sous la profondeur demandée, et AU MOINS UN siège en jeu
     exactement dessus — sinon le tapis effectif ne vaudrait plus le réglage. */
  let seed = 424242 >>> 0;
  const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  let tirages = 0, ecarts = 0, inegaux = 0;
  for (const base of [10, 20, 40, 100, 200]) {
    for (let t = 0; t < 200; t++) {
      const s = assignSeatStacks({ positions: SEATS6, effectiveBb: base, heroPos: "BTN", villainPos: "BB", rng });
      tirages++;
      if (auditSeatStacks(s, base).length) ecarts++;
      const vals = SEATS6.map(p => s[p]);
      if (Math.min(...vals) !== base) ecarts++;
      if (new Set(vals).size > 1) inegaux++;
      for (const v of vals) if (v < base) ecarts++;
    }
  }
  eq(tirages, 1000, "1 000 tirages sur 5 profondeurs");
  eq(ecarts, 0, "0 écart : jamais sous la profondeur, minimum toujours égal au réglage");
  ok(inegaux > 950, inegaux + " tirages sur 1 000 produisent des tapis RÉELLEMENT inégaux");
  /* Le garde-fou attrape bien une table qui trahirait le réglage. */
  ok(auditSeatStacks({ BTN: 55, BB: 60 }, 40).length > 0, "une table dont le minimum dépasse le réglage est refusée");
  ok(auditSeatStacks({ BTN: 30, BB: 40 }, 40).length > 0, "un siège sous la profondeur est refusé");
  eq(auditSeatStacks({ BTN: 40, BB: 90 }, 40), [], "une table conforme passe");
}

/* ── 11. LE POT REPORTÉ EST CONNU, PLUS RÉPARTI ─────────────────────────── */
{
  /* Avant : le ledger répartissait le pot d'entrée à parts égales — la somme
     était exacte, l'attribution était une hypothèse, et les blindes mortes
     (celles des joueurs couchés) se retrouvaient créditées aux deux joueurs.
     Maintenant le spot porte la séquence qui a produit le pot. */
  const seats = SEATS6;
  const ligne = carriedLineForPostflopSpot({
    street: "Turn", hpos: "BTN", vpos: "BB", seats, targetPot: 24, blinds: { SB: 0.5, BB: 1 },
  });
  ok(ligne && ligne.coherent, "la séquence reconstruit exactement son pot");
  near(ligne.dead, 0.5, "la SB couchée laisse 0.5bb de blinde morte");
  near(ligne.pot, ligne.dead + 2 * ligne.parJoueur, "pot = blindes mortes + 2 × engagement");
  ok(ligne.actions.some(a => a.street === "Préflop"), "la ligne contient le préflop");
  ok(ligne.actions.some(a => a.street === "Flop"), "et le flop, déjà joué avant le turn");

  const spot = {
    hpos: "BTN", vpos: "BB", street: "Turn", stack: "100bb",
    pot: ligne.pot, toCall: 0, nplayers: 6,
    carriedCommitted: ligne.committed,
  };
  const l = trainerHandLedger({
    spot, ctx: { preActions: ligne.actions }, seatOrder: seats,
    streetContributions: {}, pot: ligne.pot, seatStates: {},
  });
  eq(l.sourceCarried, "declare", "le ledger LIT les engagements au lieu de les répartir");
  near(l.seats.BTN.carried, ligne.parJoueur, "Hero porte son engagement réel");
  near(l.seats.BB.carried, ligne.parJoueur, "le vilain aussi");
  /* La différence qui compte : la blinde morte reste à la SB, pas partagée. */
  near(l.seats.SB.carried, 0.5, "la blinde morte reste à la SB");
  ok(l.seats.BTN.carried !== l.pot / 2, `l'attribution n'est plus « la moitié du pot » (${l.seats.BTN.carried} ≠ ${l.pot / 2})`);
  conserve(l, "conservation avec un pot reporté connu");

  /* Sans déclaration, le repli est NOMMÉ — il n'est pas silencieux. */
  const sansDeclare = trainerHandLedger({
    spot: { ...spot, carriedCommitted: undefined }, ctx: { preActions: [] }, seatOrder: seats,
    streetContributions: {}, pot: ligne.pot, seatStates: {},
  });
  eq(sansDeclare.sourceCarried, "parts-egales", "le repli à parts égales se déclare");
  conserve(sansDeclare, "et conserve quand même");

  /* La cible n'est pas une contrainte : le pot rendu est celui de la séquence. */
  for (const [st, cible] of [["Flop", 12], ["Turn", 24], ["River", 48]]) {
    const li = carriedLineForPostflopSpot({ street: st, hpos: "CO", vpos: "BB", seats, targetPot: cible, blinds: { SB: 0.5, BB: 1 } });
    ok(li.coherent, `${st} : séquence cohérente`);
    ok(Math.abs(li.pot - cible) <= 1.01, `${st} : le pot produit (${li.pot}) reste proche de la cible (${cible})`);
    ok(li.parJoueur >= 2.5, `${st} : chaque joueur a au moins payé l'ouverture`);
  }
  eq(carriedLineForPostflopSpot({ hpos: "BTN", vpos: "BTN", seats, targetPot: 10 }), null,
     "Hero et le vilain au même siège : aucune séquence n'est produite");
}

/* ── 12. COUP COMPLET À TROIS : LE LEDGER LIT LA TABLE DU MOTEUR ─────────
   Le bloc Full Hand du ledger ne connaissait que `heroStack` et `villStack`.
   Un troisième siège recevait sa profondeur de DÉPART et le drapeau « couché »,
   alors qu'il avait déjà de l'argent dans le pot : la conservation cassait
   d'autant. Mesuré au navigateur avant correction : 12 à 48bb d'écart sur les
   coups à trois joueurs. */
{
  const spot = { stack: "100bb", street: "Flop", hpos: "BTN", vpos: "CO", seatStacks: { BTN: 100, CO: 100, HJ: 100, SB: 100, BB: 100 } };
  const seats = ["SB", "BB", "HJ", "CO", "BTN"];
  /* État du moteur : trois joueurs assis, tapis et engagements différents. */
  const fh = {
    pot: 40,
    players: {
      hero:    { id: "hero",    stack: 80, contrib: 5, committedBefore: 10, folded: false },
      villain: { id: "villain", stack: 75, contrib: 5, committedBefore: 10, folded: false },
      HJ:      { id: "HJ",      stack: 0,  contrib: 0, committedBefore: 10, folded: true },
    },
    heroStack: 80, villStack: 75,
    contrib: { hero: 5, villain: 5 },
    committedBefore: { hero: 10, villain: 10 },
  };
  const l = trainerHandLedger({
    spot, ctx: { preActions: [] }, seatOrder: seats, streetContributions: {},
    pot: 40, seatStates: {}, fullHandState: fh,
    fullHandSeats: { BTN: "hero", CO: "villain", HJ: "HJ" },
  });
  near(l.seats.BTN.remaining, 80, "le tapis d'Hero vient du moteur");
  near(l.seats.CO.remaining, 75, "celui du vilain aussi");
  /* Le point du test : HJ est DANS le coup, à zéro, pas à 100bb intacts. */
  near(l.seats.HJ.remaining, 0, "le troisième joueur n'a plus de tapis — il est à tapis, pas assis à 100bb");
  near(l.seats.HJ.total, 10, "et ses 10bb sont bien comptés comme engagés");
  ok(l.seats.HJ.folded, "HJ s'est couché : le moteur le dit, le ledger le recopie");
  /* Un siège qui n'est PAS du coup garde sa profondeur et reste hors du pot. */
  near(l.seats.SB.remaining, 100, "un siège hors du coup garde sa profondeur");
  near(l.seats.SB.total, 0, "et n'a rien engagé");
  near(l.potStreet, 10, "engagement de street = 5 + 5 (HJ est à 0 sur cette street)");
  near(l.potCarried, 30, "le reste du pot est reporté (10 + 10 + 10 du préflop)");
  /* Σ engagements des joueurs du coup = pot. */
  const somme = ["BTN", "CO", "HJ"].reduce((a, p) => a + l.seats[p].total, 0);
  near(somme, 40, "les trois engagements reconstruisent le pot");
  eq(auditHandLedger(l), [], "aucun écart sur un coup complet à trois");

  /* Rétro-compatibilité : sans `fullHandSeats` ni table de joueurs, le chemin
     hérité heads-up donne exactement ce qu'il donnait avant. */
  const legacy = trainerHandLedger({
    spot, ctx: { preActions: [] }, seatOrder: ["CO", "BTN"], streetContributions: {},
    pot: 30, seatStates: {},
    fullHandState: { pot: 30, heroStack: 80, villStack: 75, contrib: { hero: 5, villain: 5 }, committedBefore: { hero: 10, villain: 10 } },
  });
  near(legacy.seats.BTN.remaining, 80, "chemin hérité : tapis Hero");
  near(legacy.seats.CO.total, 15, "chemin hérité : engagement total du vilain");
  eq(auditHandLedger(legacy), [], "chemin hérité : aucun écart");
}

console.log(`✅ ledger de main du Trainer (C2) — ${passed} assertions OK`);
