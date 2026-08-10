# SharkSolver — Matrice de certification

**Statut global : NON CERTIFIÉ — en attente de validation humaine.**
Ce document présente les preuves obtenues, domaine par domaine. Les statuts qui y
figurent sont *proposés d'après les mesures*, pas décrétés. Aucun domaine ne doit être
annoncé « certifié » tant que cette matrice n'a pas été relue et validée.

Généré le 6 août 2026 · moteur : évaluateur 1.0.0 · équité 1.0.0 · push/fold 1.0.0 ·
CFR 2.0.0 · ICM 1.0.0 · PKO 0.9.0
Reproduction : `npm run test:certify` (~120 s) · seed maîtresse **20260806**

---

## 1. Comment lire cette matrice

Un statut décrit **le niveau de preuve**, pas la qualité perçue du code :

| Statut | Signification |
|---|---|
| **Vérifié** | Différentiel exhaustif ou preuve analytique sur le domaine complet |
| **Comparé** | Confronté à des références indépendantes, écarts mesurés et bornés |
| **Bêta** | Fonctionne, mais le modèle comporte une approximation assumée non levée |
| **Expérimental** | Preuve partielle ; le domaine dépasse ce qui est démontré |
| **À certifier** | Aucune preuve dédiée produite à ce jour |

Deux règles de lecture, valables partout dans ce document :

1. **« Exact » n'a de sens qu'accompagné de ce qui est exact.** Une énumération
   exhaustive et un abattage exact sur board complet sont deux affirmations
   différentes ; la seconde n'implique rien sur la stratégie.
2. **Un maillon faible plafonne toute la chaîne.** Un moteur vérifié alimenté par des
   ranges heuristiques produit un résultat *expérimental*. C'est le principe appliqué
   par `deriveSolverTrustBadge`.

---

## 2. Matrice

| Domaine | Méthode | Référence | Preuve obtenue | Seuil retenu | Statut |
|---|---|---|---|---|---|
| Évaluateur 5 cartes | Énumération exhaustive | Implémentation indépendante | **2 598 960 mains** comparées — 0 divergence ; séparation stricte des 9 catégories | 0 erreur | **Vérifié** |
| Évaluateur 7 cartes | Max des 21 sous-mains | Implémentation indépendante | 60 000 comparaisons + 5 000 vérifications du max — 0 divergence | 0 erreur | **Comparé** |
| Équité — voie exhaustive | Énumération des runouts | Énumération indépendante | 6 spots flop/turn — écart < 1e-6 pt ; pondérations exactes | 1e-6 pt | **Vérifié** |
| Équité — Monte-Carlo | Échantillonnage seedé | Voie exhaustive du même spot | Écart max **0,308 pt = 2,14 SE** sur 10 spots × 2 tailles ; dispersion inter-seeds 0,418 pt vs 0,438 théoriques | 4 SE | **Comparé** |
| Équité — invariants | — | Propriétés mathématiques | Symétrie, bornes, permutation de couleurs, card removal, ranges pondérées | exact | **Vérifié** |
| Push/fold ChipEV | Jeu matriciel à somme nulle | `validate.mjs` (existant) | Couvert par la suite historique ; **aucun différentiel indépendant produit dans cet audit** | à définir | **À certifier** |
| ICM (Malmuth-Harville) | Récursion exhaustive | Cas analytiques (`validate.mjs`) | Couvert par la suite historique ; non retesté ici | tolérance numérique | **À certifier** |
| PKO | Modèle PokerForge | Tests directionnels | Prime propre **non modélisée** (terme du second ordre assumé) | directionnel | **Bêta** |
| CFR rivière (1 rue) | CFR+ | Jeu de clairvoyance (solution analytique) | Bluffs **25,0 / 33,1 / 40,0 %** vs théorie 25,0 / 33,3 / 40,0 ; calls 67,7 / 50,7 / 32,2 vs 66,7 / 50,0 / 33,3 ; NashConv **0,0177 bb** à 2 000 itérations | NashConv ≤ 0,35 bb | **Comparé** |
| CFR multi-rue | CFR+ · sous-arbres par carte | Benchmark historique | NashConv 0,006 bb (2 rues) ; **runouts échantillonnés → exploitabilité exacte indisponible** | NashConv ≤ 0,3 bb | **Expérimental** |
| Règle de mise à jour CFR+ | CFR+ sur jeu jouet | **Kuhn poker**, équilibre connu | Valeur **−0,05691** vs −1/18 = −0,05556 ; rapport roi/valet **3,00** vs 3,00 théorique | écart ≤ 0,01 | **Comparé** *(algorithme seul — voir §4)* |
| CFR multijoueur | — | — | **Hors périmètre** : le moteur est heads-up par construction | — | **Non pris en charge** |
| Badge de confiance | Fonction pure | Règles du cahier des charges | 51 assertions : maillon faible, seuils, couleurs distinctes des actions | — | **Vérifié** |

