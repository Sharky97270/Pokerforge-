# Surface heuristique du SharkSolver — état mesuré

Objet : dimensionner le remplacement des ranges heuristiques par des ranges
pré-solvées. Chiffres relevés dans le code au 2026-07-21, pas estimés.

Question de départ : *pourquoi l'écran affiche « Heuristique » et pas « GTO », et
est-ce le bon choix pour un outil pro ?*

Réponse courte : le label décrit ce que le chiffre **est**. Le problème n'est pas
l'étiquette mais la taille de la zone qu'elle couvre.

---

## 1. Deux zones heuristiques distinctes

Elles n'ont ni la même cause ni le même remède, et les confondre fait perdre du temps.

### A. Le préflop n'est jamais solvé

`solveMultiStreet` renvoie `NO_SOLUTION` si `board.length < 3`
([api.js:92](../../src/solver/api.js)), et le bouton de solve est désactivé
([SharkSolverTab.jsx:1029](../../src/tabs/SharkSolverTab.jsx)).

Sur un spot préflop il n'existe **aucun chemin** vers un résultat calculé. Ce n'est
pas une dégradation, c'est une absence de fonctionnalité — assumée (§40 : le CFR est
un solveur de sous-jeu postflop, l'exécuter préflop produirait des Check/Bet
dépourvus de sens).

### B. Les ranges d'entrée sont écrites à la main

`buildSolverFreqs` ([SharkSolverTab.jsx:19](../../src/tabs/SharkSolverTab.jsx)) —
**182 lignes, 539 constantes numériques**, dont deux tables de calibrage explicites.
Les fréquences viennent de formules du type :

```js
const p = Math.max(0, Math.min(100, 100 - gap*12 + hi*4));
```

Paliers de paires, décote par gap, bonus de hauteur, bonus de position. Calibré à
l'œil pour **avoir la forme** d'une range correcte. Aucun calcul d'équilibre.

**C'est la zone qui compte le plus, et c'est contre-intuitif.** Ces ranges sont les
ENTRÉES du CFR postflop. Un solve postflop exact sur des ranges devinées reste une
réponse exacte à la mauvaise question.

Ce n'est pas une inquiétude théorique : le bug de troncature (§8, commit `7a56fec`)
en a fourni la démonstration. Supprimer les combos offsuit changeait la composition
de range, et **toute la stratégie** basculait. La composition de range domine la
stratégie postflop. Tant que les ranges sont heuristiques, elles dominent le terme
d'erreur — devant la précision du CFR, devant la finesse des sous-arbres.

Corollaire pour la roadmap : raffiner les sous-arbres par carte, c'est polir le terme
secondaire pendant que le principal est intact.

---

## 2. Taille de la surface

Paramétrage de `buildSolverFreqs` :

| Dimension | Valeurs | n |
|---|---|---|
| Position Hero | UTG, LJ, HJ, CO, BTN, SB, BB | 7 |
| Position Vilain | idem, ≠ Hero | 6 |
| Action | rfi, vs_open, vs_3bet, cbet_ip, vs_bet | 5 |
| Paliers de tapis | ≥80bb, 40-79bb, <40bb | 3 |

Les 5 actions sont toutes couvertes par une branche dédiée : aucune ne retombe sur
un défaut générique.

**Combinaisons paramétrables : 7 × 6 × 5 × 3 = 630.**
Dont **378 préflop** (rfi, vs_open, vs_3bet) et **252 postflop** (cbet_ip, vs_bet).

⚠ Borne SUPÉRIEURE, pas un décompte de spots réels : toutes les paires
position/action ne sont pas légales (UTG ne peut pas ouvrir « face à UTG »), et le
tapis est en réalité continu — `posBonus` s'y applique de façon graduée, les trois
paliers sont une simplification de lecture. Le chiffre sert à dimensionner, pas à
facturer.

Chaque scénario produit **169 classes de mains × 3 fréquences** (raise / call / fold).

---

## 3. Provenance : l'emplacement existe déjà, vide

`provenance.js` définit cinq `RangeSource`. Deux seulement sont utilisés :

| Valeur | Utilisée ? |
|---|---|
| `HEURISTIC` | ✅ défaut de toute range |
| `USER_DEFINED` | ✅ si l'utilisateur saisit une main exacte |
| `PRESOLVED` | ❌ jamais |
| `SOLVER_GENERATED` | ❌ jamais |
| `IMPORTED` | ❌ jamais |

Seule occurrence, [SharkSolverTab.jsx:1335](../../src/tabs/SharkSolverTab.jsx) :

```js
const heroRangeSrc = heroMode==="hand" ? RangeSource.USER_DEFINED : RangeSource.HEURISTIC;
```

L'architecture de provenance anticipait donc déjà des ranges pré-solvées. Le champ
attend son contenu.

---

## 4. Direction recommandée

**Ne pas solver le préflop en direct.** Personne ne le fait : un solve préflop tourne
des heures sur serveur (PioSOLVER et équivalents). En navigateur, avec 6 s mesurées
pour 200 combos postflop, ce n'est pas un problème de degré.

**Embarquer une bibliothèque de ranges pré-solvées**, et basculer `RangeSource` sur
`PRESOLVED`. Effet en cascade :

| | Aujourd'hui | Avec ranges pré-solvées |
|---|---|---|
| Spot préflop | Heuristique, aucun solve possible | Pré-solvé |
| Ranges d'entrée postflop | Heuristique | Pré-solvé |
| Solve postflop | CFR exact sur données devinées | CFR exact sur données solvées |

Le rouge quitterait l'écran non parce qu'on l'a effacé, mais parce qu'il n'aurait
plus lieu d'être.

### Deux décisions produit, hors compétence technique

1. **Origine des ranges.** Les générer (long, maîtrisé, traçable — un outil pro doit
   pouvoir dire d'où viennent ses chiffres) ou en importer (rapide, mais licence et
   provenance à vérifier — et `IMPORTED` existe justement pour ne pas les faire
   passer pour des solves maison).
2. **Couverture.** Les spots RFI / vs-open / 3bet aux tapis courants couvrent
   l'essentiel du volume réel. La couverture exhaustive des 630 combinaisons est un
   projet distinct, et probablement pas rentable d'emblée.

### Ce qui reste heuristique quoi qu'il arrive

À dire, sans quoi on recrée le problème un cran plus loin :

- les **profils de vilain** de l'Exploit Solver (§20) sont des modèles de tendances
  estimées — seule la stratégie d'exploit est re-solvée ;
- le modèle de **prime PKO** (§22) : `realization` est un paramètre, pas un calcul ;
- l'**abstraction de range** au-delà de ~200 combos approche la granularité par
  couleur (compte sur board monotone) — déjà signalé dans l'UI.

Ceux-là garderont leur étiquette. C'est correct : ils sont *nommés* pour ce qu'ils
sont, et c'est toute la différence entre un outil fiable et un outil qui en a l'air.
