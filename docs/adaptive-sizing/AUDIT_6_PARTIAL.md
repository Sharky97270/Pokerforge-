# AUDIT DES 6 `PARTIAL` — cartographie avant modification

> Mission « fermeture des 6 PARTIAL ». Cet audit précède toute modification de
> code. Il répond, pour chaque point, aux douze questions demandées.
>
> **Résultat de l'audit en une phrase :** deux des trois causes annoncées ne sont
> pas ce qu'elles disent être. Un modèle de side pots N joueurs **existe déjà,
> exact et testé** ; et les rues futures **participent déjà** à la valeur d'une
> décision de flop. La troisième cause — le préflop — est réelle, et ses trois
> verrous sont identifiés précisément.

---

## Table des six points

| § | Intitulé | Cause annoncée | Cause RÉELLE après audit |
|---|---|---|---|
| 7 | Source unique pot/SPR/tapis/relances | « les side pots exigent ≥ 3 joueurs → L2 » | **Le modèle de side pots existe et est exact.** Ce qui manque : PFASE ne représente pas un état à N joueurs, et il n'existe pas de solveur stratégique multiway. Deux capacités distinctes, confondues en une |
| 38 | Full Hand suit préflop → river | « préflop hors périmètre → L1 » | Exacte, mais double : `fullHandEngine` démarre au **flop** (`FH_STREETS`), et PFASE refuse le préflop |
| 54 | Preflop Tree Builder | « le classement exige l'EV postflop → L1 » | Exacte. Trois verrous précis, tous identifiés (voir §54 ci-dessous) |
| 66 | Mains complètes préflop → river | idem §38 | idem §38 |
| 77 | Format tournoi | « MTT/ICM limité par L6 » | Partiellement inexacte : l'ICM **entre dans le CFR**. Ce qui manque : le multiway MTT (même cause que §7) et la réalisation de prime PKO |
| 104 | Revue Trainer jouée réellement | « une solution décrit une décision, pas un coup complet » | **Inexacte sur le fond.** PFASE résout déjà `streets = streetsRemaining` : les rues futures changent l'EV de 1.33 à 3.74 bb et la fréquence de check de 57 % à 18 %. Le champ `coversStreetsAhead` mesure l'EXTRACTION, pas l'HORIZON DE VALEUR |

---

## §7 — Source unique pot / SPR / tapis / relances

| | |
|---|---|
| **1. Entrée exacte** | `normalizeGameState({players:[…], deadPot, blinds, …})` |
| **2. Sortie actuelle** | 7 grandeurs dérivées ; `effectiveStack = min` sur DEUX joueurs. All-in partiel HU vérifié (CASE M) |
| **3. Raison du PARTIAL** | « les side pots exigent ≥ 3 joueurs » |
| **4. Module responsable** | `src/sizing/gameState.js` (représentation) · `src/sizing/trainingSolutionResolver.js:165` (le refus) |
| **5. Limitation algorithmique** | Aucune pour la COMPTABILITÉ. Réelle pour la STRATÉGIE : `buildPostflopTree` a deux camps (`HERO`/`VILL`), `solveTree` a deux tables de regret |
| **6. Limitation de modèle de données** | `gameState` n'expose ni paliers de contribution ni éligibilité par pot |
| **7. Tests existants** | `test-pot-distribution.mjs` (**82 assertions**) · `test-full-hand-multiway.mjs` (**78**) — les deux dans `npm test` |
| **8. Dépendances Adaptive Sizing** | `effectiveStack` alimente `sizingContextFrom` → tous les montants |
| **9. Impact Solver** | Le panneau refuserait un état à 3 joueurs |
| **10. Impact Trainer** | **Aucun** : le Trainer joue déjà des coups multiway avec side pots (`fullHandEngine` + `potDistribution`) |
| **11. Impact Replayer/API** | Le Replayer lit des mains réelles, souvent multiway ; il ne peut pas demander de solution PFASE dessus |
| **12. Modifications nécessaires** | (a) exposer la comptabilité de pot N joueurs dans `gameState` en réutilisant `potDistribution.js` — **ne pas réécrire** ; (b) déclarer deux capacités séparées : `potAccounting: EXACT` et `strategicSolving: UNSUPPORTED` au-delà de 2 joueurs |

**Ce que l'audit a trouvé.** `src/potDistribution.js` (241 lignes, module PUR, aucune
dépendance) empile les engagements par paliers, construit pot principal + side pots,
gère les joueurs couchés qui ont contribué, détache la mise non suivie avant tout
découpage, rend un pot orphelin à ses contributeurs au prorata, et attribue le jeton
indivisible à l'OOP. `fullHandEngine.finish()` l'utilise et publie `sidePots`,
`argentMort`, `nonSuivi` — trois catégories dont la somme fait le pot.

Autrement dit : **PokerForge sait déjà régler exactement un side pot.** Le §7 le niait.

