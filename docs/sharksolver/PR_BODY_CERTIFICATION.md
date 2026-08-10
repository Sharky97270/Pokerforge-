# feat(solver) : audit de certification SharkSolver — matrice de preuve

Branche : `feature/trainer-cfr-3bet-pots` → `main`
Commits : `726fedf` (état des lieux) · `661de1c` (phase 1) · `c3846af` (phase 2)

> *Le nom de branche est hérité du chantier précédent (déjà mergé en PR #11). Le contenu
> de cette PR est exclusivement l'audit de certification.*

---

## Intention

Faire passer SharkSolver d'un moteur techniquement solide à un moteur dont **chaque
domaine a un niveau de fiabilité mesuré, traçable et affiché honnêtement**.

Ce n'est volontairement **pas** une PR de fonctionnalités. Aucune capacité nouvelle n'est
offerte à l'utilisateur : on produit de la **preuve** sur ce qui existe déjà.

Le problème traité est précis. Jusqu'ici, un seul badge sortait du moteur, alors que la
confiance réelle dépend d'une chaîne :

```
fiabilité du moteur × provenance des entrées × convergence × incertitude × cadre du jeu
```

Un moteur vérifié nourri de ranges heuristiques ne produit pas un résultat vérifié. Noter
cette chaîne par son maillon le plus solide était l'erreur à corriger.

---

## 1. Fondations

| Module | Rôle |
|---|---|
| `certification/types.js` | Provenance du calcul / des entrées / convergence / incertitude / cadre théorique. Taxonomie d'exactitude à 5 niveaux. |
| `certification/trustBadge.js` | Badge dérivé du **maillon le plus faible**, avec désignation du maillon responsable. |
| `certification/flags.js` | 3 drapeaux, **tous `false`**. Une valeur non reconnue laisse désactivé. |

**Taxonomie d'exactitude.** « Exact » sans complément est une affirmation vide : exact par
rapport à quoi ? Les cinq niveaux forcent la question — une énumération exhaustive et un
abattage exact sur board complet sont deux choses différentes, et la seconde n'implique
rien sur la stratégie.

**Badge par le maillon faible.** Règle centrale : *moteur vérifié + ranges heuristiques →
résultat **Expérimental***. Le badge indique toujours **quel** maillon l'a plafonné, pour
qu'on sache quoi améliorer plutôt que de deviner. Palette distincte de celle des actions
poker : confondre « ce résultat est fiable » et « cette action est un call » est le genre
d'ambiguïté qui fait prendre une couleur pour un conseil.

---

## 2. Preuve — 11 suites, 389 assertions, seed `20260806`

### Évaluateur — le premier domaine réellement **vérifié**
Différentiel contre une implémentation écrite séparément, dans un style délibérément
différent (catégories nommées + tie-breaks lexicographiques) pour que les bugs ne se
corrèlent pas.

- **2 598 960 mains de 5 cartes** — le périmètre **complet**, pas un échantillon
- **0 divergence** · séparation stricte des 9 catégories vérifiée sur les 8 frontières
- 7 cartes : 60 000 comparaisons échantillonnées (C(52,7) = 133 M rend l'exhaustif
  déraisonnable en suite de tests — dit explicitement)

### Équité — 4 suites, tolérances dérivées de l'erreur standard
Le ±1,7 pt hérité d'un benchmark préflop est **réfuté chiffres à l'appui** : il vaut
**11,8 erreurs standard** à n = 120 000 (il accepterait des erreurs massives) et **0,5** à
n = 200 (il signalerait du bruit normal). Un seuil unique ne peut pas être juste aux deux
bouts. Tout passe désormais par `√(p(1−p)/n)`.

- Écart max exhaustif ↔ Monte-Carlo : **0,308 pt = 2,14 σ** (seuil 4 σ)
- **Absence de biais établie** : dispersion inter-seeds **0,418 pt** contre **0,438**
  prédits par la théorie

### Push/fold — vérification d'équilibre indépendante
`solvePushFold` résout déjà par fictitious play : en réécrire un aurait partagé
l'algorithme, donc ses biais — preuve circulaire. Pour certifier un **équilibre**, on ne le
recalcule pas : on **vérifie qu'aucune déviation n'est profitable**, avec des fonctions de
gain et une pondération par card removal réécrites depuis la spécification du modèle.

- Exploitabilité **< 0,0025 bb**, reproduite **à 5 décimales** par le calcul indépendant
- **0 main** du mauvais côté de son seuil · monotonie (jam **68,7 % à 6bb → 35,6 % à 25bb**)

### Jeux réduits — deux niveaux à ne pas confondre
`solveTree(heroList, villList, board)` est de forme hold'em : **Kuhn ne peut pas y passer**.

- **Niveau A — production** : clairvoyance via `solveTree`. Bluffs **25,0 / 33,1 / 40,0 %**
  contre **25,0 / 33,3 / 40,0** théoriques. NashConv **0,0177 bb**.
- **Niveau B — algorithme seul** : Kuhn via un harnais séparé. Valeur **−0,05691** contre
  **−1/18**, rapport roi/valet **3,00** contre 3,00.
- **Un Kuhn vert ne certifie pas le solveur.** C'est écrit dans le fichier de test et
  répété dans la matrice — sans quoi une bonne nouvelle sur un jeu jouet se lirait comme
  une garantie sur le produit.

### ICM / PKO — des identités, pas des valeurs recopiées
**Σ équités = prizepool** sur 4 structures, dont le cas du joueur à 0 jeton
(historiquement fautif). Prime de risque **+6,5 pt** : il faut **56,5 % d'équité au lieu de
50 %** — le resserrement ICM, mesuré.

### Propriétés (`fast-check`, déjà présent)
Bornes, symétrie, distributions valides à chaque nœud, invariance par permutation de
couleurs, combos bloqués, entrées vides → `NO_SOLUTION`. 200 cas générés par propriété.

---

## 3. Deux ajouts au moteur, strictement additifs

**Intervalles de confiance (§4).** Une équité Monte-Carlo sans intervalle ne dit pas à quel
point on sait : « 46,2 % » sur 200 tirages et sur 200 000 sont deux affirmations très
différentes.

`computeEquity` ajoute `standardError`, `confidenceInterval95`, `confidenceLevel`,
`stoppingReason`, `elapsedMs`. Les champs historiques gardent **sens et type** ;
`monteCarloEquity` reste un adaptateur retournant un nombre, donc **aucun appelant cassé**.

Nouveau critère d'arrêt **sur la précision** plutôt que sur un budget : la cible de 1,0 pt
est atteinte en **38 500 tirages au lieu de 200 000**. La voie exhaustive n'expose aucun
champ d'incertitude — il n'y a rien à estimer.

**Cadre théorique (§5).** `NashConv = brEV(H) + brEV(V)` est une identité qui **suppose la
somme nulle**. Chaque solve porte désormais `equilibriumScope` et le booléen
`mayClaimNashApproximation`, vrai **uniquement** si le cadre l'autorise (exactement
2 joueurs) **et** si l'exploitabilité a été mesurée.

