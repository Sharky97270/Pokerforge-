# MODÈLE DE DONNÉES — PokerForge Adaptive Sizing Engine

> Mission §17, §18, §19, §28, §37, §80, §97.

---

## 1. `SizingSpec` — un sizing est un objet, jamais une chaîne

```ts
type SizingSpec =
  | { type: "pot",         value: number }   // fraction du pot : 0.75 = 75 %
  | { type: "geometric",   streetsRemaining: number }
  | { type: "previousBet", value: number }   // multiple de la mise affrontée
  | { type: "bb",          value: number }   // multiple de la grosse blinde
  | { type: "jam" }                          // tapis — une ACTION, pas 999 % du pot
```

Résolu par `resolveSizing(spec, ctx)` en :

```ts
{
  spec, key, label,
  computedAmount,   // TOTAL atteint sur la street, en bb
  additionalChips,  // ce qui quitte réellement le tapis
  potFraction,      // fraction équivalente — permet de comparer des types différents
  allIn, clamped,   // "tapis" | "minimum légal" | null
  minTo, maxTo
}
```

Un nombre nu vaut une fraction de pot (rétro-compatibilité avec `buildPostflopTree`).
Une chaîne ne vaut **rien** : `toSizingSpec("33%")` rend `null`.

---

## 2. `GameState` — l'état canonique

```ts
{
  gameType, format, tableFormat,
  street, streetsRemaining, board, boardKeys,
  blinds:{sb,bb}, ante, minBet, rake:{pct,cap,applied},
  players:[{ id, position, seat, stack, committedStreet, committedTotal,
             folded, allIn, isHero }],
  heroId, actorId, actorPosition,

  // ── LES SEPT GRANDEURS DÉRIVÉES (§7) — calculées ici, nulle part ailleurs ──
  pot, effectiveStack, spr, currentBet, amountToCall, minimumRaise, maximumRaise,

  allInOnly, minIncrement, actorCommittedStreet, deadPot,
  actionHistory:[{ street, position, actionType, size }],
  evaluationModel, icmParams, pkoParams
}
```

Gelé (`Object.freeze`). Produit par `normalizeGameState(input)` qui rend
`{ ok, errors, state }` — un état incohérent est **refusé**, jamais rattrapé.

### Types d'action stricts (§37)

```ts
ActionType = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN"
```

Le **type** et la **taille** sont deux champs distincts, jamais un libellé unique.
`isSizedActionType(CALL)` vaut `false` : un CALL engage des jetons mais n'a pas de
taille choisie. C'est le défaut nommé au §37, verrouillé par test.

---

## 3. `PFSolution` — la solution stockée

```ts
{
  // Identité et versions (§17, §80)
  solutionId,            // "<gameStateHash>#<COMPLEXITY>"
  gameStateHash,         // "PFS-xxxxxxxxxxxxxxxx"
  canonical,             // la chaîne canonique complète → le hash est VÉRIFIABLE
  schemaVersion, sizingEngineVersion, solverVersion, solverEngine,

  // État de jeu
  gameType, format, tableFormat, players, positions,
  effectiveStacks, pot, spr, street, board, actionHistory,
  heroRange, villainRanges, rake, antes, blinds, potType,
  evaluationModel, icmParams, pkoParams,

  // Arbre et sizings
  sizingMode, sizingComplexity,
  candidateSizes:{ bets:[{key,label,spec}], raises:[…], dropped:[{reason,…}] },
  selectedSizes:{ bets:[…], raises:[…] },
  referenceSizes:{ bets:[…], raises:[…] },
  bettingTree,

  // Stratégie
  strategy,              // cf. §4 ci-dessous
  frequencies,           // vue de la racine, pour les consommateurs simples
  ev, optimizeFor,

  // Métriques
  simplificationMetrics:{ referenceEV, simplifiedEV, absoluteEVLoss,
                          relativeEVLoss, relativeEVLossNote, evLossPotPct,
                          retainedEV, retainedEVNote,
                          negativeLoss, negativeLossNote },
  actionRanking:{ best, bestEV, actions:[{label,ev,delta,isBest}] },
  measurement:{ floor, seedNoise, convergenceDrift, escalations, iterations,
                probes, sampled },
  distinguishable,       // la perte dépasse-t-elle le plancher ?
  planner, tolerance,

  // Convergence et statut
  convergence:{ iterations, elapsedMs, nashConv, note, sampled, tolerance, seed, completed },
  accuracy:{ exact, metric, value, note, iterations, sampled },
  status,                // COMPLETE | PARTIAL | FAILED | CANCELLED
  partialReasons:[…],

  // Reproductibilité
  seed, solveId, evaluationConfig, finalSolveConfig, instrumentation,

  // Provenance (§18)
  source, provenanceMeta,

  // Deux EV, deux questions — jamais comparables entre elles
  finalEV, finalEVComparable /* = false */, finalEVNote,

  createdAt, updatedAt
}
```

