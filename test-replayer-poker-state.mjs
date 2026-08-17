/* ═══════════════════════════════════════════════════════════════
   Tests — Replayer : POKER STATE SÉMANTIQUE + GARDE ANTI-INVENTION

   Ce que cette suite protège, concrètement : le bug de production où une big
   blind confrontée à un open du hijack se voyait conseiller « ouvrir (raise) à
   2.1bb avec une fréquence de 62 % ». Trois défauts s'y cumulaient :
     ① le contexte « Hero est-il confronté ? » venait d'un test d'expression
        régulière sur le libellé de la dernière action adverse (« Call 2bb ») ;
     ② l'action recommandée n'était nommée qu'en famille mécanique (« raise ») ;
     ③ rien n'empêchait le modèle d'écrire un sizing dans sa prose.
   Les trois sont couverts ci-dessous, plus les 13 spots demandés au §10.

   Lancement : node test-replayer-poker-state.mjs
═══════════════════════════════════════════════════════════════ */
import { parseHand } from "./src/replayer/handModel.js";
import { computeAllSnapshots } from "./src/replayer/stateEngine.js";
import { buildHandState } from "./src/replayer/handState.js";
import {
  SEM, semFr, familyOf, isInPosition,
  buildBettingContext, buildPokerState, legalActions, semanticOf, describeSpot,
} from "./src/replayer/pokerState.js";
import {
  validatePokerState, validateAiResponse, allowedNumbers, scanForeignNumbers,
  FACING_MATRIX, collectNumbers,
} from "./src/replayer/pokerStateValidator.js";
import { scenarioFromHand, solveScenario } from "./src/replayer/heuristicEngine.js";
import { buildTarget, heroEquity, ORIGIN } from "./src/replayer/solverPackage.js";

let passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.error("  ✗ " + m); } }
function section(t) { console.log("\n── " + t); }

/* ─────────────────────────────────────────────────────────────
   Fabrique de mains : on écrit une séquence, on obtient une main
   parsée + ses snapshots + la décision Hero ciblée.
───────────────────────────────────────────────────────────── */
const SEATS6 = [
  ["UTGp", "UTG", 1], ["HJp", "HJ", 2], ["COp", "CO", 3],
  ["BTNp", "BTN", 4], ["SBp", "SB", 5], ["BBp", "BB", 6],
];

/**
 * @param heroPos  position de Hero (il remplace le joueur de ce siège)
 * @param lines    lignes d'action, en notation PokerStars, « Hero » inclus
 * @param opts     { cards, board:{flop,turn,river}, stacks:{POS:n} }
 */
function makeHand(heroPos, lines, opts = {}) {
  const cards = opts.cards || "Kh 8s";
  const stacks = opts.stacks || {};
  const seats = SEATS6.map(([name, pos, seat]) => {
    const isHero = pos === heroPos;
    return `Seat ${seat}: ${isHero ? "Hero" : name} (${stacks[pos] ?? 100} in chips)`;
  });
  const nameOf = pos => (pos === heroPos ? "Hero" : SEATS6.find(s => s[1] === pos)[0]);
  const hh = [
    `PokerStars Hand #99${Math.floor(Math.random() * 1e6)}: Hold'em No Limit ($0.50/$1) - 2026/01/01 12:00:00`,
    "Table 'Sem' 6-max Seat #4 is the button",
    ...seats,
    `${nameOf("SB")}: posts small blind 0.5`,
    `${nameOf("BB")}: posts big blind 1`,
    "*** HOLE CARDS ***",
    `Dealt to Hero [${cards}]`,
    ...lines,
  ];
  const hand = parseHand(hh.join("\n"), 0);
  const snaps = computeAllSnapshots(hand);
  return { hand, snaps, nameOf };
}

/** Dernière décision de Hero dans la main (l'étape que le Replayer analyse). */
function lastHeroStep(hand) {
  const BET = ["fold", "check", "call", "bet", "raise", "allin"];
  for (let i = hand.events.length - 1; i >= 0; i--) {
    const e = hand.events[i];
    if (e.playerId === hand.heroId && BET.includes(e.type)) return i;
  }
  return -1;
}
function heroStepAt(hand, nth) {
  const BET = ["fold", "check", "call", "bet", "raise", "allin"];
  let n = 0;
  for (let i = 0; i < hand.events.length; i++) {
    const e = hand.events[i];
    if (e.playerId === hand.heroId && BET.includes(e.type)) { if (n === nth) return i; n++; }
  }
  return -1;
}

const CTX = snaps => ({ buildScenario: scenarioFromHand, solve: solveScenario, snaps });

