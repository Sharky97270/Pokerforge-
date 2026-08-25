# POKERFORGE ADAPTIVE SIZING — IMPLEMENTATION REPORT

> Mission §107. Branche `feature/pokerforge-adaptive-sizing`, base `main` @ `73b164e`.
> 61 fichiers · +15 240 lignes · −52 lignes.

---

## A. Audit initial — ce qui existait réellement

`AUDIT_BEFORE_IMPLEMENTATION.md`, écrit **avant** toute modification, après lecture
ligne à ligne de 30 fichiers.

**Calculé exactement** : évaluateur 5/6/7 cartes, équité par énumération,
push/fold préflop HU (exploitabilité 0.000256 bb), CFR 1-street et multi-rue sur
board complet, ICM Malmuth-Harville.

**Approximatif mais déclaré** : Monte-Carlo, CFR flop/turn (runouts échantillonnés),
réduction de range, PKO, ranges préflop d'entrée.

**Hardcodé et présenté comme stratégie — 13 emplacements**, dont :

| Emplacement | Contenu |
|---|---|
| `SharkSolverTab.jsx:3121` | `betSizes:[0.33,0.75]` — constante littérale pour **tous** les solves multi-rue |
| `SharkSolverTab.jsx:455` | onglet « Sizings » = conseils rédigés à la main (« 33% pot (board sec) ») |
| `trainerSizing.js` | préréglages `[0.33,0.5,0.75,1]`, 3-bet « 3× IP / 4× OOP » |
| `TrainerTab.jsx` ≈ 2119-2380 | `freq` **et** `ev` littéraux par template |
| `postflopHeuristic.js` | matrice d'EV en bb écrite à la main |
| `trainerPostflopSolver.js` | fraction de pot déduite du **texte** du bouton |

**Le constat central** : le flux était inversé. L'interface décidait des sizings ;
le solveur ne faisait que produire des fréquences sur un arbre imposé.

---

## B. Architecture retenue

```
GAME STATE → CANDIDATE TREE → SOLVER → EV RESULTS → SIZING OPTIMIZER
          → SIMPLIFIED SOLUTION → SOLUTION STORE → TRAINER / REPLAYER / COACH
```

18 modules dans `src/sizing/`, **aucun n'importe React** (§3). Détail dans
`ARCHITECTURE.md`. Cinq décisions structurantes :

1. **L'extension du Game Tree est additive.** Sans les nouvelles options, l'arbre
   est identique à la v2 — vérifié par comparaison structurelle exacte, pas par
   relecture.
2. **Deux magasins, deux natures.** `solver/library.js` garde les solves bruts ;
   `sizing/solutionStore.js` les `PFSolution` normalisées et versionnées.
3. **L'optimiseur ne conserve que des nombres.** Le cache d'évaluation ne mémorise
   jamais l'objet solution.
4. **Le Worker n'est pas optionnel.** Sans lui, PFASE refuse de calculer plutôt
   que de geler l'onglet.
5. **La provenance est dérivée, jamais choisie.**

---

## C. SharkSolver — modifications

**`src/solver/core/gametree.js`** — v3, additive :
`betSizes` accepte des `SizingSpec` typés · `betSizesByPlayer` · `raiseSizes` ·
`raiseSizesByPlayer` · `allowJam` (action `J`) · `minBet`/`bb`/`betStepBb` ·
`nodeOverrides` (Tree Editor) · chaque nœud porte son `path`.

**`src/solver/api.js`** — deux corrections de fond :

* la signature de solve ne décrivait **pas l'arbre** : `effStack`, `raiseMult`,
  `maxRaisesPerStreet`, `ipProbe` n'entraient pas dans la clé. Deux solves du même
  board à des **tapis différents** partageaient un `solveId` — la collision que
  §63 interdit, et elle rendait PFASE impossible ;
* option `noStore` : les micro-solves d'évaluation ne peuplent plus la Solution
  Library (500 solutions complètes en mémoire).

**`src/components/solver/AdaptiveSizingPanel.jsx`** — Betting Structure,
complexité, candidats, unités `% · e · x · JAM`, tolérance, préréglages,
progression, annulation, résultat honnête, **Tree Editor**, tableau FULL→SINGLE.

**`src/tabs/SharkSolverTab.jsx`** — un `useMemo` (état canonique, §7) et le montage
du panneau. Le moteur multi-rue historique reste en place, à côté (§82).

---

## D. Sizing Engine — l'algorithme

Détail et formules dans `ALGORITHM.md`. Les quatre décisions qui font la
différence entre un moteur et une simulation :

