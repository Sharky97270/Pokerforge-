# MIGRATION — PokerForge Adaptive Sizing Engine

> Mission §2, §80, §81, §82, §97.

---

## 1. Rien n'a été supprimé

§2 et §82 sont explicites : la mise à jour est **additive**, et le moteur
historique ne doit pas disparaître avant validation en production.

Ce qui reste en place, intact et fonctionnel :

| Domaine | État |
|---|---|
| Ranges existantes, equity calculator, CFR, push/fold | inchangés |
| Paramètres de scénario, imports HH | inchangés |
| Trainer : templates de spots, `trainerSizing.js`, préréglages de mise, ledger, géométrie de table | inchangés |
| Replayer, Coach AI, profils adverses, GTO/Exploit | inchangés |
| 1T / 2T / 3T / 4T, Full Hand, Sessions | inchangés |
| Historique des solutions (`solver/library.js`) | inchangé, sauf `noStore` (opt-in) |
| Comptes utilisateurs, préférences, sauvegardes, DB | **non touchés** |
| Panneau multi-rue de SharkSolver, avec son arbre `[0.33, 0.75]` | inchangé, visible à côté du nouveau |

---

## 2. Ce qui a changé dans l'existant — trois modifications, toutes additives

### 2.1 `src/solver/core/gametree.js`

Nouvelles options **optionnelles** (`betSizesByPlayer`, `raiseSizes`,
`raiseSizesByPlayer`, `allowJam`, `minBet`, `bb`, specs typés dans `betSizes`).

Sans elles, l'arbre est identique — vérifié par comparaison structurelle exacte,
pas par relecture. Le chemin v2 est conservé octet pour octet dans une branche
séparée du code (`if (!adaptive) { … }`).

**Compatibilité des labels** : `X`, `B`, `B0`, `B1`, `F`, `C`, `R` inchangés. Les
nouveaux labels `R0`, `R1` et `J` n'apparaissent que si l'appelant demande
plusieurs relances ou le jam explicite.

### 2.2 `src/solver/api.js` — signature de cache complétée

`effStack`, `raiseMult`, `maxRaisesPerStreet`, `ipProbe` et les specs entrent
désormais dans la clé (§63). Préfixe de version `ms2|`.

**Effet de bord assumé et souhaitable** : les `solveId` changent, donc les
solutions déjà persistées dans `library.js` (IndexedDB `sharksolver`) ne seront
plus retrouvées. Elles seront **recalculées**, ce qui est le comportement correct
— l'ancienne clé était fausse (deux tapis différents partageaient une entrée).
Aucune donnée utilisateur n'est perdue : ces entrées sont un cache, pas un
livrable, et l'éviction LRU les remplacera naturellement.

### 2.3 `src/tabs/SharkSolverTab.jsx`

Ajout d'un `useMemo` (`pfaseStateInput`) et du montage du panneau. Aucune
modification du reste du fichier, aucun composant existant déplacé ou redessiné.

---

## 3. Versionnement et invalidation (§80)

Trois versions distinctes, parce qu'elles changent pour trois raisons différentes :

```js
SIZING_ENGINE_VERSION   = "1.0.0"                    // l'algorithme de sélection
SOLVER_VERSION          = "sharksolver-core-2.1.0"   // le moteur qui produit les EV
SOLUTION_SCHEMA_VERSION = 1                          // la FORME de l'objet stocké
```

**Deux verrous, pas un** :

1. Les trois versions entrent dans le **hash canonique**. Une solution produite par
   un moteur antérieur porte un hash différent : elle ne peut pas être servie à la
   place d'une solution courante.
2. `getSolutionById` vérifie **en plus** les versions et refuse une entrée périmée.
   `allowStale: true` permet de l'inspecter pour diagnostic, avec `isStale: true`
   et la liste des écarts.

Un seul verrou aurait suffi en théorie. Deux, parce que celui qui saute en silence
est le pire.

**Quand incrémenter :**

| Version | Incrémenter si… |
|---|---|
| `SIZING_ENGINE_VERSION` | la sélection change de résultat (nouveau critère, nouveau plancher, nouvelle définition de la perte) |
| `SOLVER_VERSION` | `core/cfr.js`, `core/multistreet.js` ou `core/gametree.js` modifient les EV produites |
| `SOLUTION_SCHEMA_VERSION` | un champ de `PFSolution` change de nom, de type ou de sens |

---

## 4. Migration de base de données

**Aucune migration destructive, parce qu'aucune table existante n'est modifiée.**

| Magasin | Nature | Effet |
|---|---|---|
| IndexedDB `sharksolver` (existant) | cache de solves bruts | inchangé ; les clés changent, les entrées sont recalculées |
| IndexedDB `pfase` (**nouveau**) | `PFSolution` normalisées | créé à la première écriture, version 1 |
| Supabase `solver_spots` | spots utilisateur | **non touché** |
| Prisma | **non touché** | |

Le magasin `pfase` est créé par `onupgradeneeded` avec deux object stores
(`solutions` clé `solutionId`, `states` clé `gameStateHash`) et deux index. Il est
**réversible** : le supprimer ne casse rien, les solutions sont recalculables.

Hors navigateur (Node, tests), tout dégrade en mémoire — aucune dépendance dure.

---

## 5. Feature flag (§81)

```js
FEATURE_FLAG = "adaptiveSizingEngine"   // activé par défaut
```

Désactivation :

```js
globalThis.__PF_FLAGS__ = { adaptiveSizingEngine: false };
// ou
localStorage.setItem("pf_flag_adaptiveSizingEngine", "0");
```

Le flag sert au **déploiement**, pas à masquer du code inachevé : derrière lui, la
fonctionnalité est complète et testée. Désactivé, le panneau affiche son état et
`solveOptimizedTree` refuse proprement ; rien d'autre ne change.

Traces de développement :

```js
localStorage.setItem("pf_sizing_debug", "1");   // silence total en production
```

---

## 6. Stratégie de déploiement (§82)

```
moteur historique
       +
     PFASE                    ← état actuel : les deux cohabitent
       ↓
 tests de comparaison         ← banc d'essai + suites de non-régression
       ↓
  feature flag                ← en place
       ↓
validation en production      ← à faire
       ↓
   nouveau défaut             ← seulement ensuite
```

Le moteur historique ne sera retiré qu'après validation en production. Le panneau
multi-rue et le panneau Adaptive Sizing sont visibles côte à côte, et leur
différence de nature est écrite dans le code, à leur point de montage.

---

## 7. Retour arrière

1. **Désactiver le flag** — effet immédiat, aucun redéploiement : PFASE devient
   inerte, le reste de l'application est inchangé.
2. **Revenir sur la branche** `feature/pokerforge-adaptive-sizing` — les seules
   modifications hors `src/sizing/` sont les trois décrites au §2, toutes
   additives.
3. **Purger le magasin** — `clearStore()` ou supprimer la base IndexedDB `pfase`.
   Aucune donnée utilisateur n'y réside.

Aucune de ces trois opérations n'affecte les comptes, les préférences, les
sauvegardes ni les spots enregistrés.
