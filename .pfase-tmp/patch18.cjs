const fs=require('fs');const p='src/sizing/solverAdapter.js';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,80));process.exit(1);} s=s.replace(a,b);};
rep(`const mb = (b) => \`\${Math.round(b / (1024 * 1024))} Mo\`;`,
`const mb = (b) => \`\${Math.round(b / (1024 * 1024))} Mo\`;

/* ── SURCOÛT MESURÉ DES OBJETS JS ─────────────────────────────────────────
   La charge utile arithmétique (combos × actions × 8 octets × 2 tables) sous-
   estime lourdement la mémoire réelle : chaque contexte alloue UN Float64Array
   PAR COMBO, et un Float64Array de 8 valeurs coûte bien plus que ses 64 octets
   de données (en-tête d'objet, ArrayBuffer, entrée de Map). S'y ajoutent les
   tableaux temporaires de la traversée CFR, qui s'accumulent entre deux passages
   du ramasse-miettes.

   Mesuré sur un flop réel (5 sizings + jam + 2 relances, 54 combos, 200 it.,
   profondeur 2) : estimation arithmétique 18 Mo, tas réellement consommé 211 Mo.
   Le facteur est donc calibré à 12 — empirique et déclaré, pas dérivé d'un
   modèle. Sans lui, le garde-fou laissait passer des solves qui faisaient tomber
   le moteur à court de mémoire, ce qui est pire que pas de garde-fou du tout :
   il donnait une fausse assurance. */
export const MEMORY_OVERHEAD_FACTOR = 12;`);
rep(`  return { bytes, decisions, maxContexts, nodes: treeStats(tree).total };`,
`  return {
    bytes: bytes * MEMORY_OVERHEAD_FACTOR,
    rawBytes: bytes, overheadFactor: MEMORY_OVERHEAD_FACTOR,
    decisions, maxContexts, nodes: treeStats(tree).total,
  };`);
fs.writeFileSync(p,s);console.log('ok');