---

## §77 — Format tournoi

| | |
|---|---|
| **1. Entrée** | `evaluationModel: "ICM"` + `icmParams:{stacks,payouts}` |
| **2. Sortie actuelle** | Utilité ICM Malmuth-Harville **injectée dans le CFR** ; `NashConv → null` (le jeu n'est plus à somme nulle) |
| **3. Raison du PARTIAL** | « MTT/ICM limité par L6 » |
| **4. Module** | `src/solver/core/icm.js` · `makeIcmUtility` |
| **5. Limitation algorithmique** | Le PKO fixe `realization` au lieu de le calculer. Et un vrai MTT est **multiway** — même cause que §7 |
| **6. Modèle de données** | `icmParams.stacks` accepte N tapis ; l'arbre n'en joue que 2 |
| **7. Tests** | couverts par les suites solveur existantes ; `validateSolution` refuse un badge ICM sans paramètres |
| **8→11. Impacts** | identiques au §7 |
| **12. Modifications** | Même correction de capacité que §7. La prime PKO reste un travail de modélisation distinct, hors périmètre raisonnable ici |

---

## §54 — Preflop Tree Builder · §38 et §66 — coup complet préflop → river

Ces trois points ont **une seule** cause technique. Les voici ensemble.

| | |
|---|---|
| **1. Entrée** | état `street:"PREFLOP"`, board vide, blindes postées, éventuels limpeurs |
| **2. Sortie actuelle** | `preflopSizing.js` rend des MONTANTS corrects (2.5 → 4.5 bb derrière deux limpeurs) avec `rankable:false`. `solverAdapter` refuse : « board d'au moins 3 cartes requis ». `supportCheck` refuse : « PFASE résout le postflop » |
| **3. Raison du PARTIAL** | l'EV d'une ouverture se réalise après le flop ; sans continuation postflop, aucun classement n'est fondé |
| **4. Modules** | `src/solver/core/gametree.js` (construction) · `src/solver/core/multistreet.js` (résolution) · `src/sizing/solverAdapter.js:91` (le refus) |

### Les TROIS verrous, précisément

**V1 — contributions inégales à l'ouverture d'une rue.** `buildPostflopTree`
documente que « les deux camps sont à égalité quand une street s'ouvre : une street
se termine toujours par un check-check ou un call ». Le préflop viole cela par
construction : SB a posté 0.5, BB a posté 1. Le premier nœud fait donc face à une
mise, ce que l'arbre ne sait pas représenter à la racine.

**V2 — le calendrier des cartes est implicite : une par rue.** `advance()` crée un
nœud `chance` par transition, et la traversée révèle la carte d'indice
`initLen + street`. Cela vaut pour turn (1 carte) et river (1 carte) ; **le flop en
révèle trois d'un coup**. Il faut un calendrier explicite « nombre de cartes visibles
à la rue s » au lieu de l'incrément implicite.

**V3 — le garde-fou d'entrée.** `solverAdapter` refuse un board de moins de 3 cartes,
et `supportCheck` refuse `PREFLOP`. Ce sont des conséquences de V1/V2, pas des causes.

### Ce qui, en revanche, EXISTE DÉJÀ et doit être réutilisé

| Composant demandé | État | Où |
|---|---|---|
| chance nodes | **oui** | `gametree.advance()` |
| distribution des boards | **oui**, échantillonnée avec graine | `multistreet.sampleBoard()` |
| card removal | **oui** | reach mis à 0 pour les combos contenant la carte révélée |
| ranges conditionnelles après action | **oui** | reach par action, tables indexées par contexte de runout |
| reach probabilities | **oui** | `traverse(node, reachH, reachV)` |
| transition pot/stack | **oui** | `betsH`/`betsV`/`pot` portés par chaque nœud |
| SPR | **oui** | dérivé de `gameState` |
| continuation CFR | **oui** | `streets = 1..3`, mesuré ci-dessous |
| propagation des EV | **oui** | remontée récursive |
| fold equity | **oui** | `terminalUtility(foldH/foldV)` |
| branches call/raise/fold | **oui** | `F`/`C`/`R*`/`B*`/`J` |
| **all-in préflop → showdown** | **oui, EXACT** | matrice d'équité 169×169 (`pfEquity`, AA vs KK = 88.47) |
| showdown equity | **oui** | `eval7i` + matrice `E` |
| pondération des boards | **oui** | CRN partagés entre sous-arbres |
| abstraction de ranges | **oui** | `maxCombos`, `reduceRange` |
| caching / canonicalisation | **oui** | `evaluationKey`, `gameStateHash` |
| MCCFR | **non** — CFR+ à échantillonnage de chance | `multistreet.js` |
| warm start | **non** | — |

**Conclusion §54/§38/§66 :** il ne manque PAS un moteur. Il manque **un calendrier de
cartes explicite** et **une racine à contributions inégales**. Le reste se réutilise.

---

## §104 — Une solution décrit-elle une décision ou un coup ?

| | |
|---|---|
| **1. Entrée** | solve de flop, `state.streetsRemaining = 3` |
| **2. Sortie actuelle** | `strategy.coversStreetsAhead: false` — **codé en dur** |
| **3. Raison annoncée** | « une solution décrit UNE décision » |
| **4. Module** | `src/sizing/strategyExtract.js` (le champ) · `src/sizing/solverAdapter.js:96` (l'horizon réel) |
| **5. Limitation algorithmique** | **aucune sur la valeur** — `depth = state.streetsRemaining` |
| **6. Modèle de données** | un seul champ pour DEUX questions différentes |
| **7. Tests** | CASE F (turn→river re-résolu) · CASE L (progression d'une main) |
| **8. Adaptive Sizing** | la sélection des sizings de flop se fait déjà sur des EV qui incluent turn et river |
| **9→11. Impacts** | le Trainer re-résout à chaque rue — comportement correct, à conserver |
| **12. Modifications** | scinder le champ en deux, chacun avec sa vérité |

### La mesure qui tranche

Même flop, mêmes ranges, mêmes sizings, seul l'horizon change :

| profondeur | rues couvertes | EV (bb) | fréquence de check |
|---:|---|---:|---:|
| 1 | flop seul | 1.3275 | 57.0 % |
| 2 | flop + turn | 3.2938 | 21.3 % |
| 3 | flop + turn + river | 3.7401 | 18.1 % |

L'EV **triple** et la stratégie change du tout au tout. Les décisions futures
participent donc bel et bien au calcul de la valeur de la décision actuelle — ce que
`coversStreetsAhead:false` niait.

Ce que le champ décrit RÉELLEMENT, c'est que la solution stockée **n'expose pas** les
nœuds des rues suivantes (choix assumé : taille, et §38/§39). Deux affirmations
distinctes, une seule case.

---

## Plan qui découle de l'audit

| Lot | Ce qui est réellement à faire | Coût | Fermeture attendue |
|---|---|---|---|
| **C** | Scinder `coversStreetsAhead` en `valuesStreetsAhead` (horizon d'EV, mesurable) et `exposesStreetsAhead` (extraction). Ajouter `HandSolution` reliant des décisions d'une même trajectoire, et **interdire** que la concaténation suffise à déclarer l'horizon | faible | §104 |
| **B** | Réutiliser `potDistribution.js` dans `gameState` pour une comptabilité N joueurs, et déclarer deux capacités distinctes (`potAccounting` vs `strategicSolving`) | moyen | §7 en partie, §77 en partie |
| **A** | Calendrier de cartes explicite + racine à contributions inégales → arbre préflop résolu avec continuation. `rankable` piloté par la mesure, jamais par l'intention | élevé | §54, §38/§66 selon ce que la mesure autorise |

**Ce que l'audit interdit d'espérer.** Un solveur CFR **stratégique** multiway
dépasse l'architecture actuelle : deux camps sont câblés dans `buildPostflopTree` et
dans les tables de `solveTree`. Les fondations exactes (comptabilité) seront livrées ;
la stratégie multiway restera `UNSUPPORTED`, documentée avec son plan de fermeture.

---

## Ce que la mise en œuvre a ajouté à cet audit

Deux choses n’apparaissaient pas dans la cartographie et sont apparues en codant.

**1. Le mur mémoire du préflop n’est pas la taille de l’arbre, c’est le nombre de
contextes.** Les tables de regret sont indexées par le runout tombé. Sur un solve
postflop ce contexte est borné ; depuis le préflop, chaque itération tire un flop
neuf, donc un contexte neuf, donc de nouvelles tables — 4 Go de tas en une
cinquantaine de secondes, sans qu’aucune boucle ne soit fautive. La réponse est un
échantillon FIXE de runouts, déclaré (`boardAbstraction`), et deux incertitudes
mesurées séparément : le bruit de convergence (même sous-jeu) et la variance
entre échantillons (sous-jeux différents). Les additionner les rendait toutes
deux inutilisables — le « bruit » relevé valait alors 2.07 bb, davantage que tout
écart entre sizings.

**2. Une comptabilité de pot ne doit jamais invalider un état.** Brancher
`potDistribution` dans `gameState` en poussant une ERREUR quand la conservation
échoue a fait tomber TOUT solve postflop du panneau sur « état de jeu invalide ».
La cause était un écart d’arrondi : le module quantifie au demi-blind, PFASE
travaille plus fin. Mais la leçon dépasse l’arrondi — un heads-up postflop n’a
qu’un pot et ne dépend pas de cette comptabilité. L’anomalie est désormais
SIGNALÉE (elle dégrade `potAccounting` en `PARTIAL`) sans jamais empêcher de
résoudre ce qui est par ailleurs résoluble.
