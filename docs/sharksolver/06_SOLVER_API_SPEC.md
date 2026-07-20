# 06 — SOLVER API SPEC
**Surface stable de SharkSolver** (§17) · `src/solver/api.js` · commit `817b13d`

> Règle d'architecture : Trainer, Replayer, HH Analyzer, Leak Detector et Coach AI
> interrogent **cette API**, jamais le CFR ni les moteurs directement (§17).
> Chaque réponse porte sa **provenance** (`source`), jamais un chiffre non sourcé (§6).

---

## 1. Identité & reproductibilité

### `makeSolveId(spec) → string`
Identifiant déterministe `SHK-XXXXXXXX`. Même spec ⇒ même ID (§15).

---

## 2. Équité

### `computeEquity(heroList, villList, board = [], opts) → EquityResult`
Choisit **automatiquement** énumération exacte ou Monte-Carlo selon le coût estimé.

| Champ | Type | Sens |
|---|---|---|
| `equity` | `number` | Équité Hero en % (0-100) |
| `exact` | `boolean` | `true` = énumération exhaustive |
| `source` | `ResultSource` | `EXACT_CALCULATION` ou `NUMERICAL_APPROXIMATION` |
| `evals` / `samples` | `number` | Coût réel du calcul |
| `seed` | `number` | Graine (reproductibilité, §15) |

`opts` : `{ iters=2500, budget=200000, seed }`.

---

## 3. Solve 1-street (CFR+ historique)

### `solveSubgame(heroFreqs, villFreqs, board, potBb, betFrac, opts) → SolveResult`
Sous-jeu heads-up 1 street (2 sizings + raise/check-raise). Cache Solution Library.

| Champ | Sens |
|---|---|
| `source` | `CFR_SOLVE` (calculé) ou `PRESOLVED_LIBRARY` (rechargé) |
| `result` | Fréquences agrégées, `heroByKey`, EV, itérations |
| `convergence` | `{ stability, avgRegret, exploitBb, status, driftPct }` (§14) |
| `solveId`, `seed`, `fromLibrary` | Traçabilité |

---

## 4. Solve multi-rue (§26) — **expérimental**

### `solveMultiStreet(heroFreqs, villFreqs, board, opts) → MultiSolveResult`
Arbre postflop complet : multi-sizings, raise plafonné, all-in, **sous-arbres par carte**.
Nombre de rues déduit du board (flop → 3, turn → 2, river → 1).

- `source` : `CFR_SOLVE` / `PRESOLVED_LIBRARY` / `NO_SOLUTION`
- `experimental: true` → **l'UI doit l'afficher comme tel** (§2) ; jamais « GTO » sec.
- `convergence.nashConv` : exploitabilité **exacte** si board complet ; `null` sinon
  (runouts échantillonnés → note explicative fournie).
- `opts` : `{ iters, betSizes[], betFrac, startPot, maxCombos=100, maxRaisesPerStreet, effStack, seed, locks }`

---

## 5. Node Lock solvé (§19)

### `solveNodeLocked(heroFreqs, villFreqs, board, locks, opts) → MultiSolveResult & { nodeLocked:true, locks }`
Verrous : `[{ path:["B"], freqs:{F:0.7,C:0.3} }]` (chemin d'actions) **ou**
`[{ match:"villFacingBet"|"villAfterCheck", freqs:{…} }]` (motif).
Au nœud verrouillé la stratégie est **imposée** ; **tout le reste de l'arbre re-solve**.
→ vrai `CFR_SOLVE`, à distinguer du Quick Node Lock heuristique de l'UI actuelle.

---

## 6. Exploit Solver (§20)

### `EXPLOIT_PROFILES`
`nit · tag · lag · calling_station · fish · aggro_reg · maniac · reg`
Chacun : `{ label, vsBet:{F,C,R}, afterCheck:{X,B} }`.

### `solveExploit(profileId, heroFreqs, villFreqs, board, opts) → … & { exploit }`
Chaîne imposée par le §20 :
`PLAYER MODEL` (étiqueté `HEURISTIC_ESTIMATE`) → `NODE LOCK` → **RE-SOLVE CFR** → `EXPLOIT STRATEGY` (`CFR_SOLVE`).
Profil inconnu → `NO_SOLUTION` (jamais de stratégie inventée, §18).

---

## 7. ICM / PKO (§21, §22)

### `computeICM({ stacks, payouts, heroIndex, … }) → { source:"ICM_ESTIMATE", … }`
Équité ICM Malmuth-Harville **exacte**, risk premium, bubble factor.

### `computePKO({ potBb, heroEquity, villainBounty, … }) → { source:"PKO_ESTIMATE", … }`
Valeur de bounty et équité PKO.

> Ces provenances existent précisément pour **ne pas** prétendre à un solve ICM/PKO
> complet : le calcul d'équité est exact, la **stratégie** ne l'est pas (§21/§22).

---

## 8. Bibliothèque pré-solvée (§16)

| Fonction | Rôle |
|---|---|
| `getPresolvedSolution(solveId)` | Solution exacte si stockée → `PRESOLVED_LIBRARY` |
| `getClosestSolution(solveId)` | V1 : match exact uniquement (fuzzy = futur) |
| `librarySize()` | Nombre d'entrées en cache |

Flux : *spot demandé → solution disponible ? oui = chargement immédiat ; non = solve à la demande, puis stockage.*

---

## 9. Explication (§30) — `src/solver/explain.js`

| Fonction | Sortie |
|---|---|
| `classifyDecision({actions, chosenId, source})` | `verdict` (best/correct/inaccuracy/mistake/blunder), `evLoss`, `leak`, `severity` |
| `classifyLeak(evaluation, ctx)` | Leak nommé (`LEAK_CATALOG`) + axe |
| `buildCoachBrief(sol, evaluation)` | **Faits sourcés** + `disclaimer` honnête |
| `buildExercise(leak, ctx)` | Drill ciblé (`AI_EXPLANATION`) |

**Garde-fou testé** : aucune fréquence des faits n'existe hors de la solution — l'IA
reformule, elle n'invente pas (§2/§30).

---

## 10. Contrat d'usage pour les consommateurs

1. Appeler l'API, **jamais** `core/*` directement.
2. **Toujours** afficher `source` (badge de provenance) — §46/§52.
3. Si `experimental: true` → le signaler explicitement dans l'UI.
4. `NO_SOLUTION` ⇒ ne rien inventer ; proposer « main suivante » (§18).
