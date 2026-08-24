/* ══════════════════════════════════════════════════════════════════════════
   test-full-hand-multiway — C8 : LES SIDE POTS SONT JOUÉS, PAS SEULEMENT CALCULÉS

   Ce que ce fichier prouve, main par main :
     ① une table de trois se joue jusqu'à l'abattage — le moteur n'est plus
        heads-up par construction ;
     ② un tapis court ne dispute que ce qu'il a pu payer : il encaisse le pot
        principal, jamais le side pot ;
     ③ le side pot va au meilleur des joueurs qui l'ont alimenté ;
     ④ une relance COMPLÈTE rouvre la parole à tous les autres, y compris à
        ceux qui avaient déjà parlé (règle invisible en heads-up) ;
     ⑤ un all-in INCOMPLET ne la rouvre pour personne ;
     ⑥ l'ordre de parole est respecté : chaque street repart de l'OOP ;
     ⑦ aucun jeton n'est créé ni détruit, à trois comme à deux, sur un
        échantillon aléatoire.

   Le point ② est ce qui manquait : `potDistribution` savait DÉCOUPER les
   paliers, mais aucune main à trois n'atteignait jamais l'attribution parce
   que le moteur refusait de la jouer. La règle était écrite sans jamais être
   exercée.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  createFullHand, applyAction, legalActions, amountToCall, raiseBounds,
  auditLedger, playVillain, defaultVillainPolicy, stackOf,
} from "./src/fullHandEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 0.001) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

const C = (r, s) => ({ r, s });
/* Board fixe. Q♠ J♦ T♣ 2♥ 7♠ — trois forces nettement ordonnées :
     A♥K♥ → quinte à l'As (la meilleure)
     9♥8♦ → quinte au Valet
     K♠Q♦ → simple paire de Dames                                          */
const BOARD = [C("Q", "♠"), C("J", "♦"), C("T", "♣"), C("2", "♥"), C("7", "♠")];
const MAIN_FORTE = [C("A", "♥"), C("K", "♥")];
const MAIN_MOYENNE = [C("9", "♥"), C("8", "♦")];
const MAIN_FAIBLE = [C("K", "♠"), C("Q", "♦")];

const conserve = (s, m) => { eq(auditLedger(s), [], m); };

