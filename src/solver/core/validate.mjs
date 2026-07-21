/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · VALIDATION SUITE (§23)
   Tests automatisés du moteur isolé — évaluateur, combos, équité, CFR/convergence.
   Sert AUSSI de non-régression pour l'extraction hors du monolithe.
   Lancer :  node src/solver/core/validate.mjs
════════════════════════════════════════════════════════════════════════════ */
import { eval5i, eval7i } from "./evaluator.js";
import { comboCardsInt, singleHandList, rangeComboList, reduceRange } from "./combos.js";
import { monteCarloEquity, computeEquity } from "./equity.js";
import { solveRiverCFR } from "./cfr.js";
import { solveSubgame, solveMultiStreet, solveNodeLocked, solveExploit, computeICM, computePKO } from "../api.js";
import { buildPostflopTree, terminalUtility, treeStats, HERO } from "./gametree.js";
import { icmEquity, finishProbabilities, icmRiskPremium, pkoValue, makeIcmUtility, CHIP_UTILITY } from "./icm.js";
import { classifyDecision, classifyLeak, buildCoachBrief, buildExercise } from "../explain.js";
import { solveTreeFixedBoard, solveTree, nashConv, rehydrateTreeSolution } from "./multistreet.js";
import { storeSolution, getSolution, librarySize, clearLibrary,
         hydrateLibrary, libraryStatus, persistedCount } from "../library.js";
import { persistenceAvailable } from "../persist.js";

let pass=0, fail=0;
const ok=(name,cond)=>{ if(cond){pass++;console.log("  ✓ "+name);} else {fail++;console.log("  ✗ FAIL: "+name);} };
// carte int = (index dans "23456789TJQKA")*4 + couleur(0..3)
const C=(r,s)=>"23456789TJQKA".indexOf(r)*4+s;

console.log("\n[1] HAND EVALUATOR (§9)");
const royal=[C("A",0),C("K",0),C("Q",0),C("J",0),C("T",0)];
const sflush=[C("K",0),C("Q",0),C("J",0),C("T",0),C("9",0)];
const quads=[C("A",0),C("A",1),C("A",2),C("A",3),C("K",0)];
const full =[C("A",0),C("A",1),C("A",2),C("K",0),C("K",1)];
const flush=[C("A",0),C("K",0),C("Q",0),C("J",0),C("9",0)];
const strt =[C("A",0),C("K",0),C("Q",0),C("J",1),C("T",2)];
const wheel=[C("A",0),C("2",0),C("3",1),C("4",2),C("5",3)];
const trips=[C("A",0),C("A",1),C("A",2),C("K",0),C("Q",1)];
const two  =[C("A",0),C("A",1),C("K",0),C("K",1),C("Q",0)];
const pair =[C("A",0),C("A",1),C("K",0),C("Q",0),C("J",1)];
const high =[C("A",0),C("K",0),C("Q",0),C("J",1),C("9",2)];
const order=[royal,sflush,quads,full,flush,strt,trips,two,pair,high].map(eval5i);
ok("ordre catégories décroissant (royal>…>high card)", order.every((v,i)=>i===0||v<order[i-1]));
ok("wheel A2345 = quinte (bat le brelan)", eval5i(wheel)>eval5i(trips));
ok("wheel < quinte A-high", eval5i(wheel)<eval5i(strt));
ok("eval7i choisit la meilleure de 7 (quinte flush royale)", eval7i([...royal,C("2",1),C("7",2)])===eval5i(royal));

console.log("\n[2] COMBO ENGINE (§8)");
ok("AKs → 4 combos", comboCardsInt("AKs").length===4);
ok("AKo → 12 combos", comboCardsInt("AKo").length===12);
ok("AA  → 6 combos",  comboCardsInt("AA").length===6);
ok("pas de doublon carte dans un combo", comboCardsInt("AKo").every(c=>c[0]!==c[1]));

console.log("\n[3] EQUITY ENGINE (§10) — Monte-Carlo (marge ±3%)");
const AAvKK=monteCarloEquity([{cards:[C("A",0),C("A",1)],w:1}],[{cards:[C("K",0),C("K",1)],w:1}],6000);
ok("AA vs KK ≈ 82% (obtenu "+AAvKK+"%)", AAvKK>=78&&AAvKK<=86);
const mirror=monteCarloEquity([{cards:[C("A",0),C("A",1)],w:1}],[{cards:[C("A",2),C("A",3)],w:1}],4000);
ok("AA vs AA ≈ 50% (obtenu "+mirror+"%)", mirror>=45&&mirror<=55);

console.log("\n[5] EQUITY EXACTE vs MONTE-CARLO (§10)");
const river=[C("A",2),C("A",3),C("2",2),C("3",1),C("4",0)]; // Ad Ac 2d 3h 4s (board complet)
const ceR=computeEquity([{cards:[C("A",0),C("A",1)],w:1}],[{cards:[C("K",0),C("K",1)],w:1}],river);
ok("river board complet → énumération exacte", ceR.exact===true);
ok("river : Hero (quad aces) gagne 100% (obtenu "+ceR.equity+"%)", ceR.equity===100);
const turn=[C("K",2),C("Q",1),C("7",0),C("2",3)]; // 4 cartes
const ceT=computeEquity([{cards:[C("A",0),C("A",1)],w:1}],[{cards:[C("K",0),C("K",1)],w:1}],turn);
ok("turn hand-vs-hand → exact (44 runouts)", ceT.exact===true);
const cePre=computeEquity([{cards:[C("A",0),C("A",1)],w:1}],[{cards:[C("K",0),C("K",1)],w:1}],[]);
ok("préflop hand-vs-hand → Monte-Carlo (C(48,5) hors budget)", cePre.exact===false);