L'interface doit lire ce booléen plutôt que d'inférer depuis NashConv : une règle qu'on
reconstitue à plusieurs endroits finit par être oubliée à l'un d'eux. Balayage de
15 combinaisons (5 tailles × 3 types d'utilité) : **0 incohérence**.

---

## 4. Résultat de l'audit : aucun défaut du moteur

Les échecs rencontrés venaient **tous des tests**, et chaque investigation a confirmé le
moteur :

| Échec | Réalité |
|---|---|
| Proportion de bluffs « fausse » | Ma formule l'était : c'est `b/(P+2b)`, pas `b/(P+b)` (qui est la fréquence de *fold*) |
| Sizing dominé « non détecté » | Prémisse invalide : avec une range de nuts pures le Vilain ne paie jamais, l'indifférence est légitime |
| Monstre qui « se couche » | Il **relançait** à 99,99 % — mesurer une action en ignorant ses alternatives |
| Nuts qui « payent 0,5 % » | Nœud **hors-chemin** : CFR n'accumule aucun regret aux infosets non atteints |
| Push/fold « non monotone » | L'équilibre est **quasi pur** : comparer deux mains du même côté du seuil est vide de sens |

La dernière ligne de chaque colonne est une **limite documentée**, pas un correctif : ce
sont des précautions de lecture que la matrice conserve.

---

## 5. Non-régression

| Contrôle | Résultat |
|---|---|
| `npm run test:solver` | **178 ✓ / 0 ✗** — identique |
| `npm run bench:solver` | 8/8 équité, 9/9 multi-street — identique |
| `npm run build` | OK |
| Fichiers d'UI modifiés | **Aucun** (`TrainerTab`, `ReplayerTab`, `SharkSolverTab` intacts) |
| Fichiers existants modifiés | **3** : `api.js` (+23), `equity.js` (+87), `package.json` (+3) |
| Drapeaux de certification | Tous à `false` |
| Vérification navigateur | Trainer : table rendue, spot jouable, **0 erreur console** ; champs historiques de `computeEquity` confirmés intacts dans l'app |

---

## 6. Trous assumés, listés sans complaisance

1. **Matrice d'équité préflop** (`preflopEquity.js`) : artefact de données jamais certifié,
   bruit documenté ±0,26 pt. Le différentiel push/fold la consomme des deux côtés — un
   biais y serait invisible.
2. **Évaluateur 7 cartes** : échantillonné, non exhaustif.
3. **Multi-rue** : pas d'exploitabilité exacte (runouts échantillonnés) — limite théorique.
4. **Ranges de production** : heuristiques. C'est la **limite dominante** ; aucun gain de
   précision du CFR ne la compensera.
5. **Libellés** « calcul exact » : non modifiés dans cette PR. La §13 prime sur la §3 pour
   l'existant — la terminologie qualifiée attend derrière `SHARKSOLVER_TRUST_BADGES`.

---

## 7. Reproduction

```bash
npm run test:certify   # 11 suites, 389 assertions, seed 20260806
npm run test:solver    # 178 ✓ / 0 ✗ (inchangé)
npm run bench:solver   # inchangé
```

Toutes les suites fixent leurs seeds : deux exécutions successives donnent des résultats
identiques, valeurs affichées comprises.

---

## 8. Ce que cette PR ne prétend pas

**SharkSolver n'est pas « certifié ».** Les statuts de la matrice sont *proposés d'après
les mesures*, pas décrétés. La validation humaine reste requise avant toute revendication
publique — c'est la contrainte §14 du cahier des charges, et elle est respectée.

Documents à relire : [`docs/sharksolver-certification-matrix.md`](../sharksolver-certification-matrix.md)
et [`docs/sharksolver/13_CERTIFICATION_AUDIT.md`](13_CERTIFICATION_AUDIT.md).
