import { analyzeHandHistory, parseSessionText, ceDetectSite } from "./src/coachEngine.js";

const SAMPLES = {
PokerStars: `PokerStars Hand #245678901234: Hold'em No Limit ($0.50/$1.00 USD) - 2024/01/15 20:30:00 ET
Table 'Acamar III' 6-max Seat #2 is the button
Seat 1: HeroPlayer ($100.00 in chips)
Seat 2: Villain1 ($120.50 in chips)
Seat 3: Villain2 ($95.00 in chips)
Seat 4: Villain3 ($210.00 in chips)
Seat 5: Villain4 ($100.00 in chips)
Seat 6: Villain5 ($88.00 in chips)
Villain2: posts small blind $0.50
Villain3: posts big blind $1.00
*** HOLE CARDS ***
Dealt to HeroPlayer [Ah Kd]
Villain4: folds
Villain5: folds
HeroPlayer: raises $2.50 to $3.50
Villain1: folds
Villain2: folds
Villain3: calls $2.50
*** FLOP *** [Ks 7h 2c]
Villain3: checks
HeroPlayer: bets $4.00
Villain3: calls $4.00
*** TURN *** [Ks 7h 2c] [9d]
Villain3: checks
HeroPlayer: bets $9.00
Villain3: calls $9.00
*** RIVER *** [Ks 7h 2c 9d] [3s]
Villain3: checks
HeroPlayer: bets $20.00
Villain3: folds
Uncalled bet ($20.00) returned to HeroPlayer
HeroPlayer collected $33.00 from pot
*** SUMMARY ***
Total pot $33.00 | Rake $0
Board [Ks 7h 2c 9d 3s]`,

Winamax: `Winamax Poker - CashGame - HandId: #12345-678-9 - Holdem no limit (0.05€/0.10€) - 2024/02/01 18:00:00 UTC
Table: 'Paris 12' 5-max (real money) Seat #3 is the button
Seat 1: Joueur1 (10€)
Seat 2: Joueur2 (8.50€)
Seat 3: Hero (12.30€)
Seat 4: Joueur4 (9.00€)
Seat 5: Joueur5 (15.00€)
Joueur4 posts small blind 0.05€
Joueur5 posts big blind 0.10€
*** PRE-FLOP ***
Dealt to Hero [Qh Qs]
Joueur1 folds
Joueur2 calls 0.10€
Hero raises 0.40€ to 0.50€
Joueur4 folds
Joueur5 folds
Joueur2 calls 0.40€
*** FLOP *** [Jc 5d 2h]
Joueur2 checks
Hero bets 0.70€
Joueur2 calls 0.70€
*** TURN *** [Jc 5d 2h][8s]
Joueur2 checks
Hero bets 1.50€
Joueur2 folds
Hero collected 2.55€
*** SUMMARY ***`,

GGPoker: `Poker Hand #HD1234567890: Hold'em No Limit ($1/$2) - 2024/03/10 12:00:00
Table 'NLHGold' 6-max Seat #1 is the button
Seat 1: Hero ($200 in chips)
Seat 2: a1b2c3 ($200 in chips)
Seat 3: d4e5f6 ($150 in chips)
Seat 4: g7h8i9 ($300 in chips)
Seat 5: j1k2l3 ($200 in chips)
Seat 6: m4n5o6 ($180 in chips)
a1b2c3: posts small blind $1
d4e5f6: posts big blind $2
*** HOLE CARDS ***
Dealt to Hero [As Ad]
g7h8i9: folds
j1k2l3: folds
m4n5o6: raises $4 to $6
Hero: raises $12 to $18
a1b2c3: folds
d4e5f6: folds
m4n5o6: calls $12
*** FLOP *** [Tc 6h 2s]
m4n5o6: checks
Hero: bets $20
m4n5o6: calls $20
*** TURN *** [Tc 6h 2s] [Kd]
m4n5o6: checks
Hero: checks
*** RIVER *** [Tc 6h 2s Kd] [4c]
m4n5o6: bets $60
Hero: calls $60
*** SHOW DOWN ***
m4n5o6: shows [Kh Qd] (a pair of Kings)
Hero: shows [As Ad] (a pair of Aces)
Hero collected $196 from pot
*** SUMMARY ***`,

PartyPoker: `***** Hand History for Game 987654321 *****
$1/$2 USD NL Texas Hold'em - Tuesday, April 02, 19:00:00 CET 2024
Table Mega (Real Money) Seat 4 is the button
Seat 1: HeroX ( $200 USD )
Seat 2: PartyVil1 ( $200 USD )
Seat 3: PartyVil2 ( $180 USD )
Seat 4: PartyVil3 ( $250 USD )
PartyVil1 posts small blind [$1 USD].
PartyVil2 posts big blind [$2 USD].
** Dealing down cards **
Dealt to HeroX [ Js Jh ]
PartyVil3 folds
HeroX raises [$6 USD]
PartyVil1 folds
PartyVil2 calls [$4 USD]
** Dealing Flop ** [ 7c, 4d, 2s ]
PartyVil2 checks
HeroX bets [$8 USD]
PartyVil2 calls [$8 USD]
** Dealing Turn ** [ 9h ]
PartyVil2 checks
HeroX bets [$18 USD]
PartyVil2 folds
HeroX wins $36 USD`,

"888": `#Game No : 123456789
***** 888poker Hand History for Game 123456789 *****
$0.50/$1 Blinds No Limit Holdem - *** 01 05 2024 21:00:00
Table Madrid 6 Max (Real Money)
Seat 5 is the button
Seat 1: Hero ( $100 )
Seat 3: Eight1 ( $100 )
Seat 5: Eight2 ( $120 )
Seat 6: Eight3 ( $90 )
Eight3 posts small blind [$0.50]
Hero posts big blind [$1]
** Dealing down cards **
Dealt to Hero [ Kh Ks ]
Eight1 folds
Eight2 raises [$3]
Eight3 folds
Hero raises [$10]
Eight2 calls [$7]
** Dealing flop ** [ 8c 5d 3h ]
Hero bets [$12]
Eight2 calls [$12]
** Dealing turn ** [ 8c 5d 3h ] [ 2c ]
Hero bets [$30]
Eight2 folds
Hero collected [ $50 ]`,

iPokerXML: `<session sessioncode="999">
<general><startdate>2024-05-01 10:00:00</startdate></general>
<game gamecode="555555">
<general>
<startdate>2024-05-01 10:00:05</startdate>
<players>
<player seat="1" name="HeroFR" chips="1000" dealer="1" win="60" bet="20"/>
<player seat="2" name="VilFR1" chips="1000" dealer="0" win="0" bet="20"/>
<player seat="3" name="VilFR2" chips="1000" dealer="0" win="0" bet="10"/>
</players>
</general>
<round no="0">
<cards type="Pocket" player="HeroFR">D7 C7</cards>
<action no="1" player="VilFR2" type="1" sum="5"/>
<action no="2" player="HeroFR" type="2" sum="10"/>
<action no="3" player="VilFR1" type="3" sum="10"/>
<action no="4" player="VilFR2" type="3" sum="5"/>
</round>
<round no="2">
<cards type="Flop" player="">H7 S2 D3</cards>
<action no="5" player="VilFR2" type="4"/>
<action no="6" player="HeroFR" type="5" sum="20"/>
<action no="7" player="VilFR1" type="0"/>
<action no="8" player="VilFR2" type="0"/>
</round>
</game>
</session>`,

Partial: `Some random text that is not a hand history at all, just garbage to test fallbacks and ensure no crash happens here.`,
};