console.log("\n[4] CFR + CONVERGENCE ENGINE (§13, §14)");
const hf={AKs:{r:100,c:0,f:0},QQ:{r:100,c:0,f:0},JJ:{r:0,c:100,f:0}};
const vf={AA:{r:100,c:0,f:0},KK:{r:0,c:100,f:0},AQs:{r:60,c:40,f:0}};
const r=solveRiverCFR(hf,vf,[],6,0.66,{iters:300,runouts:40});
ok("solve renvoie un résultat", !!r);
if(r){
  ok("fréquences Hero somment ~100 (check+bet)", Math.abs(r.heroCheck+r.heroBet-100)<=2);
  ok("stabilité ∈ [0,100] (obtenu "+r.stability+")", r.stability>=0&&r.stability<=100);
  ok("statut convergence valide ("+r.convStatus+")", ["Low","Medium","High","Converged"].includes(r.convStatus));
  ok("exploitabilité (borne) ≥ 0 (obtenu "+r.exploitBb+"bb)", r.exploitBb>=0);
  ok("heroEV fini", Number.isFinite(r.heroEV));
}

console.log("\n[6] REPRODUCTIBILITÉ (§15) — seed déterministe");
const AA=[{cards:[C("A",0),C("A",1)],w:1}], KK=[{cards:[C("K",0),C("K",1)],w:1}];
const e1=computeEquity(AA,KK,[]), e2=computeEquity(AA,KK,[]);
ok("computeEquity déterministe (même spot → même équité: "+e1.equity+"="+e2.equity+")", e1.equity===e2.equity && e1.exact===false);
ok("computeEquity expose un seed", Number.isFinite(e1.seed));
ok("monteCarloEquity(seed) reproductible", monteCarloEquity(AA,KK,1000,[],12345)===monteCarloEquity(AA,KK,1000,[],12345));

console.log("\n[7] SOLUTION LIBRARY (§16) — cache / rechargement immédiat");
const hf2={AKs:{r:100,c:0,f:0},QQ:{r:100,c:0,f:0}}, vf2={AA:{r:100,c:0,f:0},KK:{r:0,c:100,f:0}};
const s1=solveSubgame(hf2,vf2,[44,40,7],6,0.66,{iters:150,runouts:20});
ok("1er solve → CFR_SOLVE (calculé)", s1.source==="CFR_SOLVE"&&s1.fromLibrary===false);
const s2=solveSubgame(hf2,vf2,[44,40,7],6,0.66,{iters:150,runouts:20});
ok("2e solve identique → PRESOLVED_LIBRARY (chargement immédiat)", s2.source==="PRESOLVED_LIBRARY"&&s2.fromLibrary===true);
ok("solution library == solve original (même SolveID & stratégie)", s2.solveId===s1.solveId&&s2.result.heroBet===s1.result.heroBet);
const s3=solveSubgame(hf2,vf2,[44,40,8],6,0.66,{iters:150,runouts:20}); // board différent
ok("spot différent → re-solve (pas de collision de cache)", s3.source==="CFR_SOLVE"&&s3.solveId!==s1.solveId);

console.log("\n[8] GAME TREE ENGINE (§12) — fondation multi-street");
const gt1=buildPostflopTree({betFrac:0.66,startPot:6,streets:1}); const gs1=treeStats(gt1);
const t3=buildPostflopTree({betFrac:0.66,startPot:6,streets:3}); const gs3=treeStats(t3);
ok("arbre 1 street : décisions + terminaux, pas de chance", gs1.decision>0&&gs1.terminal>0&&gs1.chance===0);
ok("arbre 3 streets : nœuds chance présents (turn/river)", gs3.chance>0);
ok("arbre 3 streets plus grand que 1 street", gs3.total>gs1.total);
ok("racine = décision Hero (OOP parle en premier)", t3.kind==="decision"&&t3.player===HERO);
ok("actions racine = check/bet", JSON.stringify(t3.actions)===JSON.stringify(["X","B"]));
const foldH={result:"foldH",betsH:2,betsV:0}, foldV={result:"foldV",betsH:0,betsV:2};
ok("Hero fold → utilité négative", terminalUtility(foldH,6,0)<0);
ok("Villain fold → utilité positive", terminalUtility(foldV,6,0)>0);
const sd={result:"showdown",betsH:2,betsV:2};
ok("showdown gagné > nul > perdu", terminalUtility(sd,6,1)>terminalUtility(sd,6,0.5)&&terminalUtility(sd,6,0.5)>terminalUtility(sd,6,0));
ok("zéro-somme showdown (mises égales)", Math.abs(terminalUtility(sd,6,1)+terminalUtility(sd,6,0))<1e-9);

console.log("\n[9] MULTI-STREET CFR (§26) — jeu de clairvoyance (solution GTO analytique)");
// Board A K Q J 2 ; Hero polarisé : NUTS (quinte à l'As) + AIR ; Villain = bluffcatcher (99).
// Pot-bet (betFrac=1) → GTO connu : Hero mise nuts 100% + bluffe air 50% ; Villain call 50%.
const cvBoard=[C("A",0),C("K",0),C("Q",2),C("J",3),C("2",1)];
const cvHero=[{cards:[C("T",1),C("3",0)],w:1},{cards:[C("4",2),C("5",3)],w:1}]; // [nuts, air]
const cvVill=[{cards:[C("9",3),C("9",2)],w:1}];                                 // bluffcatcher
const cv=solveTreeFixedBoard(cvHero,cvVill,cvBoard,{iters:2000,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0});
const nutsBet=Math.round(cv.avgOf(cv.tree,0)[1]*100);      // action B (mise)
const airBet=Math.round(cv.avgOf(cv.tree,1)[1]*100);
const villCall=Math.round(cv.avgOf(cv.tree.children.B,0)[1]*100); // nœud villain face à la mise, action C
ok("Hero mise les NUTS ~100% (obtenu "+nutsBet+"%)", nutsBet>=90);
ok("Hero bluffe l'AIR ~50% (pot-bet, obtenu "+airBet+"%)", airBet>=38&&airBet<=62);
ok("Villain call le bluffcatcher ~50% (MDF pot-bet, obtenu "+villCall+"%)", villCall>=38&&villCall<=62);
ok("EV Hero finie", Number.isFinite(cv.ev));
// Flop incomplet → échantillonnage des runouts turn+river (arbre 3 rues)
const flopBoard=[C("A",0),C("K",0),C("7",2)];
const fr=solveTree([{cards:[C("A",2),C("A",1)],w:1},{cards:[C("6",0),C("5",0)],w:1}],[{cards:[C("K",3),C("Q",3)],w:1}],flopBoard,{iters:400,betFrac:0.75,startPot:6,streets:3});
ok("flop (board incomplet) → échantillonnage runouts (3 rues)", fr.sampled===true&&fr.boardCards===3);
ok("multi-street flop : fréquence de mise valide", fr.heroBet>=0&&fr.heroBet<=100);
ok("multi-street flop : EV finie", Number.isFinite(fr.ev));

