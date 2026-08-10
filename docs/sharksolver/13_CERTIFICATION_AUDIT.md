# 13 — Rapport d'audit de certification (phase 1)

**Périmètre : fondations + preuve.** Aucune fonctionnalité ajoutée, aucun changement
d'interface, aucune modification des mathématiques.
Matrice associée : [`docs/sharksolver-certification-matrix.md`](../sharksolver-certification-matrix.md)

---

## 0. Résumé exécutif — les cinq faits qui comptent

1. **L'évaluateur est le premier domaine réellement vérifié.** Les 2 598 960 mains de
   5 cartes ont été comparées à une implémentation indépendante : **0 divergence**, et la
   séparation stricte des 9 catégories est établie. Ce n'est plus « des assertions
   passent » — c'est un périmètre complet.

2. **À trois reprises, le test était faux et le moteur avait raison.** Formule de bluff
   erronée, prémisse de sizing invalide, lecture d'une stratégie mixte en ignorant la
   relance : chaque fois, l'investigation a confirmé le moteur. C'est un signal de
   qualité — mais il rappelle surtout qu'un test qui échoue doit être instruit, jamais
   « ajusté » jusqu'à passer.

3. **Le CFR retrouve la théorie au dixième de point.** Sur le jeu de clairvoyance, les
   proportions de bluff mesurées sont 25,0 / 33,1 / 40,0 % contre 25,0 / 33,3 / 40,0 %
   attendus. Sur Kuhn, le rapport roi/valet vaut **3,00** contre 3,00 théorique.

4. **La tolérance forfaitaire est réfutée chiffres à l'appui.** Le ±1,7 pt hérité d'un
   benchmark préflop vaut **11,8 erreurs standard** à n = 120 000 et **0,5** à n = 200.
   Un seuil unique ne peut pas être juste aux deux bouts ; toutes les tolérances Monte-
   Carlo sont désormais dérivées de `√(p(1−p)/n)`.

5. **La limite dominante n'est pas le solveur, ce sont ses entrées.** Les ranges de
   production sont heuristiques. Aucun gain de précision du CFR ne compensera cela, et
   c'est exactement ce que le badge traduit : *moteur comparé + ranges heuristiques →
   Expérimental*.

---

## 1. Ce qui a été construit

| Module | Rôle |
|---|---|
| `src/solver/certification/types.js` | Provenance du calcul, provenance des entrées, convergence, incertitude, cadre théorique. Taxonomie d'exactitude à 5 niveaux + `classifyExactness()`. Typedefs JSDoc. |
| `src/solver/certification/trustBadge.js` | `deriveSolverTrustBadge()` — badge dérivé du **maillon le plus faible**, avec désignation du maillon responsable. |
| `src/solver/certification/flags.js` | Trois drapeaux, **tous à `false`**. Une valeur non reconnue laisse le drapeau désactivé (comportement sûr). |

Pourquoi du JSDoc et non du TypeScript : `src/` est en JavaScript pur — le `tsconfig.json`
du dépôt ne couvre que `prisma/**`. Les typedefs JSDoc apportent l'autocomplétion et la
vérification par l'IDE sans imposer une conversion du projet.

---

## 2. Définitions exactes des métriques

Une métrique dont la définition est floue peut être invoquée pour prouver n'importe quoi.

| Métrique | Définition | Domaine de validité |
|---|---|---|
| **NashConv** | `brEV(Hero) + brEV(Vilain)` : somme des gains qu'obtiendrait chaque joueur en jouant sa meilleure réponse contre la stratégie moyenne adverse. ≈ 0 ⟺ équilibre. | **Jeux à somme nulle uniquement.** L'identité suppose la somme nulle. À 3 joueurs sous ICM, elle est fausse. |
| **Exploitabilité** | Même quantité, exprimée par joueur (NashConv / 2). | Idem. |
| **Regret moyen** | Moyenne des regrets cumulés positifs par infoset, divisée par le nombre d'itérations. Tend vers 0. | Tout arbre CFR. |
| **Stabilité de stratégie** | Variation de la stratégie moyenne entre deux fenêtres d'itérations. | Diagnostic, pas une preuve d'équilibre. |
| **Erreur standard (équité)** | `SE = √(p(1−p)/n)`, `p` la proportion estimée, `n` le nombre de tirages. Exprimée en points de pourcentage. | Estimateurs par échantillonnage. |
| **Écart en σ** | `|mesure − référence| / SE`. Rend les écarts comparables entre tailles d'échantillon. | Idem. |

**Ce que NashConv ne dit pas.** Une valeur faible atteste que la paire de stratégies est
proche d'un équilibre **dans l'arbre et les ranges donnés**. Elle ne dit rien sur la
pertinence de cet arbre ni de ces ranges. Un solve parfaitement convergé sur de mauvaises
ranges reste une réponse exacte à la mauvaise question.

