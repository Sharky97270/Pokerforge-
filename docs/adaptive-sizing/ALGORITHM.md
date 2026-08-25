# ALGORITHME — PokerForge Adaptive Sizing Engine

> Mission §98 : « Documenter précisément : Candidate generation · Subset creation ·
> Evaluation · EV comparison · Selection · Final tree · Final solve · Caching ·
> Persistence. Inclure formules. »

---

## 0. Convention d'EV — une seule, et c'est ici

Toutes les EV manipulées par PFASE sont :

* exprimées **en bb** ;
* du point de vue du **joueur optimisé** (`optimizeFor`, 0 par défaut = Hero = OOP) ;
* sur la base zéro-somme `P/2` de `gametree.terminalUtility`.

En chip-EV le jeu est à somme nulle, donc `EV(joueur 1) = −EV(joueur 0)`.
Sous utilité ICM/PKO il ne l'est pas : `evForPlayer(sol, 1)` rend **`null`**, jamais
`−EV(0)`. C'est la seule convention du moteur ; aucun module n'en définit une autre.

---

## 1. Génération des candidats

Entrée : l'état canonique (§7). Sortie : deux listes d'**actions candidates**.

```
préflop sans mise affrontée  →  multiples de la grosse blinde
sinon                        →  fractions de pot
+ géométrique (un par horizon 1..streetsRemaining)
+ jam
face à une mise, en plus     →  multiples de la mise précédente
```

Deux filtres, tous deux **mathématiques** — aucun n'est stratégique :

1. **Jouabilité.** Un sizing au-dessus du tapis n'est pas un sizing, c'est un jam.
   Un sizing sous la relance minimale légale est **écarté**, jamais relevé au
   minimum (§34 : une conversion implicite ferait entrer dans l'arbre un sizing
   que personne n'a demandé).
2. **Distinction.** Deux specs qui produisent le même montant sont la même action.

Le second filtre suffit à produire la « pertinence » du mode AUTOMATIC. À SPR 0.42,
`150 %`, `200 %` et `jam` valent tous le tapis : il n'en reste qu'un. C'est mesuré
dans les benchmarks — deux spots sur six y voient leur liste de candidats s'effondrer
à deux actions, et le moteur le dit au lieu de classer des sizings identiques.

Réduction au budget : échantillonnage **régulier** sur la liste triée par montant
(le tapis est toujours conservé). Garder les N premiers supprimerait toutes les
grosses tailles, ce qui biaiserait la sélection avant toute mesure.

---

## 2. Formules de sizing

### 2.1 Pourcentage du pot

Pour une mise (aucune mise affrontée) :

```
montant = f · P
```

Pour une relance, convention universelle « payer, puis miser f du pot ainsi
constitué » :

```
toCall       = facingLevel − alreadyCommitted
potAfterCall = P + toCall
raiseTo      = facingLevel + f · potAfterCall
```

### 2.2 Multiple de la mise précédente

```
raiseTo = m · facingLevel
```

où `facingLevel` est l'engagement total de l'agresseur sur la street.

### 2.3 Sizing géométrique — la formule, et pourquoi elle dépend du SPR

On cherche la fraction `x` telle que **N** mises de taille `x`, chacune suivie,
amènent exactement les tapis à zéro.

Une mise de `x·P` suivie porte le pot à `P(1 + 2x)`. Après N rues :

```
P_final = P · (1 + 2x)^N
```

On veut que chaque joueur ait investi tout son tapis effectif `S` derrière :

```
P_final = P + 2S
```

D'où :

```
(1 + 2x)^N = (P + 2S)/P = 1 + 2·SPR

        ( (1 + 2·SPR)^(1/N) − 1 )
x  =    ─────────────────────────
                   2
```

**Contrôles analytiques** (vérifiés par `test-sizing-math.mjs`) :

| N | SPR | x attendu | interprétation |
|---|---|---|---|
| 1 | 1 | 1.00 | une mise de 100 % du pot = tapis |
| 1 | 3 | 3.00 | une mise de 300 % du pot = tapis |
| 2 | 4 | 1.00 | `(1+2x)² = 9` → `x = 1` |
| 3 | 13 | 1.00 | `(1+2x)³ = 27` → `x = 1` |

Le sizing géométrique **ne peut pas** être une constante : mesuré au banc,
`géo 2e` vaut 6.49 bb à 20 bb de tapis et 21.50 bb à 120 bb, sur le même board.

### 2.4 JAM

`montant = tapis effectif`. Ce n'est pas « 999 % du pot » : son montant ne se
déduit pas du pot mais du tapis, et l'action porte son propre label (`J`).

---

## 3. Création des sous-ensembles

Le problème : avec 12 candidats et le niveau ADVANCED (3 mises, 2 relances),
l'énumération complète vaut

```
( C(12,1)+C(12,2)+C(12,3) ) × ( C(12,1)+C(12,2) )  =  298 × 78  =  23 244 solves
```

Hors de portée. Le plan se fait donc **en deux étages** :

**Étage 1** — chaque candidat évalué **seul** (n solves). Donne un classement
individuel. C'est le minimum vital : sans lui, rien à sélectionner.

**Étage 2** — les sous-ensembles ne sont formés que parmi les
`maxSizes + 3` meilleurs de l'étage 1, **mais ils sont réellement résolus**.

Cette distinction est ce qui sépare le plan de l'interdit §10. On ne déduit
jamais l'EV d'une paire de l'EV de ses membres : la paire est un jeu différent,
et son EV est mesurée.

Le pruning est **consigné** (`planner.pruned`, `planner.truncated`) : un
sous-ensemble absent l'est pour une raison écrite.

---

## 4. Évaluation

### 4.1 Nombres aléatoires communs (CRN)

Sur board incomplet, les runouts sont échantillonnés. Tous les sous-arbres d'une
même optimisation partagent donc la **même graine** : la comparaison devient
appariée et le bruit s'annule largement.

Mesuré sur un flop A♠T♥4♣, 120 itérations, trois Single Size :

| graine | 33 % | 75 % | 150 % | meilleur |
|---|---|---|---|---|
| 1 | −0.221 | −0.370 | −0.386 | 33 % |
| 2 | −0.217 | −0.424 | −0.380 | 33 % |
| 3 | −0.145 | −0.311 | −0.253 | 33 % |
| 4 | −0.137 | −0.362 | −0.284 | 33 % |

Les EV absolues bougent de 0.13 bb d'une graine à l'autre ; le **classement** ne
bouge pas. Comparer des arbres résolus sur des runouts différents reviendrait à
comparer du bruit.

### 4.2 Profondeur d'évaluation et garde-fou mémoire

`evaluationDepth` borne le nombre de rues de mise construites. Une évaluation
tronquée reste valide **à condition d'être annoncée** (`depthLimited`,
`partialReasons`).

