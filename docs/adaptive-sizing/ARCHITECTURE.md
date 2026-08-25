# ARCHITECTURE — PokerForge Adaptive Sizing Engine (PFASE)

> Mission §3, §79, §97. Ce document décrit **ce qui existe dans le dépôt**, pas une cible.

---

## 1. Le renversement

Avant PFASE, le flux de PokerForge était :

```
TEMPLATE UI  →  boutons de mise (« Cbet 33% »)  →  solveur invité à produire
                                                     des fréquences SUR CET ARBRE
```

`trainerPostflopSolver.betFracFromLabel` relisait littéralement `/33/` dans le **texte**
d'un bouton pour reconstruire une fraction de pot. L'interface décidait de la stratégie.

PFASE inverse :

```
GAME STATE
    ↓
CANDIDATE BETTING TREE
    ↓
SOLVER
    ↓
EV RESULTS
    ↓
SIZING OPTIMIZER
    ↓
SIMPLIFIED SOLUTION
    ↓
SOLUTION STORE
    ↓
TRAINER / REPLAYER / COACH
```

Aucune étape de cette chaîne ne vit dans un composant React (§3).

---

## 2. Les modules

Tout PFASE vit dans `src/sizing/`. Aucun de ces fichiers n'importe React.

| Fichier | Rôle | Mission |
|---|---|---|
| `config.js` | **Toute** borne, epsilon, version, budget et drapeau. Rien de configurable n'existe ailleurs. | §5, §11, §12, §16, §80, §81, §94 |
| `sizingSpec.js` | Un sizing est un **objet typé** (`pot`, `geometric`, `previousBet`, `bb`, `jam`), jamais une chaîne. Résolution en montant, arrondis centralisés. | §6, §25, §72, §73, §74 |
| `gameState.js` | État canonique + les sept grandeurs dérivées (pot, tapis effectif, SPR, mise en cours, à-payer, relance min/max). Types d'action stricts. Validation. | §7, §37, §39, §92 |
| `canonicalHash.js` | Canonicalisation (clés triées, nombres quantifiés) + hash 64 bits. Clés de solution et d'évaluation. | §19, §20, §63, §80 |
| `candidateGenerator.js` | Génère/matérialise les **actions candidates**. Aucune recommandation. | §8 |
| `combinationPlanner.js` | Sous-ensembles, plan en deux étages, budget, déduplication, traçabilité du pruning. | §10, §11, §62 |
| `solverAdapter.js` | **Seul** point de contact avec SharkSolver. Garde-fou mémoire, statuts, instrumentation, annulation. | §12, §21, §22, §57, §59 |
| `metrics.js` | Perte d'EV, écart d'EV entre actions, tolérance, normalisation. Refus des ratios trompeurs. | §14, §15, §16, §93 |
| `dynamicOptimizer.js` | Le cœur : référence, escalade de convergence, plancher de mesure, étages 1 et 2, sélection. | §9, §10, §13, §16, §62 |
| `strategyExtract.js` | Solution CFR vivante → données pures, rue courante. | §17, §33, §38, §39 |
| `solutionSchema.js` | Forme d'une `PFSolution`, provenance **dérivée**, validation, péremption. | §17, §18, §55, §80 |
| `solutionStore.js` | Magasin normalisé (un état, quatre niveaux), mémoire + IndexedDB, versionné. | §17, §20, §28, §88 |
| `pfase.js` | **API publique** : `solveOptimizedTree`, `solveSolutionFamily`, `getSolution`, `getTrainingNode`, `compareAction`, `sampleAction`. | §13, §34, §50, §79 |
| `pfase.worker.js` / `pfaseClient.js` | Exécution hors du thread principal, progression, annulation à deux niveaux. | §22, §58, §59, §90 |
| `trainingSolutionResolver.js` | Trainer → solution compatible, ou « aucune solution vérifiée ». | §30, §41, §44, §56, §90, §91 |
| `trainerBridge.js` | Spot Trainer ↔ PFASE : `acts`, verdict, action Vilain échantillonnée, RNG seedé. | §29→§43, §68, §71 |
| `replayerBridge.js` | Rejeu : joué vs Single/Simple/Full, sizing non étudié, analyse d'historique. | §49, §50, §51 |
| `coachPayload.js` | Ce que le Coach a le droit de voir, rubrique par rubrique, avec disponibilité. | §0, §47, §48 |
| `boardTexture.js` | Propriétés dérivées du board + agrégation. Descriptives, jamais décisionnelles. | §52, §53 |

Interface :

| Fichier | Rôle |
|---|---|
| `src/components/solver/AdaptiveSizingPanel.jsx` | Betting Structure, complexité, candidats, unités, tolérance, presets, progression, annulation, résultat honnête. §23→§27 |

