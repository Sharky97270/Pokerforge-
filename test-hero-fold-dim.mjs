/* ══════════════════════════════════════════════════════════════════════════
   test-hero-fold-dim — HERO COUCHÉ : LA MAIN RESTE, EN SOUS-BRILLANCE

   Règle verrouillée ici, identique dans le Trainer et le Replayer :

     Hero encore dans le coup  → cartes en état normal
     Hero couché               → cartes TOUJOURS VISIBLES, immédiatement
                                  passées en sous-brillance, et cela tient
                                  jusqu'à la fin de la main (streets suivantes
                                  et abattement compris)
     Main suivante             → état remis à zéro
     Vilains                   → inchangés (un vilain couché ne rend plus de
                                  cartes du tout, cf. §4)

   Ce que le test prouve :
     1. la source de vérité côté Trainer (statuts de siège) ;
     2. la source de vérité côté Replayer (instantané reconstruit par étape,
        donc réversible quand on remonte la timeline) ;
     3. l'indépendance par table (le multitabling ne partage aucun état) ;
     4. le style partagé et ses valeurs (un seul langage visuel) ;
     5. le câblage des trois points de rendu (1T, mosaïque, Replayer).
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import fs from "node:fs";
import { trainerSeatStatuses, SEAT_STATUS } from "./src/trainerSeatStatus.js";
import { POSITIONS_BY_SIZE } from "./src/data/content.js";
import { parseHand } from "./src/replayer/handModel.js";
import { computeSnapshot, stepCount } from "./src/replayer/stateEngine.js";
import { createFullHand, applyAction, playVillain, amountToCall, HERO } from "./src/fullHandEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const section = t => console.log("\n── " + t);

const SIX = POSITIONS_BY_SIZE[6];
const lire = f => fs.readFileSync(new URL(f, import.meta.url), "utf8");

/* Statut du siège d'Hero pour un spot donné. C'est exactement ce que le rendu
   consulte : `seatStates[spot.hpos].folded`. */
const heroStatut = (spot, ctx, answered = null) =>
  trainerSeatStatuses({ spot, ctx, seatOrder: SIX, answered, activePlayerId: answered === null ? "hero" : null })[spot.hpos];

/* ════════════════════════════════════════════════════════════════════════
   1. TRAINER — HERO ACTIF : AUCUN ÉTAT « COUCHÉ »
   ════════════════════════════════════════════════════════════════════════ */
section("Trainer — Hero encore dans le coup");
{
  const spot = { hpos: "BB", vpos: "CO", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 2.5,
                 acts: [{ id: "FOLD" }, { id: "CALL" }, { id: "RAISE" }] };
  const ctx = { preActions: [
    { position: "UTG", actionType: "FOLD" }, { position: "HJ", actionType: "FOLD" },
    { position: "CO", actionType: "RAISE", amountBb: 2.5 },
    { position: "BTN", actionType: "FOLD" }, { position: "SB", actionType: "FOLD" },
  ] };

  const avant = heroStatut(spot, ctx, null);
  ok(!avant.folded, "Hero n'a pas encore répondu : il n'est PAS couché");
  eq(avant.status, SEAT_STATUS.TO_ACT, "c'est à Hero de parler");

  /* Une réponse qui n'est pas un fold ne couche personne. */
  const apresCall = heroStatut(spot, ctx, 1);
  ok(!apresCall.folded, "Hero a payé : sa main reste en état normal");
  const apresRaise = heroStatut(spot, ctx, 2);
  ok(!apresRaise.folded, "Hero a relancé : sa main reste en état normal");
}

/* ════════════════════════════════════════════════════════════════════════
   2. TRAINER — HERO FOLD : L'ÉTAT EXISTE IMMÉDIATEMENT
   ════════════════════════════════════════════════════════════════════════ */
