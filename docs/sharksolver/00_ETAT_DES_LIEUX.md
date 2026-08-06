# SharkSolver — état des lieux

*Comment il fonctionne, et comment il a été construit.*
Document de synthèse, à jour au 6 août 2026. Chiffres mesurés sur le code de `main`.

---

## 1. En une phrase

SharkSolver est le moteur mathématique de PokerForge : il tourne **entièrement dans le
navigateur**, calcule des équités et des stratégies d'équilibre, et **étiquette chaque
résultat selon sa provenance** pour qu'une estimation ne puisse jamais se faire passer
pour un calcul.

## 2. Le principe fondateur

> **« Le solveur calcule. L'IA explique. »**

Tout le reste en découle. Le risque qu'il combat est précis : une heuristique — des
fréquences écrites à la main — présentée à l'utilisateur comme une vérité GTO. Cela
paraît anodin ; en pratique c'est ainsi qu'on apprend de mauvais réflexes en croyant
s'appuyer sur les mathématiques.

La parade est structurelle, pas déclarative : **chaque valeur transporte sa provenance**
jusqu'à l'écran (`src/solver/provenance.js`), et le code de couleur de provenance est
délibérément distinct de celui des actions poker pour qu'on ne puisse pas les confondre.

| Provenance | Signification |
|---|---|
| `EXACT_CALCULATION` | Énumération exhaustive, déterministe |
| `CFR_SOLVE` | Stratégie résolue par CFR+ |
| `PRESOLVED_LIBRARY` | Solution déjà calculée, rechargée |
| `NUMERICAL_APPROXIMATION` | Monte-Carlo — comporte une marge d'erreur |
| `HEURISTIC_ESTIMATE` | Estimation codée à la main — **pas** un solve |
| `ICM_ESTIMATE` / `PKO_ESTIMATE` | Équité de tournoi exacte, mais **pas** un solve complet |
| `AI_EXPLANATION` | Texte pédagogique — ne modifie aucun chiffre |
| `NO_SOLUTION` | Rien de fiable à afficher |

`isCalculated()` répond à une seule question : a-t-on le droit d'écrire « GTO » sans mentir ?

---

## 3. Architecture

```
                     ┌─────────────────────────────────────────┐
   CONSOMMATEURS     │  SharkSolverTab · Trainer · Replayer     │
                     └────────────────────┬────────────────────┘
                                          │  (jamais le CFR en direct)
                     ┌────────────────────▼────────────────────┐
   API PUBLIQUE      │  src/solver/api.js                      │
                     │  provenance · convergence · cache        │
                     └────────────────────┬────────────────────┘
        ┌──────────────────┬──────────────┼──────────────┬──────────────────┐
        ▼                  ▼              ▼              ▼                  ▼
   ┌─────────┐      ┌────────────┐  ┌──────────┐  ┌──────────┐     ┌──────────────┐
   │evaluator│      │  equity    │  │   cfr    │  │ pushfold │     │  icm / pko   │
   │ 5 et 7  │      │ exact / MC │  │  CFR+    │  │  exact   │     │ Malmuth-H.   │
   └─────────┘      └────────────┘  └────┬─────┘  └──────────┘     └──────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │ gametree · multistreet│
                              └───────────────────────┘

   TRANSVERSE :  library (cache) → persist (IndexedDB) · provenance · explain
```

Règle d'architecture : **l'UI ne parle jamais au CFR directement**, toujours via
`api.js`. C'est ce qui garantit que provenance, convergence et cache sont attachés à
*tout* résultat, sans dépendre de la vigilance de chaque appelant.

---

## 4. Les moteurs, un par un

### Évaluateur — `core/evaluator.js`
Une carte est un entier 0-51 (`rang = c>>2`, `couleur = c&3`). `eval5i` réduit 5 cartes à
un score entier comparable, `eval7i` prend la meilleure des 21 combinaisons de 5 parmi 7.
Gère la quinte à l'as basse (A2345), les kickers et les égalités. Aucune dépendance.

### Équité — `core/equity.js`
Choisit **automatiquement** entre énumération exhaustive et Monte-Carlo selon le nombre
de runouts — et c'est ce choix qui fait basculer le badge entre `EXACT_CALCULATION` et
`NUMERICAL_APPROXIMATION`. Le Monte-Carlo est seedé (`mulberry32`) : même spot, même
résultat.

### Push/fold préflop — `core/pushfold.js` → **exact**
Le seul segment préflop réellement solvable dans un navigateur, et la raison est
structurelle : **toute main all-in va à l'abattage**, il n'y a donc aucune EV postflop à
estimer — il ne reste qu'une matrice d'équité et un jeu à somme nulle.

Le card removal est exact au niveau des classes : le poids d'une classe sachant la main
adverse vient de l'énumération des paires de combos **disjointes**. Un simple comptage
surestimerait lourdement les recouvrements (AA contre AA est le cas extrême).