let pass = 0, fail = 0;
for (const [room, hh] of Object.entries(SAMPLES)) {
  console.log("\n" + "=".repeat(70));
  console.log("ROOM:", room, "| detectSite:", ceDetectSite(hh));
  try {
    const r = analyzeHandHistory(hh);
    if (!r.ok) {
      console.log("  ok=false →", r.error);
      console.log("  warnings:", (r.parseWarnings || []).join(" | "));
      if (room === "Partial") { console.log("  ✓ fallback propre (attendu)"); pass++; }
      else { console.log("  ✗ devait parser"); fail++; }
      continue;
    }
    console.log("  site:", r.meta.sourceSite, "| game:", r.meta.gameType, r.meta.tournamentType || "", "| bb:", r.meta.blinds.bb, "| seats:", r.meta.tableSize);
    console.log("  heroPos:", r.meta.heroPos, "| heroCards:", r.tableData.heroCards.join(" "), "| showdown:", r.meta.showdown);
    console.log("  potByStreet:", JSON.stringify(r.normalized.potByStreet), "| finalPot:", r.normalized.finalPotBb, "bb");
    console.log("  heroResult:", r.normalized.heroResultBb, "bb");
    console.log("  timeline steps:", r.actionTimeline.length, "| board:", r.tableData.board.join(" "));
    console.log("  SCORE:", r.scoreData.score, "(" + r.scoreData.grade + "/" + r.scoreData.label + ") conf:", r.scoreData.confidence);
    console.log("  keyDecision:", JSON.stringify(r.analysisSummary.keyDecision));
    console.log("  mistakes:", r.mistakes.map(m => m.tag).join(", ") || "—");
    console.log("  leakTags:", r.leakTags.join(", ") || "—");
    console.log("  recos:", r.trainingRecommendations.map(x => x.label).join(" | "));
    console.log("  warnings:", (r.parseWarnings || []).join(" | ") || "—");
    // sanity checks
    const seatsOk = r.tableData.seats.length === r.meta.tableSize;
    const posOk = r.tableData.seats.every(s => s.pos && s.pos !== "?") || r.parseWarnings.some(w => /position|bouton/i.test(w));
    if (seatsOk) pass++; else { fail++; console.log("  ✗ seats mismatch"); }
  } catch (e) {
    fail++; console.log("  ✗✗ EXCEPTION:", e.message, "\n", e.stack);
  }
}

// session multi-mains
console.log("\n" + "=".repeat(70));
const multi = SAMPLES.PokerStars + "\n\n" + SAMPLES.GGPoker.replace("Poker Hand #HD1234567890", "Poker Hand #HD1234567891");
const sess = parseSessionText(multi);
console.log("SESSION multi:", sess.count, "mains parsées,", sess.errors.length, "erreurs | site:", sess.meta.sourceSite);
if (sess.count === 2) pass++; else { fail++; console.log("  ✗ attendu 2 mains"); }

console.log("\n" + "=".repeat(70));
console.log(`RÉSULTAT : ${pass} OK / ${fail} KO`);
process.exit(fail ? 1 : 0);
