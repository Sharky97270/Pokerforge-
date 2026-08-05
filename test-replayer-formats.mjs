/* Tests — parsing multi-rooms du Replayer (§5).
   Garde-fou : détection de la room + board correct malgré les formats variés
   (marqueurs *** FLOP *** vs ** Dealing Flop **, montants entre crochets…).
   Lancement : node test-replayer-formats.mjs                              */
import { parseSession, parseHand, pfDetectSite } from "./src/replayer/handModel.js";
import { computeAllSnapshots } from "./src/replayer/stateEngine.js";

let passed=0, failed=0;
function ok(c,m){ if(c) passed++; else { failed++; console.error("  ✗ "+m); } }

const HANDS = {
  PokerStars: `PokerStars Hand #234589012: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'Andromeda' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Seat 5: P5 ($200 in chips)
Hero: posts small blind $1
P5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: calls $5
P5: folds
*** FLOP *** [Ah Kd 7c]
Hero: checks
Villain: bets $7
Hero: calls $7
*** TURN *** [Ah Kd 7c] [2s]
Hero: checks
Villain: checks
*** RIVER *** [Ah Kd 7c 2s] [9h]
Hero: checks
Villain: checks`,

  Winamax: `Winamax Poker - CashGame - HandId: #12345-67-1234567890 - Holdem no limit (0.01€/0.02€) - 2023/05/12 20:15:33 UTC
Table: 'Wichita 12' 5-max (real money) Seat #3 is the button
Seat 1: Hero (2€)
Seat 2: Villain (2.50€)
Seat 3: Player3 (1.80€)
*** ANTE/BLINDS ***
Hero posts small blind 0.01€
Villain posts big blind 0.02€
Dealt to Hero [As Kh]
*** PRE-FLOP ***
Player3 raises 0.06€ to 0.08€
Hero calls 0.07€
Villain folds
*** FLOP *** [Ah 7c 2d]
Hero checks
Player3 bets 0.10€
Hero calls 0.10€
*** TURN *** [Ah 7c 2d][9s]
Hero checks
Player3 checks
*** RIVER *** [Ah 7c 2d 9s][Jh]
Hero checks
Player3 checks`,

  GGPoker: `Poker Hand #TM123456789: Hold'em No Limit ($0.05/$0.10) - 2023/06/01 12:00:00
Table 'Xeus' 6-max Seat #1 is the button
Seat 1: Hero ($10)
Seat 2: v2 ($10)
Seat 3: v3 ($10)
Hero: posts small blind $0.05
v2: posts big blind $0.10
*** HOLE CARDS ***
Dealt to Hero [As Kh]
v3: folds
Hero: raises $0.20 to $0.30
v2: calls $0.20
*** FLOP *** [Ah 7c 2d]
Hero: bets $0.40
v2: calls $0.40
*** TURN *** [Ah 7c 2d] [9s]
Hero: checks
v2: checks
*** RIVER *** [Ah 7c 2d 9s] [Jh]
Hero: checks
v2: checks`,

  PartyPoker: `partypoker Hand #12345678901: Hold'em No Limit ($0.01/$0.02 USD) - 2023/05/12 20:00:00
Table Nassau 6-max Seat #3 is the button
Seat 1: Hero ( $2 USD )
Seat 2: Villain ( $2 USD )
Seat 3: p3 ( $2 USD )
Hero: posts small blind $0.01
Villain: posts big blind $0.02
** Dealing down cards **
Dealt to Hero [ As Kh ]
p3: folds
Hero: raises $0.06 to $0.08
Villain: calls $0.06
** Dealing Flop ** [ Ah, 7c, 2d ]
Hero: bets $0.10
Villain: calls $0.10
** Dealing Turn ** [ Ah, 7c, 2d, 9s ]
Hero: checks
Villain: checks
** Dealing River ** [ Ah, 7c, 2d, 9s, Jh ]
Hero: checks
Villain: checks`,

  '888': `888poker Hand History for Game 123456789
$0.01/$0.02 Blinds No Limit Holdem - *** 12 05 2023 20:00:00
Table Madrid 6 Max (Real Money)
Seat 3 is the button
Total number of players : 3
Seat 1: Hero ( $2 )
Seat 2: Villain ( $2 )
Seat 3: p3 ( $2 )
Hero posts small blind [$0.01]
Villain posts big blind [$0.02]
** Dealing down cards **
Dealt to Hero [ As Kh ]
p3 folds
Hero raises [$0.06]
Villain calls [$0.04]
** Dealing Flop ** [ Ah 7c 2d ]
Hero bets [$0.10]
Villain calls [$0.10]
** Dealing Turn ** [ 9s ]
Hero checks
Villain checks
** Dealing River ** [ Jh ]
Hero checks
Villain checks`,
};