/* ═══════════════════════════════════════════════════════════════
   1. TAXONOMIE — cohérence interne
═══════════════════════════════════════════════════════════════ */
section("Taxonomie sémantique");
ok(familyOf(SEM.THREE_BET) === "RAISE", "THREE_BET est une famille RAISE");
ok(familyOf(SEM.CHECK_RAISE) === "RAISE", "CHECK_RAISE est une famille RAISE");
ok(familyOf(SEM.DONK_BET) === "BET", "DONK_BET est une famille BET");
ok(familyOf(SEM.CALL_OPEN) === "CALL", "CALL_OPEN est une famille CALL");
ok(familyOf(SEM.FOLD_TO_THREE_BET) === "FOLD", "FOLD_TO_THREE_BET est une famille FOLD");
ok(Object.values(SEM).every(s => semFr(s) && semFr(s) !== semFr(SEM.UNKNOWN) || s === SEM.UNKNOWN),
  "chaque action sémantique a un libellé FR distinct");
ok(isInPosition("BTN", "BB", 6) === true, "BTN est en position sur BB");
ok(isInPosition("BB", "HJ", 6) === false, "BB est hors de position sur HJ");
ok(isInPosition("SB", "BB", 6) === false, "SB parle avant BB postflop");

/* ═══════════════════════════════════════════════════════════════
   2. LES 13 SPOTS DU CAHIER DES CHARGES (§10)

   Pour chacun on vérifie : position, action affrontée, action de Hero nommée
   correctement, options légales, et cohérence globale du state.
═══════════════════════════════════════════════════════════════ */
section("§10 — Les 13 spots");

const SPOTS = [
  {
    id: "1. UTG open → BB décision",
    heroPos: "BB",
    lines: ["UTGp: raises 2 to 3", "HJp: folds", "COp: folds", "BTNp: folds", "SBp: folds", "Hero: folds"],
    expect: { street: "preflop", facing: SEM.OPEN_RAISE, hero: SEM.FOLD_TO_OPEN,
              aggrPos: "UTG", legal: [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET], ip: false },
  },
  {
    id: "2. HJ open → BB décision (le bug de production)",
    heroPos: "BB",
    lines: ["UTGp: folds", "HJp: raises 2 to 2", "COp: folds", "BTNp: calls 2", "SBp: folds", "Hero: folds"],
    expect: { street: "preflop", facing: SEM.OPEN_RAISE, hero: SEM.FOLD_TO_OPEN,
              aggrPos: "HJ", legal: [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET], ip: false },
  },
  {
    id: "3. BTN open → BB décision (3-bet)",
    heroPos: "BB",
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "SBp: folds", "Hero: raises 7.5 to 10"],
    expect: { street: "preflop", facing: SEM.OPEN_RAISE, hero: SEM.THREE_BET,
              aggrPos: "BTN", legal: [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET], ip: false },
  },
  {
    id: "4. BTN open → SB décision (call)",
    heroPos: "SB",
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "Hero: calls 2"],
    expect: { street: "preflop", facing: SEM.OPEN_RAISE, hero: SEM.CALL_OPEN,
              aggrPos: "BTN", legal: [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET], ip: false },
  },
  {
    id: "5. CO open → BTN décision (3-bet en position)",
    heroPos: "BTN",
    lines: ["UTGp: folds", "HJp: folds", "COp: raises 1.5 to 2.5", "Hero: raises 5.5 to 8", "SBp: folds", "BBp: folds"],
    expect: { street: "preflop", facing: SEM.OPEN_RAISE, hero: SEM.THREE_BET,
              aggrPos: "CO", legal: [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET], ip: true },
  },
  {
    id: "6. Open → 3-bet → Hero décision (fold au 3-bet)",
    heroPos: "CO",
    lines: ["UTGp: folds", "HJp: folds", "Hero: raises 1.5 to 2.5", "BTNp: raises 5.5 to 8", "SBp: folds", "BBp: folds", "Hero: folds"],
    /* CO a ouvert, mais c'est le BTN qui a 3-bet : Hero jouera le coup HORS
       de position, malgré une position d'ouverture « tardive ». */
    expect: { street: "preflop", facing: SEM.THREE_BET, hero: SEM.FOLD_TO_THREE_BET,
              aggrPos: "BTN", legal: [SEM.FOLD_TO_THREE_BET, SEM.CALL_THREE_BET, SEM.FOUR_BET], ip: false },
  },
  {
    id: "7. Open → 3-bet → 4-bet (Hero 4-bet)",
    heroPos: "CO",
    lines: ["UTGp: folds", "HJp: folds", "Hero: raises 1.5 to 2.5", "BTNp: raises 5.5 to 8", "SBp: folds", "BBp: folds", "Hero: raises 14 to 22"],
    expect: { street: "preflop", facing: SEM.THREE_BET, hero: SEM.FOUR_BET,
              aggrPos: "BTN", legal: [SEM.FOLD_TO_THREE_BET, SEM.CALL_THREE_BET, SEM.FOUR_BET], ip: false },
  },
  {
    id: "8. Flop check → Hero (c-bet)",
    heroPos: "BTN",
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "Hero: raises 1.5 to 2.5", "SBp: folds", "BBp: calls 1.5",
            "*** FLOP *** [Ah 7d 2c]", "BBp: checks", "Hero: bets 2"],
    expect: { street: "flop", facing: SEM.CHECK, hero: SEM.BET,
              legal: [SEM.CHECK, SEM.BET], ip: true },
  },
  {
    id: "9. Flop bet → Hero (call)",
    heroPos: "BB",
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "SBp: folds", "Hero: calls 1.5",
            "*** FLOP *** [Ah 7d 2c]", "Hero: checks", "BTNp: bets 2.5", "Hero: calls 2.5"],
    expect: { street: "flop", facing: SEM.BET, hero: SEM.CALL_BET,
              aggrPos: "BTN", legal: [SEM.FOLD_TO_BET, SEM.CALL_BET, SEM.CHECK_RAISE], ip: false },
  },
  {
    id: "10. Flop bet → raise → Hero (check-raise de Hero)",
    heroPos: "BB",
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "SBp: folds", "Hero: calls 1.5",
            "*** FLOP *** [Ah 7d 2c]", "Hero: checks", "BTNp: bets 2.5", "Hero: raises 6 to 8.5"],
    expect: { street: "flop", facing: SEM.BET, hero: SEM.CHECK_RAISE,
              aggrPos: "BTN", legal: [SEM.FOLD_TO_BET, SEM.CALL_BET, SEM.CHECK_RAISE], ip: false },
  },
  {
    id: "11. Turn — donk bet de Hero",
    heroPos: "BB",
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "SBp: folds", "Hero: calls 1.5",
            "*** FLOP *** [Ah 7d 2c]", "Hero: checks", "BTNp: bets 2.5", "Hero: calls 2.5",
            "*** TURN *** [Ah 7d 2c] [9s]", "Hero: bets 5"],
    expect: { street: "turn", hero: SEM.DONK_BET, legal: [SEM.CHECK, SEM.DONK_BET], ip: false },
  },
  {
    id: "12. River — fold face à une mise",
    heroPos: "BB",
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "SBp: folds", "Hero: calls 1.5",
            "*** FLOP *** [Ah 7d 2c]", "Hero: checks", "BTNp: checks",
            "*** TURN *** [Ah 7d 2c] [9s]", "Hero: checks", "BTNp: checks",
            "*** RIVER *** [Ah 7d 2c 9s] [Kd]", "Hero: checks", "BTNp: bets 4", "Hero: folds"],
    expect: { street: "river", facing: SEM.BET, hero: SEM.FOLD_TO_BET,
              aggrPos: "BTN", legal: [SEM.FOLD_TO_BET, SEM.CALL_BET, SEM.CHECK_RAISE], ip: false },
  },
  {
    id: "13. All-in — Hero paie un jam préflop",
    heroPos: "BB",
    stacks: { BB: 20, SB: 20 },
    lines: ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: folds", "SBp: raises 19.5 to 20", "Hero: calls 19"],
    /* BB parle APRÈS SB postflop : face au jam du small blind, Hero est IP. */
    expect: { street: "preflop", facing: SEM.OPEN_RAISE, hero: SEM.CALL_OPEN, aggrPos: "SB", ip: true },
  },
];

