/* Tests moteur Replayer — modèle normalisé + State Engine (Phase A).
   Lancement : node test-replayer-state-engine.mjs                      */
import { parseHand, parseSession } from "./src/replayer/handModel.js";
import { computeSnapshot, computeAllSnapshots, stepCount } from "./src/replayer/stateEngine.js";

let passed = 0, failed = 0;
const EPS = 0.02;
function ok(cond, msg){ if(cond){ passed++; } else { failed++; console.error("  ✗ " + msg); } }
function near(a,b,msg){ ok(Math.abs(a-b)<=EPS, `${msg} (attendu ${b}, obtenu ${a})`); }
function section(t){ console.log("\n── " + t); }

/* HH sans showdown (Hero fold river) — 6-max, $1/$2 */
const HH_FOLD = `PokerStars Hand #234589012: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'Andromeda IX' 6-max Seat #3 is the button
Seat 1: Hero ($200.50 in chips)
Seat 3: Villain ($187.00 in chips)
Seat 5: Player5 ($243.00 in chips)
Hero: posts small blind $1
Player5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: calls $5
Player5: folds
FLOP [Ah Kd 7c]
Hero: checks
Villain: bets $7
Hero: calls $7
TURN [Ah Kd 7c] [2s]
Hero: checks
Villain: bets $19
Hero: calls $19
RIVER [Ah Kd 7c 2s] [9h]
Hero: checks
Villain: bets $60
Hero: folds`;

/* HH avec showdown — 3-max, $0.50/$1 */
const HH_SHOW = `PokerStars Hand #500777: Hold'em No Limit ($0.50/$1) - 2025/06/01
Table 'Nebula' 3-max Seat #1 is the button
Seat 1: Alice ($100 in chips)
Seat 2: Bob ($100 in chips)
Seat 3: Carol ($100 in chips)
Bob: posts small blind $0.50
Carol: posts big blind $1
Dealt to Alice [As Kd]
Alice: raises $2 to $3
Bob: folds
Carol: calls $2
*** FLOP *** [Ah 7c 2d]
Carol: checks
Alice: bets $4
Carol: calls $4
*** TURN *** [Ah 7c 2d] [9s]
Carol: checks
Alice: checks
*** RIVER *** [Ah 7c 2d 9s] [Jh]
Carol: checks
Alice: checks
*** SHOW DOWN ***
Carol: shows [Qh Qc]
Alice: shows [As Kd]
Alice collected $15 from pot
*** SUMMARY ***`;

function sumStart(hand){ return hand.players.reduce((a,p)=>a+p.stackStart,0); }
function conservation(snap){ return snap.players.reduce((a,p)=>a+p.stack+p.committed,0) + snap.potMain; }

/* ── 1. Parsing de base ── */
section("Parsing");
const h1 = parseHand(HH_FOLD, 0);
ok(h1.valid, "HH_FOLD valide");
ok(h1.room==="PokerStars", "room = PokerStars");
ok(h1.bbSize===2, "bbSize = 2 ($1/$2)");
ok(h1.players.length===3, "3 joueurs");
ok(h1.heroId && h1.players.find(p=>p.id===h1.heroId)?.name==="Hero", "Hero détecté");
near(h1.players.find(p=>p.name==="Hero").stackStart, 100.25, "stack Hero en bb");
ok(h1.events.some(e=>e.type==="post-sb")&&h1.events.some(e=>e.type==="post-bb"), "blinds émises");
ok(h1.events.some(e=>e.type==="deal-hole"), "deal-hole émis");
ok(h1.events.filter(e=>e.type==="deal-flop"||e.type==="deal-turn"||e.type==="deal-river").length===3, "3 deals de board");
ok(!h1.showdown, "HH_FOLD : pas de showdown");

const h2 = parseHand(HH_SHOW, 0);
ok(h2.valid, "HH_SHOW valide");
ok(h2.bbSize===1, "bbSize = 1 ($0.50/$1)");
ok(!!h2.showdown, "HH_SHOW : showdown présent");

/* ── 2. Conservation des jetons à CHAQUE étape ── */
section("Conservation des jetons (Σ stack + Σ committed + potMain = Σ stackStart)");
for(const [name, hand] of [["HH_FOLD",h1],["HH_SHOW",h2]]){
  const start = sumStart(hand);
  let allGood = true;
  for(let s=0;s<stepCount(hand);s++){
    const snap = computeSnapshot(hand, s);
    if(Math.abs(conservation(snap)-start) > EPS){ allGood=false; console.error(`    ${name} step ${s}: ${conservation(snap)} ≠ ${start} (event ${snap.currentEvent?.type})`); }
  }
  ok(allGood, `${name} : jetons conservés sur toutes les étapes`);
}