**1. Le sizing géométrique dépend du SPR.**

```
x = ( (1 + 2·SPR)^(1/N) − 1 ) / 2
```

Vérifié analytiquement (N=1,SPR=1 → 100 % ; N=2,SPR=4 → 100 % ; N=3,SPR=13 → 100 %)
et mesuré : 6.49 bb à 20 bb de tapis contre 21.50 bb à 120 bb, même board.

**2. La perte d'EV a une définition, et elle est asymétrique.**
Seul le joueur optimisé est restreint ; l'adversaire garde l'arbre complet. C'est
la seule définition sous laquelle la perte est garantie ≥ 0. Avec la restriction
symétrique, **toutes** les pertes mesurées devenaient négatives (−0.15 à −0.19 bb)
— le moteur aurait annoncé qu'un Single Size bat le solve complet.

**3. La convergence entre dans la mesure.**
Le CFR converge plus lentement quand un nœud offre plus d'actions : l'arbre de
référence est systématiquement moins convergé. Mesuré sur un river :

| itérations | référence | « 33 % seul » | perte |
|---|---|---|---|
| 150 | −0.548 | −0.495 | **−0.053** |
| 2 500 | −0.463 | −0.461 | −0.002 ≈ 0 |

À 150 itérations, le moteur aurait « prouvé » un résultat faux.

**4. Rien n'est affirmé sous le plancher de mesure.**

```
plancher = max( bruit d'échantillonnage, dérive × 2, NashConv(réf) + NashConv(sous-arbre) )
```

Sur board complet, la dernière borne est **rigoureuse** : dans un jeu à somme
nulle, l'écart entre l'EV d'un profil et la valeur du jeu est borné par son
NashConv.

Deux étages d'évaluation (chaque candidat seul, puis les sous-ensembles réellement
résolus) évitent 23 244 solves tout en respectant l'interdit §10 : on ne déduit
jamais l'EV d'une paire de l'EV de ses membres.

---

## E. Trainer — intégration

Détail dans `TRAINER_INTEGRATION.md`.

Le sens du flux a été renversé (§29) : **le spot est construit à partir de la
solution**, pas l'inverse. Un bouton « S'entraîner contre cette solution » dans
SharkSolver ouvre le Trainer sur ce spot exact ; board, pot, tapis, positions,
actions et fréquences en sortent tous. Aucun sizing n'est recopié (§87).

Vérifié dans un vrai navigateur : le solveur retient `67 %`, le Trainer affiche
**Check · Bet 67 % · Tapis** — trois boutons, aucun de plus (§71) — et le badge
`⚖️ ADAPTIVE SIZING — SINGLE · sizings retenus 67%` avec
« perte −0.001 bb — non mesurable : sous le plancher de 0.0112 bb ».

Sans solution : « No verified solution available », **zéro bouton fabriqué**, et
trois suites proposées (§90).

Multitabling : un seul moteur, quatre tables → quatre `solutionId` distincts,
400 décisions sans qu'un sizing d'une table n'apparaisse dans une autre.

---

## F. Replayer — intégration

`replayerBridge.js`. Pour chaque décision : le coup joué confronté aux solutions
Single / Simple / Full, chacune avec ses actions.

Le point délicat (§50) : un sizing joué absent de l'arbre **n'hérite pas** de l'EV
du voisin. L'EV d'un sizing est la valeur d'un sous-arbre entier — celui de 75 %
décrit un jeu où le vilain fait face à 75 %, pas à 62 %. On rend
`evAvailable:false` et l'on cite le sizing étudié le plus proche, étiqueté
approximatif.

`analyzeHandHistory` conserve le **type de solution** qui a servi à chaque verdict
(§51) et annonce son taux de couverture : une décision sans solution ne compte
dans aucune statistique.

---

## G. Coach AI — intégration

`coachPayload.js`. Sept rubriques (§48), chacune portant `supported` et son motif
d'indisponibilité. La charge utile transporte **la liste des interdits** :

> n'énonce aucun nombre absent de cette fiche · ne présente aucune règle générale
> comme un résultat de solve · n'emploie pas « GTO » si `mayClaimSolved` est faux.

`boardTexture.js` fournit les propriétés de board pour l'explication — et aucune
d'elles ne porte de sizing, de fréquence ou d'action. La rubrique `boardLogic`
porte l'avertissement : « ces propriétés n'expliquent aucun sizing par
elles-mêmes ».

---

## H. Base de données — migration

Détail dans `MIGRATION.md`. **Aucune migration destructive** : aucune table
existante n'est modifiée.