for (const sp of SPOTS) {
  const { hand, snaps } = makeHand(sp.heroPos, sp.lines, { stacks: sp.stacks });
  const step = lastHeroStep(hand);
  const ps = buildPokerState(hand, snaps, step);
  const tag = `[${sp.id}]`;

  if (!ps) { ok(false, `${tag} PokerState construit`); continue; }

  ok(ps.hero.position === sp.heroPos, `${tag} position Hero = ${sp.heroPos} (reçu ${ps.hero.position})`);
  ok(ps.street === sp.expect.street, `${tag} street = ${sp.expect.street} (reçu ${ps.street})`);
  ok(ps.heroAction === sp.expect.hero,
    `${tag} action Hero = ${sp.expect.hero} (reçu ${ps.heroAction})`);
  if (sp.expect.facing !== undefined) {
    ok(ps.facingAction === sp.expect.facing,
      `${tag} action affrontée = ${sp.expect.facing} (reçu ${ps.facingAction})`);
  }
  if (sp.expect.aggrPos) {
    ok(ps.lastAggressor?.position === sp.expect.aggrPos,
      `${tag} agresseur = ${sp.expect.aggrPos} (reçu ${ps.lastAggressor?.position})`);
  }
  if (sp.expect.legal) {
    ok(sp.expect.legal.length === ps.legalActions.length
      && sp.expect.legal.every(a => ps.legalActions.includes(a)),
      `${tag} actions légales = [${sp.expect.legal}] (reçu [${ps.legalActions}])`);
  }
  if (sp.expect.ip !== undefined) {
    ok(ps.hero.inPosition === sp.expect.ip, `${tag} inPosition = ${sp.expect.ip} (reçu ${ps.hero.inPosition})`);
  }

  const v = validatePokerState(ps);
  ok(v.valid, `${tag} state cohérent — ${v.errors.join(" · ")}`);

  /* §4 — l'action jouée fait toujours partie des options légales. */
  ok(ps.legalActions.includes(ps.heroAction), `${tag} action jouée présente dans les options légales`);

  /* §10 — aucun nombre inventé dans les données transmises : le sizing n'est
     présent que si le moteur en a réellement un. */
  const t = buildTarget(hand, snaps, CTX(snaps), step);
  if (t) {
    ok(t.heroSemantic === ps.heroAction, `${tag} target.heroSemantic aligné sur le state`);
    ok(t.recommendedSemantic == null || ps.legalActions.includes(t.recommendedSemantic),
      `${tag} action recommandée légale (${t.recommendedSemantic})`);
    ok(t.origin != null, `${tag} provenance renseignée (${t.origin})`);
    ok(t.recommendedSizingBb == null || typeof t.recommendedSizingBb === "number",
      `${tag} sizing : absent ou numérique, jamais fabriqué`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   3. NON-RÉGRESSION DU BUG EXACT (spot 2)
═══════════════════════════════════════════════════════════════ */
section("Non-régression : « ouvrir à 2.1bb » en BB face à un open");
{
  const { hand, snaps } = makeHand("BB",
    ["UTGp: folds", "HJp: raises 2 to 2", "COp: folds", "BTNp: calls 2", "SBp: folds", "Hero: folds"],
    { stacks: { BB: 28, HJ: 92, BTN: 40, SB: 38, UTG: 25, CO: 16 } });
  const step = lastHeroStep(hand);
  const t = buildTarget(hand, snaps, CTX(snaps), step);

  ok(t.recommendedSemantic === SEM.THREE_BET,
    `action recommandée = 3-bet, pas une ouverture (reçu ${t.recommendedSemantic})`);
  ok(t.heroSemantic === SEM.FOLD_TO_OPEN, "action Hero = fold face à l'open");
  ok(!(SEM.OPEN_RAISE in (t.strategyBySemantic || {})),
    "OPEN_RAISE absent des alternatives : une BB confrontée ne peut pas ouvrir");
  ok(!(SEM.LIMP in (t.strategyBySemantic || {})), "LIMP absent : le pot est ouvert");

  /* Le sizing d'ouverture fantôme (2.1bb) ne doit exister NULLE PART dans les
     données transmises — c'est ce qui garantit que le modèle ne peut plus le
     citer, la garde numérique s'appuyant sur cet inventaire. */
  const nums = collectNumbers({ t });
  ok(!nums.has(2.1), "la valeur 2.1 n'existe plus dans les données transmises");

  const texts = JSON.stringify(t).toLowerCase();
  ok(!/ouvrir|open rfi|"open"/.test(texts), "aucun commentaire ne parle d'ouverture sur ce nœud");

  /* Le moteur heuristique lui-même, testé directement. */
  const sc = scenarioFromHand(hand, step, snaps);
  ok(sc.node.facing === SEM.OPEN_RAISE, "scenarioFromHand détecte l'open malgré le call du BTN intercalé");
  ok(sc.vilPos === "HJ", "le vilain de référence est l'agresseur (HJ), pas le premier siège");
  const res = solveScenario(sc);
  ok(res.alts.every(a => a.sem !== SEM.OPEN_RAISE), "solveScenario ne propose plus d'ouverture");
  ok(res.alts.some(a => a.sem === SEM.THREE_BET), "solveScenario propose bien un 3-bet");

  /* L'équité doit être calculée face à l'agresseur, pas face à UTG. */
  const eq = heroEquity(buildHandState(hand));
  ok(eq?.villainPosition === "HJ", `équité calculée face au HJ (reçu ${eq?.villainPosition})`);
}

/* ═══════════════════════════════════════════════════════════════
   4. VALIDATEUR §4 — les incohérences sont refusées
═══════════════════════════════════════════════════════════════ */
section("§4 — Validateur de cohérence");
{
  const { hand, snaps } = makeHand("BB",
    ["UTGp: folds", "HJp: raises 2 to 2", "COp: folds", "BTNp: folds", "SBp: folds", "Hero: folds"]);
  const base = buildPokerState(hand, snaps, lastHeroStep(hand));

  ok(validatePokerState(base).valid, "état de référence valide");

  const check = { ...base, legalActions: [...base.legalActions, SEM.CHECK] };
  ok(!validatePokerState(check).valid, "CHECK face à une mise → refusé");

  const noCall = { ...base, toCallBB: 0, legalActions: [SEM.CHECK, SEM.CALL_BET] };
  ok(!validatePokerState(noCall).valid, "CALL sans rien à payer → refusé");

  const badOpen = { ...base, heroAction: SEM.OPEN_RAISE, legalActions: [...base.legalActions, SEM.OPEN_RAISE] };
  ok(!validatePokerState(badOpen).valid, "OPEN_RAISE dans un pot déjà ouvert → refusé");

  const badMatrix = { ...base, legalActions: [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.FOUR_BET] };
  ok(!validatePokerState(badMatrix).valid, "4-bet face à un open → refusé (matrice)");

  const badBoard = { ...base, street: "flop", boardCount: 0 };
  ok(!validatePokerState(badBoard).valid, "flop sans board → refusé");

  const dupPos = { ...base, players: [...base.players, { ...base.players[0] }] };
  ok(!validatePokerState(dupPos).valid, "positions dupliquées → refusé");

  /* La matrice couvre bien les cas du cahier des charges. */
  ok(FACING_MATRIX[SEM.OPEN_RAISE].join() === [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET].join(),
    "face à OPEN_RAISE : fold / call / 3-bet");
  ok(FACING_MATRIX[SEM.THREE_BET].join() === [SEM.FOLD_TO_THREE_BET, SEM.CALL_THREE_BET, SEM.FOUR_BET].join(),
    "face à THREE_BET : fold / call / 4-bet");
}

/* ═══════════════════════════════════════════════════════════════
   5. GARDE ANTI-INVENTION §5
═══════════════════════════════════════════════════════════════ */
section("§5 — Aucun nombre inventé");
{
  const facts = {
    ps: { potBB: 5.5, toCallBB: 1, effectiveStackBB: 28.35, potOddsPct: 15 },
    sd: { strategy: { three_bet: 0.18, call_open: 0.22, fold_to_open: 0.48 }, evLossBB: 0.2 },
  };
  const allowed = allowedNumbers(facts);

  const cases = [
    ["ouvrir à 2.1bb", "L'action optimale est d'ouvrir à 2.1bb.", false],
    ["3-bet à 7bb", "Il faut 3-bet à 7bb pour appliquer la pression.", false],
    ["fréquence inventée", "Tu dois défendre 73% du temps ici.", false],
    ["EV inventée", "Ce fold coûte 0.42bb.", false],
    ["stack inventé", "Avec 45bb effectifs, la range change.", false],
    ["fréquence réelle", "Le 3-bet est joué 18 % du temps par la range.", true],
    ["EV réelle", "L'écart estimé est de 0.2bb.", true],
    ["pot réel", "Le pot est de 5.5bb et il faut payer 1bb.", true],
    ["cote réelle", "La cote du pot est de 15 %.", true],
    ["vocabulaire poker", "Un 3-bet ou un 4-bet reste possible, comme un c-bet en heads-up.", true],
    ["notations de main", "A5s et T9o entrent dans la range ; KK aussi.", true],
    ["sans donnée", "Le 3-bet est préféré ; le sizing exact n'est pas disponible pour ce spot.", true],
  ];
  for (const [name, text, shouldPass] of cases) {
    const r = scanForeignNumbers(text, allowed);
    ok(r.clean === shouldPass,
      `${shouldPass ? "accepté" : "rejeté"} — ${name} : « ${text} »${r.foreign.length ? ` (détecté ${r.foreign.map(f => f.value + f.unit)})` : ""}`);
  }

  /* Une source à 2.04bb autorise sa citation arrondie, mais pas 2.1bb. */
  const a2 = allowedNumbers({ x: 2.04 });
  ok(scanForeignNumbers("mise 2bb", a2).clean, "arrondi d'une valeur réelle accepté (2.04 → « 2bb »)");
  ok(!scanForeignNumbers("mise 2.1bb", a2).clean, "2.1bb rejeté même si 2.04bb existe");
}

/* ═══════════════════════════════════════════════════════════════
   6. VALIDATION DE LA RÉPONSE IA §7
═══════════════════════════════════════════════════════════════ */
section("§7 — Validation de la sortie structurée");
{
  const { hand, snaps } = makeHand("BB",
    ["UTGp: folds", "HJp: raises 2 to 2", "COp: folds", "BTNp: calls 2", "SBp: folds", "Hero: folds"]);
  const step = lastHeroStep(hand);
  const target = buildTarget(hand, snaps, CTX(snaps), step);
  const facts = { pokerState: target.pokerState, solverData: { target } };

  const good = {
    heroAction: SEM.FOLD_TO_OPEN, recommendedAction: SEM.THREE_BET,
    strategicReason: "En big blind face à l'open du hijack, la cote du pot justifie une défense plus large.",
    coachAdvice: "Construis une range de 3-bet en BB ; le sizing exact n'est pas disponible pour ce spot.",
    concepts: ["cote du pot", "défense de blinde"], warnings: [],
  };
  ok(validateAiResponse(good, facts).valid, "réponse conforme acceptée");

  const wrongReco = { ...good, recommendedAction: SEM.OPEN_RAISE };
  const r1 = validateAiResponse(wrongReco, facts);
  ok(!r1.valid, "recommendedAction ≠ moteur → rejeté");
  ok(r1.errors.some(e => /hors des actions légales|≠ moteur/.test(e)), "l'erreur nomme le désaccord");

  const wrongHero = { ...good, heroAction: SEM.CALL_OPEN };
  ok(!validateAiResponse(wrongHero, facts).valid, "heroAction ≠ action jouée → rejeté");

  const invented = { ...good, coachAdvice: "3-bet à 7.5bb pour maximiser le fold equity." };
  const r2 = validateAiResponse(invented, facts);
  ok(!r2.valid && r2.foreign.some(f => f.value === 7.5), "sizing inventé dans la prose → rejeté");

  const inventedFreq = { ...good, strategicReason: "Cette main défend 64% du temps." };
  ok(!validateAiResponse(inventedFreq, facts).valid, "fréquence inventée dans la prose → rejetée");
}

/* ═══════════════════════════════════════════════════════════════
   7. §11 — COHÉRENCE INTER-COUCHES
   Hand history → snapshots → PokerState → target → payload backend.
   Aucune information ne doit changer de sens d'une couche à l'autre.
═══════════════════════════════════════════════════════════════ */
section("§11 — Cohérence de bout en bout");
{
  const { hand, snaps } = makeHand("BB",
    ["UTGp: folds", "HJp: raises 2 to 2", "COp: folds", "BTNp: calls 2", "SBp: folds", "Hero: folds"],
    { cards: "Kh 8s", stacks: { BB: 28, HJ: 92 } });
  const step = lastHeroStep(hand);

  /* Couche 1 — hand history */
  const rawAggr = hand.events.find(e => e.type === "raise");
  const rawAggrPos = hand.players.find(p => p.id === rawAggr.playerId).pos;

  /* Couche 2 — snapshots */
  const snapStreet = snaps[step].street;

  /* Couche 3 — PokerState */
  const ps = buildPokerState(hand, snaps, step);

  /* Couche 4 — HandState (payload backend) */
  const hs = buildHandState(hand);

  /* Couche 5 — target (données solveur) */
  const t = buildTarget(hand, snaps, CTX(snaps), step);

  ok(rawAggrPos === ps.lastAggressor.position,
    `agresseur identique HH (${rawAggrPos}) ↔ PokerState (${ps.lastAggressor.position})`);
  ok(snapStreet === ps.street, "street identique snapshot ↔ PokerState");
  ok(hs.hero.position === ps.hero.position, "position Hero identique HandState ↔ PokerState");
  ok(hs.hero.cards.join("") === ps.hero.cards.join(""), "cartes Hero identiques HandState ↔ PokerState");
  ok(rawAggr.toAmount === ps.lastAggressor.toAmountBB,
    `montant de l'open identique HH (${rawAggr.toAmount}) ↔ PokerState (${ps.lastAggressor.toAmountBB})`);
  ok(t.pokerState.heroAction === ps.heroAction, "action Hero identique target ↔ PokerState");
  ok(t.street === ps.street, "street identique target ↔ PokerState");
  ok(ps.playersInHand === 3, `joueurs encore dans le coup = 3 (reçu ${ps.playersInHand})`);
  ok(ps.actionHistory.filter(a => a.semantic === SEM.OPEN_RAISE).length === 1,
    "exactement une ouverture dans l'historique");
  ok(ps.actionHistory.every(a => a.position && a.position !== "?"), "toutes les actions ont une position");

  /* Le pot transmis doit être celui d'AVANT la décision, pas celui d'après. */
  ok(ps.potBB === snaps[step - 1].potTotal,
    `pot = état avant décision (${ps.potBB} vs ${snaps[step - 1].potTotal})`);

  /* La description lisible ne doit contenir aucun terme d'ouverture pour Hero. */
  const d = describeSpot(ps);
  ok(/face au open/.test(d) && /fold face à l'open/.test(d), `description exacte : « ${d} »`);
}

/* ═══════════════════════════════════════════════════════════════
   8. CAS LIMITES
═══════════════════════════════════════════════════════════════ */
section("Cas limites");
{
  /* Limp puis iso-raise. */
  const { hand, snaps } = makeHand("BTN",
    ["UTGp: calls 1", "HJp: calls 1", "COp: folds", "Hero: raises 4 to 5", "SBp: folds", "BBp: folds"]);
  const ps = buildPokerState(hand, snaps, lastHeroStep(hand));
  ok(ps.heroAction === SEM.ISO_RAISE, `iso-raise face aux limpeurs (reçu ${ps.heroAction})`);
  ok(ps.limpers.length === 2, `2 limpeurs détectés (reçu ${ps.limpers.length})`);
  ok(ps.facingAction === SEM.LIMP, "action affrontée = limp");
}
{
  /* Fold en pot NON ouvert : ce n'est pas un « fold face à l'open ». */
  const { hand, snaps } = makeHand("CO", ["UTGp: folds", "HJp: folds", "Hero: folds", "BTNp: folds", "SBp: folds"]);
  const ps = buildPokerState(hand, snaps, lastHeroStep(hand));
  ok(ps.heroAction === SEM.FOLD, `fold en pot non ouvert = FOLD (reçu ${ps.heroAction})`);
  ok(ps.facingAction === null, "aucune action affrontée en pot non ouvert");
}
{
  /* BB qui check son option. */
  const { hand, snaps } = makeHand("BB",
    ["UTGp: calls 1", "HJp: folds", "COp: folds", "BTNp: folds", "SBp: folds", "Hero: checks"]);
  const ps = buildPokerState(hand, snaps, lastHeroStep(hand));
  ok(ps.heroAction === SEM.CHECK_OPTION, `check de l'option (reçu ${ps.heroAction})`);
  ok(ps.toCallBB === 0, "rien à payer");
  ok(validatePokerState(ps).valid, "état cohérent");
}
{
  /* Étape qui n'est pas une décision Hero → null, pas une invention. */
  const { hand, snaps } = makeHand("BB", ["UTGp: folds", "HJp: raises 2 to 2", "COp: folds", "BTNp: folds", "SBp: folds", "Hero: folds"]);
  const hjStep = hand.events.findIndex(e => e.type === "raise");
  ok(buildPokerState(hand, snaps, hjStep) === null, "action adverse → pas de PokerState Hero");
  ok(buildPokerState(hand, snaps, 0) === null, "post de blinde → pas de PokerState");
}
{
  /* Multi-décisions : chaque étape Hero est nommée indépendamment. */
  const { hand, snaps } = makeHand("BB",
    ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "SBp: folds", "Hero: calls 1.5",
     "*** FLOP *** [Ah 7d 2c]", "Hero: checks", "BTNp: bets 2.5", "Hero: raises 6 to 8.5"]);
  const s0 = heroStepAt(hand, 0), s1 = heroStepAt(hand, 1), s2 = heroStepAt(hand, 2);
  ok(buildPokerState(hand, snaps, s0).heroAction === SEM.CALL_OPEN, "décision 1 = call de l'open");
  ok(buildPokerState(hand, snaps, s1).heroAction === SEM.CHECK, "décision 2 = check au flop");
  ok(buildPokerState(hand, snaps, s2).heroAction === SEM.CHECK_RAISE, "décision 3 = check-raise");
}

/* ═══════════════════════════════════════════════════════════════
   9. MONTANTS POSTFLOP — non-régression du parser

   `committed` (mise engagée sur la street) doit repartir de zéro à chaque
   street. Sans ce reset, une mise de 2.5bb au flop était étiquetée « 5bb »
   après un pot préflop de 2.5bb, et l'incrément d'une relance était
   sous-évalué de tout l'investissement antérieur : le pot, les tapis et les
   montants transmis au coach étaient tous faux d'une street de retard.
═══════════════════════════════════════════════════════════════ */
section("Montants postflop (reset de `committed` par street)");
{
  const { hand, snaps } = makeHand("BB",
    ["UTGp: folds", "HJp: folds", "COp: folds", "BTNp: raises 1.5 to 2.5", "SBp: folds", "Hero: calls 1.5",
     "*** FLOP *** [Ah 7d 2c]", "Hero: checks", "BTNp: bets 2.5", "Hero: raises 6 to 8.5", "BTNp: calls 6"]);
  const at = (street, type) => hand.events.find(e => e.street === street && e.type === type);

  ok(at("flop", "bet").toAmount === 2.5, `mise flop = 2.5bb (reçu ${at("flop", "bet").toAmount})`);
  ok(at("flop", "raise").amount === 8.5, `incrément du raise flop = 8.5bb (reçu ${at("flop", "raise").amount})`);
  ok(at("preflop", "raise").toAmount === 2.5, "l'open préflop reste à 2.5bb");

  const last = snaps[snaps.length - 1];
  ok(last.potTotal === 22.5, `pot final = 22.5bb (reçu ${last.potTotal})`);
  const conserv = last.players.reduce((a, p) => a + p.stack + p.committed, 0) + last.potMain;
  ok(Math.abs(conserv - 600) < 0.01, `conservation des jetons (reçu ${conserv} / 600)`);

  /* Le montant affiché par le coach est celui de la street, pas un cumul. */
  const s = heroStepAt(hand, 2);                       // le check-raise
  const ps = buildPokerState(hand, snaps, s);
  ok(ps.lastAggressor.toAmountBB === 2.5,
    `agresseur annoncé à 2.5bb (reçu ${ps.lastAggressor.toAmountBB})`);
  ok(ps.toCallBB === 2.5, `à payer = 2.5bb (reçu ${ps.toCallBB})`);
}

/* ═══════════════════════════════════════════════════════════════
   10. SIZING DE RE-RELANCE (§5)

   Un sizing a le droit d'exister — s'il est CALCULÉ depuis la mise réelle de
   l'adversaire (3× l'open IP, 4× OOP, +1× par caller) et non tiré d'un chapeau.
   Ce qui reste interdit : un sizing sans mise de référence, et un sizing
   injouable (au-dessus du tapis effectif).
═══════════════════════════════════════════════════════════════ */
section("§5 — Sizing de re-relance : calculé, jamais inventé");
{
  const sizing = (heroPos, lines, stacks) => {
    const { hand, snaps } = makeHand(heroPos, lines, { stacks });
    const t = buildTarget(hand, snaps, CTX(snaps), lastHeroStep(hand));
    return t ? { sz: t.recommendedSizingBb, reco: t.recommendedSemantic, origin: t.recommendedSizingOrigin } : null;
  };

  const a = sizing("BB", ["UTGp: folds", "HJp: raises 1 to 2", "COp: folds", "BTNp: folds", "SBp: folds", "Hero: folds"]);
  ok(a.reco === SEM.THREE_BET && a.sz === 8, `BB vs open 2bb (OOP) → 3-bet 8bb = 4× l'open (reçu ${a.sz})`);

  const b = sizing("BB", ["UTGp: folds", "HJp: raises 1 to 2", "COp: folds", "BTNp: calls 2", "SBp: folds", "Hero: folds"]);
  ok(b.sz === 10, `un caller intercalé ajoute 1× l'open → 10bb (reçu ${b.sz})`);

  const c = sizing("BTN", ["UTGp: folds", "HJp: raises 1.5 to 2.5", "COp: folds", "Hero: folds", "SBp: folds", "BBp: folds"]);
  ok(c.sz === 7.5, `BTN vs open 2.5bb (IP) → 3× = 7.5bb (reçu ${c.sz})`);

  const d = sizing("BB", ["UTGp: folds", "HJp: raises 1 to 2", "COp: folds", "BTNp: folds", "SBp: folds", "Hero: folds"], { BB: 5 });
  ok(d.sz <= 5, `sizing plafonné au tapis effectif — jamais injouable (reçu ${d.sz})`);

  const e = sizing("CO", ["UTGp: folds", "HJp: folds", "Hero: raises 1.5 to 2.5", "BTNp: raises 5.5 to 8", "SBp: folds", "BBp: folds", "Hero: folds"]);
  ok(e.reco === SEM.FOUR_BET && e.sz === 17.6, `4-bet dimensionné sur le 3-bet réel → 2.2×8 = 17.6bb (reçu ${e.sz})`);

  /* Provenance : un sizing conventionnel n'est pas une lecture de solveur. */
  ok(a.origin === ORIGIN.POKERFORGE_HEURISTIC, `le sizing porte sa provenance (${a.origin})`);

  /* Sans mise de référence, on ne propose RIEN : le Solver manuel n'a pas de
     contexte de mise, donc pas de sizing plausible fabriqué à sa place. */
  const manuel = solveScenario({ ...{ format: "Cash", players: 6, heroPos: "BB", vilPos: "BTN",
    heroStack: 100, vilStack: 100, potBb: 3, board: "", heroCards: "", street: "Preflop",
    prevAction: "Raise 2.5bb", node: null, villainProfile: "Reg", mode: "gto" } });
  const troisBet = manuel.alts.find(x => x.sem === SEM.THREE_BET);
  ok(troisBet && troisBet.sizingBb == null, "sans contexte de mise : aucun sizing proposé");

  /* Le sizing doit être citable par le coach : il figure dans l'inventaire. */
  const { hand, snaps } = makeHand("BB", ["UTGp: folds", "HJp: raises 1 to 2", "COp: folds", "BTNp: folds", "SBp: folds", "Hero: folds"]);
  const t = buildTarget(hand, snaps, CTX(snaps), lastHeroStep(hand));
  const allowed = allowedNumbers({ ps: t.pokerState, sd: t });
  ok(scanForeignNumbers("Le 3-bet usuel est de 8bb.", allowed).clean, "le sizing réel est citable par le coach");
  ok(!scanForeignNumbers("Le 3-bet usuel est de 7bb.", allowed).clean, "un sizing voisin mais faux reste rejeté");
}

console.log(`\n${failed ? "❌" : "✅"} Replayer PokerState : ${passed} ok, ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
