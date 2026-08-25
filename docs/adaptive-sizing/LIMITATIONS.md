# LIMITATIONS — PokerForge Adaptive Sizing Engine

> Mission §99 : « Si certaines ambitions ne sont réellement pas possibles avec
> SharkSolver actuel : NE PAS FAIRE SEMBLANT. Documenter : capability · reason ·
> required change. »
>
> Chaque limitation ci-dessous est **mesurée**, pas supposée, et chacune est
> **signalée à l'exécution** — l'utilisateur ne peut pas la découvrir par accident.

---

## L1 — Le préflop n'est pas résolu par PFASE

| | |
|---|---|
| **Capacité visée** | §54 : arbre préflop (open / 3bet / 4bet / limp / iso / cold-call). |
| **Cause technique** | `core/gametree.js` construit un arbre **postflop heads-up** : il part d'un pot mort et de deux joueurs à égalité de contribution. Il n'a ni blindes postées, ni ordre de parole multi-joueurs, ni notion de limpeurs. |
| **Ce qui est livré** | Les types de sizing préflop existent et sont testés (`bbSizing`, multiples d'ouverture dans le générateur de candidats). `gameState` accepte `PREFLOP`, valide un board vide et calcule correctement blindes, antes et relance minimale. `trainingSolutionResolver` **refuse** explicitement le préflop, avec son motif. |
| **Ce qui reste à faire** | Un constructeur d'arbre préflop dans `core/`, avec blindes postées et n joueurs. PFASE le consommerait sans modification : sélection, métriques, magasin et Trainer sont indépendants de la forme de l'arbre. |
| **Comportement actuel** | `resolveTrainingSolution` rend `UNSUPPORTED` : « PFASE résout le postflop ; le préflop passe par le moteur push/fold et les charts ». Le push/fold HU existant reste la seule zone préflop réellement calculée. |

---

## L2 — Heads-up uniquement

| | |
|---|---|
| **Capacité visée** | §56 : HU / 3-way / multiway. |
| **Cause technique** | `buildPostflopTree` alterne entre deux joueurs (`HERO`/`VILL`) et sa comptabilité terminale suppose des tapis symétriques (aucun side-pot). |
| **Ce qui est livré** | `TABLE_FORMAT_SUPPORT` déclare `3WAY` et `MULTIWAY` **non supportés**, avec le motif. `supportCheck` compte les joueurs encore dans le coup et refuse au-delà de deux. |
| **Ce qui reste à faire** | Arbre à n joueurs et side-pots dans le Game Tree Engine. |
| **Comportement actuel** | `UNSUPPORTED` : « le moteur ne construit qu'un arbre heads-up — une solution HU ne sert PAS de vérité pour un spot multiway ». Vérifié par test. |

---

## L3 — Le flop à trois rues de mise est hors de portée mémoire

| | |
|---|---|
| **Capacité visée** | Résoudre un flop avec ses trois rues de mise (flop, turn, river). |
| **Cause technique** | `core/multistreet.js` indexe regrets et stratégie par **(nœud, runout observé)**. Le nombre de contextes croît avec les itérations : à la 3ᵉ rue, chaque itération échantillonne un runout neuf. Mesuré (5 sizings + jam + 2 relances, 54 combos, 200 it.) : profondeur 2 → 222 Mo estimés / 211 Mo réels ; profondeur 3 → **4 701 Mo estimés**. Sur ranges complètes (169 classes), Node tombe à court de tas. |
| **Ce qui est livré** | Un garde-fou qui **estime avant de solver**, dégrade la profondeur puis l'abstraction, et **le dit** (`guardNotes`, `partialReasons`). Le moteur ne plante plus : il rend une solution `PARTIAL` annotée. |
| **Ce qui reste à faire** | Abstraction de board (regrouper les runouts par isomorphisme de couleurs et par classe de texture), ou stockage compressé des regrets. C'est un changement du cœur CFR, pas de PFASE. |
| **Comportement actuel** | Flop → profondeur 2 (flop + turn) ; la river est distribuée pour l'abattage mais sans rue de mise. Annoncé dans chaque solution : « profondeur d'évaluation bornée à 2 rue(s) sur 3 ». |

---

## ~~L4 — L'EV par action à un nœud n'est pas conservée~~ · **LEVÉE**

| | |
|---|---|
| **Capacité visée** | §36/§49 : afficher « EV played / EV best / EV difference » pour une décision. |
| **Ce qui bloquait** | `solveTree` ne conserve pas les valeurs contrefactuelles par action après convergence. |
| **Comment c'est levé** | `nodeActionEVs()` les **recalcule** exactement à partir de la stratégie moyenne déjà stockée — une traversée d'arbre par action. Sur board complet c'est exact ; sur board incomplet, la moyenne porte sur des runouts rejoués avec la graine du solve, et `exact:false` le dit. `extractStreetStrategy` attache le résultat à chaque nœud (budget : 24 nœuds, les plus proches de la racine d'abord) ; `compareAction` en tire `evPlayedBb`, `evBestBb`, `evLossBb`. |
| **Ce qui reste vrai** | Un sizing **non résolu** n'a toujours pas d'EV : `compareAction` rend `evAvailable:false` et publie seulement l'EV de la meilleure action **étudiée**, étiquetée comme telle (§50). Les rues à venir restent hors périmètre (L8). |

