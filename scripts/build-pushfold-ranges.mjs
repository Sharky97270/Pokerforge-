/* ══════════════════════════════════════════════════════════════════════════
   Pré-calcul des ranges d'équilibre push/fold pour les tapis entiers 1..25bb.

   Pourquoi pré-calculer plutôt que solver à la volée : un équilibre à 20 000
   itérations coûte ~23 s. Rigoureux, mais l'UI gèlerait. Baisser les itérations
   dégraderait la précision d'un résultat qu'on présente comme CALCULÉ — ce qui
   serait exactement le compromis à ne pas faire. On paie le calcul UNE fois, hors
   ligne, et le runtime devient instantané.

   Lancer : node scripts/build-pushfold-ranges.mjs
   Sortie : src/solver/data/pushfoldRanges.js
════════════════════════════════════════════════════════════════════════════ */
import { solvePushFold, pfExploitability, pfRangePct, PF_HANDS } from "../src/solver/core/pushfold.js";
import fs from "node:fs";

const DEPTHS = Array.from({ length: 25 }, (_, i) => i + 1);   // 1..25 bb
const ITERS = 20000;
const out = { v: 1, iters: ITERS, hands: PF_HANDS, depths: {} };

console.error(`Pré-calcul de ${DEPTHS.length} profondeurs à ${ITERS} itérations…`);
const t0 = Date.now();
let worst = 0;
for (const S of DEPTHS) {
  const s = solvePushFold(S, { iters: ITERS });
  const e = pfExploitability(s.sbJam, s.bbCall, S);
  worst = Math.max(worst, e.sbGain, e.bbGain);
  out.depths[S] = {
    // fréquences en millièmes entiers : compact, et suffisant (l'équilibre
    // push/fold est génériquement en stratégies pures, donc 0 ou 1000).
    jam: Array.from(s.sbJam, x => Math.round(x * 1000)),
    call: Array.from(s.bbCall, x => Math.round(x * 1000)),
    jamPct: Math.round(pfRangePct(s.sbJam) * 10) / 10,
    callPct: Math.round(pfRangePct(s.bbCall) * 10) / 10,
    exp: { sb: Math.round(e.sbGain * 1e6) / 1e6, bb: Math.round(e.bbGain * 1e6) / 1e6 },
  };
  console.error(`  ${String(S).padStart(2)}bb  jam ${out.depths[S].jamPct}%  call ${out.depths[S].callPct}%  exploit ${e.bbGain.toFixed(6)}`);
}
out.maxExploitability = Math.round(worst * 1e6) / 1e6;

const header = `/* ARTEFACT GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
   Ranges d'équilibre push/fold heads-up, tapis 1..25bb, ${ITERS} itérations.
   Exploitabilité maximale sur l'ensemble : ${out.maxExploitability} bb.
   Fréquences en MILLIÈMES entiers (0..1000).
   Régénérer : node scripts/build-pushfold-ranges.mjs */
`;
fs.writeFileSync("src/solver/data/pushfoldRanges.js", header + "export default " + JSON.stringify(out) + ";\n");
console.error(`\nÉcrit en ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min — exploitabilité max ${out.maxExploitability} bb`);
console.error(`Taille : ${(fs.statSync("src/solver/data/pushfoldRanges.js").size / 1024).toFixed(0)} Ko`);