console.log("\n[10] MULTI-STREET v2 — sizings, raise, all-in, sous-arbres par carte, exploitabilité");
// (a) Famille de sizings analytique : bet b → bluff:value = b/(P+b) ; call = 1-b/(P+b).
const cvH=solveTreeFixedBoard(cvHero,cvVill,cvBoard,{iters:2500,betFrac:0.5,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0});
const airH=Math.round(cvH.avgOf(cvH.tree,1)[1]*100), callH=Math.round(cvH.avgOf(cvH.tree.children.B,0)[1]*100);
ok("bet 1/2 pot : bluff air ~33% (obtenu "+airH+"%)", airH>=23&&airH<=43);
ok("bet 1/2 pot : call ~67% (obtenu "+callH+"%)", callH>=57&&callH<=77);
// (b) Exploitabilité (meilleure réponse) : équilibre du jeu modélisé ⟺ NashConv ≈ 0.
const nc1=nashConv(cv);
ok("NashConv pot-bet ≈ 0 (obtenu "+nc1+" bb)", nc1!=null&&nc1>=-0.02&&nc1<=0.25);
// (c) Raise activé : raiser un range polarisé avec un bluffcatcheur est dominé → R ≈ 0.
const cvR=solveTreeFixedBoard(cvHero,cvVill,cvBoard,{iters:2500,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:1});
const rIdx=cvR.tree.children.B.actions.indexOf("R");
const villRaise=rIdx>=0?Math.round(cvR.avgOf(cvR.tree.children.B,0)[rIdx]*100):-1;
ok("raise disponible dans l'arbre (action R)", rIdx===2);
ok("bluffcatcher ne raise ~jamais un range polarisé (obtenu "+villRaise+"%)", villRaise>=0&&villRaise<=10);
// (d) ALL-IN : stack effectif couvert → plus aucune décision après tapis payé.
const tAI=buildPostflopTree({betSizes:[1],startPot:6,effStack:6,streets:3});
const aiLine=tAI.children.B.children.C;
ok("all-in payé → chance→chance→showdown (aucune décision)", aiLine.kind==="chance"&&aiLine.next.kind==="chance"&&aiLine.next.next.kind==="terminal");
ok("all-in : mises = stack effectif (6bb des deux côtés)", aiLine.next.next.betsH===6&&aiLine.next.next.betsV===6);
ok("pas de raise face à un all-in", !tAI.children.B.actions.includes("R"));
// (e) SOUS-ARBRES PAR CARTE : sur un turn échantillonné, la street river apprend
//     un contexte par carte de river visitée (ctxCount > 1).
const turnBoard=[C("A",0),C("K",0),C("7",2),C("2",3)];
const tv=solveTree([{cards:[C("A",2),C("A",1)],w:1},{cards:[C("6",1),C("5",1)],w:1}],[{cards:[C("K",3),C("Q",3)],w:1}],turnBoard,{iters:300,betFrac:0.75,startPot:6,streets:2});
let riverNode=null;
(function find(n){if(riverNode)return;if(n.kind==="decision"){if(n.street===1){riverNode=n;return;}for(const a of n.actions)find(n.children[a]);}else if(n.kind==="chance")find(n.next);})(tv.tree);
ok("nœud river trouvé dans l'arbre 2 rues", !!riverNode);
ok("sous-arbres par carte : contextes river multiples (obtenu "+(riverNode?tv.ctxCount(riverNode):0)+")", riverNode&&tv.ctxCount(riverNode)>1);
// (f) SOLVER API multi-street (§17/§26) : provenance + convergence + cache library.
const msH={AA:{r:100,c:0,f:0},KK:{r:100,c:0,f:0},T9s:{r:100,c:0,f:0}};
const msV={QQ:{r:100,c:0,f:0},AKo:{r:0,c:100,f:0}};
const msBoard=[C("K",1),C("8",2),C("4",3),C("J",1),C("2",2)];
const ms1=solveMultiStreet(msH,msV,msBoard,{iters:200,betFrac:0.66,startPot:6});
ok("API multi-street : CFR_SOLVE + experimental", ms1.source==="CFR_SOLVE"&&ms1.experimental===true);
ok("API multi-street : NashConv exact fourni sur river ("+(ms1.convergence&&ms1.convergence.nashConv)+" bb)", ms1.convergence&&Number.isFinite(ms1.convergence.nashConv));
const ms2=solveMultiStreet(msH,msV,msBoard,{iters:200,betFrac:0.66,startPot:6});
ok("API multi-street : re-solve identique → PRESOLVED_LIBRARY", ms2.source==="PRESOLVED_LIBRARY"&&ms2.solveId===ms1.solveId);