---

## 3. Assertions par catégorie

| Suite | Assertions | Nature de la preuve |
|---|---|---|
| `test-solver-trust-badge.mjs` | 51 | Fondations : flags, taxonomie, cadre théorique, maillon faible, couleurs |
| `test-solver-evaluator.mjs` | 53 | Différentiel **exhaustif** 5 cartes + échantillonné 7 cartes + invariants |
| `test-solver-equity-exact.mjs` | 21 | Différentiel contre énumération indépendante |
| `test-solver-equity-invariants.mjs` | 19 | Propriétés mathématiques (symétrie, bornes, couleurs, card removal) |
| `test-solver-equity-mc.mjs` | 21 | Reproductibilité, convergence, absence de biais, loi en 1/√n |
| `test-solver-equity-differential.mjs` | 33 | Balayage 10 spots × 2 tailles, écarts en σ |
| `test-solver-reduced-games.mjs` | 28 | Niveau A (production) + niveau B (algorithme) |
| `test-solver-properties.mjs` | 17 | Propriétés universelles via `fast-check`, 200 cas chacune |
| **Total** | **243** | |

Le nombre d'assertions n'est **pas** la preuve principale. Le périmètre l'est :
2 598 960 mains exhaustives, 260 000 comparaisons d'ordre, 10 spots d'équité en
différentiel, 200 cas générés par propriété.

---

## 4. Couverture des branches critiques

| Branche | Couverte par | Reste |
|---|---|---|
| `computeEquity` → voie exhaustive | `equity-exact` (différentiel indépendant) | — |
| `computeEquity` → voie Monte-Carlo | `equity-mc`, `equity-differential` | — |
| `eval5i` / `eval7i` | `evaluator` (exhaustif 5c) | 7 cartes non exhaustif |
| `solveTree` board complet | `reduced-games` niveau A, `properties` | — |
| `solveTree` board incomplet | Benchmark historique | Pas d'exploitabilité exacte (limite théorique) |
| Regret matching CFR+ | `reduced-games` niveau B (Kuhn) | Ne certifie pas l'arbre de production |
| `solveMultiStreet` entrées vides | `properties` §5 → `NO_SOLUTION` | — |
| Card removal / combos bloqués | `equity-exact`, `properties` §6 | — |
| Push/fold | Suite historique uniquement | **Différentiel indépendant à produire** |
| ICM / PKO | Suite historique uniquement | **Non retestés dans cet audit** |

---

## 5. Seeds et reproductibilité

Seed maîtresse **20260806**, déclinée par suite (`^0x7777`, `^0xABCD`, `^0x1234`).
`fast-check` est lancé avec `seed: 20260806`. Les solves CFR utilisent des seeds
explicites (4242, 20260806, 99, 7).

Vérifié : deux exécutions successives de `npm run test:certify` produisent des résultats
identiques, y compris les valeurs affichées.

---

## 6. Écarts mesurés par rapport aux références

| Comparaison | Écart max | En σ | Seuil |
|---|---|---|---|
| Évaluateur 5 cartes vs référence indépendante | 0 | — | 0 |
| Évaluateur 7 cartes vs référence indépendante | 0 | — | 0 |
| Équité exhaustive vs énumération indépendante | < 1e-6 pt | — | 1e-6 |
| Équité Monte-Carlo vs exhaustive | **0,308 pt** | **2,14** | 4 σ |
| Clairvoyance — bluffs | 0,2 pt | — | 6 pt |
| Clairvoyance — calls | 1,1 pt | — | 10 pt |
| Kuhn — valeur du jeu | 0,00135 | — | 0,01 |
| Kuhn — rapport roi/valet | 0,00 | — | 1,2 |

---

## 7. Audit terminologique du mot « exact » (§3)

Les occurrences de « exact » dans `src/solver` sont majoritairement des **commentaires
internes**, souvent déjà précis (« exact dans le modèle spécifié »). Le risque réel est
concentré sur les chaînes **affichées à l'utilisateur** — elles sont trois :

| Emplacement | Chaîne | Verdict |
|---|---|---|
| `provenance.js` — `ICM_ESTIMATE.desc` | « calculée exactement, mais ce n'est PAS un solve ICM/GTO complet » | **Correct** — dit ce qui est exact et ce qui ne l'est pas |
| `provenance.js` — `EXACT_CALCULATION.label` | « Calcul exact » | **À qualifier** — le libellé seul est nu ; sa description (« énumération exhaustive, sans échantillonnage ») le sauve, mais elle n'est visible qu'en survol |
| `TrainerTab.jsx:6578` | « SOLUTION SOLVEUR — calcul exact » | **À qualifier — priorité** : concerne le push/fold, exact seulement *dans son modèle* (heads-up, chip-EV, arbre jam/fold). C'est la chaîne la plus visible du produit, et le domaine dont la matrice signale justement l'absence de différentiel indépendant. |