*Limites assumées* : heads-up uniquement, chip-EV pur (aucune contrainte ICM), précision
bornée par la matrice d'équité (±0,26 pt).

### CFR — `core/cfr.js`, `core/gametree.js`, `core/multistreet.js`
CFR+ (regrets clampés à 0, moyennage pondéré par l'itération). L'arbre gère plusieurs
sizings, la relance (plafonnée), l'all-in écrêté au tapis.

Le point délicat du multi-rue : les infosets sont indexés **par (nœud, cartes révélées)**
— des sous-arbres par carte, construits paresseusement. Sur un board complet (rivière) il
n'y a plus rien à échantillonner : le solve est **exact** et l'exploitabilité réelle
(`NashConv`) devient calculable.

### ICM / PKO — `core/icm.js`
Probabilités de place par Malmuth-Harville, équité en $, prime de risque. Ces valeurs
peuvent aussi **entrer dans le calcul** de la stratégie (utilité terminale en $EQ plutôt
qu'en jetons), et pas seulement s'afficher à côté.

Un fait mathématique à connaître : **à 3 joueurs ou plus, le jeu n'est plus à somme
nulle** sous ICM — les jetons transférés déplacent l'équité de joueurs qui ne sont pas
dans le coup. `NashConv` y perd son sens et n'est donc pas affiché. À exactement
2 joueurs, la somme des équités est constante : la métrique reste valide.

### Explication — `explain.js`
Classe une décision (verdict, EV perdue, leak) et rédige un briefing. Contrainte : il ne
peut citer **que** des chiffres présents dans la solution. Il n'invente aucune fréquence.

---

## 5. Cache et persistance

`library.js` indexe chaque solution par un `SolveID` dérivé de la signature du problème
(ranges + board + options + graine). `persist.js` écrit en IndexedDB.

Deux pièges qui ont façonné la conception :

- **Les closures ne survivent pas au clonage structuré.** Les accesseurs de stratégie
  (`avgOf`/`aggAt`) sont des fonctions : une solution naïvement persistée revenait en
  renvoyant une stratégie uniforme — c'est-à-dire une **fausse** stratégie présentée
  comme un solve. D'où une fabrique unique d'accesseurs, partagée par le solve frais et
  le solve rechargé, et un rejet pur et simple d'un enregistrement incomplet.
- **Ne jamais persister sous une clé `pf_`** : `cloud.js` synchronise automatiquement
  toute clé `pf_` du localStorage vers Supabase — des mégaoctets de tables CFR partiraient
  sur le réseau à chaque écriture. IndexedDB échappe à ce mécanisme, et un solve est de
  toute façon recalculable.

---

## 6. Où le moteur est branché

| Consommateur | Ce qu'il utilise |
|---|---|
| **SharkSolverTab** | Toute l'API : équité, CFR mono/multi-rue, node lock, exploit, ICM/PKO, coach |
| **Trainer** | `solvePreflopPushFold` (exact) + **CFR postflop via Web Worker** |
| **Replayer** | `decisionAnalysis` s'appuie sur l'API |
| **fullHandEngine / postflopHeuristic** | `evaluator` seul (abattage réel) |

### L'intégration au Trainer
Le CFR est synchrone et coûte de 0,6 à 10 s : le lancer sur le fil principal gèlerait
l'entraînement. Il tourne donc dans un **Web Worker**, en pré-solve d'arrière-plan — le
spot reste jouable immédiatement avec la solution heuristique, et bascule sur la solution
CFR dès qu'elle arrive.

Le worker **consomme les accesseurs sur place** et ne renvoie que des nombres : les
closures ne traverseraient pas `postMessage`.

Couverture actuelle :

| Situation | Provenance |
|---|---|
| Push/fold préflop HU ≤ 30bb | 🦈 Solveur exact |
| Flop / turn — Héros mène ou fait face à une mise | 🦈 CFR expérimental |
| **Rivière** (les deux cas) | 🦈 **CFR exact** (NashConv réel) |
| Préflop open / 3-bet, multiway | ≈ Heuristique, ou 📊 chart si des données sont fournies |

---

## 7. Comment il a été construit

**Point de départ (audit, phase 1).** Tout vivait dans `SharkSolverTab.jsx`, un monolithe
de ~3 000 lignes mêlant moteur et interface. Le constat qui a tout déclenché : *les vraies
mathématiques existaient et étaient correctes*, mais **la stratégie affichée par défaut
était heuristique**, le CFR ne tournant que sur clic — et **rien dans l'interface ne
distinguait les deux**. Par ailleurs le serveur solveur et son edge function étaient
documentés mais **débranchés** (l'edge function était même absente du dépôt).

La séquence a été :

1. **Provenance d'abord.** Avant d'ajouter le moindre moteur : rendre visible ce qui est
   calculé et ce qui ne l'est pas. C'est le choix qui a structuré tout le reste.
2. **Isoler le cœur** hors du monolithe vers `src/solver/core/` — le CFR a été *déplacé
   octet pour octet*, jamais retapé, pour qu'aucune régression ne puisse se glisser.
3. **Rendre les métriques réelles** : convergence, exploitabilité, énumération exacte
   quand elle est possible. Fini les « n/d » et les valeurs décoratives.
4. **Ajouter les moteurs dans l'ordre** : arbre de jeu v2, CFR multi-rue, node lock,
   exploit, ICM, PKO, explication.
5. **Prouver** : suite de validation et benchmark contre des références publiées.
6. **V2** : persistance, ranges non plafonnées, ICM/PKO stratégiques.
7. **Intégrations** : Replayer, puis Trainer (push/fold, puis CFR postflop).

### Deux corrections qui valent d'être retenues

**La troncature de range.** Le plafonnement gardait les *premiers* combos dans l'ordre
d'insertion — soit les paires et les assortis, en supprimant la **totalité** des dépareillés.
Mesuré sur une range d'open BTN : 90 % de la range écartée, 744 combos dépareillés disparus
à chaque solve. Ce n'était pas une limite de performance mais un **bug de justesse** : le
solveur résolvait une autre range, bien plus forte, que celle saisie. Remplacé par une
réduction stratifiée qui préserve la forme de la range.

**Le modèle PKO.** La première version soustrayait la prime du héros lorsqu'il sautait.
Or sa propre prime n'est pas un actif qu'il détient : elle est sur sa tête et ne lui
revient qu'en gagnant. L'erreur doublait le coût du bust et **inversait la conclusion** —
une grosse prime faisait coucher *davantage*. Le test de direction l'a rattrapée.

Dans les deux cas, le bug était invisible à l'œil et n'a été révélé que par un test qui
vérifiait le *sens* du résultat, pas seulement son absence d'erreur.

---

## 8. Ce qui est prouvé

`npm run test:solver` → **178 assertions, 0 échec**
`npm run bench:solver` → **conforme**

| Contrôle | Résultat |
|---|---|
| Équité contre références publiées (8 scénarios) | écart ≤ 1,7 pt, tolérance respectée |
| Clairvoyance analytique (bluff/call théoriques) | ≤ 0,4 pt de la théorie |
| Exploitabilité 1 rue / avec relance / 2 rues | NashConv 0,037 / 0,038 / 0,006 bb |
| Rivière 120×120 combos, 2 sizings + relance | 1 271 ms, NashConv 0,036 bb |
| Flop 3 rues, 100×100 combos | 8 467 ms, reproductible |

Un NashConv proche de zéro signifie qu'aucun des deux joueurs ne gagnerait à dévier :
c'est la définition opérationnelle d'un équilibre.

---

## 9. Limites assumées

- **Ranges d'entrée heuristiques.** C'est la limite dominante : un solve exact sur des
  ranges devinées reste une réponse exacte à la mauvaise question. La composition de
  range pilote l'essentiel de la stratégie postflop.
- **Heads-up postflop uniquement.** Le multiway n'est pas modélisé.
- **Préflop profond non solvable en direct** — d'où l'infrastructure de charts
  (`preflopCharts.js`), inerte tant qu'aucune donnée n'est fournie.
- **Abstraction par classe de main** : la granularité des couleurs est perdue, ce qui
  compte sur les boards monotones.
- **ICM/PKO estimés**, jamais présentés comme des solves complets.

---

## 10. Où regarder dans le code

| Question | Fichier |
|---|---|
| Que veut dire ce badge ? | `src/solver/provenance.js` |
| Comment appeler le solveur ? | `src/solver/api.js` |
| Pourquoi le push/fold est-il exact ? | `src/solver/core/pushfold.js` (en-tête) |
| Comment marche le multi-rue ? | `src/solver/core/multistreet.js` |
| Pourquoi ce solve est-il lent/rapide ? | `core/gametree.js` + `maxCombos` / `iters` |
| Comment le Trainer l'utilise ? | `src/trainerPostflopSolver.js` + `solver/cfrPostflop.worker.js` |
| Est-ce prouvé ? | `src/solver/core/validate.mjs`, `benchmark.mjs` |

Documents voisins : `01_EXISTING_ARCHITECTURE_AUDIT.md` (le point de départ),
`02_SHARKSOLVER_CORE_ARCHITECTURE.md`, `06_SOLVER_API_SPEC.md`,
`10_SHARKSOLVER_LIMITATIONS.md`, `11_SHARKSOLVER_V2_ROADMAP.md`,
`12_HEURISTIC_SURFACE_AUDIT.md`.