console.log("\n[11] SOLVED NODE LOCK (§19) — re-solve CFR contre fréquences verrouillées");
// Clairvoyance pot-bet : équilibre = bluff 50 / call 50 (cv ci-dessus). Exploits analytiques :
// (a) Vilain verrouillé OVERFOLD (fold 80% vs bet) → bluff air optimal = 100% (EV +0.6 vs -3).
const lockOF=solveTreeFixedBoard(cvHero,cvVill,cvBoard,{iters:1500,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0,locks:[{path:["B"],freqs:{F:0.8,C:0.2}}]});
const airOF=Math.round(lockOF.avgOf(lockOF.tree,1)[1]*100);
const callLocked=Math.round(lockOF.avgOf(lockOF.tree.children.B,0)[1]*100);
ok("vilain overfold verrouillé → Hero bluffe l'air ~100% (obtenu "+airOF+"%)", airOF>=90);
ok("le nœud verrouillé joue EXACTEMENT le verrou (call 20%, obtenu "+callLocked+"%)", callLocked>=18&&callLocked<=22);
ok("EV exploit > EV équilibre ("+lockOF.ev+" vs "+cv.ev+" bb)", lockOF.ev>cv.ev);
// (b) Vilain verrouillé OVERCALL (fold 10%) → bluff air = 0% (EV -7.8 vs -3), nuts value ~100%.
const lockOC=solveTreeFixedBoard(cvHero,cvVill,cvBoard,{iters:1500,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0,locks:[{path:["B"],freqs:{F:0.1,C:0.9}}]});
const airOC=Math.round(lockOC.avgOf(lockOC.tree,1)[1]*100);
const nutsOC=Math.round(lockOC.avgOf(lockOC.tree,0)[1]*100);
ok("vilain overcall verrouillé → Hero ne bluffe plus (obtenu "+airOC+"%)", airOC<=10);
ok("vilain overcall verrouillé → nuts value bet ~100% (obtenu "+nutsOC+"%)", nutsOC>=90);
// (c) API : solveNodeLocked → CFR_SOLVE + nodeLocked, SolveID distinct du solve non verrouillé.
const nl=solveNodeLocked(msH,msV,msBoard,[{path:["B"],freqs:{F:0.7,C:0.3}}],{iters:150,betFrac:0.66,startPot:6});
ok("API node lock : CFR_SOLVE + nodeLocked", nl.source==="CFR_SOLVE"&&nl.nodeLocked===true);
ok("API node lock : pas de collision de cache avec le solve non verrouillé", nl.solveId!==ms1.solveId);

console.log("\n[12] EXPLOIT SOLVER (§20) — modèle de joueur → verrous → re-solve CFR");
// Verrous par MOTIF (tous les nœuds vilain face à la mise) — exploits analytiques :
// Nit (fold ~65% après normalisation) → bluff pot EV -1.16 > give-up -3 → bluff 100%.
const exN=solveTreeFixedBoard(cvHero,cvVill,cvBoard,{iters:1500,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0,locks:[{match:"villFacingBet",freqs:{F:0.62,C:0.33,R:0.05}}]});
const airN=Math.round(exN.avgOf(exN.tree,1)[1]*100);
ok("vs Nit (overfold) → Hero bluffe l'air ~100% (obtenu "+airN+"%)", airN>=90);
ok("EV exploit vs Nit > EV équilibre ("+exN.ev+" vs "+cv.ev+" bb)", exN.ev>cv.ev);
// Calling Station (call ~87%) → bluff EV -7.5 < -3 → bluff 0%.
const exCS=solveTreeFixedBoard(cvHero,cvVill,cvBoard,{iters:1500,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0,locks:[{match:"villFacingBet",freqs:{F:0.12,C:0.83,R:0.05}}]});
const airCS=Math.round(exCS.avgOf(exCS.tree,1)[1]*100);
ok("vs Calling Station → Hero ne bluffe plus (obtenu "+airCS+"%)", airCS<=10);
// API : profil → CFR_SOLVE + métadonnées exploit (modèle étiqueté HEURISTIC_ESTIMATE).
const ex1=solveExploit("nit",msH,msV,msBoard,{iters:150,betFrac:0.66,startPot:6});
ok("API exploit : CFR_SOLVE + profil nit", ex1.source==="CFR_SOLVE"&&ex1.exploit&&ex1.exploit.profile==="nit");
ok("API exploit : modèle étiqueté HEURISTIC_ESTIMATE (§20)", ex1.exploit.model==="HEURISTIC_ESTIMATE");
ok("API exploit : profil inconnu → NO_SOLUTION", solveExploit("zzz",msH,msV,msBoard,{}).source==="NO_SOLUTION");

console.log("\n[13] ICM ENGINE (§21) — Malmuth-Harville exact");
// (a) Probas de finish : stacks égaux → symétrie parfaite (chacun 1/n par place).
const fp=finishProbabilities([100,100,100,100]);
ok("stacks égaux → P(1re place) = 25% chacun", fp.every(r=>Math.abs(r[0]-0.25)<1e-9));
ok("probas de finish : chaque joueur somme à 1", fp.every(r=>Math.abs(r.reduce((a,b)=>a+b,0)-1)<1e-9));
// (b) $EQ : winner-take-all + stacks égaux → payout partagé également.
const wta=icmEquity([100,100,100,100],[100,0,0,0]);
ok("winner-take-all, stacks égaux → $EQ = 25 chacun", wta.eq.every(e=>Math.abs(e-25)<1e-9));
// (c) Cas 2 joueurs, payouts [70,30] : $EQ = part linéaire du prizepool restant ? Non —
//     ICM 2 joueurs : EQ_i = 30 + (stack_i/total)*(70-30) (chacun a min 30, se partage l'écart).
const hu2=icmEquity([70,30],[70,30]);
ok("2 joueurs [70,30] payouts [70,30] : gros stack $EQ = 58 (obtenu "+Math.round(hu2.eq[0]*10)/10+")", Math.abs(hu2.eq[0]-58)<0.5);
ok("2 joueurs : conservation du prizepool (Σ$EQ = 100)", Math.abs(hu2.eq[0]+hu2.eq[1]-100)<1e-9);
// (d) Monotonie : plus de jetons ⇒ plus de $EQ.
const mono=icmEquity([50,30,20],[50,30,20]);
ok("monotonie : $EQ décroît avec le stack (50>30>20)", mono.eq[0]>mono.eq[1]&&mono.eq[1]>mono.eq[2]);
// (e) Risk premium : bulle (4 joueurs, 3 payés) → prime ICM > 0 (il faut plus que 50%).
const rp=icmRiskPremium([40,40,40,40],[50,30,20,0],0,40);
ok("bulle → risk premium > 0 (obtenu "+rp.riskPremium+"%)", rp.riskPremium>0);
ok("bulle → équité EV-neutre > 50% (obtenu "+rp.evNeutralEquity+"%)", rp.evNeutralEquity>50);
// (f) Pas de bulle (winner-take-all, HU) → pas de prime ICM (chipEV pur).
const rpH=icmRiskPremium([50,50],[100,0],0,50);
ok("HU winner-take-all → risk premium ≈ 0 (chipEV, obtenu "+rpH.riskPremium+"%)", Math.abs(rpH.riskPremium)<1);