---

## 3. Périmètres exacts, domaine par domaine

### Évaluateur
- **Définition.** `eval5i` associe à 5 cartes un entier comparable ; `eval7i` retourne le
  maximum sur les 21 sous-mains de 5.
- **Ce qui est prouvé.** Les 2 598 960 mains de 5 cartes ont été évaluées et comparées à
  une implémentation écrite séparément (catégories nommées + tie-breaks lexicographiques,
  aucune ligne partagée). Les deux induisent le **même ordre**. La séparation stricte des
  catégories a été vérifiée : le score maximal d'une catégorie est inférieur au score
  minimal de la suivante, pour les 8 frontières.
- **Ce qui n'est pas prouvé.** Le 7 cartes est échantillonné (C(52,7) = 133 784 560 rend
  l'exhaustif déraisonnable dans une suite de tests).
- **Précondition connue.** L'évaluateur **ne se défend pas** contre les cartes dupliquées :
  les appelants garantissent des cartes distinctes via le card removal. C'est une
  précondition documentée, pas un défaut — mais tout nouvel appelant doit la respecter.

### Équité
- **Définition.** Part du pot revenant à Hero à l'abattage, égalités comptées pour moitié.
- **Bascule exhaustif / Monte-Carlo** décidée par un budget de coût. Les deux voies ont
  des niveaux de preuve différents et **ne doivent pas porter le même badge**.
- **Tolérance.** Dérivée de l'erreur standard binomiale `SE = √(p(1−p)/n)`, jamais d'un
  forfait. Démonstration chiffrée : un seuil fixe de ±1,7 pt vaut **11,8 SE** à
  n = 120 000 (il accepterait des erreurs massives) mais **0,5 SE** à n = 200 (il
  signalerait du bruit normal). Un seuil unique ne peut pas être juste aux deux bouts.
- **Absence de biais.** Sur 24 seeds à n = 4 000, la dispersion mesurée est de 0,418 pt
  contre 0,438 pt prédits par la théorie — l'estimateur se comporte comme attendu.

### Push/fold
- **Exact, mais dans un modèle précis** : heads-up, chip-EV pur, arbre jam/fold,
  card removal exact au niveau des classes. Hors de ce cadre, l'affirmation ne tient plus
  — en particulier sur la bulle, où l'ICM change la décision.
- **Preuve manquante.** Cet audit n'a pas produit de différentiel contre une source
  indépendante. C'est le principal trou de la matrice.

### CFR
- **Rivière (board complet).** Les abattages sont évalués exactement : plus aucun runout
  n'est échantillonné. L'exploitabilité `NashConv` y est donc réelle. La **stratégie**
  reste une approximation itérative — les deux faits doivent être énoncés ensemble.
- **Flop / turn.** Runouts échantillonnés : l'exploitabilité exacte n'est pas disponible.
- **NashConv suppose la somme nulle.** L'identité `NashConv = brEV(Hero) + brEV(Vilain)`
  n'est valide qu'à somme nulle. À 3 joueurs sous ICM, les jetons transférés déplacent
  l'équité de joueurs absents du coup : la métrique perd son sens et ne doit pas être
  affichée. À exactement 2 joueurs, elle reste valide même en ICM.