/* ── 1. Le tapis court encaisse le POT PRINCIPAL, pas le side pot ────────── */
{
  /* hero 10bb (court, meilleure main) · p2 40bb (plus faible) · p3 40bb
     (intermédiaire). Chacun a engagé 2bb au préflop → pot d'entrée 6bb.  */
  let s = createFullHand({
    fullBoard: BOARD, startPot: 6, firstToAct: "hero",
    seats: ["hero", "p2", "p3"],
    players: [
      { id: "hero", hand: MAIN_FORTE, stack: 10, committedBefore: 2 },
      { id: "p2", hand: MAIN_FAIBLE, stack: 40, committedBefore: 2 },
      { id: "p3", hand: MAIN_MOYENNE, stack: 40, committedBefore: 2 },
    ],
  });
  near(s.totalChips, 96, "total = 10 + 40 + 40 + 6");
  eq(s.toAct, "hero", "l'OOP parle en premier");
  conserve(s, "conservation à la création d'une table de trois");

  s = applyAction(s, "hero", { type: "BET", amount: 10 });   // tapis
  near(stackOf(s, "hero"), 0, "le tapis court est à zéro");
  eq(s.toAct, "p2", "la parole passe au siège suivant dans l'ordre");

  s = applyAction(s, "p2", { type: "RAISE", amount: 20 });
  eq(s.toAct, "p3", "puis à p3");
  s = applyAction(s, "p3", { type: "CALL" });
  ok(!s.done, "la main continue : p2 et p3 ont encore des jetons");
  eq(s.street, "turn", "le tour d'enchères du flop est clos");
  near(s.pot, 6 + 10 + 20 + 20, "pot = 6 reportés + 50 engagés au flop");
  conserve(s, "conservation après un all-in couvert par deux joueurs");

  /* p2 et p3 checkent turn puis river : on va à l'abattage. */
  s = applyAction(s, "p2", { type: "CHECK" });
  s = applyAction(s, "p3", { type: "CHECK" });
  eq(s.street, "river", "le turn est clos par deux checks");
  s = applyAction(s, "p2", { type: "CHECK" });
  s = applyAction(s, "p3", { type: "CHECK" });
  ok(s.done, "la main est terminée");

  eq(s.result.reason, "showdown", "abattage");
  eq(s.result.winner, "hero", "hero a la meilleure main");
  ok(s.result.sidePots >= 1, `au moins un side pot a été JOUÉ (${s.result.sidePots})`);
  eq(s.result.pots.length, 2, "deux paliers : pot principal + side pot");

  /* Contributions TOTALES : hero 12 · p2 22 · p3 22.
     Palier 1 (≤12) : 3 × 12 = 36 → disputé par les trois → hero.
     Palier 2 (10 de plus) : 2 × 10 = 20 → disputé par p2/p3 → p3 (quinte). */
  near(s.result.pots[0].montant, 36, "pot principal = 36bb");
  near(s.result.pots[1].montant, 20, "side pot = 20bb");
  eq([...s.result.pots[1].disputePar].sort(), ["p2", "p3"], "le tapis court ne dispute PAS le side pot");
  near(s.result.payout.hero, 36, "hero encaisse le pot principal, et seulement lui");
  near(s.result.payout.p3, 20, "le side pot va au meilleur de ceux qui l'ont alimenté");
  near(s.result.payout.p2 || 0, 0, "p2, plus faible, n'encaisse rien");

  near(stackOf(s, "hero"), 36, "tapis final hero");
  near(stackOf(s, "p2"), 20, "tapis final p2");
  near(stackOf(s, "p3"), 40, "tapis final p3");
  near(s.result.netBb.hero, 24, "hero : +24bb (36 gagnés − 12 engagés)");
  near(s.result.netBb.p2, -22, "p2 : −22bb");
  near(s.result.netBb.p3, -2, "p3 : −2bb");
  near(s.result.netBb.hero + s.result.netBb.p2 + s.result.netBb.p3, 0, "jeu à somme nulle à trois");
  conserve(s, "conservation après attribution d'un pot à deux paliers");
}

/* ── 2. Le tapis court PERD : il ne reprend rien, le side pot reste séparé ─ */
{
  let s = createFullHand({
    fullBoard: BOARD, startPot: 6, firstToAct: "hero",
    seats: ["hero", "p2", "p3"],
    players: [
      { id: "hero", hand: MAIN_FAIBLE, stack: 10, committedBefore: 2 },   // le plus faible
      { id: "p2", hand: MAIN_MOYENNE, stack: 40, committedBefore: 2 },
      { id: "p3", hand: MAIN_FORTE, stack: 40, committedBefore: 2 },      // le meilleur
    ],
  });
  s = applyAction(s, "hero", { type: "BET", amount: 10 });
  s = applyAction(s, "p2", { type: "CALL" });
  s = applyAction(s, "p3", { type: "RAISE", amount: 20 });
  eq(s.toAct, "p2", "la relance complète de p3 rouvre la parole à p2, qui avait déjà suivi");
  s = applyAction(s, "p2", { type: "CALL" });
  while (!s.done && s.toAct) s = applyAction(s, s.toAct, { type: "CHECK" });
  ok(s.done, "la main va au bout");
  eq(s.result.winner, "p3", "p3 gagne les deux paliers");
  near(s.result.payout.p3, 56, "p3 encaisse 36 + 20");
  near(s.result.payout.hero || 0, 0, "le tapis court perdant ne récupère rien");
  near(stackOf(s, "hero"), 0, "hero est éliminé du coup");
  conserve(s, "conservation quand le court perd");
}