Le coût mémoire est **estimé avant** le solve :

```
octets ≈ Σ_{nœuds de décision} contextes(street) × combos × actions × 8 × 2 × K
                                                                        │     │
                                                          regret + stratégie  │
                                                       facteur de surcoût JS ─┘
```

avec `contextes(s) = min(itérations, préfixes de s cartes)`, `combos` = le nombre
de combos **réellement** solvés (pas le plafond : `maxCombos: 0` signifie « non
plafonné », et le lire comme « zéro » désarmait le garde-fou), et `K = 12`.

`K` est **empirique et déclaré** : chaque contexte alloue un `Float64Array` par
combo, dont l'en-tête d'objet dépasse largement les données ; s'y ajoutent les
tableaux temporaires de la traversée. Mesuré sur un flop réel (5 sizings + jam +
2 relances, 54 combos, 200 it., profondeur 2) : arithmétique 18 Mo, tas réel
211 Mo → `K = 12`.

Sans ce facteur, le garde-fou laissait passer des solves qui faisaient tomber le
moteur à court de mémoire — pire que pas de garde-fou, puisqu'il donnait une
fausse assurance.

---

## 5. Comparaison d'EV — la définition de la perte

### 5.1 Le choix, et pourquoi il est décisif

```
perte d'EV  =  EV(référence)  −  EV(sous-arbre)
```

Reste à définir « sous-arbre ». Deux définitions possibles :

**(A) Restriction asymétrique — retenue par défaut.**
Seul le joueur optimisé voit ses sizings restreints ; l'adversaire garde l'arbre
de référence. C'est la question rigoureuse : *que perds-je à me limiter à ces
tailles, face à un adversaire qui, lui, dispose de tout ?* Dans un jeu à somme
nulle, restreindre l'ensemble d'actions d'un joueur ne peut pas augmenter la
valeur du jeu pour lui : **la perte est garantie ≥ 0**.

**(B) Restriction symétrique.**
Les deux camps sont simplifiés. Le jeu change des deux côtés ; on ne mesure plus
le coût de sa propre simplification mais l'effet net de deux simplifications.
Mesuré sur un river réel, ce réglage rendait **toutes** les pertes négatives
(−0.15 à −0.19 bb) : le moteur aurait annoncé qu'un Single Size bat le solve
complet. Disponible via `restrictPlayers:"both"`, jamais par défaut.

### 5.2 L'escalade de convergence

Le CFR converge d'autant plus lentement qu'un nœud offre d'actions. L'arbre de
référence est donc **systématiquement** moins convergé qu'un sous-arbre à un seul
sizing, au même nombre d'itérations. Mesuré sur un river réel :

| itérations | référence | « 33 % seul » (restreint côté Hero) | perte |
|---|---|---|---|
| 150 | −0.548 | −0.495 | **−0.053** |
| 400 | −0.493 | −0.471 | **−0.022** |
| 1 000 | −0.471 | −0.463 | −0.008 |
| 2 500 | −0.463 | −0.461 | −0.002 ≈ 0 |