| Magasin | Effet |
|---|---|
| IndexedDB `sharksolver` (existant) | inchangé ; les clés changent (correction §63), les entrées sont recalculées |
| IndexedDB `pfase` (**nouveau**) | 2 object stores normalisés (`solutions`, `states`), version 1, réversible |
| Supabase `solver_spots`, Prisma | **non touchés** |

Versionnage : trois versions dans le hash **et** vérifiées à la lecture — deux
verrous, parce que celui qui saute en silence est le pire.

---

## I. Tests — résultats exacts

| | Avant | Après |
|---|---|---|
| Suites | 53 | **61** |
| Assertions | **5 845** | **6 595** |
| Sortie | 0 | **0** |

Huit suites PFASE, **750 assertions** :

| Fichier | Assertions |
|---|---:|
| `test-sizing-math.mjs` | 111 |
| `test-sizing-gametree.mjs` | 60 |
| `test-sizing-hash.mjs` | 49 |
| `test-sizing-dynamic.mjs` | 94 |
| `test-sizing-store.mjs` | 106 |
| `test-sizing-trainer.mjs` | 139 |
| `test-sizing-replayer-coach.mjs` | 103 |
| `test-sizing-pipeline.mjs` (vrai solveur) | 88 |

**Acceptance Test Master (§101)** : les 8 cas A→H passent avec le vrai solveur.
CASE D : géométrique 6.49 bb vs 21.50 bb selon le tapis. CASE E : 4 tables,
sizings `75 % · 150 % · 33 % · 150 %`. CASE F : turn 9 bb → river 34 bb.
CASE H : range vide → échec, **0 bouton**.

**QA navigateur** : trois scripts qui comparent, pas qui capturent.
`audit:sizing:ui` (panneau + Tree Editor), `audit:sizing:trainer` (§87 :
les sizings du solveur sont ceux du Trainer), `audit:sizing:persistence`
(§88 : solve → rechargement de page → solution **identique**).

**20 défauts réels trouvés et corrigés**, dont neuf hors de portée d'une relecture
de code (voir `TEST_PLAN.md §5`). Les plus significatifs :

* une collision de clé de cache créditait trois sizings de la même EV ;
* la définition de la perte d'EV rendait toutes les pertes négatives ;
* la sous-convergence faisait « battre » le solve complet par un Single Size ;
* trois fuites mémoire distinctes (cache d'évaluation, bibliothèque, estimateur) ;
* §73 : le solveur produisait 1.125 bb et le Trainer quantifiait à 1 bb.

**Revue finale (§103)** : `grep` de TODO/FIXME/MOCK/PLACEHOLDER/fake/stub sur tout le
code livré → **aucune occurrence**. Cinq `Math.random` subsistent, tous analysés :
quatre sont des générateurs **par défaut et injectables** (échantillonnage du
Vilain §43, distribution de main, tirage de classe — tous seedables §68), le
cinquième produit l'identifiant d'instance du module de diagnostic. Aucun ne
produit de stratégie, d'EV ni de sizing.

---

## J. Benchmarks

`BENCHMARKS.md`. 10 spots représentatifs, 625 s, `bench:sizing`.

| Rue | Durée (4 niveaux) | Δ tas | Exploitabilité |
|---|---:|---:|---|
| River | 2 – 15 s | ≤ 28 Mo | **NashConv exact** 0.010 – 0.054 bb |
| Turn | 118 – 143 s | ~150 Mo | indisponible (échantillonné) |
| Flop | 145 – 157 s | ≤ 600 Mo | indisponible, profondeur dégradée à 2/3 |

**Monotonie de la perte d'EV : 10/10.** La perte ne diminue jamais quand la
complexité baisse, au-delà du plancher — la propriété que garantit la définition
asymétrique.

**Résultat honnête à retenir** : aux budgets par défaut, **aucune** perte de
simplification n'est distinguable du bruit. Le **classement** des sizings, lui,
l'est sur 4 spots river sur 6 (écarts 0.23 à 1.44 bb contre un plancher de 0.06).
Les 2 restants sont à SPR 0.42 et 0.50, où tous les candidats s'écrasent sur le
tapis : il n'y a littéralement rien à classer, et le moteur le dit.

Le cache partagé entre niveaux rend une famille de 4 pour le prix d'environ 1,5.

---

## K. Limitations restantes

`LIMITATIONS.md` — 11 limitations, chacune avec sa cause technique, ce qui est
livré, et ce qui reste à faire. Les six qui comptent :

| # | Limitation | Cause | Comportement |
|---|---|---|---|
| L1 | Préflop non résolu | `gametree` construit un arbre postflop HU (pas de blindes postées, pas de n joueurs) | `UNSUPPORTED` explicite ; push/fold et charts inchangés |
| L2 | Heads-up uniquement | arbre à 2 joueurs, tapis symétriques | 3+ joueurs → `UNSUPPORTED` avec motif |
| L3 | Flop à 3 rues hors de portée mémoire | tables indexées par runout : 4 701 Mo estimés | garde-fou : dégradation annoncée à 2 rues |
| L4 | EV par action non conservée | `solveTree` ne garde pas les valeurs contrefactuelles | `evAvailable:false` ; l'écart entre **sizings** est fourni |
| L5 | Rake transporté, non appliqué | `terminalUtility` ne retire pas de rake | `applied:false` visible |
| L11 | Ranges d'entrée heuristiques | `buildSolverFreqs` (préexistant) | réserve portée par la rubrique `rangeLogic` |

Deux périmètres non couverts, sans limitation technique : PFASE ne produit pas
encore de solution d'**exploit** par nodelock (§45/§46 — le nodelock existant est
préservé intact), et aucun **pipeline d'import** externe n'est construit (§84 — la
provenance `VERIFIED_IMPORT` et le schéma sont prêts).