/* ── 3. Un side pot orphelin retourne à ceux qui l'ont alimenté ──────────── */
{
  /* p2 relance au-delà de ce que hero peut payer, puis se couche face à p3 :
     le palier supérieur n'a plus qu'un prétendant, il lui revient. */
  let s = createFullHand({
    fullBoard: BOARD, startPot: 6, firstToAct: "hero",
    seats: ["hero", "p2", "p3"],
    players: [
      { id: "hero", hand: MAIN_FORTE, stack: 10, committedBefore: 2 },
      { id: "p2", hand: MAIN_FAIBLE, stack: 40, committedBefore: 2 },
      { id: "p3", hand: MAIN_MOYENNE, stack: 40, committedBefore: 2 },
    ],
  });
  s = applyAction(s, "hero", { type: "BET", amount: 10 });
  s = applyAction(s, "p2", { type: "RAISE", amount: 24 });
  s = applyAction(s, "p3", { type: "RAISE", amount: 40 });   // tapis
  s = applyAction(s, "p2", { type: "FOLD" });
  ok(s.done, "hero est à tapis et p2 s'est couché : plus personne ne peut miser");
  /* p3 a engagé 40 mais seul hero (12 au total) et p2 (26 au total) l'ont
     suivi : l'excédent non suivi lui est rendu AVANT l'attribution. */
  const remb = s.ledger.filter(l => l.kind === "return");
  ok(remb.length >= 1, "un remboursement de la part non suivie est enregistré");
  near(s.result.payout.hero, 36, "hero, meilleure main, prend le pot principal (3 × 12)");
  ok((s.result.payout.p3 || 0) > 0, "p3 récupère le palier que hero ne disputait pas");
  near(s.result.netBb.hero + s.result.netBb.p2 + s.result.netBb.p3, 0, "somme nulle malgré le fold intermédiaire");
  conserve(s, "conservation avec fold au-dessus d'un all-in");
}

/* ── 4. Un all-in INCOMPLET ne rouvre la parole à personne (à trois) ─────── */
{
  let s = createFullHand({
    fullBoard: BOARD, startPot: 6, firstToAct: "hero",
    seats: ["hero", "p2", "p3"],
    players: [
      { id: "hero", hand: MAIN_FORTE, stack: 100, committedBefore: 2 },
      { id: "p2", hand: MAIN_FAIBLE, stack: 9, committedBefore: 2 },
      { id: "p3", hand: MAIN_MOYENNE, stack: 100, committedBefore: 2 },
    ],
  });
  s = applyAction(s, "hero", { type: "BET", amount: 6 });
  ok(raiseBounds(s, "p2").allInOnly, "p2 (9bb) ne peut pas relancer complètement face à 6bb");
  s = applyAction(s, "p2", { type: "RAISE", amount: 9 });   // tapis, incomplet
  eq(s.raiseLocked, true, "l'action est verrouillée");
  eq(s.toAct, "p3", "p3 doit encore parler : il n'avait pas agi");
  ok(!legalActions(s, "p3").some(a => a.type === "RAISE"), "mais il ne peut que suivre ou se coucher");
  s = applyAction(s, "p3", { type: "CALL" });
  eq(s.toAct, "hero", "hero doit compléter les 3bb supplémentaires");
  ok(!legalActions(s, "hero").some(a => a.type === "RAISE"), "et lui non plus ne peut pas re-relancer");
  near(amountToCall(s, "hero"), 3, "hero doit 3bb de plus");
  s = applyAction(s, "hero", { type: "CALL" });
  eq(s.street, "turn", "le tour est clos");
  conserve(s, "conservation après un all-in incomplet à trois");
}