**Trois pièges rencontrés, et comment ils ont été attrapés** — parce qu'une EV par
action a toujours l'air raisonnable, et qu'aucun ne se voyait à la lecture :

1. **Le dénominateur comptait des combinaisons impossibles.** Une main adverse qui
   partage une carte avec la nôtre est écartée du numérateur ; la compter au
   dénominateur écrasait toutes les EV du rapport des combos bloqués. Symptôme :
   sur un pot mort de 12 bb, un FOLD rendait −5.93 bb au lieu de −6 bb exactement.
   Un pour cent — sur la seule case dont la réponse était connue d'avance.
2. **La référence de l'auto-contrôle était fausse.** L'EV mélangée à la racine ne
   doit PAS égaler `solveTree.ev` : celui-ci est la moyenne, sur les itérations,
   de la valeur de la stratégie **courante** de chaque itération, quand la mesure
   porte sur la stratégie **moyenne**. Écart mesuré : 0.086 bb à 600 itérations.
   Confondre les deux fait chercher un bug inexistant pendant longtemps.
3. **L'indifférence se vérifie PONDÉRÉE.** À l'équilibre, les actions qu'une main
   joue réellement se valent — mais l'écart brut résiduel (0.26 bb) semble
   contredire un NashConv de 0.004. Pondéré par la fréquence de l'action et par le
   poids de la classe dans la range, il retombe à 0.003 : les deux mesures, qui ne
   partagent aucun code, concordent.

