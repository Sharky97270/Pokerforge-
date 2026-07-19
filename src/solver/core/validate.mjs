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
import { solveSubgame } from "../api.js";

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

console.log("\n────────────────────────────────────────");
console.log(`RÉSULTAT : ${pass} ✓ / ${fail} ✗`);
if(fail>0){process.exitCode=1;console.log("❌ VALIDATION ÉCHOUÉE\n");}
else console.log("✅ VALIDATION RÉUSSIE\n");