section("Trainer — Hero se couche");
{
  const spot = { hpos: "BB", vpos: "CO", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 2.5,
                 acts: [{ id: "FOLD" }, { id: "CALL" }, { id: "RAISE" }] };
  const ctx = { preActions: [
    { position: "UTG", actionType: "FOLD" }, { position: "HJ", actionType: "FOLD" },
    { position: "CO", actionType: "RAISE", amountBb: 2.5 },
    { position: "BTN", actionType: "FOLD" }, { position: "SB", actionType: "FOLD" },
  ] };
  const st = heroStatut(spot, ctx, 0);          // acts[0] = FOLD
  ok(st.folded, "Hero a fold : l'état couché est vrai dès la réponse validée");
  eq(st.status, SEAT_STATUS.FOLDED, "statut FOLDED");
  ok(!st.inHand, "il n'est plus dans le coup");

  /* Le vilain, lui, n'est pas touché : la règle ne concerne QUE Hero. */
  const tous = trainerSeatStatuses({ spot, ctx, seatOrder: SIX, answered: 0 });
  ok(!tous.CO.folded, "le vilain qui a ouvert n'est pas couché — les cartes vilaines ne changent pas de règle");
}

/* ════════════════════════════════════════════════════════════════════════
   3. TRAINER — LE FOLD EST UN ÉTAT DE LA MAIN, PAS DE LA STREET
   ════════════════════════════════════════════════════════════════════════ */