/* ── 5. Chaque street repart de l'OOP, même après des folds ──────────────── */
{
  let s = createFullHand({
    fullBoard: BOARD, startPot: 9, firstToAct: "p1",
    seats: ["p1", "p2", "hero"],
    players: [
      { id: "p1", hand: MAIN_FAIBLE, stack: 50, committedBefore: 3 },
      { id: "p2", hand: MAIN_MOYENNE, stack: 50, committedBefore: 3 },
      { id: "hero", hand: MAIN_FORTE, stack: 50, committedBefore: 3 },
    ],
  });
  eq(s.toAct, "p1", "flop : p1 ouvre");
  s = applyAction(s, "p1", { type: "CHECK" });
  eq(s.toAct, "p2", "puis p2");
  s = applyAction(s, "p2", { type: "CHECK" });
  eq(s.toAct, "hero", "puis hero");
  s = applyAction(s, "hero", { type: "CHECK" });
  eq(s.street, "turn", "trois checks ferment la street");
  eq(s.toAct, "p1", "turn : la parole revient à l'OOP");
  s = applyAction(s, "p1", { type: "FOLD" });
  eq(s.toAct, "p2", "p1 couché, p2 parle");
  s = applyAction(s, "p2", { type: "CHECK" });
  s = applyAction(s, "hero", { type: "CHECK" });
  eq(s.toAct, "p2", "river : p1 étant couché, l OOP effectif est p2");
  conserve(s, "conservation sur une street sans mise");
}

/* ── 6 bis. L'ARGENT MORT VA AU POT PRINCIPAL, PAS À L'OOP ────────────────
   Un pot de squeeze contient les blindes des sièges couchés avant le flop :
   elles n'appartiennent à aucun joueur assis. Le moteur poussait tout ce
   surplus vers le joueur hors de position — c'est-à-dire, une fois sur deux,
   vers le PERDANT du coup. L'argent mort entre dans le pot principal et suit
   son gagnant. */
{
  /* p2 (OOP, le plus faible) · hero (le meilleur) · p3. Trois joueurs à 2.5bb
     engagés = 7.5bb ; le pot d'entrée vaut 9bb → 1.5bb d'argent mort. */
  let s = createFullHand({
    fullBoard: BOARD, startPot: 9, firstToAct: "p2",
    seats: ["p2", "hero", "p3"],
    players: [
      { id: "p2", hand: MAIN_FAIBLE, stack: 20, committedBefore: 2.5 },
      { id: "hero", hand: MAIN_FORTE, stack: 20, committedBefore: 2.5 },
      { id: "p3", hand: MAIN_MOYENNE, stack: 20, committedBefore: 2.5 },
    ],
  });
  while (!s.done && s.toAct) s = applyAction(s, s.toAct, { type: "CHECK" });
  eq(s.result.winner, "hero", "hero gagne l'abattage");
  near(s.result.potAwarded, 9, "le pot vaut 9bb");
  near(s.result.payout.hero, 9, "hero encaisse le pot ENTIER, argent mort compris");
  near(s.result.payout.p2 || 0, 0, "l'OOP perdant ne reçoit pas les 1.5bb morts");
  const mort = s.ledger.find(l => l.kind === "dead");
  ok(mort && Math.abs(mort.amount - 1.5) < 0.001, `1.5bb d'argent mort identifié au ledger (${mort && mort.amount})`);
  near(stackOf(s, "hero"), 29, "tapis final hero = 20 + 9");
  near(stackOf(s, "p2"), 20, "p2 garde son tapis, sans prime");
  conserve(s, "conservation avec argent mort");
}

/* ── 6 ter. Un partage se partage aussi l'argent mort ────────────────────── */
{
  let s = createFullHand({
    fullBoard: BOARD, startPot: 9, firstToAct: "p2",
    seats: ["p2", "hero", "p3"],
    players: [
      { id: "p2", hand: MAIN_FAIBLE, stack: 20, committedBefore: 2.5 },
      { id: "hero", hand: MAIN_FORTE, stack: 20, committedBefore: 2.5 },
      { id: "p3", hand: [C("A", "♦"), C("K", "♦")], stack: 20, committedBefore: 2.5 },  // même quinte
    ],
  });
  while (!s.done && s.toAct) s = applyAction(s, s.toAct, { type: "CHECK" });
  eq(s.result.winner, "split", "hero et p3 ont la même quinte");
  near(s.result.payout.hero + s.result.payout.p3, 9, "les deux gagnants se partagent le pot entier");
  near(s.result.payout.p2 || 0, 0, "l'OOP perdant reste à zéro");
  conserve(s, "conservation sur un partage avec argent mort");
}

