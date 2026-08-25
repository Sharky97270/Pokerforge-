# AUDIT AVANT IMPLÉMENTATION — PokerForge Adaptive Sizing Engine (PFASE)

> Mission Master §1 · §109-1. Ce document est écrit **avant toute modification de code**.
> Il décrit ce que le code fait *réellement* aujourd'hui, lu ligne à ligne — pas ce que
> l'architecture prétend faire.
>
> Branche : `feature/pokerforge-adaptive-sizing`
> Base : `main` @ `73b164e`
> Date : 2026-08-25

---

## 0. Méthode

Fichiers réellement ouverts et lus pour cet audit :

| Domaine | Fichiers lus |
|---|---|
| Solver API | `src/solver/api.js` (306 l.) |
| Moteur CFR | `src/solver/core/cfr.js`, `src/solver/core/multistreet.js`, `src/solver/core/gametree.js` |
| Équité / évaluateur | `src/solver/core/equity.js`, `core/evaluator.js`, `core/combos.js` |
| Push/fold | `src/solver/core/pushfold.js`, `src/solver/data/pushfoldRanges.js` |
| ICM / PKO | `src/solver/core/icm.js` |
| Provenance | `src/solver/provenance.js`, `src/solver/certification/*` |
| Stockage | `src/solver/library.js`, `src/solver/persist.js` |
| Ranges | `src/solver/preflopRanges.js`, `src/solver/preflopCharts.js` |
| API réseau | `src/solverApi.js` |
| Solver UI | `src/tabs/SharkSolverTab.jsx` (3436 l., lecture ciblée) |
| Trainer | `src/tabs/TrainerTab.jsx` (9853 l., lecture ciblée), `src/trainerSizing.js`, `src/trainerStrategyProvider.js`, `src/trainerPostflopSolver.js`, `src/trainerSolutionScope.js`, `src/trainingConfig.js` |
| Full Hand | `src/fullHandEngine.js`, `src/postflopHeuristic.js` |
| Worker | `src/solver/cfrPostflop.worker.js`, `src/solver/cfrPostflopClient.js` |
| Replayer | `src/replayer/postflopSolve.js`, `decisionAnalysis.js`, `solverPackage.js`, `heuristicEngine.js` |

---

## 1. Ce qui est RÉELLEMENT calculé aujourd'hui

### 1.1 Calculs exacts (énumération / équilibre mesuré)

| Objet | Où | Preuve de validité disponible |
|---|---|---|
| Évaluateur 5/6/7 cartes | `core/evaluator.js` | `test-evaluator-card-count.mjs`, `test-solver-evaluator.mjs` (exhaustif) |
| Équité par énumération exacte | `core/equity.js::computeEquity` | `test-solver-equity-exact.mjs`, invariants |
| Push/fold préflop HU | `core/pushfold.js` + table pré-compilée `data/pushfoldRanges.js` (20 000 itérations, exploitabilité max **0.000256 bb**) | `test-solver-pushfold.mjs` |
| CFR 1-street (river, board complet) | `core/cfr.js::solveRiverCFR` | convergence : `stability`, `avgRegret`, `exploitBb` |
| CFR multi-rue, **board complet** | `core/multistreet.js::solveTree` + `nashConv()` | NashConv exact (best-response des deux camps) |
| ICM Malmuth-Harville | `core/icm.js` | `test-solver-icm-pko.mjs` |

### 1.2 Calculs approximatifs, **déclarés comme tels**

| Objet | Nature réelle | Marqueur existant |
|---|---|---|
| Équité Monte-Carlo | échantillonnage seedé | `ResultSource.NUMERICAL_APPROXIMATION`, champ `exact:false` |
| CFR multi-rue **flop/turn** | runouts échantillonnés → NashConv **null** | `convergence.note`, `sampled:true` |
| Réduction de range (`maxCombos`) | abstraction : classes de mains supprimées si < 169 | bloc `abstraction:{exact, classesDropped…}` |
| ICM/PKO stratégique | l'utilité entre bien dans le CFR, mais le modèle de prime est paramétré | `icm.strategic`, `bounty.model = PKO_ESTIMATE` |
| Ranges préflop d'entrée du CFR | **formules écrites à la main** (`buildSolverFreqs`) | commentaire explicite + `rangeSource:"heuristic"` |

