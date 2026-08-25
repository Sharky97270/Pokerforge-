const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const P = 'docs/adaptive-sizing/CONFORMITE_1_110.md';
const rep = (a, b) => {
  let s = fs.readFileSync(P, 'utf8');
  for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
    if (s.includes(pat)) { fs.writeFileSync(P, s.replace(pat, r2)); return; }
  }
  console.error('MISS : ' + a.slice(0, 90)); process.exit(1);
};

rep(`| 14 | Métrique de perte d'EV, sans ratio trompeur | **PASS** | \`retainedEV\` refusé sur référence ≤ 0 ; \`evLossPotPct\` toujours défini ; plancher de mesure |`,
`| 14 | Métrique de perte d'EV, sans ratio trompeur | **PASS** | \`retainedEV\` refusé sur référence ≤ 0 ; \`evLossPotPct\` toujours défini ; **deux** planchers rapportés — \`distinguishable\` (mesuré) et \`guaranteed\` (borné par NashConv), voir L7 |`);

rep(`| 21 | Convergence réelle, jamais fabriquée | **PASS** | NashConv exact sur board complet ; \`null\` + motif sinon |`,
`| 21 | Convergence réelle, jamais fabriquée | **PASS** | NashConv exact sur board complet ; \`null\` + motif sinon — y compris sous rake, où la somme nulle tombe et où l'exploitabilité cesse d'être définie |`);

rep(`| 36 | Retour : action, sizing, fréquence, EV… si disponibles | **PASS** | EV par action déclarée indisponible (L4) plutôt qu'inventée |`,
`| 36 | Retour : action, sizing, fréquence, EV… si disponibles | **PASS** | **EV par action désormais CALCULÉE** (\`nodeActionEVs\`) : \`evPlayedBb\`, \`evBestBb\`, \`evLossBb\`, avec la source (main ou range) et l'exactitude. Un sizing non résolu reste sans EV (§50). L4 levée |`);

rep(`| 49 | Replayer : joué vs Single/Simple/Full | **PASS** | \`compareReplayDecision\` ; les trois niveaux confrontés |`,
`| 49 | Replayer : joué vs Single/Simple/Full | **PASS** | \`compareReplayDecision\` ; les trois niveaux confrontés — et \`formatReplayComparison\` rend enfin les trois lignes « EV jouée / EV la meilleure / écart », avec la mention explicite quand l'écart tient dans le résidu d'indifférence du nœud |`);

rep(`| 78 | Format cash (rake, cap, straddle) | **PARTIAL** | rake et cap transportés, dans le hash, **déclarés non appliqués** (L5) ; straddle non modélisé |`,
`| 78 | Format cash (rake, cap, straddle) | **PARTIAL** | **rake et cap APPLIQUÉS** à l'utilité terminale (\`makeRakeModel\`), variante « pots non disputés » comprise ; le sizing retenu en change (75 % → 33 % à 5 %/cap 3bb). Somme nulle levée → NashConv \`null\`, ICM+rake refusé. L5 levée. **Straddle toujours non modélisé** |`);

rep(`| Mémoire du flop à 3 rues | (aucun PARTIAL : dégradé et annoncé) | L3 |
| EV par action non conservée | (aucun PARTIAL : §36 l'autorise explicitement) | L4 |
| Rake non appliqué | §78 | L5 |`,
`| Mémoire du flop à 3 rues | (aucun PARTIAL : dégradé et annoncé) | L3 |
| ~~EV par action non conservée~~ | **levé** — §36 et §49 passent en PASS calculé | ~~L4~~ |
| ~~Rake non appliqué~~ | **levé** — §78 reste PARTIAL pour le seul straddle | ~~L5~~ |`);
console.log('ok');
