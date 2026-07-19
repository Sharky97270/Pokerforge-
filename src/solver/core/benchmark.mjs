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
if(fail>0){process.exitCode=1;console.log("❌ BENCHMARK ÉCHOUÉ — écart moteur vs référence.\n");}
else console.log("✅ BENCHMARK RÉUSSI — équité conforme aux références.\n");