### 1.3 Ce qui est HARDCODÉ (et présenté comme stratégie)

C'est le cœur du problème que la mission attaque.

| # | Emplacement | Contenu hardcodé | Conséquence |
|---|---|---|---|
| H1 | `SharkSolverTab.jsx:3121` | `betSizes:[0.33,0.75]` — **constante littérale**, pour *tous* les solves multi-rue | L'utilisateur n'a jamais choisi ces tailles ; aucun autre sizing n'est jamais évalué |
| H2 | `SharkSolverTab.jsx:455` `SOLVER_SIZINGS` | Table de textes : `"33% pot (board sec)"`, `"50-75% pot (board dynamique)"`, `"Overbet 125%+"` | Onglet « Sizings » = **conseils rédigés à la main**, jamais calculés, affichés dans un solveur |
| H3 | `SharkSolverTab.jsx` panneau CFR | choix `betFrac` parmi une liste fixe, **un seul sizing** | Pas de comparaison d'EV entre sizings |
| H4 | `trainerSizing.js::sizingPresets` | postflop → `[0.33, 0.5, 0.75, 1]` ; préflop → `[2.5, 3, 3.5, 4]` | Les boutons de mise du Trainer ne dépendent d'**aucune** solution |
| H5 | `trainerSizing.js::villainThreeBetTo` | `3× l'ouverture IP / 4× OOP, +1× par suiveur` | Le Vilain a un sizing de règle, pas de stratégie |
| H6 | `trainerSizing.js::villainIsolateTo` | `3× BB + 1× BB par limpeur` | idem |
| H7 | `TrainerTab.jsx` générateur de spots (≈ l. 2119-2380) | `acts`, `freq`, `ev` littéraux par template — ex. `freq:{CHECK:65,BET33:25,BET75:8,BET100:2}`, `ev:{CHECK:.8,BET33:1.2,…}` | **Les fréquences ET les EV affichées par le Trainer sont écrites à la main** pour tout ce qui n'est pas push/fold HU ou CFR postflop résoluble |
| H8 | `TrainerTab.jsx:1378` | `byAct={RAISE:150,ALLIN:200,BET33:50,…}` | Pondération d'agressivité hardcodée |
| H9 | `fullHandEngine.js::defaultBetAmount` | `pot * 0.6` | Sizing par défaut du moteur de main complète |
| H10 | `fullHandEngine.js::defaultRaiseTo` | `max(increment*2, pot*0.5)` | idem |
| H11 | `postflopHeuristic.js::grade` | matrice `quality`/`ev` littérale (`-0.12`, `-1.1`, `-0.35`…) | **des « EV » en bb écrites à la main** ; provenance `heuristic-estimate` déclarée, mais ce sont bien des nombres inventés affichés au joueur |
| H12 | `replayer/heuristicEngine.js` | `freq:78`, `evBb:+0.18`, `cbet% pot` | Recommandations du Replayer hors CFR |
| H13 | `trainerPostflopSolver.js::betFracFromLabel` | déduit la fraction de pot **du texte du bouton** (`/33/`, `/½/`, défaut `0.66`) | Le solveur résout l'arbre issu du **libellé UI**, pas l'inverse |

> **Constat central.** Le flux actuel est *inversé* par rapport à la cible : l'UI décide des
> sizings (templates), puis le solveur est éventuellement invoqué pour produire des fréquences
> **sur cet arbre imposé**. La mission demande : le moteur choisit les sizings, l'UI les affiche.

### 1.4 Ce qui utilise le CFR

