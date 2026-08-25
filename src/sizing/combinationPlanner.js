/* ══════════════════════════════════════════════════════════════════════════
   PFASE · PLANIFICATEUR COMBINATOIRE (Mission §10, §11, §62)

   LE PROBLÈME
   « Pour N sizings retenus : ne pas sélectionner simplement les N meilleures
   tailles indépendantes. Il faut évaluer les sous-ensembles. » (§10)

   C'est mathématiquement fondé : deux sizings se COMPLÈTENT ou se DOUBLONNENT.
   {33, 36} couvre moins de terrain que {33, 150} même si 36 bat 150 seul.
   Prendre les deux meilleurs isolément produit régulièrement une paire redondante.

   MAIS le nombre de sous-ensembles explose : avec 12 candidats et ADVANCED
   (3 bets, 2 raises), c'est (12 + 66 + 220) × (12 + 66) = 23 244 solves. Hors
   de portée.

   LA RÉPONSE ICI — en deux étages, et DÉCLARÉE :
     Étage 1  chaque candidat est évalué SEUL (n solves). C'est bon marché et ça
              donne un classement individuel.
     Étage 2  les sous-ensembles ne sont formés que parmi les K meilleurs de
              l'étage 1 (K = maxSizes + `shortlistMargin`), MAIS ils sont
              réellement évalués — on ne déduit jamais l'EV d'une paire de l'EV
              de ses membres. C'est ce qui distingue ce plan de l'interdit §10.

   Le résultat porte `pruned`, `prunedFrom`, `truncated` : un sous-ensemble absent
   du plan est absent POUR UNE RAISON CONSIGNÉE, jamais par oubli.

   Module PUR et DÉTERMINISTE : même entrée → même plan, à l'ordre près des
   candidats fournis (ils sont triés par clé avant tout).
   ══════════════════════════════════════════════════════════════════════════ */

import { DEFAULT_COMBINATION_BUDGET, complexityLimits, withDefaults, SizingComplexity } from "./config.js";

/* Nombre de candidats supplémentaires (au-delà du plafond de sizings) conservés
   pour former les sous-ensembles. 3 : une paire optimale se compose presque
   toujours de tailles bien classées individuellement, mais pas forcément des
   deux premières — la marge couvre ce cas sans faire exploser le plan. */
export const DEFAULT_SHORTLIST_MARGIN = 3;

/* Sous-ensembles de taille exactement `k` parmi `items`, en ordre lexicographique
   d'indices : déterministe, sans doublon, sans dépendance à l'ordre d'appel. */