section("Trainer — l'état traverse les streets");
{
  /* Hero s'est couché au préflop ; le coup continue au flop / turn / river.
     `handLog` n'est jamais purgé entre deux streets (il ne l'est qu'au spot
     suivant) : le fold enregistré doit donc encore être là. */
  const base = { hpos: "BTN", vpos: "BB", stack: "100bb", nplayers: 6,
                 acts: [{ id: "FOLD" }, { id: "CALL" }] };
  const handLog = [
    { position: "CO", actionType: "RAISE", amountBb: 2.5 },
    { position: "BTN", actionType: "FOLD" },
  ];
  for (const street of ["Preflop", "Flop", "Turn", "River"]) {
    const st = trainerSeatStatuses({ spot: { ...base, street }, handLog, seatOrder: SIX, playingFull: true });
    ok(st.BTN.folded, `${street} : Hero reste couché — pas de remise à zéro par street`);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   4. TRAINER — MAIN SUIVANTE : REMISE À ZÉRO, AUCUNE FUITE
   ════════════════════════════════════════════════════════════════════════ */
section("Trainer — main suivante");
{
  /* La main suivante remonte un spot neuf : ni `handLog`, ni `answered`. */
  const neuf = { hpos: "BB", vpos: "CO", street: "Preflop", stack: "100bb", nplayers: 6, toCall: 2.5,
                 acts: [{ id: "FOLD" }, { id: "CALL" }] };
  const st = trainerSeatStatuses({ spot: neuf, ctx: { preActions: [] }, handLog: [], answered: null,
                                   seatOrder: SIX, activePlayerId: "hero" });
  ok(!st.BB.folded, "nouveau spot : Hero repart en pleine luminosité");
  eq(st.BB.status, SEAT_STATUS.TO_ACT, "et c'est de nouveau à lui de parler");
}

/* ════════════════════════════════════════════════════════════════════════
   5. TRAINER — MULTITABLING : UN ÉTAT PAR TABLE, JAMAIS UN ÉTAT GLOBAL
   ════════════════════════════════════════════════════════════════════════ */
section("Trainer — 2T / 3T / 4T, états indépendants");
{
  const spotDe = hpos => ({ hpos, vpos: hpos === "BB" ? "CO" : "BB", street: "Preflop", stack: "100bb",
                            nplayers: 6, toCall: 2.5, acts: [{ id: "FOLD" }, { id: "CALL" }] });
  const ctxDe = () => ({ preActions: [{ position: "CO", actionType: "RAISE", amountBb: 2.5 }] });

  /* Quatre tables, deux Hero couchés (A et C), deux Hero actifs (B et D). */
  const tables = [
    { nom: "A", spot: spotDe("BB"),  answered: 0    },
    { nom: "B", spot: spotDe("BTN"), answered: null },
    { nom: "C", spot: spotDe("SB"),  answered: 0    },
    { nom: "D", spot: spotDe("HJ"),  answered: null },
  ].map(t => ({ ...t, st: trainerSeatStatuses({ spot: t.spot, ctx: ctxDe(), seatOrder: SIX,
                                                answered: t.answered,
                                                activePlayerId: t.answered === null ? "hero" : null }) }));

  const couche = t => !!t.st[t.spot.hpos].folded;
  eq(tables.map(couche), [true, false, true, false],
     "chaque table porte SON état : A et C couchées, B et D actives");
  ok(tables[0].st !== tables[1].st && tables[2].st !== tables[3].st,
     "aucune table ne réutilise l'objet d'état d'une autre");
}

/* ════════════════════════════════════════════════════════════════════════
   6. REPLAYER — RECONSTRUCTION DEPUIS LA HH, ET RÉVERSIBILITÉ
   ════════════════════════════════════════════════════════════════════════ */
section("Replayer — timeline");
const HH_HERO_FOLD = `PokerStars Hand #900112: Hold'em No Limit ($1/$2) - 2025/07/04
Table 'Vega' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Seat 5: Player5 ($200 in chips)
Hero: posts small blind $1
Player5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: folds
Player5: calls $4
*** FLOP *** [Ah Kd 7c]
Player5: checks
Villain: bets $8
Player5: calls $8
*** TURN *** [Ah Kd 7c] [2s]
Player5: checks
Villain: checks
*** RIVER *** [Ah Kd 7c 2s] [9h]
Player5: checks
Villain: bets $20
Player5: calls $20
*** SHOW DOWN ***
Villain: shows [Ac Qd]
Player5: shows [Kh Ts]`;
{
  const main = parseHand(HH_HERO_FOLD);
  ok(!!main, "la HH importée est lue");
  const N = stepCount(main);
  ok(N > 6, `la main a ${N} étapes rejouables`);

  const heroDe = snap => snap.players.find(p => p.isHero);
  const etats = [];
  for (let i = 0; i < N; i++) etats.push(!!heroDe(computeSnapshot(main, i)).folded);

  const premierCouche = etats.indexOf(true);
  ok(premierCouche > 0, "Hero n'est pas couché à l'étape 0 — la HH n'a pas besoin d'un clic d'interface");
  ok(etats.slice(0, premierCouche).every(v => v === false),
     "AVANT le fold : Hero est en état normal à chaque étape");
  ok(etats.slice(premierCouche).every(v => v === true),
     "À PARTIR du fold : Hero reste couché jusqu'à la fin — abattement compris");

  /* §18 — l'abattement ne rallume pas la main d'Hero. */
  const fin = computeSnapshot(main, N - 1);
  ok(heroDe(fin).folded, "au showdown, Hero est toujours couché");
  ok(Array.isArray(heroDe(fin).hole) && heroDe(fin).hole.length === 2,
     "et ses cartes sont TOUJOURS là : on les atténue, on ne les retire pas");
  ok(heroDe(fin).holeVisible, "elles restent visibles (sous-brillance ≠ masquage)");

  /* §6 — remonter la timeline restaure l'état normal, sans état bloqué :
     l'instantané est recalculé depuis l'étape 0 à chaque fois. */
  const avant = computeSnapshot(main, premierCouche - 1);
  ok(!heroDe(avant).folded, "retour AVANT le fold → Hero redevient normal");
  const rejoue = computeSnapshot(main, N - 1);
  ok(heroDe(rejoue).folded, "et repartir à la fin le recouche : aucun état bloqué dans un sens ou dans l'autre");

  /* Le vilain n'est pas concerné par la règle Hero. */
  const vil = fin.players.find(p => !p.isHero && p.name === "Villain");
  ok(vil && !vil.folded, "le vilain qui va à l'abattement n'est pas couché");
}

/* ════════════════════════════════════════════════════════════════════════
   7. LE STYLE PARTAGÉ — UN SEUL LANGAGE VISUEL, DES VALEURS LISIBLES
   ════════════════════════════════════════════════════════════════════════ */
section("Style — token partagé");
{
  const css = lire("./src/styles.js");
  ok(css.includes(".pf-hole-cards.hero-cards--folded"),
     "la classe partagée `.hero-cards--folded` existe (Trainer ET Replayer la portent)");
  ok(css.includes("--pf-hero-fold-opacity"), "l'opacité est un token, pas une valeur recopiée");
  ok(css.includes("--pf-hero-fold-filter"), "le filtre est un token");

  const op = Number(/--pf-hero-fold-opacity:\s*(\.?\d*\.?\d+)/.exec(css)[1]);
  ok(op >= 0.35 && op <= 0.5,
     `l'opacité (${op}) est dans la fourchette lisible 0.35–0.50 : la carte reste identifiable`);

  const filtre = /--pf-hero-fold-filter:([^;]+);/.exec(css)[1].trim();
  ok(/saturate\(0?\.\d+\)/.test(filtre), `saturation réduite (${filtre})`);
  ok(/brightness\(0?\.\d+\)/.test(filtre), `luminosité réduite (${filtre})`);

  /* §14 — la bascule est animée, mais courte : le retour doit être immédiat. */
  const ms = Number(/--pf-hero-fold-transition:[^;]*?(\d+)ms/.exec(css)[1]);
  ok(ms > 0 && ms <= 200, `transition de ${ms}ms : perceptible mais quasi immédiate`);

  /* L'opacité doit battre l'animation `deal` de la carte, sinon la règle ne
     s'applique tout simplement pas à l'écran (piège mesuré). */
  ok(/--pf-hero-fold-opacity\)!important/.test(css),
     "l'opacité est en !important : sans cela la keyframe `deal` (fill both) gagnerait");
}

/* ════════════════════════════════════════════════════════════════════════
   8. CÂBLAGE — LES TROIS POINTS DE RENDU LISENT BIEN L'ÉTAT
   ════════════════════════════════════════════════════════════════════════ */
section("Câblage des rendus");
{
  const cards = lire("./src/components/table/Cards.jsx");
  ok(/export function HeroHoleCards\(\{[^}]*folded=false/.test(cards),
     "HeroHoleCards accepte l'état `folded`");
  ok(cards.includes('folded?" hero-cards--folded":""'),
     "et le traduit par la classe partagée");
  ok(!/export function VillainBackCards\(\{[^}]*folded/.test(cards),
     "les cartes VILAINES n'ont pas de prop `folded` : leur règle est inchangée");

  const trainer = lire("./src/tabs/TrainerTab.jsx");
  const appels = trainer.match(/<HeroHoleCards[^>]*/g) || [];
  eq(appels.length, 2, "le Trainer rend les cartes d'Hero à deux endroits (1T et mosaïque)");
  ok(appels.every(a => a.includes("folded={seatFolded}")),
     "les deux passent l'état du siège d'Hero");
  ok(/const heroFolded=!!\(seatStates\[spot\?\.hpos\]\|\|\{\}\)\.folded/.test(trainer),
     "la vérité vient de l'état de siège du spot…");
  ok(/playingFull&&!!fhStateRef\.current\?\.players\?\.hero\?\.folded/.test(trainer),
     "…complétée par le moteur de coup complet, qui ne passe pas par handLog");
  ok((trainer.match(/const seatFolded=isH\?heroFolded:!!seatState\.folded;/g) || []).length === 2,
     "et le siège d'Hero lit cette vérité unique, dans les deux boucles de rendu");

  const replayer = lire("./src/replayer/ReplayTableImmersive.jsx");
  ok(/<HeroHoleCards cards=\{p\.hole\} folded=\{!!p\.folded\}/.test(replayer),
     "le Replayer passe l'état couché de l'instantané courant — donc temporel");
  ok(replayer.includes("{!p.folded && (showFace"),
     "et les cartes vilaines disparaissent toujours au fold : règle vilain inchangée");
}

/* ════════════════════════════════════════════════════════════════════════
   9. TRAINER, COUP COMPLET — LE MOTEUR QUI NE PASSE PAS PAR handLog
   ════════════════════════════════════════════════════════════════════════ */
section("Trainer — coup complet multiway");
{
  /* Le §3 vérifie la ligne du SPOT. Le coup complet, lui, vit dans
     `fullHandEngine` : ses actions ne sont jamais écrites dans `handLog`, et
     c'est pour cela que `heroFolded` interroge AUSSI ce moteur. Sans cette
     seconde source, un Hero qui se couche au flop verrait sa main se rallumer
     au turn — exactement le défaut que le §7 interdit.

     Trois joueurs : quand Hero se couche au flop, le coup CONTINUE entre les
     deux autres. C'est le seul montage où l'on peut observer l'état traverser
     turn, river et abattement. */
  /* Le moteur lit les couleurs en SYMBOLES (♠♥♦♣) et refuse tout le reste :
     une carte illisible lève au lieu d être silencieusement ramenée à 2♠. */
  const C = t => ({ r: t[0], s: { s: "♠", h: "♥", d: "♦", c: "♣" }[t[1]] });
  const board = ["Ah", "Kd", "7c", "2s", "9h"].map(C);
  let st = createFullHand({
    players: [
      { id: HERO, hand: [C("Qs"), C("Jh")], stack: 100, committedBefore: 2 },
      { id: "v1", hand: [C("Ac"), C("Qd")], stack: 100, committedBefore: 2 },
      { id: "v2", hand: [C("Kh"), C("Ts")], stack: 100, committedBefore: 2 },
    ],
    seats: [HERO, "v1", "v2"],
    fullBoard: board, startPot: 6, firstToAct: HERO,
  });
  eq(st.street, "flop", "le coup complet démarre au flop");
  ok(!st.players[HERO].folded, "Hero est dans le coup");

  st = applyAction(st, HERO, { type: "FOLD" });
  ok(st.players[HERO].folded, "Hero s'est couché au flop");

  /* Les deux vilains jouent le coup jusqu'au bout. Politique DÉTERMINISTE :
     la politique par défaut du moteur est aléatoire — un vilain qui se couche au
     turn arrête la main, et l'assertion « le coup a traversé la river » devient
     un tirage au sort. On ne mesure pas ici la qualité du jeu adverse : on veut
     un coup qui va jusqu'à l'abattement, à chaque exécution. */
  const passeOuPaie = (state, { actor }) => (amountToCall(state, actor) > 0 ? { type: "CALL" } : { type: "CHECK" });
  const vus = new Set([st.street]);
  for (let garde = 0; garde < 60 && !st.done; garde++) {
    if (st.toAct === HERO) { assert.fail("un joueur couché ne reprend jamais la parole"); }
    st = playVillain(st, passeOuPaie);
    vus.add(st.street);
    ok(st.players[HERO].folded,
       `${st.street} : Hero reste couché — l'état est celui de la MAIN, pas de la street`);
  }
  ok(st.done, "le coup est allé à son terme sans Hero");
  ok(vus.has("turn") && vus.has("river"),
     `le coup a bien traversé turn et river (${[...vus].join(" → ")})`);
  ok(st.players[HERO].folded, "et à l'abattement, Hero est toujours couché");
  eq(st.players[HERO].hand.length, 2,
     "sa main est toujours connue du moteur : le rendu a de quoi la peindre, atténuée");
}

console.log(`\n✅ Hero couché — sous-brillance Trainer + Replayer — ${passed} assertions OK`);
