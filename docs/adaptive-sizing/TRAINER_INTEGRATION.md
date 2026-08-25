# INTÉGRATION TRAINER — PokerForge Adaptive Sizing Engine

> Mission §29 → §43, §64 → §68, §71, §90, §91, §97.

---

## 1. Le flux imposé par §29

```
Trainer
   ↓  request solution
Solution Resolver          (trainingSolutionResolver.js)
   ↓  verified strategy
legal actions              (trainerBridge.solutionActsForSpot)
   ↓
Trainer UI
```

`prepareTrainerSpot()` enchaîne les quatre étapes en un appel :

```js
const r = prepareTrainerSpot({
  spot, ledger, complexity, trainingMode, studySpec, solverConfig, handClass, path,
});
if (!r.ok) {
  // r.message === "No verified solution available"
  // r.offeredActions === [SOLVE_SPOT, APPROXIMATE_TRAINING, CHANGE_SETTINGS]
  // r.acts === []   ← AUCUN bouton fabriqué
}
```

---

## 2. `spotToGameState` — la traduction

Le **ledger** est la source des tapis et du pot : côté Trainer, c'est lui qui a
déjà été rendu cohérent (une seule comptabilité de main). On ne recalcule rien —
on traduit.

| Trainer | PFASE |
|---|---|
| `ledger.pot` | `pot` (via `deadPot` + contributions de street) |
| `ledger.seats[p].remaining` | `players[].stack` |
| `ledger.seats[p].street` / `.total` | `committedStreet` / `committedTotal` |
| `spot.street`, `spot.board` | `street`, `board` |
| `spot.hpos` | acteur et héros |
| `spot.actionHistory` | `actionHistory`, avec **types stricts** |

La traduction des types est explicite (§37) : « 3-bet », « squeeze », « open »,
« iso » sont tous des `RAISE`. Les confondre avec `BET` produirait un type de pot
faux, donc un `potType` faux, donc un hash faux.

---

## 3. `solutionActsForSpot` — les boutons viennent de la solution

C'est le renversement du §29. Le générateur de spots n'écrit plus les boutons ;
la solution les dicte.

| Niveau | Boutons rendus |
|---|---|
| SINGLE | `CHECK` + **un** `BETxx` |
| SIMPLE | `CHECK` + **deux** `BETxx`, issus du même arbre optimisé |
| ADVANCED | jusqu'à trois mises |
| FULL | toutes les actions de la solution |

Les `acts` produits ont le **format exact** que le Trainer sait déjà rendre —
`{ id, l, s }` — augmenté des grandeurs exploitables :

```js
{ id:"BET33", l:"Bet 33% · 3.96bb", s:"3.96bb",
  amountBb: 3.96, additionalBb: 3.96, actionType:"BET",
  potFraction: 0.33, solverLabel:"B0", specKey:"pot:0.33", specLabel:"33%" }
```

`amountBb` existe précisément pour que **personne n'ait à relire le libellé** —
c'est le défaut C4/C6 déjà corrigé côté Trainer, appliqué ici à la source.

L'identifiant est **dérivé du montant** : une mise de 66 % devient `BET66`, jamais
`BET75` par défaut de table.

Aucun ajout, aucune suppression : `acts.length === node.actions.length` (§71,
vérifié par test).

---

## 4. Fréquences : main d'abord, range en repli — et on le dit

```js
solutionActsForSpot({ solution, handClass: "AKs" }).frequencySource
// "hand-class"      → fréquences de CETTE main
// "range-aggregate" → repli, avec frequencyNote expliquant pourquoi
```

Une fréquence de range n'est pas la fréquence d'une main. Le repli est donc
signalé, pas silencieux — le Coach doit pouvoir le dire.

---

## 5. Verdict (§34, §36, §37)

```js
trainerVerdict({ solution, handClass, heroAction: { actionType:"BET", toBb: 8.2 } })
```

Trois comportements, selon ce qui est vrai :

| Cas | `inTree` | `verdict` | `evAvailable` |
|---|:--:|---|:--:|
| sizing exact de l'arbre | `true` | « action de la solution » / « action majoritaire » | `false` (L4) |
| sizing absent de l'arbre | `false` | « sizing non étudié » + `nearestStudied` marqué approximatif | `false` |
| type absent du nœud | `false` | « hors-arbre » | `false` |

Aucune conversion implicite : 68 % **n'est pas** arrondi à 75 % pour trouver une
fréquence (§34). L'EV par action n'est pas disponible (LIMITATIONS L4) et on le
dit ; l'écart d'EV entre **sizings**, lui, est fourni (`sizingRanking`).

Le type et la taille restent deux champs distincts jusqu'au bout (§37) : un `CALL`
de 9 bb n'est jamais confondu avec un `BET` de 9 bb.

---

## 6. Villain (§43, §68)

```js
villainActionFromSolution({ solution, handClass, rng: seededRng(4242) })
```

Échantillonnage **proportionnel aux fréquences du nœud** — pas l'action
majoritaire, qui produirait un Vilain déterministe donc exploitable. La
distribution complète accompagne la décision, pour que le Coach puisse dire
« il misait 36 % du temps » et non « il a misé ».

`rng` est injectable. Vérifié : même graine → séquence identique sur 60 tirages ;
graine différente → séquence différente ; la proportion de mises suit les
fréquences.

---

## 7. Multitabling (§40, §41, §42, §67)

**Un seul moteur.** Il n'existe pas de chemin `1T`/`2T`/`3T`/`4T` : la même
fonction sert les quatre, et seul le rendu diffère.

**États isolés.** Chaque table résout son propre spot → son propre
`gameStateHash` → son propre `solutionId`. Vérifié sur quatre tables : quatre
identifiants distincts, et chaque table ne voit **que** ses montants (test de
400 décisions, aucun sizing d'une autre table ne fuit).

**Suggestion, pas imposition (§41).**

```js
suggestedComplexityFor(4)                          // → SINGLE, suggested:true
suggestedComplexityFor(4, { userChoice:"ADVANCED" }) // → ADVANCED, suggested:false
```

Un choix explicite de l'utilisateur n'est jamais écrasé. La fonction ne lit ni
n'écrit aucune préférence : elle rend une suggestion, l'appelant décide.

---

## 8. Transitions de rue (§38, §39)

Une solution ne couvre que la rue courante (LIMITATIONS L8). À chaque transition,
le Trainer **re-résout** au nouvel état : pot, tapis, SPR et arbre ont changé.

Vérifié sur un même coup : turn → `75 %` = 9 bb (pot 12) ; river → `150 %` = 34 bb
(pot 24). Le sizing de la turn n'est pas réutilisé.

---

## 9. Absence de solution (§90, §91)

```
message:        "No verified solution available"
acts:           []
offeredActions: [ SOLVE_SPOT, APPROXIMATE_TRAINING, CHANGE_SETTINGS ]
```

`APPROXIMATE_TRAINING` porte la provenance `APPROXIMATION`, dont
`PROVENANCE_META.gtoClaim === false` : elle ne peut structurellement pas afficher
un badge de solution calculée.

Un **autre niveau de complexité** du même état peut être proposé — jamais
substitué en silence : `complexityDowngraded`, `requestedComplexity` et
`downgradeReason` accompagnent la solution servie.

---

## 10. Ce qui n'a pas été touché

`trainerSizing.js`, les templates de spots, les préréglages de mise, le ledger,
la géométrie de table, les animations : **inchangés**. PFASE se superpose. Sans
solution vérifiée, le Trainer se comporte exactement comme avant.
