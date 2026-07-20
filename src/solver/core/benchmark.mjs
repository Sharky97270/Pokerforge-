/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER · BENCHMARK REPORT (§24)
   Compare l'équité SharkSolver à des valeurs de RÉFÉRENCE publiques (équités
   heads-up préflop all-in, moyennées sur toutes les couleurs). Priorité du projet :
   CORRECTNESS BEFORE PERFORMANCE — ce banc détecte toute erreur grossière de
   l'évaluateur / de l'équité. Reproductible (équité seedée §15).
   Lancer :  node src/solver/core/benchmark.mjs   (npm run bench:solver)
════════════════════════════════════════════════════════════════════════════ */
import { singleHandList, rangeComboList } from "./combos.js";
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

/* ══ [C] RANGES LARGES — perf + convergence (préalable au câblage UI) ══
   Ranges réalistes ~large vs ~large générées par force de main, bornées à
   maxCombos par camp (même abstraction que le solveur 1-street de l'API).
   · River (board complet) : NashConv EXACT mesurable, raise inclus.
   · Flop 3 rues échantillonnées : temps de solve + bornes de sanité + repro. */
function wideRange(pct){
  const RK="AKQJT98765432";
  const freqs={};
  for(let i=0;i<13;i++)for(let j=i;j<13;j++){
    const mk2=(k,sc)=>{if(sc>=(1-pct)*100)freqs[k]={r:100,c:0,f:0};};
    if(i===j){mk2(RK[i]+RK[i],100-i*5.5);continue;}                 // paires
    const gap=j-i;
    mk2(RK[i]+RK[j]+"s",96-(i+j)*3.2-gap*2.4);                       // suited
    mk2(RK[i]+RK[j]+"o",90-(i+j)*3.6-gap*3.2);                       // offsuit
  }
  return freqs;
}
const capCombos=(freqs,cap,bd)=>rangeComboList(freqs).filter(e=>!bd.includes(e.cards[0])&&!bd.includes(e.cards[1])).slice(0,cap);
const wideBtn=wideRange(0.42),wideBb=wideRange(0.34);
console.log("  RANGES LARGES — perf & convergence :");
const rvBoard=[Cc("K",0),Cc("8",1),Cc("4",2),Cc("J",3),Cc("2",0)];
const rvH=capCombos(wideBtn,120,rvBoard),rvV=capCombos(wideBb,120,rvBoard);
let t0=Date.now();
const wr=solveTree(rvH,rvV,rvBoard,{iters:250,betSizes:[0.5,1],startPot:6,streets:1,maxRaisesPerStreet:1,effStack:97});
const wrMs=Date.now()-t0,wrNc=nashConv(wr);
const okWr=wrNc!=null&&wrNc>=-0.02&&wrNc<=0.35;
if(okWr)mpass++;else mfail++;
console.log("  river "+rvH.length+"×"+rvV.length+" combos · 2 sizings+raise      "+String(wrMs).padStart(5)+" ms   NashConv "+String(wrNc).padStart(8)+" bb (tol 0.35)   "+(okWr?"PASS ✓":"FAIL ✗"));
const flBoard=[Cc("K",0),Cc("8",1),Cc("4",2)];
const flH=capCombos(wideBtn,100,flBoard),flV=capCombos(wideBb,100,flBoard);
t0=Date.now();
const wf=solveTree(flH,flV,flBoard,{iters:120,betFrac:0.66,startPot:6,streets:3,maxRaisesPerStreet:1,effStack:97,seed:777});
const wfMs=Date.now()-t0;
const wf2=solveTree(flH,flV,flBoard,{iters:120,betFrac:0.66,startPot:6,streets:3,maxRaisesPerStreet:1,effStack:97,seed:777});
const okWf=Number.isFinite(wf.ev)&&Math.abs(wf.ev)<=100&&wf.heroBet>=0&&wf.heroBet<=100;
const okRepro=wf.heroBet===wf2.heroBet&&wf.ev===wf2.ev;
if(okWf)mpass++;else mfail++;
if(okRepro)mpass++;else mfail++;
console.log("  flop 3 rues "+flH.length+"×"+flV.length+" combos (120 iters)     "+String(wfMs).padStart(5)+" ms   EV "+wf.ev+" bb · bet "+wf.heroBet+"%          "+(okWf?"PASS ✓":"FAIL ✗"));
console.log("  reproductibilité flop 3 rues (même seed → même solve)              "+(okRepro?"PASS ✓":"FAIL ✗"));
console.log(`\n  Ranges larges : voir ci-dessus — total multi-street ${mpass} PASS / ${mfail} FAIL\n`);

if(fail+mfail>0){process.exitCode=1;console.log("❌ BENCHMARK ÉCHOUÉ — écart moteur vs référence.\n");}
else console.log("✅ BENCHMARK RÉUSSI — équité + multi-street conformes.\n");