Extension du moteur existant :

| Fichier | Modification |
|---|---|
| `src/solver/core/gametree.js` | **Additive** : `betSizes` accepte des specs typés ; `betSizesByPlayer`, `raiseSizes`, `raiseSizesByPlayer`, `allowJam`, `minBet`, `bb`. Sans ces options, l'arbre est identique à la v2 (vérifié par `test-sizing-gametree.mjs`). |
| `src/solver/api.js` | Signature de cache complétée (`effStack`, `raiseMult`, `maxRaisesPerStreet`, `ipProbe`, specs) — §63 ; option `noStore` pour les micro-solves jetables — §13. |

---

## 3. Graphe de dépendances

```
config ─────────────────┬─────────────────────────────────────────┐
                        │                                         │
sizingSpec ─────────────┼── gameState ── canonicalHash            │
   │                    │        │            │                   │
   │  (core/gametree ───┘        │            │                   │
   │   importe sizingSpec)       │            │                   │
   ▼                             ▼            ▼                   ▼
candidateGenerator      solverAdapter ── solver/api ── core/*   metrics
        │                     │                                    │
        └──── combinationPlanner ──── dynamicOptimizer ────────────┘
                                            │
                              strategyExtract│  solutionSchema
                                            ▼        │
                                         pfase.js ───┴── solutionStore
                                            │
        ┌───────────────┬───────────────────┼───────────────┬──────────────┐
        ▼               ▼                   ▼               ▼              ▼
 trainingSolution   trainerBridge     replayerBridge   coachPayload   pfase.worker
   Resolver              │                  │               │              │
        └────────────────┴──────────────────┴───────────────┘        pfaseClient
                                   │                                       │
                            (Trainer / Replayer / Coach)          AdaptiveSizingPanel
```

Une seule dépendance nouvelle traverse la frontière historique :
`solver/core/gametree.js` importe `sizing/sizingSpec.js`. Elle est acyclique
(`sizingSpec` ne dépend que de `config`).

---

## 4. Décisions structurantes, et leur raison

### 4.1 L'extension du Game Tree est additive, jamais destructive
Trois suites de tests existantes et le Worker du Trainer consomment les labels
`X`/`B`/`B0`/`F`/`C`/`R`. Le chemin v2 est donc conservé **à l'identique**, et le
chemin adaptatif n'est emprunté que si l'appelant utilise explicitement une des
nouvelles options (`usesAdaptiveSizing`). C'est vérifié par comparaison
structurelle (nombre exact de nœuds, labels, montants).

### 4.2 Deux magasins, deux natures
`solver/library.js` reste le cache de **solves bruts** (tables CFR vivantes).
`sizing/solutionStore.js` stocke des **PFSolution** plain-data, normalisées et
versionnées. Les mélanger aurait fait cohabiter des objets recalculables et des
livrables dans la même politique d'éviction.

Corollaire découvert au banc d'essai : les micro-solves d'évaluation ne doivent
pas entrer dans `library.js` (option `noStore`). Ils y accumulaient des tables de
stratégie jusqu'à épuiser le tas.

### 4.3 L'optimiseur ne conserve que des nombres
Le cache d'évaluation mémorise `{ok, ev, status, convergence, …}` — jamais l'objet
solution. La phase de sélection n'a besoin que de comparer des EV ; la solution
complète n'est requise qu'une fois, au solve final.

### 4.4 Le Worker n'est pas optionnel
Une optimisation enchaîne 10 à 40 solves CFR synchrones. Sans Worker, l'onglet
gèle. `pfaseClient` **refuse** par défaut de calculer sur le thread principal et
rend un échec explicite, que l'interface transforme en action manuelle (§90).

### 4.5 La provenance est dérivée, jamais choisie
`deriveProvenance` la calcule à partir du chemin qui a produit la solution.
`mayClaimSolved` exige *à la fois* une provenance qui l'autorise *et* un statut
qui a réellement produit une stratégie. Un badge ne peut donc pas être posé à la
main sur une approximation.

---

## 5. Ce qui n'a pas été touché

Conformément à §2 et §82, rien n'a été retiré :

* les templates de spots du Trainer, ses préréglages de mise, `trainerSizing.js` ;
* le moteur multi-rue historique de SharkSolver (`SolverMultiStreetPanel`) et son
  arbre `betSizes:[0.33,0.75]` ;
* `postflopHeuristic.js`, `replayer/heuristicEngine.js`, `SOLVER_SIZINGS` ;
* le push/fold préflop, les charts, l'ICM/PKO, le nodelock, les profils.

PFASE se superpose et prend la main **quand une solution vérifiée existe**.
Ailleurs, le comportement historique est inchangé.