console.log("\n[14] PKO ENGINE (§22) — valeur chips + bounty");
const pk=pkoValue({potBb:20,heroEquity:0.5,villainBounty:10,bountyRealization:0.5});
ok("PKO : total = chipEV + bountyEV (10 + 2.5 = 12.5)", Math.abs(pk.totalEv-12.5)<1e-6);
ok("PKO : bounty ↑ → discount d'équité > 0 (obtenu "+pk.equityDiscount+"%)", pk.equityDiscount>0);
ok("PKO : sans bounty → discount = 0", pkoValue({potBb:20,heroEquity:0.5,villainBounty:0}).equityDiscount===0);
// API : provenance honnête (ICM_ESTIMATE / PKO_ESTIMATE — jamais « exact solve », §21/§58).
const apiIcm=computeICM({stacks:[40,40,40,40],payouts:[50,30,20,0],heroIdx:0,riskChips:40});
ok("API ICM : provenance ICM_ESTIMATE (pas EXACT)", apiIcm.source==="ICM_ESTIMATE");
ok("API ICM : risk premium fourni", Number.isFinite(apiIcm.riskPremium));
ok("API PKO : provenance PKO_ESTIMATE", computePKO({potBb:20,heroEquity:0.5,villainBounty:10}).source==="PKO_ESTIMATE");

console.log("\n[15] AI EXPLANATION (§30) — le solver calcule, l'IA explique");
const dActions=[{id:"X",label:"Check",freq:60,ev:5.1},{id:"B75",label:"Bet 75%",freq:40,ev:5.0},{id:"F",label:"Fold",freq:0,ev:0.0}];
// (a) Classification : action = meilleure EV → best ; grosse perte d'EV → blunder.
ok("classifyDecision : meilleure EV → verdict best", classifyDecision({actions:dActions,chosenId:"X"}).verdict==="best");
const bl=classifyDecision({actions:dActions,chosenId:"F"});
ok("classifyDecision : perte d'EV massive → blunder + evLoss (obtenu "+bl.evLoss+")", bl.verdict==="blunder"&&bl.evLoss>3);
ok("classifyDecision : mix proche (0.1 bb) → correct", classifyDecision({actions:dActions,chosenId:"B75"}).verdict==="correct");
// (b) Leak : check quand best = bet → value manquée ; fold quand best ≠ fold → sur-fold.
const misVal=classifyLeak(classifyDecision({actions:[{id:"X",freq:0,ev:2},{id:"B75",freq:100,ev:6}],chosenId:"X"}));
ok("classifyLeak : check vs best=bet → value manquée", misVal&&misVal.key==="missed_value");
const ovf=classifyLeak(classifyDecision({actions:[{id:"F",freq:0,ev:0},{id:"C",freq:100,ev:4}],chosenId:"F"}));
ok("classifyLeak : fold vs best=call → sur-fold", ovf&&ovf.key==="overfold_vs_bet");
// (c) Coach brief : provenance présente, flag calculated cohérent avec la source.
const sol={source:"CFR_SOLVE",actions:dActions,equity:58,spr:3.2,nashConv:0.03};
const brief=buildCoachBrief(sol,classifyDecision({actions:dActions,chosenId:"F"}));
ok("buildCoachBrief : 1er fait = provenance calculée (CFR)", brief.facts[0].type==="provenance"&&brief.facts[0].calculated===true);
ok("buildCoachBrief : verdict Hero présent (blunder)", brief.facts.some(f=>f.type==="hero_evaluation"&&f.verdict==="blunder"));
ok("buildCoachBrief : leak value/défense présent", brief.facts.some(f=>f.type==="leak"));
// GARDE-FOU HONNÊTETÉ : aucune fréquence des faits n'est absente de la solution (§2/§30).
const inFreqs=new Set(sol.actions.map(a=>a.freq));
const factFreqs=brief.facts.flatMap(f=>f.type==="primary_action"?[f.freq]:f.type==="mixed_strategy"?f.actions.map(a=>a.freq):[]).filter(x=>x!=null);
ok("aucune fréquence inventée : toutes ⊆ solution ("+factFreqs.join(",")+")", factFreqs.every(f=>inFreqs.has(f)));
// source heuristique → disclaimer honnête (pas GTO).
const briefH=buildCoachBrief({source:"HEURISTIC_ESTIMATE",actions:dActions,equity:52});
ok("brief heuristique → disclaimer 'pas un solve GTO'", /pas un solve GTO/.test(briefH.disclaimer)&&briefH.calculated===false);
// (d) Exercice ciblé sur le leak.
const ex=buildExercise(misVal,{heroPos:"CO",vsPos:"BB"});
ok("buildExercise : scénario + focus + reps (leak value)", ex&&ex.scenario.heroPos==="CO"&&ex.reps>=2&&/value/i.test(ex.focus));