* `SharkSolverTab` → `solveSubgame` (1 street) et `solveMultiStreet` (multi-rue) — **à la demande**, bouton « Résoudre ».
* Trainer → `trainerPostflopSolver` construit une requête → `cfrPostflopClient` → Web Worker → `solveMultiStreet`. Domaine : **flop/turn/river, heads-up strict**, Hero *leads* (X/B) ou *facing* (F/C/R), au plus **1 agression adverse** sur la street.
* Replayer → `replayer/postflopSolve.js` réutilise **le même provider Trainer** (bonne nouvelle : un seul chemin).

### 1.5 Ce qui utilise seulement l'équité

* `SolverEquityPanel`, Range Advantage, Nut Advantage, bloqueurs — équité pure, pas de stratégie.
* `postflopHeuristic.js` : force de main normalisée → **matrice de verdict hardcodée** (H11).

### 1.6 Ce qui utilise une DB

* **Aucune base de solutions.** `library.js` est un cache LRU mémoire + IndexedDB (`sharksolver`), clé = `solveId`, borné à 500 entrées mémoire / 200 disque.
* `solver_spots` (Supabase) stocke des **spots utilisateur** (scénario + résultat sérialisé), pas des solutions structurées.
* Prisma (`prisma/`) existe mais n'est pas le chemin des solutions solveur.

### 1.7 Ce qui est purement UI

* Onglet « Sizings » (H2), « Comparaison », arbre de décision V2 (`buildMultiStreetNodes`) qui **projette** le pot street par street avec `pot*(1+2*betFrac)` — projection arithmétique, marquée `src:"projection heuristique"`.
* Node Lock bouton désactivé (`SharkSolverTab.jsx:1850` : « Fonction en développement ») alors que `solveNodeLocked` **existe et fonctionne** dans l'API. Incohérence UI/moteur.

---

## 2. Formats de données existants

### 2.1 Range
```js
{ "AKs": {r: 100, c: 0, f: 0}, "72o": {r: 0, c: 0, f: 100}, ... }   // 169 classes, en %
```
Convertie en combos par `rangeComboList(freqs)` → `[{cards:[int,int], w, key}]`, puis
`reduceRange(list, maxCombos)` (réduction **stratifiée**, conserve la forme).

### 2.2 Carte
Entier `0..51` = `rangIdx*4 + suitIdx`, `EQ_RANKVAL="23456789TJQKA"`, `EQ_SUITIDX={♠:0,♥:1,♦:2,♣:3}`.

### 2.3 Nœud d'arbre (`gametree.js`)
```js
{ id, kind:"decision"|"chance"|"terminal", player:0|1, street, pot, betsH, betsV,
  toCall?, actions:["X","B0","B1"] | ["F","C","R"], children:{...}, next? , result? }
```
**Labels d'action actuels** — contrat implicite consommé par le worker, le Trainer et le Replayer :
`X` (check) · `B` (bet unique) · `B0`,`B1`,… (bets multiples) · `F` · `C` · `R` (**un seul** sizing de raise).

### 2.4 Solution multi-rue (`solveTree`)
```js
{ tree, E, strat, heroList, villList, wH, wV, startPot, initLen,
  utility, utilityKind, icmParams, pkoParams, ev, iters, sampled, boardCards,
  avgOf(node,combo,key), aggAt(node,actIdx,key), ctxCount(node), heroCheck, heroBet }
```
`strat` : `node.id → Map(runoutKey → Float64Array[combo][action])`.
Les accesseurs sont des **closures** : détruites par le structured clone → `rehydrateTreeSolution`.

### 2.5 Enveloppe API (`solveMultiStreet`)
```js
{ source, experimental, fromLibrary, result, convergence:{nashConv|note},
  equilibriumScope, mayClaimNashApproximation, icm:{...}, abstraction:{...}, solveId, seed }
```