Verrouillé par `test-sizing-pipeline.mjs` **CASE I** (les trois contrôles sur le
vrai solveur) et par `test-sizing-trainer.mjs` (l'arithmétique du verdict, dont le
piège « la plus fréquente n'est pas la mieux valorisée »).

---

## ~~L5 — Le rake est transporté mais pas appliqué~~ · **LEVÉE**

| | |
|---|---|
| **Capacité visée** | §78 : rake, rake cap. |
| **Comment c'est levé** | `makeRakeModel()` retranche `min(pct × pot final, cap)` de l'utilité terminale, **du côté de celui qui encaisse** — et à parts égales sur un pot partagé. `state.rake.applied` vaut désormais vrai dès qu'un pourcentage strictement positif est fourni, et le drapeau descend jusqu'au solveur. |
| **Variante modélisée** | Convention « no flop, no drop » : ces arbres sont postflop, le pot est donc raké même emporté sans abattage. `rakeUncontested:false` restitue les salles qui ne rakent que les pots disputés — et entre dans le hash, puisque c'est un autre jeu. |

**Ce que cela change vraiment.** Tant que le rake n'était que transporté, le moteur
recommandait le même sizing avec et sans taxe. Mesuré sur le river de référence,
à 5 % plafonné à 3 bb : le sizing retenu passe de **75 % à 33 %**, et l'EV de Hero
de 1.29 à 0.60 bb. Le rake renchérit les gros pots ; l'ignorer ne décalait pas
seulement un chiffre, cela donnait un mauvais conseil.

**Deux conséquences qu'on ne peut pas contourner :**

* **La somme nulle tombe.** Ce que Hero gagne n'est plus l'opposé de ce que le
  Vilain perd : une part quitte la table. `nashConv` rend donc `null` — pas une
  valeur approchée — et la solution porte `zeroSum:false`. Toutes les mesures
  bâties sur la somme nulle deviennent illégitimes au-dessus d'un solve raké, à
  commencer par l'exploitabilité.
* **L'ICM et le PKO sont refusés avec le rake.** Ces utilités transforment un
  *transfert* de jetons entre deux joueurs ; le rake en fait *sortir* une part.
  Aucune convention publiée ne compose les deux, et en inventer une produirait un
  chiffre que rien ne fonde (§0, §99). `solveTreeSpec` refuse **avant** de dépenser
  un solve, avec le motif — plutôt qu'une exception opaque.

Verrouillé par `test-sizing-pipeline.mjs` **CASE J**, qui vérifie notamment que le
FOLD de Hero vaut **toujours exactement −6 bb** sous rake : c'est le gagnant qui
paie, et prélever du mauvais côté est l'erreur la plus facile à commettre et la
plus difficile à voir dans une EV agrégée.

---

## L6 — L'ICM postflop est solvable, le PKO reste partiellement estimé

| | |
|---|---|
| **Capacité visée** | §55 : ChipEV / ICM / PKO. |
| **État réel** | L'utilité ICM (Malmuth-Harville) **entre dans le CFR** : la stratégie est réellement solvée en $EQ. Le PKO ajoute une capture de prime dont le paramètre `realization` est **fixé**, pas calculé. |
| **Conséquence mesurable** | Sous ICM/PKO le jeu n'est pas à somme nulle : `NashConv` devient ininterprétable et vaut `null` ; `evForPlayer(sol, 1)` rend `null` plutôt que `−EV(0)`. |
| **Ce qui est livré** | `evaluationModel` dans l'état, dans le hash et dans la solution. `validateSolution` **refuse** un badge ICM sans paramètres ICM. `compatibilityReport` refuse de servir une solution ChipEV pour un spot ICM. |
| **Ce qui reste à faire** | Modéliser la réalisation de prime plutôt que la paramétrer. |

---

## L7 — La perte d'une simplification est souvent sous le plancher de mesure · **ATTÉNUÉE**

| | |
|---|---|
| **Constat initial** | Sur les 10 spots du banc d'essai, **aucun** niveau simplifié n'affichait une perte d'EV distinguable du bruit aux budgets par défaut. |
| **Est-ce un défaut ?** | Non, et la distinction est importante. Deux choses sont mesurées séparément : (a) le **classement** des sizings — mesurable, avec des écarts de 0.23 à 1.44 bb ; (b) la **perte du meilleur sizing face à l'arbre complet** — effectivement très petite. Un Single Size bien choisi coûte moins que ce que cette précision permet de mesurer. |
| **Les 2 spots restants** | SPR 0.42 et 0.5 : tous les candidats s'écrasent sur le même montant (le tapis). Le classement n'y est pas mesurable parce qu'il n'y a **rien à classer**. Le moteur le dit au lieu de départager des actions identiques. |
| **Comportement actuel** | `distinguishable` et `guaranteed` sont rapportés séparément (ci-dessous). Jamais un chiffre présenté comme plus précis qu'il ne l'est. |

**Ce qui a changé — deux corrections qui abaissent réellement le plancher :**

**1. On ne mesurait pas l'EV de la stratégie qu'on sert.** `solveTree.ev` est la
moyenne, *sur les itérations*, de la valeur de la stratégie **courante** de chaque
itération. La stratégie **stockée, affichée et jouée** est la stratégie *moyenne* —
et sa valeur converge bien plus vite :

| itérations | `sol.ev` (moyenne des itérations) | EV de la stratégie moyenne | NashConv |
|---:|---:|---:|---:|
| 100 | 0.837 | 1.074 | 0.580 |
| 800 | 1.167 | 1.243 | 0.093 |
| 1600 | 1.217 | 1.267 | 0.041 |
| 3200 | 1.243 | 1.270 | 0.019 |

Entre 1600 et 3200 itérations, l'ancienne mesure bougeait encore de 0.026 bb quand
la nouvelle ne bouge que de 0.003 : **près de dix fois plus stable**. L'essentiel
de la « dérive de convergence » qu'on prenait pour de l'imprécision était l'inertie
d'une moyenne qui traîne ses premières itérations. `strategyEV()` calcule la bonne
grandeur, et c'est elle que PFASE compare désormais.

**2. « Mesurable » et « garanti » ne sont pas la même question**, et n'en donner
qu'une réponse trompe dans un sens ou dans l'autre :

* le **plancher mesuré** — dérive observée entre N et 2N itérations, majorée d'un
  facteur de sécurité, plus le bruit d'échantillonnage. C'est ce que l'on constate ;
* le **plancher garanti** — `NashConv(référence) + NashConv(sous-arbre)`. Dans un
  jeu à somme nulle, l'écart entre la valeur d'un profil et celle du jeu est borné
  par son exploitabilité. C'est rigoureux, mais lâche : sur le river de référence,
  la borne annonçait 0.041 bb là où l'erreur réelle valait 0.003 — un facteur 13.

N'utiliser que la borne rigoureuse déclarerait presque tout indistinguable et
masquerait des écarts réels ; n'utiliser que la dérive surestimerait la précision.
La solution rapporte donc `distinguishable` (mesuré) **et** `guaranteed` (borné),
avec les deux planchers, et l'interface dit lequel est franchi.

**Ce qui reste à faire.** Une abstraction de board abaisserait encore le plancher
sur les flops. L'arbitrage temps/précision reste exposé (`convergenceTarget`,
`maxIterationsCeiling`, `timeBudgetMs`).