console.log("\n[16] SOLUTION LIBRARY — PERSISTANCE (§16 · roadmap §11)");
/* La persistance repose sur le structured clone d'IndexedDB, qui NE CONSERVE PAS
   les fonctions. Une solution multi-rue expose des accesseurs (avgOf/aggAt/ctxCount)
   fermés sur ses tables de stratégie : rechargée telle quelle, elle les perdrait et
   renverrait des fréquences uniformes 1/na — de la fausse stratégie présentée comme
   un solve. Ces tests verrouillent le contrat : ce qui revient du disque se lit
   EXACTEMENT comme ce qui sort du solveur. Ici on SIMULE le clone en retirant les
   fonctions (Node n'a pas d'IndexedDB). */
const persistSol=solveTree(
  [{cards:[C("A",2),C("A",1)],w:1},{cards:[C("6",1),C("5",1)],w:1}],
  [{cards:[C("K",3),C("Q",3)],w:1}],
  turnBoard,{iters:300,betFrac:0.75,startPot:6,streets:2});
// `strat` doit être exposé : sans lui, rien n'est persistable.
ok("solveTree expose ses tables de stratégie (strat)", !!persistSol.strat&&typeof persistSol.strat==="object");
// Simulation du structured clone : les fonctions disparaissent.
const cloned={};for(const k of Object.keys(persistSol))if(typeof persistSol[k]!=="function")cloned[k]=persistSol[k];
ok("clone simulé : les accesseurs sont bien perdus", cloned.aggAt===undefined&&cloned.avgOf===undefined);
const revived=rehydrateTreeSolution(cloned);
ok("rehydrateTreeSolution : accesseurs reconstruits", !!revived&&typeof revived.aggAt==="function"&&typeof revived.avgOf==="function");
// LE test qui compte : lecture identique à la racine ET sur un nœud enfant.
const rootA=persistSol.aggAt(persistSol.tree,0), rootB=revived.aggAt(revived.tree,0);
ok("réhydratée == fraîche : fréquence racine ("+rootA.toFixed(6)+" vs "+rootB.toFixed(6)+")", Math.abs(rootA-rootB)<1e-12);
const avgA=persistSol.avgOf(persistSol.tree,0), avgB=revived.avgOf(revived.tree,0);
ok("réhydratée == fraîche : stratégie par combo identique", avgA.length===avgB.length&&avgA.every((x,i)=>Math.abs(x-avgB[i])<1e-12));
ok("réhydratée == fraîche : ctxCount identique", persistSol.ctxCount(persistSol.tree)===revived.ctxCount(revived.tree));
// GARDE-FOU : une charge amputée doit être REJETÉE, pas servie en silence (§2).
ok("payload sans strat → null (jamais de solution amputée)", rehydrateTreeSolution({...cloned,strat:undefined})===null);
ok("payload vide → null", rehydrateTreeSolution(null)===null&&rehydrateTreeSolution({})===null);

/* Éviction LRU RÉELLE : une solution relue ne doit pas être évincée avant une
   solution jamais relue insérée plus tard (l'ancienne implémentation, FIFO sur
   l'ordre d'insertion, échouait ici). */
clearLibrary();
for(let i=0;i<500;i++)storeSolution("LRU-"+i,{result:{n:i}});
getSolution("LRU-0");                    // on « utilise » la plus ancienne
storeSolution("LRU-new",{result:{n:-1}}); // force une éviction
ok("LRU : l'entrée relue survit à l'éviction", getSolution("LRU-0")!==null);
ok("LRU : c'est la vraie inutilisée qui est évincée", getSolution("LRU-1")===null);
ok("LRU : taille bornée après éviction ("+librarySize()+")", librarySize()<=500);

/* Dégradation hors navigateur : pas d'IndexedDB sous Node. Rien ne doit lever, et
   la bibliothèque doit rester pleinement fonctionnelle en mémoire. */
ok("Node : persistance correctement signalée indisponible", persistenceAvailable()===false);
const hydrated=await hydrateLibrary();
ok("Node : hydrateLibrary() résout sans lever (0 entrée)", hydrated===0&&libraryStatus.hydrated===true);
ok("Node : storeSolution reste fonctionnel sans disque", storeSolution("NODB-1",{result:{ok:1}})==="NODB-1"&&getSolution("NODB-1")!==null);
ok("Node : persistedCount() = 0", (await persistedCount())===0);
clearLibrary();

console.log("\n[17] RANGES NON PLAFONNÉES (§8 · roadmap §11)");
/* L'ancien plafond faisait `list.slice(0,maxCombos)` sur un ordre d'INSERTION
   (paires → suited → offsuit) : il ne réduisait pas la range, il en supprimait
   le bas. Mesuré : à maxCombos=110 sur une range BTN RFI de 1134 combos, 90% de
   la range partait et les 744 offsuit disparaissaient EN TOTALITÉ. Ces tests
   verrouillent le remplacement : la range réduite garde la FORME de la range. */
const rr={};
"AKQJT98765432".split("").forEach((r,i)=>{const p=[100,100,100,100,95,90,85,90,80,79,69,59,49][i];rr[r+r]={r:p,c:0,f:100-p};});
for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){const R="AKQJT98765432";const p=Math.max(0,Math.min(100,100-(j-i)*12+(12-i)*4));if(p>0)rr[R[i]+R[j]+"s"]={r:p,c:0,f:100-p};}
for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){const R="AKQJT98765432";const p=Math.max(0,Math.min(100,90-(j-i)*16+(12-i)*3));if(p>0)rr[R[i]+R[j]+"o"]={r:p,c:0,f:100-p};}
const rrFull=rangeComboList(rr);
const klass=(k)=>k[0]===k[1]?"pp":k.endsWith("s")?"s":"o";
const shareOf=(l)=>{const t={pp:0,s:0,o:0};let tot=0;for(const e of l){t[klass(e.key)]+=e.w;tot+=e.w;}return{pp:t.pp/tot,s:t.s/tot,o:t.o/tot};};
const wSum=(l)=>l.reduce((a,e)=>a+e.w,0);
const shFull=shareOf(rrFull);
ok("range de test large ("+rrFull.length+" combos, "+new Set(rrFull.map(e=>e.key)).size+" classes)", rrFull.length>1000);