### 2.6 Spot Trainer
```js
{ id, cat, street, hpos, vpos, stack, pot, toCall, hand:[{r,s},{r,s}], board:[{r,s}...],
  acts:[{id:"BET33", l:"Cbet 33%", s:"3.2bb"}...], ok:idx, best, freq:{ID:%}, ev:{ID:bb},
  expl, detail, leaks, diff,
  // ajoutés par applySolverStrategy :
  strategySource, strategyProvenance, strategyNote, strategyScope, strategyLimits,
  strategyEngine, strategyConfidence, strategyPayoutModel, strategyFallbackReason, solverMeta }
```

### 2.7 Enregistrement persisté (`library.js`)
```js
{ solveId, kind:"tree"|"plain", savedAt, lastUsed, payload }
```
**Pas de `schemaVersion`. Pas de `solverVersion`.** → une mise à jour du moteur ne peut pas
invalider les anciennes entrées. C'est un défaut à corriger (mission §80).

---

## 3. Dépendances (graphe réel)

```
core/evaluator ─┬─ core/equity ─┬─ core/cfr ────────┐
                │               └─ core/multistreet ├─ solver/api.js ─┬─ SharkSolverTab
core/combos ────┘                     │             │                 ├─ cfrPostflop.worker
core/gametree ────────────────────────┘             │                 │      ↑
core/icm ───────────────────────────────────────────┘                 │  cfrPostflopClient
solver/library ── solver/persist (IndexedDB)                          │      ↑
solver/preflopRanges (heuristique) ───────────────────────────────────┘  trainerPostflopSolver
                                                                          ↑            ↑
                                                              TrainerTab      replayer/postflopSolve
trainerSizing (autonome, aucune dépendance solveur) ── TrainerTab
```

**Point clé :** `trainerSizing.js` — le module qui produit les montants affichés — **n'importe
rien du solveur**. C'est la coupure exacte que PFASE doit refermer.

---

## 4. Risques de régression identifiés

| # | Risque | Mitigation prévue |
|---|---|---|
| R1 | Changer les labels d'action de `gametree` casse le worker, le Trainer, le Replayer et 3 suites de tests | **Additif strict** : `B`/`B0`/`R` conservés à l'identique quand un seul raise size est demandé ; nouveaux labels `R0`,`R1`,`AI` uniquement si demandés |
| R2 | Changer la signature de `buildPostflopTree` casse `solveTree` et `test-solver-reduced-games.mjs` | Nouvelles options **optionnelles** avec défauts = comportement actuel |
| R3 | Ajouter des champs à la solution casse `_toRecord`/`rehydrateTreeSolution` (structured clone) | Aucun champ porteur de fonction hors `utility` ; test de persistance dédié |
| R4 | Le cache `solveId` ne connaît pas la version du moteur → solutions incompatibles rechargées | Introduire `solverVersion`/`sizingEngineVersion`/`solutionSchemaVersion` **dans la signature de hash** |
| R5 | Les templates Trainer (H7) sont la source de `ok`/`freq`/`ev` pour la majorité des spots ; les retirer casserait l'entraînement | Ne **rien retirer** : PFASE se superpose et prend la main quand une solution vérifiée existe ; sinon provenance `APPROXIMATION` affichée |
| R6 | `sizingPresets` alimente le sélecteur ET le clavier ET `handleHeroAct` | La liste de préréglages devient *dérivée de la solution* quand il y en a une, avec repli identique à l'actuel |
| R7 | Explosion combinatoire des sous-arbres (§11 de la mission) | `CombinationPlanner` avec budget, cache et déduplication, testé |
| R8 | Le worker est mono-requête multiplexé sans annulation | Ajouter `AbortSignal` + `cancel` sans casser l'API existante |
| R9 | Build standalone (fichier unique) : `Worker` indisponible → `_broken=true` | Chemin synchrone de repli conservé ; PFASE doit dégrader en `PARTIAL`/`FAILED`, jamais en stratégie inventée |
| R10 | 44 suites de tests `.mjs` lancées par `npm test` | Exécution complète avant/après ; baseline capturée §6 |

