# Mission « cinématique des mises » — preuves de mesure

Tout ce dossier est produit par `npm run audit:table`
(`scripts/trainer-bet-anchor-audit.mjs`), qui pilote un vrai navigateur.

    npm run audit:table -- --tables=4T --n=12 --w=1600 --h=950

## Ce que les fichiers contiennent

`avant-*.json` — relevé AVANT la refonte. `apres-*.json` — après.
Chaque fichier porte un `summary` et le détail de chaque tirage.

| grandeur | ce qu'elle dit | §  |
|---|---|---|
| `ratioFeutre` | largeur/hauteur du feutre — doit être CONSTANTE | 6/19 |
| `ecartAngleDeg` | angle entre l'axe siège→pot et l'axe siège→mise | 4/9/20 |
| `attribution` | distance du tas à SON siège vs au siège étranger le plus proche | 43 |
| `misesAmbigues` | tas plus proches d'un autre joueur que du leur — doit rester vide | 43 |
| `couloir` | écarts verticaux pot↔board et board↔cartes du Hero, en px | 15/16 |
| `boutonDattribution` | même test d'attribution pour le bouton dealer | 29 |

## Le résultat, en un tableau

Mesuré à 1600×950, 6-max, n=10 à 12 tirages par mode.

| | ratio feutre | écart angulaire | attribution min | mises ambiguës |
|---|---|---|---|---|
| avant 1T | 1.34 … 1.54 | moy 47°, max 76° | **0.87** | 3 |
| avant 2T | **1.16** (un cercle) | 8° | 1.64 | 0 |
| avant 3T | 1.71 … 1.95 | 3° | 1.28 | 0 |
| avant 4T | 1.79 | moy 14° | 1.33 | 0 |
| après 1T | **1.70** | 0° sur les sièges de flanc | 1.31 | **0** |
| après 2T | **1.70** | 0° | 1.31 | **0** |
| après 3T | **1.70** | 0° | 1.31 | **0** |
| après 4T | **1.70** | 0° | 1.33 | **0** |

Les sièges de l'AXE VERTICAL (Hero en bas-centre, siège haut-centre) gardent un
écart angulaire : leur rayon traverse le board de part en part, ils posent donc
leur tas dans une poche latérale — comme tous les clients de poker pour la main
du Hero. Cette poche est bornée par le critère d'attribution, pas par un angle.

## Captures

`final-<mode>-<street>.png` : la matrice §40 (4 modes × préflop/postflop) à
1600×950. `final-4T-1366.png` : le format CONTRAINT, celui qui révèle les
défauts (à 1600 tout paraît propre — cf. mémoire « trainer-audit-jetons »).
`zoom-final-*.png` : agrandissements produits par `scripts/png-crop.mjs`.

---

# Cinématique des mises (§12/§13/§27/§28)

Produit par `npm run audit:cine:trainer` (`scripts/trainer-cine-audit.mjs`), qui
injecte un échantillonneur dans la page et relève, à chaque frame, l'état complet
de la table. Un relevé unique ne dirait rien : c'est la CHRONOLOGIE qui porte le
défaut.

    npm run audit:cine:trainer -- --tables=1T --n=14

`cine-avant-1T.json` / `cine-apres-1T.json`.

| grandeur | ce qu'elle dit | §  |
|---|---|---|
| `potChangeSansJetonEnMouvement` | le pot prend-il sa valeur AVANT qu'un jeton bouge | 12 |
| `collecteVisible` | les tas partent-ils vers le pot en fin de tour | 27 |
| `ghostChipsAprèsStreet` | un tas de la street précédente survit-il | 28 |
| `pointsDeDépartDeVolDistincts` | les vols partent-ils de sièges différents | 9 |

## Le défaut mesuré avant correction

    ghostChipsAprèsStreet : ["UTG:call10bb", "HJ:3-bet10bb"]

Des engagements du préflop encore peints alors que le board avait déjà changé.
Et aucune collecte : les tas disparaissaient sur place pendant que le pot
sautait, parce que `setPotWithDelta` écrivait la valeur finale de façon
synchrone puis animait un « +X » par-dessus.

## Après

`collecte.png` / `zoom-collecte.png` — capture prise EN COURS de collecte
(animations figées à l'instant du relevé, sinon on attrape une frame où le jeton
a déjà disparu). On y lit la règle du §12 : **POT 1.5bb** avec **+3bb** en
attente au-dessus, pendant que le jeton `3bb` parcourt l'axe joueur → pot. Le
pot ne prendra sa valeur qu'à l'arrivée.
