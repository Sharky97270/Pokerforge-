/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER · BENCHMARK REPORT (§24)
   Compare l'équité SharkSolver à des valeurs de RÉFÉRENCE publiques (équités
   heads-up préflop all-in, moyennées sur toutes les couleurs). Priorité du projet :
   CORRECTNESS BEFORE PERFORMANCE — ce banc détecte toute erreur grossière de
   l'évaluateur / de l'équité. Reproductible (équité seedée §15).
   Lancer :  node src/solver/core/benchmark.mjs   (npm run bench:solver)
════════════════════════════════════════════════════════════════════════════ */
import { singleHandList } from "./combos.js";
import { computeEquity } from "./equity.js";
import { solveTree, nashConv } from "./multistreet.js";

/* Références (équité du 1er camp, %, moyenne sur les combos) — valeurs classiques
   établies (pair-over-pair 4 outs ≈ 82.6 ; domination ; races). Tolérances larges :
   on veut détecter une ERREUR de moteur, pas départager des décimales. */
const REF=[
  ["KK vs QQ (pair > pair)","KK","QQ",82.6,2.5],
  ["AA vs 22 (pair > pair)","AA","22",82.4,2.5],
  ["AKo vs AQo (dominé)","AKo","AQo",73.5,3.0],
  ["AKs vs AQs (dominé, assorti)","AKs","AQs",69.5,3.5],
  ["JJ vs AKo (race)","JJ","AKo",56.9,3.0],
  ["AKs vs 22 (race, assorti)","AKs","22",49.5,3.0],
  ["AKo vs KK (dominé)","AKo","KK",30.0,3.0],
  ["QQ vs AKs (race)","QQ","AKs",53.8,3.0],
];

const ITERS=120000;
console.log("\nSHARKSOLVER — BENCHMARK ÉQUITÉ (§24)  ·  Monte-Carlo "+ITERS.toLocaleString("fr")+" itérations (seedé)\n");
console.log("  Scénario                         Réf     Shark    Δ       Tol    Verdict");
console.log("  ─────────────────────────────────────────────────────────────────────────");
let pass=0,fail=0;
for(const [id,ha,hb,ref,tol] of REF){
  const eq=computeEquity(singleHandList(ha),singleHandList(hb),[],{iters:ITERS}).equity;
  const diff=Math.round((eq-ref)*10)/10;
  const okv=Math.abs(eq-ref)<=tol;
  if(okv)pass++;else fail++;
  console.log("  "+id.padEnd(32)+" "+String(ref).padStart(5)+"%  "+String(eq).padStart(5)+"%  "+
    (diff>=0?"+":"")+String(diff).padStart(4)+"   ±"+String(tol).padStart(3)+"   "+(okv?"PASS ✓":"FAIL ✗"));
}
console.log("  ─────────────────────────────────────────────────────────────────────────");
console.log(`  ${pass} PASS / ${fail} FAIL sur ${REF.length} scénarios\n`);

/* ══ [B] BENCHMARK MULTI-STREET (§26) ══
   1) Famille analytique (jeu de clairvoyance, 1 street, sans raise) :
      bluff air = b/(P+b) · call = P/(P+b) — solution GTO exacte connue.
   2) Exploitabilité (NashConv = somme des gains de meilleure réponse) sur des
      jeux 1 et 2 rues, raise inclus : ≈ 0 ⟺ le solveur atteint l'équilibre. */
const Cc=(r,s)=>"23456789TJQKA".indexOf(r)*4+s;
const board5=[Cc("A",0),Cc("K",0),Cc("Q",2),Cc("J",3),Cc("2",1)];
const polar=[{cards:[Cc("T",1),Cc("3",0)],w:1},{cards:[Cc("4",2),Cc("5",3)],w:1}]; // nuts + air
const catcher=[{cards:[Cc("9",3),Cc("9",2)],w:1}];
console.log("  MULTI-STREET — clairvoyance analytique (bluff air / call) :");
console.log("  Sizing      Réf bluff  Shark   Réf call  Shark   Verdict");
console.log("  ──────────────────────────────────────────────────────────");
let mpass=0,mfail=0;
for(const b of [0.5,1,2]){
  const refBluff=Math.round(b/(1+b)*1000)/10, refCall=Math.round(1/(1+b)*1000)/10;
  const s=solveTree(polar,catcher,board5,{iters:3000,betFrac:b,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0});
  const air=Math.round(s.avgOf(s.tree,1)[1]*1000)/10;
  const call=Math.round(s.avgOf(s.tree.children.B,0)[1]*1000)/10;
  const okb=Math.abs(air-refBluff)<=6&&Math.abs(call-refCall)<=6;
  if(okb)mpass++;else mfail++;
  console.log("  bet "+String(b).padEnd(5)+"    "+String(refBluff).padStart(5)+"%  "+String(air).padStart(5)+"%   "+String(refCall).padStart(5)+"%  "+String(call).padStart(5)+"%   "+(okb?"PASS ✓":"FAIL ✗"));
}
console.log("\n  MULTI-STREET — exploitabilité (NashConv, ≈0 ⟺ équilibre) :");
const sc1=solveTree(polar,catcher,board5,{iters:3000,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:0});
const scR=solveTree(polar,catcher,board5,{iters:3000,betFrac:1,startPot:6,streets:1,ipProbe:false,maxRaisesPerStreet:1});
const sc2=solveTree(polar,catcher,board5,{iters:3000,betFrac:0.75,startPot:6,streets:2,ipProbe:true,maxRaisesPerStreet:1});
for(const [id,s,tol] of [["1 street sans raise",sc1,0.15],["1 street avec raise",scR,0.20],["2 streets avec raise/probe",sc2,0.30]]){
  const nc=nashConv(s);
  const okn=nc!=null&&nc>=-0.02&&nc<=tol;
  if(okn)mpass++;else mfail++;
  console.log("  "+id.padEnd(28)+" NashConv "+String(nc).padStart(8)+" bb   (tol "+tol+")   "+(okn?"PASS ✓":"FAIL ✗"));
}
console.log("  ──────────────────────────────────────────────────────────");
console.log(`  Multi-street : ${mpass} PASS / ${mfail} FAIL\n`);

if(fail+mfail>0){process.exitCode=1;console.log("❌ BENCHMARK ÉCHOUÉ — écart moteur vs référence.\n");}
else console.log("✅ BENCHMARK RÉUSSI — équité + multi-street conformes.\n");