À 150 itérations, le moteur aurait « prouvé » qu'un Single Size bat le solve
complet. Ce n'est pas une propriété du poker : c'est un artefact de convergence.

L'optimiseur mesure donc la **dérive** de l'EV de référence entre N et 2N
itérations, et monte en précision tant que le critère d'arrêt n'est pas atteint :

* **board complet** → `NashConv`, qui est calculable **exactement** ;
* **board incomplet** → la dérive × `DRIFT_SAFETY_FACTOR` (= 2), faute de mieux.

### 5.3 Le plancher de mesure

Une perte plus petite que l'incertitude de mesure **n'est pas une perte mesurée**.

```
plancher = max( bruit d'échantillonnage,
                dérive × 2,
                NashConv(référence) )
```

et, par évaluation, quand les deux exploitabilités sont connues :

```
plancher(évaluation) = max( plancher global,
                            NashConv(référence) + NashConv(sous-arbre) )
```

Cette dernière borne est **rigoureuse** : dans un jeu à somme nulle, l'écart entre
l'EV d'un profil et la valeur du jeu est borné par son NashConv ; l'erreur sur une
**différence** d'EV est donc bornée par la somme des deux.

Toute perte sous ce plancher est rapportée avec `distinguishable: false`, et
l'interface affiche : *« Ce niveau ne coûte rien de mesurable — ce qui n'est pas
la même chose que "ne coûte rien". »*

La dérive seule ne suffisait pas : elle mesure le **dernier pas** de convergence,
pas la distance restante. Mesuré : dérive 0.003 bb là où l'écart réel valait
0.011 bb — soit un facteur 3.

---

## 6. Sélection

```
sélection = argmin( perte d'EV )   parmi les sous-ensembles conformes au niveau
```

avec deux règles de départage :

1. **Sous le plancher de mesure, la simplicité l'emporte.** Deux sous-arbres dont
   les pertes diffèrent de moins que le bruit ne sont pas distinguables ; les
   classer par EV reviendrait à trancher au hasard, et à retenir trois sizings là
   où deux font aussi bien.
2. **Sous tolérance** (`maxAcceptableEVLoss`), on retient la solution de **coût de
   complexité minimal** qui tient la tolérance. Si aucune ne la tient, on rend la
   meilleure **en disant** que la tolérance n'est pas tenue.

`FULL` et `FIXED` court-circuitent la sélection : ils ne simplifient rien, et leur
perte d'EV vaut zéro par définition.

---

## 7. Arbre final et solve final

Les micro-solves de sélection sont tronqués (profondeur bornée, abstraction,
itérations réduites). Les prendre pour la solution reviendrait à livrer un
brouillon (§13). L'arbre retenu est donc **reconstruit et re-résolu** à la
précision de production.

L'arbre final est **symétrique** : les deux camps jouent les sizings retenus.
C'est le jeu contre lequel le Trainer entraînera. Il n'est **pas** le même que
l'arbre asymétrique de la sélection — la solution le dit
(`finalEVComparable: false`) plutôt que de laisser quelqu'un comparer les deux EV.

---

## 8. Cache et persistance

Trois étages, trois natures :

| Étage | Contenu | Clé | Durée |
|---|---|---|---|
| Évaluation | **nombres seuls** (EV, statut, convergence) | `EVAL:<hash>:<arbre+config>` | vie de l'optimisation (partageable) |
| Solves bruts (`solver/library.js`) | tables CFR complètes | `solveId` | LRU 500 mémoire / 200 disque |
| Solutions (`sizing/solutionStore.js`) | `PFSolution` plain-data | `<gameStateHash>#<COMPLEXITY>` | LRU 400 mémoire / 300 disque |

Deux règles apprises en mesurant :

* le cache d'évaluation ne conserve **jamais** l'objet solution — dix à quarante
  jeux de tables CFR épuisaient le tas ;
* les micro-solves n'entrent **pas** dans `library.js` (`noStore: true`) — même
  cause, même effet.

Le hash canonique inclut les trois versions (`sizingEngineVersion`,
`solverVersion`, `solutionSchemaVersion`) : une mise à jour du moteur produit des
hashs différents, donc n'a aucun moyen de servir une ancienne solution. En plus de
cela, `getSolutionById` vérifie explicitement les versions et refuse les entrées
périmées — deux verrous, parce que celui qui saute en silence est le pire.

---

## 9. Échantillonnage des actions Villain

```
sampleAction(node, rng) :  tirage proportionnel aux fréquences du nœud
```

`rng` est **injectable**. Le mode QA fournit un générateur seedé (`seededRng`) :
même graine, même partie. Choisir systématiquement l'action majoritaire produirait
un Vilain déterministe, donc exploitable, donc faux (§43).
