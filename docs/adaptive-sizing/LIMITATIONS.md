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

## L4 — L'EV par action à un nœud n'est pas conservée

| | |
|---|---|
| **Capacité visée** | §36/§49 : afficher « EV played / EV best / EV difference » pour une décision. |
| **Cause technique** | `solveTree` ne conserve pas les valeurs contrefactuelles par action après convergence : seules la stratégie moyenne et l'EV racine survivent. |
| **Ce qui est livré** | L'**écart d'EV entre SIZINGS** (§15), lui, est mesuré et conservé (`actionRanking`) : c'est l'EV du joueur s'il se limitait à ce seul sizing. Il répond exactement à « 33 % est proche, 150 % sacrifie davantage ». |
| **Ce qui reste à faire** | Conserver les valeurs contrefactuelles de la dernière itération dans `solveTree`, ou ajouter une passe de meilleure réponse par action. |
| **Comportement actuel** | `compareAction` rend `evAvailable: false` avec la note explicite. Aucun nombre n'est fabriqué pour combler le trou. |

---

## L5 — Le rake est transporté mais pas appliqué

| | |
|---|---|
| **Capacité visée** | §78 : rake, rake cap. |
| **Cause technique** | `terminalUtility` ne retire aucun rake du pot. |
| **Ce qui est livré** | `state.rake = { pct, cap, applied:false }` — transporté, entrant dans le hash canonique (deux configurations de rake ne partagent donc pas de cache), et **déclaré non appliqué**. |
| **Ce qui reste à faire** | Retrancher le rake dans `terminalUtility` pour les issues non-fold. |
| **Comportement actuel** | `applied: false` visible dans la solution. Aucune solution ne prétend tenir compte du rake. |

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

## L7 — La perte d'une simplification est souvent sous le plancher de mesure

| | |
|---|---|
| **Constat** | Sur les 10 spots du banc d'essai, **aucun** niveau simplifié n'affiche une perte d'EV distinguable du bruit aux budgets par défaut. |
| **Est-ce un défaut ?** | Non, et la distinction est importante. Deux choses sont mesurées séparément : (a) le **classement** des sizings — mesurable sur 4 spots river sur 6, avec des écarts de 0.23 à 1.44 bb contre un plancher de 0.06 ; (b) la **perte du meilleur sizing face à l'arbre complet** — effectivement très petite. Un Single Size bien choisi coûte moins que ce que cette précision permet de mesurer. |
| **Les 2 spots restants** | SPR 0.42 et 0.5 : tous les candidats s'écrasent sur le même montant (le tapis). Le classement n'y est pas mesurable parce qu'il n'y a **rien à classer**. Le moteur le dit au lieu de départager des actions identiques. |
| **Ce qui reste à faire** | Plus d'itérations et une abstraction de board abaisseraient le plancher. C'est un arbitrage temps/précision, exposé à l'utilisateur (`convergenceTarget`, `maxIterationsCeiling`, `timeBudgetMs`). |
| **Comportement actuel** | `distinguishable: false` et l'avertissement à l'écran. Jamais un chiffre présenté comme précis. |

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
