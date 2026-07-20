/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · VALIDATION SUITE (§23)
   Tests automatisés du moteur isolé — évaluateur, combos, équité, CFR/convergence.
   Sert AUSSI de non-régression pour l'extraction hors du monolithe.
   Lancer :  node src/solver/core/validate.mjs
════════════════════════════════════════════════════════════════════════════ */
import { eval5i, eval7i } from "./evaluator.js";
import { comboCardsInt, singleHandList } from "./combos.js";
import { monteCarloEquity, computeEquity } from "./equity.js";
import { solveRiverCFR } from "./cfr.js";
import { solveSubgame, solveMultiStreet, solveNodeLocked, solveExploit, computeICM, computePKO } from "../api.js";
import { buildPostflopTree, terminalUtility, treeStats, HERO } from "./gametree.js";
import { icmEquity, finishProbabilities, icmRiskPremium, pkoValue } from "./icm.js";
import { solveTreeFixedBoard, solveTree, nashConv } from "./multistreet.js";

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

console.log("\n────────────────────────────────────────");
console.log(`RÉSULTAT : ${pass} ✓ / ${fail} ✗`);
if(fail>0){process.exitCode=1;console.log("❌ VALIDATION ÉCHOUÉE\n");}
else console.log("✅ VALIDATION RÉUSSIE\n");