---

## 5. Écart entre la cible (mission) et l'existant

| Exigence mission | État actuel | Écart |
|---|---|---|
| §4 FIXED | possible en passant `betSizes` — mais **aucune UI** | UI + API à créer |
| §4 DYNAMIC | **inexistant** | tout à créer |
| §4 AUTOMATIC | **inexistant** | tout à créer |
| §4 SINGLE SIZE | **inexistant** | tout à créer |
| §5 SizingComplexity | **inexistant** | tout à créer |
| §6 pot % | oui (`betSizes` = fractions) | à typer (`SizingSpec`) |
| §6 geometric | **inexistant** | à créer (dépend du SPR) |
| §6 previous-bet multiple | partiel : `raiseMult` scalaire | à généraliser en liste |
| §7 source unique pot/SPR | dispersée : `math.pot` (Solver), `handLedger` (Trainer), `state.pot` (FullHand) | à unifier |
| §8 CandidateGenerator | **inexistant** | à créer |
| §9-10 comparaison d'EV entre sous-arbres | **inexistant** | à créer |
| §11 CombinationPlanner | **inexistant** | à créer |
| §12 depth-limited eval | `iters`/`streets` existent, non exposés comme config d'évaluation | à formaliser |
| §13 full solve final | **inexistant** | à créer |
| §14 EV loss | **inexistant** | à créer |
| §17 solution store versionné | cache non versionné | à créer |
| §18 provenance | `ResultSource` existe et est bon | à étendre (`SolutionProvenance`) |
| §19 hash canonique | `makeSolveId` = hash 31 d'un `JSON.stringify` **non canonicalisé** | à remplacer (ordre des clés non garanti) |
| §21 convergence | présent et honnête | à propager dans le schéma |
| §22 états du solve | `busy` booléen | machine à états à créer |
| §26 Tree Editor | **inexistant** | à créer |
| §29-33 Trainer piloté par solution | **inversé** | à refondre |
| §40 un seul moteur 1T/2T/3T/4T | déjà vrai côté moteur (`trainerPostflopSolver`), les tables partagent le provider | à préserver |
| §55 ICM | `evaluationModel` implicite (`utilityKind`) | à exposer |
| §74 JAM | écrêtage implicite au tapis, pas d'action explicite | à créer |
| §80 versionning | absent | à créer |

---

## 6. Baseline de non-régression

`npm test` exécuté sur `main` @ `73b164e` avant toute modification.
Résultat consigné dans `docs/adaptive-sizing/BASELINE_TESTS.txt`.

---

## 7. Décisions d'architecture prises à l'issue de l'audit

1. **PFASE vit dans `src/sizing/`**, hors de tout composant React (mission §3).
2. **`gametree.js` est étendu, pas remplacé** : `betSizes` accepte désormais des `SizingSpec`
   en plus des nombres ; `raiseSizes` (liste) s'ajoute à `raiseMult` (scalaire, conservé) ;
   `allowJam` ajoute une action `AI` explicite. Défauts = comportement actuel **bit pour bit**.
3. **Le hash canonique remplace `makeSolveId`** pour PFASE, mais `makeSolveId` reste exporté
   (rétro-compat des appels existants).
4. **Le Solution Store PFASE est distinct** de `library.js` (qui reste le cache de solves bruts) :
   il stocke des `PFSolution` versionnées et normalisées (§17/§28), avec les 4 niveaux de
   complexité rattachés à un même `gameStateHash`.
5. **Aucune suppression** de template Trainer, de préréglage ou de moteur historique (§2/§82).
   PFASE est activé derrière le flag `adaptiveSizingEngine`, mais **complet** derrière ce flag (§81).

---

*Fin de l'audit. Toute modification de code postérieure à ce document est décrite dans
`ARCHITECTURE.md`, `ALGORITHM.md` et le rapport final.*