// L'ANCIEN comportement, reproduit ici pour prouver ce qui a été corrigé.
const oldWay=rrFull.slice(0,110);
ok("ancien slice : supprimait TOUS les offsuit (régression verrouillée)", shareOf(oldWay).o===0);

const red=reduceRange(rrFull,200);
ok("réduction : budget respecté ("+red.kept+" ≤ 200)", red.kept<=200);
ok("réduction : aucune classe perdue à 200 ("+red.classesKept+"/"+red.classesTotal+")", red.classesDropped===0);
ok("réduction : les offsuit SURVIVENT ("+(100*shareOf(red.list).o).toFixed(1)+"%)", shareOf(red.list).o>0.5);
// La forme de la range est le point : c'est elle qui pilote la stratégie postflop.
ok("réduction : forme préservée (pp/s/o à ±1 pt)",
  Math.abs(shareOf(red.list).pp-shFull.pp)<0.01&&
  Math.abs(shareOf(red.list).s -shFull.s )<0.01&&
  Math.abs(shareOf(red.list).o -shFull.o )<0.01);
ok("réduction : poids TOTAL conservé ("+wSum(red.list).toFixed(3)+" vs "+wSum(rrFull).toFixed(3)+")", Math.abs(wSum(red.list)-wSum(rrFull))<1e-9);
ok("réduction : marquée non exacte (l'UI doit le dire)", red.exact===false&&red.method==="stratified");

// Non plafonné = chemin EXACT, aucune abstraction.
const unc=reduceRange(rrFull,0);
ok("maxCombos=0 → range complète, exact", unc.exact===true&&unc.method==="complete"&&unc.kept===rrFull.length);
const under=reduceRange(rrFull,99999);
ok("budget > range → complète, exact", under.exact===true&&under.method==="complete");
// Budget < nombre de classes : perte inévitable, mais REMONTÉE et non silencieuse.
const squeezed=reduceRange(rrFull,50);
ok("budget < classes → classesDropped renseigné ("+squeezed.classesDropped+")", squeezed.classesDropped>0&&squeezed.exact===false);

// L'abstraction doit remonter jusqu'aux résultats de l'API, sinon l'UI ne peut pas être honnête.
const abRiver=[C("K",1),C("8",2),C("4",3),C("J",1),C("2",2)];
const ab1=solveSubgame(rr,rr,abRiver,6,0.66,{maxCombos:200,iters:60,force:true});
ok("API 1-street : abstraction exposée dans le résultat", !!ab1.result.abstraction&&ab1.result.abstraction.hero.classesTotal>0);
const abSmall={AA:{r:100,c:0,f:0},T9o:{r:100,c:0,f:0}};
const ab2=solveSubgame(abSmall,abSmall,abRiver,6,0.66,{maxCombos:0,iters:60,force:true});
ok("API 1-street : maxCombos=0 → abstraction.exact=true", ab2.result.abstraction.exact===true);
const ab3=solveMultiStreet(rr,rr,abRiver,{maxCombos:200,iters:40,betFrac:0.66,startPot:6,force:true});
ok("API multi-rue : abstraction exposée + non exacte à 200", ab3.abstraction&&ab3.abstraction.exact===false);
const ab4=solveMultiStreet(abSmall,abSmall,abRiver,{maxCombos:0,iters:40,betFrac:0.66,startPot:6,force:true});
ok("API multi-rue : maxCombos=0 → abstraction.exact=true", ab4.abstraction.exact===true);

console.log("\n[18] ICM STRATÉGIQUE (§21 · roadmap §11)");
/* Jusqu'ici l'ICM était un AFFICHAGE à côté d'une stratégie calculée en jetons.
   makeIcmUtility le fait ENTRER dans le calcul : le CFR optimise des $EQ. */

// (a) CONSERVATION — la somme des $EQ vaut toujours le total des prix.
// Corrige un bug préexistant : un joueur à EXACTEMENT 0 jeton n'obtenait aucune
// place, son gain s'évaporait (mesuré 70 au lieu de 100 sur [100,0]/[70,30]).
// Cas atteint dès qu'un all-in tapis complet est évalué.
let consOk=true;
for(const [stacks,payouts] of [
  [[50,50],[70,30]],[[100,0],[70,30]],[[25,25,25,25],[50,30,20,0]],
  [[75,0,25,0],[50,30,20,0]],[[100,0,0,0],[50,30,20,0]],[[0,0],[70,30]],
]){
  const tot=icmEquity(stacks,payouts).eq.reduce((a,b)=>a+b,0);
  if(Math.abs(tot-payouts.reduce((a,b)=>a+b,0))>1e-9)consOk=false;
}
ok("ICM : Σ$EQ = total des prix, y compris avec des tapis à 0", consOk);

// (b) L'utilité du solveur doit coïncider avec le moteur ICM déjà validé.
const uBub=makeIcmUtility({stacks:[25,25,25,25],payouts:[50,30,20,0],heroIdx:0,villIdx:1});
const baseB=icmEquity([25,25,25,25],[50,30,20,0]).eq[0];
const refGain=icmEquity([50,0,25,25],[50,30,20,0]).eq[0]-baseB;
const refLoss=baseB-icmEquity([0,50,25,25],[50,30,20,0]).eq[0];
ok("utilité ICM : gain == référence recalculée ("+uBub.h(25).toFixed(4)+")", Math.abs(uBub.h(25)-refGain)<1e-12);
ok("utilité ICM : perte == référence recalculée ("+(-uBub.h(-25)).toFixed(4)+")", Math.abs(-uBub.h(-25)-refLoss)<1e-12);
ok("utilité ICM : perte > gain (asymétrie = pression de bulle)", refLoss>refGain);
ok("utilité ICM : écrêtée au tapis couvrant", Math.abs(uBub.h(9999)-uBub.h(25))<1e-12);
ok("utilité ICM : mémoïsée (peu d'appels icmEquity)", uBub.memoSize<=8);