**Aucune de ces chaînes n'a été modifiée** : la §13 prime sur la §3 pour l'existant. Les
libellés qualifiés vivent derrière `SHARKSOLVER_TRUST_BADGES`, à valider avant publication.

---

## 8. Défauts trouvés — et ce qu'ils enseignent

**Aucun défaut du moteur n'a été mis en évidence.** Les trois échecs rencontrés venaient
des tests :

1. **Formule de bluff erronée.** J'avais écrit `b/(P+P)`… en réalité `b/(P+b)`, qui est la
   fréquence de *fold* du Vilain, alors que la proportion de bluffs vaut `b/(P+2b)`. Deux
   quantités voisines, facilement confondues. Le solveur donnait la bonne réponse depuis
   le début.
2. **Prémisse de sizing invalide.** Avec une range de nuts pures, le Vilain ne paie jamais :
   toutes les tailles rapportent le pot et le solveur est *légitimement* indifférent. Il
   n'y avait aucune domination à détecter.
3. **Lecture de stratégie mixte incomplète.** Le monstre « ne payait pas » (0 %) — il
   **relançait** à 99,99 %. Mesurer une action en ignorant ses alternatives est un piège
   classique ; la fréquence de *fold* est la quantité non ambiguë.

S'y ajoute une **limite théorique constatée** : au nœud « je checke puis je fais face à
une mise », les nuts affichaient 0,5 % de call. Non par erreur, mais parce que ce nœud est
**hors-chemin** pour elles. CFR n'accumule aucun regret aux infosets non atteints et n'y
offre aucune garantie. Toute lecture de stratégie doit vérifier que le nœud est atteint.

---

## 9. Preuve de non-régression

| Contrôle | Résultat |
|---|---|
| `npm run test:solver` | **178 ✓ / 0 ✗** — identique à avant l'audit |
| `npm run bench:solver` | 8/8 équité, 9/9 multi-street — identique |
| `npm test` (suite complète) | Verte, certification incluse |
| Fichiers d'UI modifiés | **Aucun** — `TrainerTab.jsx`, `ReplayerTab.jsx`, `SharkSolverTab.jsx` intacts |
| Fichiers de moteur modifiés | **Aucun** |
| Seul fichier existant modifié | `package.json` (ajout de scripts) |
| Drapeaux de certification | Tous à `false` |

Le Trainer et le Replayer se comportent donc exactement comme avant : rien de ce qu'ils
exécutent n'a été touché.

---

## 10. Livrables §14 — état

| # | Livrable | État |
|---|---|---|
| 1 | Rapport d'audit | ✅ ce document |
| 2 | Matrice de certification | ✅ `docs/sharksolver-certification-matrix.md` |
| 3 | Définitions des métriques | ✅ §2 |
| 4 | Assertions par catégorie | ✅ §3 |
| 5 | Couverture des branches critiques | ✅ §4 |
| 6 | Benchmarks reproductibles | ✅ `npm run test:certify` |
| 7 | Seeds utilisées | ✅ §5 |
| 8 | Écarts par rapport aux références | ✅ §6 |
| 9 | Limites théoriques connues | ✅ §8 et matrice §3/§5 |
| 10 | Route de démonstration | ⏸ phase suivante (dépend d'une UI volontairement désactivée) |
| 11 | Captures des badges | ⏸ idem |
| 12 | Preuve de non-régression | ✅ §9 |

---

## 11. Suite recommandée, par ordre de valeur

1. **Différentiel push/fold contre une source indépendante.** C'est le trou le plus gênant :
   le domaine est affiché « calcul exact » dans le produit alors qu'il est le moins prouvé
   de la matrice.
2. **Intervalles de confiance Monte-Carlo (§4)** — l'instrumentation est prête côté
   badge (`UncertaintyEvidence`), il reste à l'exposer dans `computeEquity` de façon
   additive, avec critère d'arrêt sur largeur d'intervalle.
3. **Câbler `EquilibriumScope` (§5)** pour interdire structurellement les libellés
   d'équilibre hors des cas à somme nulle.
4. **Retester ICM / PKO** avec des cas analytiques dédiés.
5. **Range Library (§11)** puis, seulement ensuite, l'UI de certification derrière les
   drapeaux.

**Aucune revendication de certification ne doit être publiée avant validation humaine de
la matrice.**
