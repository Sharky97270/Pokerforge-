# 02 — SHARKSOLVER CORE ARCHITECTURE
**PokerForge — SharkSolver Core V1** · état au commit `817b13d`

Cartographie de l'architecture **réellement implémentée** (pas cible : ce qui existe
et tourne). Tout le moteur est isolé sous `src/solver/`, indépendant de l'UI et de React.

---

## 1. Vue d'ensemble

```
PokerForge (UI React)
        │
        ▼
  SOLVER API  ......................  src/solver/api.js
        │   (surface stable, provenance-taggée — §17)
        ▼
  SHARKSOLVER CORE  ...............   src/solver/core/*
     ├─ Card Engine / Combo Engine ...  combos.js        (§7, §8)
     ├─ Hand Evaluator .............     evaluator.js     (§9)
     ├─ Equity Engine ..............     equity.js        (§10, exact + Monte-Carlo)
     ├─ Game Tree Engine ...........     gametree.js      (§12, v2 : sizings/raise/all-in)
     ├─ CFR Engine (1-street) ......     cfr.js           (§13, CFR+)
     ├─ Multi-Street CFR ...........     multistreet.js   (§26, vectorisé + node lock)
     ├─ Convergence ................     (dans cfr.js + nashConv dans multistreet.js) (§14)
     └─ ICM / PKO Engine ...........     icm.js           (§21, §22)
        │
        ▼
  SOLUTION STORAGE / LIBRARY  .....    src/solver/library.js   (§15, §16)
        │
        ▼
  PROVENANCE  .....................    src/solver/provenance.js (§6)
  AI EXPLANATION  .................    src/solver/explain.js    (§30)
```

## 2. Modules & responsabilités

| Module | Rôle | Fonctions clés | Provenance émise |
|---|---|---|---|
| `provenance.js` | Système de provenance central | `ResultSource`, `resultMeta`, `RangeSource`, `isCalculated` | — |
| `core/combos.js` | Cartes (int 0-51) + expansion combos + card removal | `comboCardsInt`, `exactComboList`, `rangeComboList`, `cardLabel` | — |
| `core/evaluator.js` | Évaluateur 5-parmi-7 | `eval5i`, `eval7i` | EXACT (déterministe) |
| `core/equity.js` | Équité exacte ↔ Monte-Carlo (seedé) | `computeEquity`, `monteCarloEquity`, `mulberry32`, `seedFrom` | EXACT / NUMERICAL_APPROXIMATION |
| `core/gametree.js` | Arbre postflop générique (sizings, raise, all-in) | `buildPostflopTree`, `terminalUtility`, `treeStats` | — |
| `core/cfr.js` | CFR+ 1-street heads-up + convergence | `solveRiverCFR` | CFR_SOLVE |
| `core/multistreet.js` | CFR+ vectorisé multi-rue, sous-arbres par carte, node lock, best-response | `solveTree`, `nashConv`, `bestResponseEV` | CFR_SOLVE |
| `core/icm.js` | ICM Malmuth-Harville exact + PKO | `icmEquity`, `finishProbabilities`, `icmRiskPremium`, `pkoValue` | ICM_ESTIMATE / PKO_ESTIMATE |
| `library.js` | Stockage/cache des solves par SolveID | `storeSolution`, `getSolution`, `getClosest` | PRESOLVED_LIBRARY |
| `api.js` | Surface stable pour tout PokerForge | voir `06_SOLVER_API_SPEC` | passe-plat + tag |
| `explain.js` | Faits sourcés pour le Coach AI | `classifyDecision`, `buildCoachBrief`, `buildExercise` | AI_EXPLANATION |

## 3. Flux d'un solve (exemple : spot postflop)

```
UI → api.solveMultiStreet(heroFreqs, villFreqs, board, opts)
   1. cap ranges 169 → combos réels (combos.js), card removal du board
   2. SolveID déterministe (signature = ranges + board + sizings + seed)
   3. library.getSolution(SolveID) ? → chargement immédiat (PRESOLVED_LIBRARY)
   4. sinon multistreet.solveTree :
        · Game Tree (gametree.js) : sizings + raise + all-in
        · CFR+ vectorisé, sous-arbres par carte, chance sampling si board incomplet
        · showdown via evaluator.js
   5. nashConv (best-response exact) si board complet → convergence mesurée
   6. library.storeSolution → provenance CFR_SOLVE + experimental
   → { source, result, convergence, solveId, experimental }
```

## 4. Principes d'architecture respectés

- **Isolation** (§5) : aucune fonction moteur ne dépend de React/DOM. Testable en Node pur.
- **Provenance partout** (§6) : chaque résultat porte sa source ; l'UI l'affiche.
- **Le solver calcule, l'IA explique** (§2) : `explain.js` ne produit que des faits
  dérivés de solutions calculées ; garde-fou testé (aucune fréquence hors solution).
- **Découplage API** (§17) : l'UI et le Trainer/Coach interrogent `api.js`, jamais le CFR.

## 5. Validation & benchmark (auto-vérifiable)

- `npm run test:solver` → `core/validate.mjs` : **95 tests** (évaluateur, combos, équité,
  CFR, convergence, reproductibilité, library, game tree, multi-street, node lock,
  exploit, ICM/PKO, AI explanation).
- `npm run bench:solver` → `core/benchmark.mjs` : équité vs références publiques (8),
  clairvoyance analytique (3 sizings), exploitabilité NashConv (3), ranges larges (3).
