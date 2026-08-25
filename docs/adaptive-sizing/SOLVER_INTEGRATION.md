# INTÉGRATION SHARKSOLVER — PokerForge Adaptive Sizing Engine

> Mission §12, §13, §21, §22, §23 → §27, §57, §58, §59, §63, §80, §82, §97.

---

## 1. Un seul point de contact

`sizing/solverAdapter.js` est le **seul** module de PFASE qui importe
`solver/api.js`. Tout le reste de `sizing/` ignore l'existence du CFR.

```js
solveTreeSpec({ state, heroRange, villainRange, treeSpec, config, optimizeFor, signal })
  → { ok, status, ev, solution, convergence, abstraction, instrumentation, partialReasons }
```

Deux règles non négociables y sont appliquées :

1. **Un solve échoué renvoie `ok:false`.** Jamais une stratégie de repli (§22).
2. **Ce que le solveur ne sait pas mesurer n'est pas inventé** : sur board
   incomplet, `nashConv` vaut `null` **avec sa raison**, pas un nombre.

---

## 2. Ce qui a été ajouté au Game Tree Engine — et pourquoi c'est additif

`core/gametree.js` v3. Sans les nouvelles options, l'arbre produit est **identique**
à la v2 : mêmes labels, mêmes montants, même nombre de nœuds. C'est vérifié par
comparaison structurelle exacte (`test-sizing-gametree.mjs` : `{decision:100,
chance:9, terminal:161, maxDepth:9, total:270}`).

| Option | Rôle | Mission |
|---|---|---|
| `betSizes[]` accepte des `SizingSpec` | pot %, géométrique, bb, jam | §6 |
| `betSizesByPlayer` | sizings **asymétriques** | §10 |
| `raiseSizes[]` | plusieurs sizings de relance | §6 |
| `raiseSizesByPlayer` | relances asymétriques | §10 |
| `allowJam` | action all-in **explicite** (label `J`) | §74 |
| `minBet`, `bb` | plancher légal et unité | §6, §7 |

Le chemin adaptatif n'est emprunté que si l'appelant utilise explicitement une de
ces options (`usesAdaptiveSizing`). Un tableau de nombres nus reste le chemin v2,
octet pour octet.

**Pourquoi l'asymétrie est indispensable** : elle est la seule façon de mesurer le
coût d'une simplification (ALGORITHM.md §5.1). Sans elle, la perte d'EV n'a pas de
définition sous laquelle elle est garantie positive.

**Légalité des relances** : dans le chemin adaptatif, un sizing de relance sous le
minimum légal est **écarté**, pas relevé au minimum. Relever ferait entrer dans
l'arbre un sizing que personne n'a demandé, et le ferait ensuite déduplifier
contre un vrai (§34).

---

## 3. Deux corrections de fond dans `solver/api.js`

### 3.1 La signature de cache décrivait les ranges, pas l'arbre (§63)

Avant : `effStack`, `raiseMult`, `maxRaisesPerStreet` et `ipProbe` **n'entraient
pas** dans la clé. Deux solves d'un même board et de mêmes ranges à des **tapis
différents** partageaient le même `solveId` : le second était servi depuis la
bibliothèque avec la stratégie du premier.

C'est exactement la collision que §63 interdit, et elle rendait PFASE impossible
— tout son principe est de solver le **même spot** avec des arbres différents.

Correction : tout ce qui change la forme de l'arbre entre dans la clé
(préfixe de version `ms2|`). Même correction, plus légère, sur `solveSubgame`
(`runouts`, `raiseMult`).

### 3.2 Les micro-solves ne doivent pas peupler la bibliothèque (§13)

`solver/library.js` garde jusqu'à 500 solutions **complètes** en mémoire, tables
de stratégie comprises. C'est le bon compromis pour des solves d'analyse, qu'on
relit. Ce n'en est pas un pour PFASE, qui enchaîne 10 à 40 micro-solves par spot,
dont **aucun n'est une solution**.

Correction : option `noStore`. `solverAdapter` la pose sur tous les solves
d'évaluation ; seul le solve final (`persistSolve: true`) entre en bibliothèque.

Sans cela, le banc d'essai tombait à court de tas dès le 9ᵉ spot.

---

## 4. Garde-fou mémoire (§57)

`estimateSolveMemory` construit l'arbre (quelques millisecondes) et somme :

```
octets ≈ Σ_{nœuds de décision} contextes(street) × combos × actions × 8 × 2 × 12
```