---

## L8 — La solution ne couvre que la rue courante

| | |
|---|---|
| **Choix, pas limite subie** | `extractStreetStrategy` n'extrait que les nœuds de la rue du board. |
| **Raison 1 — taille** | La stratégie d'un nœud de turn dépend de la carte tombée : jusqu'à 48 stratégies par nœud, puis 47 de plus à la river. |
| **Raison 2 — justesse (§38/§39)** | « Le sizing proposé à la turn dépend du nouvel état. Ne pas réutiliser naïvement le sizing flop. » Rejouer la turn depuis une extraction figée du flop, ce serait exactement cela. |
| **Comportement actuel** | `strategy.coversStreetsAhead: false`. Le Trainer re-résout au nouvel état à chaque transition de rue. Vérifié sur un même coup : turn → 75 % = 9 bb (pot 12) ; river → 150 % = 34 bb (pot 24). |

---

## L9 — L'annulation d'un solve en cours n'est pas instantanée

| | |
|---|---|
| **Cause technique** | Un solve CFR est une boucle **synchrone** : tant qu'elle tourne, le Worker ne lit plus ses messages. |
| **Ce qui est livré** | Deux niveaux (§59) : coopératif — le drapeau est testé **entre** deux solves, le Worker survit et son cache reste chaud ; puis terminaison du Worker après un délai de grâce de 1.5 s. |
| **Ce qui reste à faire** | Découper la boucle CFR en tranches rendant la main, ou tester un `SharedArrayBuffer` dans la boucle. |

---

## L10 — Sans Web Worker, PFASE refuse de calculer

| | |
|---|---|
| **Contexte** | Build standalone en fichier unique : `Worker` est indisponible. |
| **Décision** | `pfaseClient` **refuse** par défaut le calcul sur le thread principal, plutôt que de geler l'onglet 30 à 150 secondes. |
| **Comportement actuel** | Échec explicite (`workerUnavailable: true`), que l'interface transforme en action manuelle (§90). `allowMainThread: true` lève le refus pour les scripts Node et les tests. |

---

## L11 — Les ranges d'entrée restent heuristiques

| | |
|---|---|
| **Constat** | `solver/preflopRanges.buildSolverFreqs` fabrique les ranges par des formules écrites à la main. C'est une limite **antérieure** à PFASE, mais elle domine le terme d'erreur. |
| **Pourquoi c'est décisif** | Un solve exact sur des ranges devinées reste une réponse exacte à une question approchée. La composition de range pilote l'essentiel de la stratégie postflop. |
| **Ce qui est livré** | La rubrique `rangeLogic` de la charge utile Coach porte cette réserve explicitement, et `abstraction` dit combien de classes ont été supprimées par le plafond de combos. |
| **Ce qui reste à faire** | Des ranges préflop solvées ou importées et vérifiées (§84). |