---

## L. Fichiers modifiés

**Nouveaux — moteur (18)**
`src/sizing/` : `config.js` · `sizingSpec.js` · `gameState.js` · `canonicalHash.js`
· `candidateGenerator.js` · `combinationPlanner.js` · `solverAdapter.js` ·
`metrics.js` · `dynamicOptimizer.js` · `strategyExtract.js` · `solutionSchema.js` ·
`solutionStore.js` · `pfase.js` · `pfase.worker.js` · `pfaseClient.js` ·
`trainingSolutionResolver.js` · `trainerBridge.js` · `replayerBridge.js` ·
`coachPayload.js` · `boardTexture.js` · `debugInspector.js`

**Nouveaux — interface (1)**
`src/components/solver/AdaptiveSizingPanel.jsx`

**Nouveaux — tests (8)**
`test-sizing-math` · `-gametree` · `-hash` · `-dynamic` · `-store` · `-trainer` ·
`-replayer-coach` · `-pipeline`

**Nouveaux — outillage (4)**
`scripts/sizing-shot.mjs` · `sizing-trainer-shot.mjs` ·
`sizing-persistence-shot.mjs` · `sizing-bench.mjs`

**Nouveaux — documentation (11)**
`docs/adaptive-sizing/` : `AUDIT_BEFORE_IMPLEMENTATION` · `ARCHITECTURE` ·
`ALGORITHM` · `DATA_MODEL` · `TRAINER_INTEGRATION` · `SOLVER_INTEGRATION` ·
`TEST_PLAN` · `MIGRATION` · `LIMITATIONS` · `BENCHMARKS` · `CONFORMITE_1_110` ·
`RAPPORT_FINAL` · `BASELINE_TESTS.txt`

**Modifiés (5)**

| Fichier | Nature |
|---|---|
| `src/solver/core/gametree.js` | extension additive (+227/−0 effectif) ; chemin v2 intact |
| `src/solver/api.js` | signature de cache complétée (§63) ; option `noStore` |
| `src/tabs/SharkSolverTab.jsx` | +64 lignes : état canonique + montage du panneau |
| `src/tabs/TrainerTab.jsx` | +128 lignes : branche solution PFASE, badge de provenance, message §90 |
| `package.json` | scripts `test:sizing`, `audit:sizing:*`, `bench:sizing` |

**Total : 61 fichiers, +15 240 / −52 lignes.**

---

## Conformité

`CONFORMITE_1_110.md` : **92 PASS · 18 PARTIAL · 0 FAIL**, chaque ligne renvoyant
à du code livré ou à un test. Les 18 `PARTIAL` se ramènent aux six limitations
ci-dessus et à deux périmètres non couverts — toutes documentées, toutes
signalées à l'exécution.

## Definition of done (§108)

Le cycle complet est vérifié **en 1T**, dans un vrai navigateur :

```
état de jeu → candidats → arbres → solve → comparaison d'EV → sélection
→ arbre final → solve final → solution stockée → chargée dans le Trainer
→ main jouée → verdict → rechargement de l'application → la solution fonctionne
```

Il n'a **pas** été rejoué manuellement en 2T/3T/4T : l'isolation multitable est
prouvée par test automatique (4 tables × 100 décisions), pas par une session
jouée. C'est le seul écart restant au §108, et il est nommé comme tel.