const EXPECT_ROOM = { PokerStars:"PokerStars", Winamax:"Winamax", GGPoker:"GGPoker", PartyPoker:"PartyPoker", '888':"888" };

for(const [name, hh] of Object.entries(HANDS)){
  console.log("\n── " + name);
  ok(pfDetectSite(hh)===EXPECT_ROOM[name], `détection room = ${EXPECT_ROOM[name]} (obtenu ${pfDetectSite(hh)})`);
  const s = parseSession(hh);
  const h = s.hands[0];
  ok(!!h, "main parsée");
  if(!h) continue;
  ok(h.room===EXPECT_ROOM[name], `room = ${EXPECT_ROOM[name]}`);
  ok(h.heroCards.map(c=>c.r+c.s).join("")==="A♠K♥" || h.heroCards.length===2, "cartes Hero (2)");
  const board = computeAllSnapshots(h).slice(-1)[0].board.map(c=>c.r+c.s).join(" ");
  ok(board==="A♥ 7♣ 2♦ 9♠ J♥" || board==="A♥ K♦ 7♣ 2♠ 9♥",
     `board complet 5 cartes (obtenu « ${board} »)`);
  const acts = h.events.filter(e=>["fold","check","call","bet","raise","allin"].includes(e.type)).length;
  ok(acts>=5, `actions détectées (${acts})`);
}

/* ── Déduplication robuste : mains DISTINCTES jamais fusionnées ── */
console.log("\n── Déduplication par contenu");
{
  const mk = (id, hero) => `Winamax Poker - Tournament "KO" buyIn: 4.50€ level: 13 - HandId: #${id}-111-1709498640 - Holdem no limit (200/800/1600) - 2024/03/03 20:44:00 UTC
Table: 'KO(123)#0133' 6-max (real money) Seat #3 is the button
Seat 1: Hero (18850)
Seat 2: v2 (58320)
*** ANTE/BLINDS ***
Hero posts small blind 400
v2 posts big blind 800
Dealt to Hero [${hero}]
*** PRE-FLOP ***
Hero raises 1600 to 2000
v2 calls 1200`;
  // 2 HandId à 19 chiffres qui COLLISIONNENT en Number (float64) mais sont distincts
  const A = mk("3254203472144236617", "6d Ts");
  const B = mk("3254203472144236552", "Th Qh");
  const sess = parseSession([A, B].join("\n\n"));
  ok(sess.imported===2, `2 mains distinctes (HandId 19 chiffres) conservées (obtenu ${sess.imported})`);
  ok(sess.duplicates===0, `0 doublon (obtenu ${sess.duplicates})`);
  // vrai HandId extrait (pas le n° de table 0133)
  ok(sess.hands[0].handId==="3254203472144236617", `HandId réel extrait (obtenu ${sess.hands[0].handId})`);
  // même main importée deux fois → 1 doublon
  const dup = parseSession([A, A].join("\n\n"));
  ok(dup.imported===1 && dup.duplicates===1, `main identique dédupliquée (imported ${dup.imported}, dup ${dup.duplicates})`);
  // GGPoker : HandId alphanumérique « TM… »
  const gg = parseHand(HANDS.GGPoker, 0);
  ok(gg.handId==="TM123456789", `GG HandId alphanumérique (obtenu ${gg.handId})`);
}

console.log(`\n${failed===0 ? "✅" : "❌"} Replayer Formats : ${passed} ok, ${failed} échec(s)`);
process.exit(failed===0 ? 0 : 1);