### ICM / PKO
- ICM : Malmuth-Harville, exact **dans son modèle** (probabilité de sortie proportionnelle
  aux tapis) — hypothèse forte qui n'est pas la réalité du jeu.
- PKO : la prime propre du joueur n'est pas modélisée (terme du second ordre). Le modèle
  est asymétrique par construction : chacun ne gagne qu'en éliminant l'autre. Statut bêta
  assumé, jamais présenté comme un solve PKO complet.

---

## 4. ⚠ Ce que le test de Kuhn ne prouve pas

`solveTree(heroList, villList, board)` est **structurellement de forme hold'em**. Kuhn
poker ne peut pas y passer : il est résolu par un harnais minimal écrit dans le fichier de
test.

**Conséquence à ne jamais perdre de vue :** un Kuhn vert atteste que la règle de regret
matching CFR+ converge vers l'équilibre là où on sait le vérifier analytiquement. Il
n'atteste **rien** sur le code d'arbre réellement livré. Ce qui certifie le chemin de
production, ce sont les tests de niveau A — clairvoyance, discrimination par force de
main, exploitabilité sur board complet.

La distinction est explicite dans `test-solver-reduced-games.mjs`, qui sépare
visuellement « NIVEAU A — chemin de PRODUCTION » et « NIVEAU B — règle CFR+ seule ».

---

## 5. Limite dominante : les ranges d'entrée

Tous les résultats CFR de cette matrice sont obtenus sur des ranges **fournies par le
test**. En production, les ranges d'entrée sont **heuristiques** (`preflopRanges.js`,
fréquences écrites à la main).

C'est la limite qui domine toutes les autres : un solve exact sur des ranges devinées
reste une réponse exacte à la mauvaise question, et la composition de range pilote
l'essentiel de la stratégie postflop. Aucune amélioration de la précision du CFR ne
compensera cela.

C'est précisément ce que traduit le badge : *moteur comparé + ranges heuristiques →
**Expérimental***.

---

## 6. Seuils d'acceptation retenus

| Mesure | Seuil | Justification |
|---|---|---|
| Différentiel évaluateur | 0 divergence | Un ordre erroné fausse tout abattage |
| Équité exhaustive vs référence | 1e-6 pt | Bruit flottant uniquement |
| Équité Monte-Carlo | 4 SE | ≈ 99,99 % sous hypothèse normale : un échec signale un biais, pas de la malchance |
| NashConv rivière | ≤ 0,35 bb | Ordre de grandeur des benchmarks à ranges larges |
| Clairvoyance (calls) | ±10 pt | Tient compte de l'abstraction de range du test |
| Clairvoyance (bluffs) | ±6 pt | Idem, quantité plus stable |
| Kuhn (valeur du jeu) | ≤ 0,01 | Convergence CFR sur 30 000 itérations |

---

## 7. Trous connus — à traiter avant toute revendication de certification

1. **Push/fold** : aucun différentiel indépendant. Domaine pourtant affiché aujourd'hui
   comme « calcul exact » dans le Trainer.
2. **ICM / PKO** : non retestés dans cet audit ; s'appuient sur la suite historique.
3. **Évaluateur 7 cartes** : échantillonné, non exhaustif.
4. **Multi-rue** : pas d'exploitabilité exacte (runouts échantillonnés) — limite
   théorique, pas un défaut d'implémentation.
5. **Ranges de production** : heuristiques, non certifiables en l'état.
6. **Stratégies hors-chemin** : CFR n'accumule aucun regret aux infosets non atteints et
   n'y offre donc aucune garantie. Lire une stratégie à un nœud non atteint et en tirer
   une conclusion est une erreur de méthode — constatée puis documentée pendant cet audit.

---

## 8. Reproduction

```bash
npm run test:certify   # 8 suites, 243 assertions, ~120 s, seed 20260806
npm run test:solver    # suite historique — 178 ✓ / 0 ✗ (inchangée)
npm run bench:solver   # benchmarks historiques (inchangés)
```

Toutes les suites fixent leurs seeds. Deux exécutions successives produisent des
résultats identiques.