// (c) SOMME NULLE — le fait qui commande la validité de NashConv.
const uHu=makeIcmUtility({stacks:[50,50],payouts:[70,30],heroIdx:0,villIdx:1});
ok("ICM heads-up : somme nulle (même à l'all-in tapis complet)",
  uHu.zeroSum===true&&Math.abs(uHu.h(50)+uHu.v(50))<1e-9&&Math.abs(uHu.h(10)+uHu.v(10))<1e-9);
ok("ICM 3+ joueurs : PAS somme nulle (l'équité des absents bouge)",
  uBub.zeroSum===false&&Math.abs(uBub.h(10)+uBub.v(10))>1e-6);

// (d) EFFET SUR LA STRATÉGIE — la validation qui compte. Sur un call d'all-in,
// la pression ICM doit AUGMENTER le fold, et de façon monotone avec l'intensité.
const icmBoard=[C("K",1),C("8",2),C("4",3),C("J",1),C("2",2)];
const icmH={A5s:{r:0,c:100,f:0},KTs:{r:0,c:100,f:0},T9s:{r:0,c:100,f:0},QJo:{r:0,c:100,f:0}};
const icmV={AA:{r:100,c:0,f:0},KK:{r:100,c:0,f:0},T9o:{r:100,c:0,f:0},A5o:{r:100,c:0,f:0}};
const icmOpts={iters:400,betFrac:2.5,startPot:6,maxCombos:200,effStack:25,maxRaisesPerStreet:0,force:true};
const foldFacingBet=(r)=>{
  const t=r.result.tree;let n=t.children[t.actions[0]];
  while(n&&n.kind==="chance")n=n.next;
  const bi=n.actions.findIndex(a=>a!=="X"&&a!=="K");
  let m=n.children[n.actions[bi]];
  while(m&&m.kind==="chance")m=m.next;
  return r.result.aggAt(m,m.actions.indexOf("F"));
};
const fChip  =foldFacingBet(solveMultiStreet(icmH,icmV,icmBoard,icmOpts));
const fFinal =foldFacingBet(solveMultiStreet(icmH,icmV,icmBoard,{...icmOpts,icm:{stacks:[25,25,25],payouts:[50,30,20],heroIdx:0,villIdx:1}}));
const fBubble=foldFacingBet(solveMultiStreet(icmH,icmV,icmBoard,{...icmOpts,icm:{stacks:[25,25,25,25],payouts:[50,30,20,0],heroIdx:0,villIdx:1}}));
ok(`ICM : la bulle fait folder plus qu'en jetons (${(100*fChip).toFixed(1)}% → ${(100*fBubble).toFixed(1)}%)`, fBubble>fChip+0.02);
ok(`ICM : pression monotone bulle > table finale > jetons (${(100*fChip).toFixed(1)} < ${(100*fFinal).toFixed(1)} < ${(100*fBubble).toFixed(1)})`, fBubble>fFinal&&fFinal>fChip);

// (e) GARDE-FOUS DE PROVENANCE.
const icmSol=solveMultiStreet(icmH,icmV,icmBoard,{...icmOpts,icm:{stacks:[25,25,25,25],payouts:[50,30,20,0],heroIdx:0,villIdx:1}});
ok("API : icm.strategic=true quand l'ICM entre dans le calcul", icmSol.icm.strategic===true);
ok("API : NashConv MASQUÉ hors somme nulle (jamais un chiffre trompeur)",
  icmSol.convergence.nashConv===null&&/somme nulle/.test(icmSol.convergence.note));
const chipSol=solveMultiStreet(icmH,icmV,icmBoard,icmOpts);
ok("API : chip-EV garde son NashConv", chipSol.icm.strategic===false&&Number.isFinite(chipSol.convergence.nashConv));
// Gains plats → jetons sans valeur → utilité nulle → stratégie uniforme sans signification.
const flat=solveMultiStreet(icmH,icmV,icmBoard,{...icmOpts,icm:{stacks:[25,25,25,25],payouts:[25,25,25,25],heroIdx:0,villIdx:1}});
ok("API : structure de gains plate DÉTECTÉE (stratégie uniforme non présentable)",
  flat.icm.degenerate===true&&/pas de valeur/.test(flat.icm.degenerateNote||""));
ok("API : ICM normal NON marqué dégénéré", icmSol.icm.degenerate===false);

// (f) PERSISTANCE — `utility` porte des fonctions ; sans traitement, plus AUCUNE
// solution ne se persisterait (DataCloneError). Le descripteur doit la reconstruire.
ok("persistance : descripteur d'utilité sérialisable", icmSol.result.utilityKind==="icm"&&!!icmSol.result.icmParams);
const icmClone={};for(const k of Object.keys(icmSol.result))if(typeof icmSol.result[k]!=="function"&&k!=="utility")icmClone[k]=icmSol.result[k];
const icmBack=rehydrateTreeSolution(icmClone);
ok("persistance : solution ICM réhydratée retrouve son utilité", !!icmBack&&icmBack.utility&&icmBack.utility.zeroSum===false);
ok("persistance : lecture identique après réhydratation",
  Math.abs(icmSol.result.aggAt(icmSol.result.tree,0)-icmBack.aggAt(icmBack.tree,0))<1e-12);
ok("persistance : solve ICM sans paramètres → REJETÉ (jamais rétrogradé en jetons)",
  rehydrateTreeSolution({...icmClone,icmParams:null})===null);

console.log("\n────────────────────────────────────────");
console.log(`RÉSULTAT : ${pass} ✓ / ${fail} ✗`);
if(fail>0){process.exitCode=1;console.log("❌ VALIDATION ÉCHOUÉE\n");}
else console.log("✅ VALIDATION RÉUSSIE\n");