### Provenance (§18)

```ts
SolutionProvenance = "POKERFORGE_SOLVER" | "POKERFORGE_DATABASE"
                   | "VERIFIED_IMPORT"   | "APPROXIMATION"
```

Elle est **dérivée** par `deriveProvenance`, jamais choisie. `mayClaimSolved()`
exige *à la fois* une provenance qui l'autorise *et* un statut qui a réellement
produit une stratégie : un badge ne peut pas être posé à la main sur une
approximation.

---

## 4. `strategy` — la stratégie extraite

```ts
{
  coversStreetsAhead: false,     // cf. LIMITATIONS L8
  coversStreetsNote: "…",
  classes: ["AA","AKs",…],
  nodeCount,
  nodes: {
    "<path joint par |>": {
      path, nodeId, player,
      actions: ["X","B0","B1","J"],
      actionTypes: { X:"CHECK", B0:"BET", J:"ALL_IN" },
      sizings: { B0:{ specKey, specLabel, spec, additionalBb, toBb, potFraction } },
      aggregate: { X:0.62, B0:0.30, … },   // pondéré par la range
      byClass:   { AKs:{ X:0.10, B0:0.90 } },
      potBb, toCallBb,
      normalization: { ok, sum, problems }  // §93
    }
  }
}
```

La racine porte le chemin `""`. Les montants sont **lus sur l'arbre** (différence
de contributions entre le nœud et son enfant), jamais reconstruits depuis un
libellé — c'est le défaut historique `betFracFromLabel`.

---

## 5. Hash canonique (§19)

```
gameStateHash = "PFS-" + FNV1a64(chaîne canonique)
```

La chaîne inclut, dans cet ordre : les **trois versions**, gameType/format/table,
street, board, blindes/ante, rake, pot/deadPot, joueurs **triés par position**,
héros et acteur, historique d'actions, modèle d'évaluation, ICM/PKO, ranges
**canonicalisées** (clés triées, poids quantifiés, mains jamais continuées omises),
arbre de candidats **trié**, configuration solveur.

Deux garanties opposées, toutes deux nécessaires :

* **même état, chemins de construction différents → même hash.** Clés triées à
  tous les niveaux ; `{a:1,b:2}` et `{b:2,a:1}` rendent la même chaîne ; `0` et
  `-0` sont le même nombre ; le bruit flottant est quantifié.
* **états différents → hashs différents.** Board, tapis, pot, blindes, ante, rake,
  rue, acteur, range, sizing candidat, précision : chacun invalide (vérifié par
  test, §63).

Un tableau garde son ordre (une séquence d'actions n'est pas un ensemble) ; un
ensemble de sizings est trié (`{33,75}` et `{75,33}` sont le même arbre).

### Deux familles de clés

```
solutionId    = "<gameStateHash>#<COMPLEXITY>"     → une solution stockée
evaluationKey = "EVAL:<gameStateHash>:<hash(arbre+config)>"  → un micro-solve
```

Le préfixe `EVAL:` rend structurellement impossible de confondre un micro-solve de
sélection avec une solution (§13).

---

## 6. Normalisation du magasin (§28)

```
GAME STATE  (1 enregistrement — ranges, joueurs, board, historique)
├── FULL        ┐
├── ADVANCED    │ 4 solutions qui le RÉFÉRENCENT
├── SIMPLE      │ par gameStateHash
└── SINGLE      ┘
```

Les champs lourds (`heroRange`, `villainRanges`, `players`, `board`,
`actionHistory`, …) vivent **une fois** dans le magasin d'états ; les solutions ne
portent que ce qui leur est propre. Ils sont re-fusionnés à la lecture.

Le `gameStateHash` porte l'**ensemble des candidats explorés** (identique pour les
quatre niveaux) et non l'arbre retenu — sinon chaque niveau obtiendrait un hash
distinct et la famille n'existerait jamais.

Persistance : IndexedDB `pfase`, deux magasins (`solutions`, `states`), index
`gameStateHash` et `updatedAt`. LRU 400 en mémoire, 300 sur disque. Best-effort :
un échec disque n'empêche jamais un solve.