Deux erreurs ont dû être corrigées avant qu'il soit utile :

* `maxCombos: 0` signifie « range **non plafonnée** » côté solveur ; l'estimateur
  le lisait comme « zéro combo » et concluait à un coût nul — le garde-fou ne se
  déclenchait donc jamais. Il compte désormais les combos **réellement** solvés.
* le modèle arithmétique ignorait le surcoût des objets JS. Mesuré : 18 Mo
  estimés contre 211 Mo réels → facteur **12**, empirique et déclaré.

En dépassement, la dégradation est ordonnée et **annoncée** : profondeur d'abord,
abstraction ensuite, refus explicite en dernier recours. Jamais un plantage.

---

## 5. Précision et convergence (§12, §21)

`SizingEvaluationConfig` est explicite et **voyage avec le résultat** :

```js
{ evaluationDepth, maxIterations, maxIterationsCeiling, autoEscalate,
  maxCombos, convergenceTarget, convergenceProbe, timeBudgetMs, seed,
  memoryGuard, persistSolve }
```

Une comparaison rapide et une solution complète ne sont pas équivalentes ; le
niveau de précision n'est jamais caché. `partialReasons` énumère chaque réserve :
profondeur bornée, range abstraite, budget dépassé, dégradation mémoire.

`convergenceProbe` et `autoEscalate` sont **deux réglages distincts** : mesurer la
dérive et agir dessus sont deux décisions. Les confondre revenait à doubler en
silence la précision demandée par l'appelant.

---

## 6. Exécution hors du thread principal (§58, §59)

`pfase.worker.js` reçoit et renvoie **exclusivement** du plain-data. C'est la
raison d'être de `strategyExtract` : les accesseurs `avgOf`/`aggAt` sont des
closures que le structured clone refuse.

Le nettoyage de sortie est **défensif par nécessité** : sur un échec,
l'optimisation renvoie un objet partiel. Une exception dans le nettoyage masquait
le vrai motif derrière un « Cannot read properties of undefined » — constaté en QA
navigateur.

`pfaseClient.js` refuse par défaut le calcul sur le thread principal
(LIMITATIONS L10) et annule à deux niveaux : coopératif, puis terminaison du
Worker après 1.5 s de grâce.

---

## 7. Interface (§23 → §27)

`src/components/solver/AdaptiveSizingPanel.jsx`. Le panneau ne calcule **aucun**
état de jeu : il reçoit `stateInput`, construit dans `SharkSolverTab` à partir des
mêmes grandeurs que le reste de l'écran (§7).

| Section | Mission |
|---|---|
| Betting Structure : Automatic · Dynamic · Single Size · Fixed | §23 |
| Complexité : Single · Simple · Advanced · Full, avec plafonds `1B/1R`… | §23, §5 |
| Bet sizes / Raise sizes à comparer, géo, JAM | §24 |
| Unités `%` · `e` · `x` · `JAM` (jamais « AI ») | §25 |
| Perte d'EV acceptable | §16 |
| Préréglages PF Automatic / Single Size / Simple / Advanced / Full | §27 |
| Progression par phase + annulation | §22, §59 |
| Résultat : sizings retenus, comparés, EV, perte, **plancher de mesure**, écart d'EV entre sizings, exploitabilité, provenance, réserves, traçabilité | §14, §15, §18, §21, §36 |
| Tableau FULL → SINGLE | §110 |

Vérifié au navigateur (`npm run audit:sizing:ui`), pas en lisant le JSX :
badge `PF SOLVED`, `SINGLE`, retenu `33 %`, comparés `JAM · 33 % · 75 % · 150 %`,
perte `−0.001 bb`, plancher `0.010 bb`, avertissement de non-distinguabilité
affiché, exploitabilité `0.0183 bb (NashConv exact)`.

---

## 8. Cohabitation avec le moteur historique (§82)

Le panneau multi-rue existant reste en place, **avec son arbre imposé**
`betSizes:[0.33,0.75]`. §82 interdit de retirer le moteur historique avant
validation en production. Les deux sont visibles côte à côte, et leur différence
de nature est écrite dans le code :

> Le moteur multi-rue ci-dessous résout UN arbre IMPOSÉ (constantes littérales du
> code). Ce panneau-ci fait l'inverse : il CHOISIT les sizings en comparant les EV
> de sous-arbres réellement résolus, puis résout l'arbre retenu.