export function combinations(items, k) {
  const out = [];
  if (k <= 0 || k > items.length) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    out.push(idx.map(i => items[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === items.length - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

/* Tous les sous-ensembles de taille 1..max. */
export function allSubsetsUpTo(items, max) {
  const out = [];
  for (let k = 1; k <= Math.min(max, items.length); k++) out.push(...combinations(items, k));
  return out;
}

/* Identifiant stable d'un sous-ensemble : clés triées. {33,75} et {75,33} sont
   le MÊME sous-ensemble et doivent porter le même id (sinon on solve deux fois
   la même chose, et §62 tombe). */
export function subsetId(betKeys, raiseKeys) {
  const b = (betKeys || []).slice().sort().join("+");
  const r = (raiseKeys || []).slice().sort().join("+");
  return r ? `${b}|R:${r}` : b;
}

/* ══════════════════════════════════════════════════════════════════════════
   planStageOne — le plan d'évaluation individuelle.
   Un sous-ensemble par candidat, plus (si des relances existent) un sous-ensemble
   par candidat de relance combiné au meilleur unique de mise… non : à ce stade
   on ne SAIT pas quel est le meilleur. Les relances sont donc évaluées avec la
   TOTALITÉ des mises candidates de référence, pour ne pas mêler deux effets.
   ══════════════════════════════════════════════════════════════════════════ */
export function planStageOne({ betCandidates = [], raiseCandidates = [] } = {}) {
  const bets = sortByKey(betCandidates);
  const raises = sortByKey(raiseCandidates);
  const allBetKeys = bets.map(c => c.key);
  const allRaiseKeys = raises.map(c => c.key);
  const entries = [];
  for (const c of bets) {
    entries.push({
      id: subsetId([c.key], allRaiseKeys),
      stage: 1, dimension: "bet",
      betKeys: [c.key], raiseKeys: allRaiseKeys,
      betSpecs: [c.spec], raiseSpecs: raises.map(r => r.spec),
    });
  }
  for (const c of raises) {
    entries.push({
      id: subsetId(allBetKeys, [c.key]),
      stage: 1, dimension: "raise",
      betKeys: allBetKeys, raiseKeys: [c.key],
      betSpecs: bets.map(b => b.spec), raiseSpecs: [c.spec],
    });
  }
  return dedupeById(entries);
}

/* ══════════════════════════════════════════════════════════════════════════
   planStageTwo — les sous-ensembles multi-tailles, formés sur la liste courte.

   `rankedBetKeys` / `rankedRaiseKeys` viennent du classement de l'étage 1
   (meilleur d'abord). L'appelant les fournit ; ce module ne calcule aucune EV.
   ══════════════════════════════════════════════════════════════════════════ */
export function planStageTwo({
  betCandidates = [], raiseCandidates = [],
  rankedBetKeys = [], rankedRaiseKeys = [],
  complexity = SizingComplexity.SIMPLE, budget, shortlistMargin = DEFAULT_SHORTLIST_MARGIN,
} = {}) {
  const bud = withDefaults(DEFAULT_COMBINATION_BUDGET, budget);
  const lim = complexityLimits(complexity);
  const betsByKey = new Map(betCandidates.map(c => [c.key, c]));
  const raisesByKey = new Map(raiseCandidates.map(c => [c.key, c]));

  const maxBet = lim.maxBetSizes == null ? betCandidates.length : lim.maxBetSizes;
  const maxRaise = lim.maxRaiseSizes == null ? raiseCandidates.length : lim.maxRaiseSizes;

  const pruned = [];
  const shortBet = shortlist(rankedBetKeys, betsByKey, maxBet + shortlistMargin, pruned, "bet");
  const shortRaise = shortlist(rankedRaiseKeys, raisesByKey, maxRaise + shortlistMargin, pruned, "raise");

  let betSubsets = allSubsetsUpTo(shortBet, maxBet);
  let raiseSubsets = raiseCandidates.length ? allSubsetsUpTo(shortRaise, maxRaise) : [[]];

  let truncated = false;
  if (betSubsets.length > bud.maxBetSubsets) {
    pruned.push({ dimension: "bet", reason: `budget de sous-ensembles (${bud.maxBetSubsets}) — ${betSubsets.length} générés` });
    betSubsets = betSubsets.slice(0, bud.maxBetSubsets);
    truncated = true;
  }
  if (raiseSubsets.length > bud.maxRaiseSubsets) {
    pruned.push({ dimension: "raise", reason: `budget de sous-ensembles (${bud.maxRaiseSubsets}) — ${raiseSubsets.length} générés` });
    raiseSubsets = raiseSubsets.slice(0, bud.maxRaiseSubsets);
    truncated = true;
  }

  const entries = [];
  for (const bs of betSubsets) {
    for (const rs of raiseSubsets) {
      entries.push({
        id: subsetId(bs.map(c => c.key), rs.map(c => c.key)),
        stage: 2, dimension: "combined",
        betKeys: bs.map(c => c.key), raiseKeys: rs.map(c => c.key),
        betSpecs: bs.map(c => c.spec), raiseSpecs: rs.map(c => c.spec),
      });
    }
  }
  let plan = dedupeById(entries);
  if (plan.length > bud.maxEvaluations) {
    pruned.push({ dimension: "combined", reason: `budget d'évaluations (${bud.maxEvaluations}) — ${plan.length} sous-arbres` });
    plan = plan.slice(0, bud.maxEvaluations);
    truncated = true;
  }
  return {
    entries: plan, pruned, truncated,
    shortlist: { bets: shortBet.map(c => c.key), raises: shortRaise.map(c => c.key) },
    limits: { maxBetSizes: maxBet, maxRaiseSizes: maxRaise },
  };
}

/* Le sous-arbre de RÉFÉRENCE (§9) : tous les candidats, aucune simplification.
   C'est l'étalon contre lequel la perte d'EV est mesurée. Il n'est PAS soumis
   au budget : sans référence, il n'y a pas de perte d'EV, donc pas de sélection
   honnête — on préfère refuser l'optimisation à mesurer contre un étalon tronqué. */
export function referenceEntry({ betCandidates = [], raiseCandidates = [] } = {}) {
  const bets = sortByKey(betCandidates), raises = sortByKey(raiseCandidates);
  return {
    id: subsetId(bets.map(c => c.key), raises.map(c => c.key)),
    stage: 0, dimension: "reference",
    betKeys: bets.map(c => c.key), raiseKeys: raises.map(c => c.key),
    betSpecs: bets.map(c => c.spec), raiseSpecs: raises.map(c => c.spec),
  };
}

/* ── Utilitaires ── */
function sortByKey(list) { return (list || []).slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); }
function dedupeById(entries) {
  const seen = new Set(); const out = [];
  for (const e of entries) { if (seen.has(e.id)) continue; seen.add(e.id); out.push(e); }
  return out;
}
function shortlist(rankedKeys, byKey, size, pruned, dimension) {
  const out = [];
  for (const k of rankedKeys) {
    const c = byKey.get(k);
    if (!c) continue;
    if (out.length < size) out.push(c);
    else pruned.push({ dimension, key: k, reason: `hors liste courte (${size} candidats retenus après l'étage 1)` });
  }
  /* Un candidat non classé (étage 1 échoué) reste utilisable si la place existe :
     on ne l'écarte pas silencieusement pour cause d'échec d'évaluation. */
  for (const [k, c] of byKey) {
    if (out.some(x => x.key === k)) continue;
    if (out.length < size) out.push(c);
    else pruned.push({ dimension, key: k, reason: "non classé et liste courte pleine" });
  }
  return sortByKey(out);
}

/* Compte des sous-arbres qu'un plan complet impliquerait SANS pruning — sert à
   l'instrumentation (§57) et à justifier le budget dans le rapport. */
export function combinatorialSize({ nBets, nRaises, complexity }) {
  const lim = complexityLimits(complexity);
  const mb = lim.maxBetSizes == null ? nBets : lim.maxBetSizes;
  const mr = lim.maxRaiseSizes == null ? nRaises : lim.maxRaiseSizes;
  const sum = (n, k) => { let s = 0; for (let i = 1; i <= Math.min(k, n); i++) s += binom(n, i); return s; };
  const b = sum(nBets, mb), r = nRaises ? sum(nRaises, mr) : 1;
  return { betSubsets: b, raiseSubsets: r, total: b * r };
}
function binom(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