/* ── 6. Échantillon aléatoire à 3 et 4 joueurs : la conservation ne cède pas ─ */
{
  let seed = 20260824 >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const RANKS = "23456789TJQKA", SUITS = "♠♥♦♣";
  let mains = 0, ecarts = 0, orphelins = 0, negatifs = 0, avecSidePot = 0, folds = 0, abattages = 0, splits = 0;

  for (let t = 0; t < 500; t++) {
    const n = 3 + (rnd() < 0.4 ? 1 : 0);                      // 3 ou 4 joueurs
    const besoin = 2 * n + 5;
    const deck = new Set();
    while (deck.size < besoin) deck.add(Math.floor(rnd() * 52));
    const cs = [...deck].map(i => ({ r: RANKS[i >> 2], s: SUITS[i & 3] }));
    const ids = ["hero", "p2", "p3", "p4"].slice(0, n);
    /* Tapis DÉLIBÉRÉMENT inégaux : c'est là que les side pots apparaissent. */
    const players = ids.map((id, k) => ({
      id, hand: cs.slice(k * 2, k * 2 + 2),
      stack: [5, 12, 25, 60, 150][Math.floor(rnd() * 5)],
      committedBefore: 2,
    }));
    const attendu = players.reduce((a, p) => a + p.stack + p.committedBefore, 0);
    let s = createFullHand({
      fullBoard: cs.slice(n * 2, n * 2 + 5), startPot: 2 * n,
      players, seats: ids, firstToAct: ids[Math.floor(rnd() * n)],
    });

    let garde = 0;
    while (!s.done && s.toAct && garde++ < 80) {
      const actor = s.toAct;
      if (actor !== "hero") { s = playVillain(s, defaultVillainPolicy, { random: rnd }); continue; }
      const acts = legalActions(s, "hero");
      if (!acts.length) break;
      const choix = acts[Math.floor(rnd() * acts.length)];
      const b = raiseBounds(s, "hero");
      const amount = choix.type === "BET" || choix.type === "RAISE"
        ? Math.min(b.maxTo, Math.max(b.minTo, Math.round((b.minTo + rnd() * b.maxTo) * 2) / 2))
        : undefined;
      const suivant = applyAction(s, "hero", { type: choix.type, ...(amount != null ? { amount } : {}) });
      s = suivant === s ? applyAction(s, "hero", { type: acts[0].type }) : suivant;
      if (auditLedger(s).length) ecarts++;
      for (const id of ids) if (stackOf(s, id) < -0.001) negatifs++;
    }
    if (!s.done) continue;
    mains++;
    if (s.pot !== 0) orphelins++;
    const totalFinal = ids.reduce((a, id) => a + stackOf(s, id), 0);
    if (Math.abs(totalFinal - attendu) > 0.001) ecarts++;
    const somme = ids.reduce((a, id) => a + (s.result.netBb[id] || 0), 0);
    if (Math.abs(somme) > 0.001) ecarts++;
    if (s.result.sidePots > 0) avecSidePot++;
    if (s.result.reason === "fold") folds++; else abattages++;
    if (s.result.winner === "split") splits++;
  }

  ok(mains >= 400, `${mains} mains multiway jouées jusqu'au bout`);
  eq(ecarts, 0, `0 écart de conservation sur ${mains} mains à 3 et 4 joueurs`);
  eq(orphelins, 0, "0 pot orphelin");
  eq(negatifs, 0, "0 tapis négatif");
  ok(avecSidePot >= 40, `${avecSidePot} mains ont RÉELLEMENT joué au moins un side pot`);
  ok(folds > 0 && abattages > 0, `échantillon bilatéral : ${folds} folds / ${abattages} abattages (dont ${splits} splits)`);
}

console.log(`✅ Full Hand multiway — side pots joués, ordre de parole, conservation — ${passed} assertions OK`);