/* ── 3. Blinds absorbées après le préflop (§12/§42) ── */
section("Blinds absorbées dans le pot au flop");
{
  // dernier snapshot préflop (juste avant deal-flop)
  const flopIdx = h1.events.findIndex(e=>e.type==="deal-flop");
  const preSnap = computeSnapshot(h1, flopIdx-1);
  ok(preSnap.potMain < 0.01, "préflop : pot au-dessus du board vide (mises devant les joueurs)");
  ok(Object.keys(preSnap.bets).length>0, "préflop : des mises sont affichées devant les joueurs");
  const flopSnap = computeSnapshot(h1, flopIdx);
  ok(flopSnap.potMain > 5.9, "flop : blinds+mises absorbées dans le pot (>= 6bb)");
  ok(Object.keys(flopSnap.bets).length===0, "flop : plus de mise devant les joueurs après absorption");
  ok(flopSnap.board.length===3, "flop : 3 cartes au board");
}

/* ── 4. Cartes villains cachées avant showdown ── */
section("Visibilité des cartes");
{
  const last1 = computeSnapshot(h1, stepCount(h1)-1);
  const villain = last1.players.find(p=>!p.isHero);
  ok(!villain.holeVisible, "HH_FOLD : villain caché (pas de showdown)");
  ok(last1.players.find(p=>p.isHero).holeVisible, "Hero toujours visible");

  const shIdx = h2.events.findIndex(e=>e.type==="showdown");
  const beforeSh = computeSnapshot(h2, shIdx-1);
  ok(!beforeSh.players.find(p=>p.name==="Carol").holeVisible, "avant showdown : Carol cachée");
  const atSh = computeSnapshot(h2, shIdx);
  const carol = atSh.players.find(p=>p.name==="Carol");
  ok(carol.holeVisible && carol.hole.length===2, "au showdown : Carol révélée (2 cartes)");
}

/* ── 5. Pot monotone (hors retour de mise) ── */
section("Pot croissant");
for(const [name, hand] of [["HH_FOLD",h1],["HH_SHOW",h2]]){
  let mono=true, prev=-1;
  for(let s=0;s<stepCount(hand);s++){
    const pt = computeSnapshot(hand,s).potTotal;
    if(pt < prev-EPS){ mono=false; }
    prev=pt;
  }
  ok(mono, `${name} : potTotal non décroissant`);
}

/* ── 6. Déterminisme ── */
section("Déterminisme des snapshots");
{
  const a = JSON.stringify(computeSnapshot(h2, 6));
  const b = JSON.stringify(computeSnapshot(h2, 6));
  ok(a===b, "computeSnapshot reproductible");
  const all = computeAllSnapshots(h2);
  ok(all.length===stepCount(h2), "computeAllSnapshots : longueur correcte");
  ok(JSON.stringify(all[6])===a, "computeAllSnapshots cohérent avec computeSnapshot");
}

/* ── 7. Session ── */
section("Session multi-mains");
{
  const sess = parseSession(HH_FOLD + "\n\n" + HH_SHOW);
  ok(sess.count===2, "2 mains parsées");
  ok(sess.hands.every(h=>h.valid), "toutes valides");
  ok(sess.detected>=2 && sess.imported===2 && sess.incomplete===0, "comptes de validation (detected/imported/incomplete)");
  // Régression : le split multi-mains ne doit pas amputer le préfixe room
  ok(sess.room==="PokerStars", `room détectée en multi-mains (obtenu ${sess.room})`);
  ok(sess.hands.every(h=>h.room==="PokerStars"), "chaque main garde sa room");
}

/* ── 8. Déduplication (§32) ── */
section("Déduplication");
{
  // même main HH_FOLD répétée 3× → 1 seule importée, 2 doublons
  const sess = parseSession([HH_FOLD, HH_FOLD, HH_FOLD, HH_SHOW].join("\n\n"));
  ok(sess.imported===2, `dédup : 2 mains uniques (obtenu ${sess.imported})`);
  ok(sess.duplicates===2, `dédup : 2 doublons comptés (obtenu ${sess.duplicates})`);
  const noDedup = parseSession([HH_FOLD, HH_FOLD].join("\n\n"), { dedup:false });
  ok(noDedup.imported===2, "dedup:false conserve les doublons");
}

/* ── 9. Découpage en lots (§4) ── */
section("Découpage en lots (limite maxPerLot)");
{
  // 5 mains distinctes, maxPerLot=2 → lots de [2,2,1]
  const distinct = [];
  for(let i=0;i<5;i++) distinct.push(HH_FOLD.replace("#234589012", "#"+(900000+i)));
  const sess = parseSession(distinct.join("\n\n"), { maxPerLot:2 });
  ok(sess.imported===5, `5 mains distinctes importées (obtenu ${sess.imported})`);
  ok(sess.lotCount===3, `3 lots (obtenu ${sess.lotCount})`);
  ok(sess.lots[0].length===2 && sess.lots[2].length===1, "lots [2,2,1]");
  ok(sess.count===2, "count = taille du 1er lot");
}

console.log(`\n${failed===0 ? "✅" : "❌"} Replayer State Engine : ${passed} ok, ${failed} échec(s)`);
process.exit(failed===0 ? 0 : 1);
