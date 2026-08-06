# Charts préflop — comment brancher des données

L'infrastructure est en place (`src/solver/preflopCharts.js`) mais **aucune donnée n'est
livrée avec l'application**. Tant que rien n'est chargé, le Trainer se comporte exactement
comme avant (solution heuristique). Ce document explique quoi fournir et comment.

## Pourquoi des charts, et pas un solve ?

Le push/fold préflop est solvable exactement en interne (2 actions terminales, abattage
immédiat) — c'est déjà fait, badge vert « SOLVEUR — calcul exact ».

Un **open / 3-bet / 4-bet**, lui, traîne derrière lui tout le jeu postflop : le solver
devrait résoudre l'arbre entier pour donner une fréquence juste. Infaisable en direct dans
un navigateur. La seule voie honnête est donc d'**embarquer des fréquences pré-calculées**.

Conséquence sur l'affichage : un chart porte le badge ambre **« 📊 CHART PRÉFLOP —
fréquences lues (non calculées ici) »**. Il ne prend jamais le badge du solveur. Des
nombres lus dans un fichier ne sont pas un calcul, et l'application ne doit jamais laisser
croire le contraire.

## Format attendu

```js
{
  id: "gto-6max-100bb",                  // identifiant unique
  label: "GTO 6-max 100bb",              // libellé affiché à l'utilisateur
  attribution: "Solveur X — export du 12/03/2026",  // OBLIGATOIRE (voir plus bas)
  format: "cash-6max",                   // optionnel : filtre de contexte
  stackBb: 100,                          // profondeur de tapis du chart
  spots: {
    // clé : `POSITION|action` ou `POSITION|action|POSITION_ADVERSE`
    // (la clé la plus spécifique gagne)
    "BTN|rfi":        { AA: { r: 100, c: 0, f: 0 }, "72o": { r: 0, c: 0, f: 100 } },
    "BB|vs_open|BTN": { AA: { r: 90,  c: 10, f: 0 } },
  }
}
```

- **Actions reconnues** : `rfi`, `vs_open`, `vs_3bet`, `vs_4bet`.
- **Mains** : notation à 169 classes — `AA`, `AKs`, `AKo`, `72o`…
- **Fréquences** en pourcentage : `r` = relance/open, `c` = call, `f` = fold.
  La somme doit tenir dans 100 (une petite tolérance d'arrondi est admise).

## L'attribution est obligatoire

Un chart sans `attribution` est **refusé** par le registre. Ce n'est pas de la
bureaucratie : des fréquences dont on ne sait plus d'où elles viennent sont
indiscernables de chiffres inventés — et c'est précisément ainsi qu'une heuristique
finit par être présentée comme une vérité GTO. L'attribution est affichée dans la note
du spot, donc l'utilisateur voit toujours sur quoi il s'appuie.

## Charger un jeu de charts

```js
import { registerChartSet } from "./src/solver/preflopCharts.js";
import monChart from "./src/data/charts/gto-6max-100bb.js";

registerChartSet(monChart);   // lève une erreur explicite si le chart est invalide
```

À appeler une fois au démarrage (par exemple là où `hydrateLibrary()` est déjà appelée).
Valider sans enregistrer est possible via `validateChartSet(data)` → `{ ok, errors[] }`.

## Garde-fous intégrés

| Situation | Comportement |
|---|---|
| Aucun chart chargé | Lookup → `null`, repli heuristique (comportement historique) |
| Main absente du chart | `null` — on n'invente jamais une fréquence manquante |
| Position/action non couverte | `null` |
| Tapis éloigné de plus de 15bb | `null` — mieux vaut rien qu'une range d'open 100bb servie à 20bb |
| Tapis proche (≤ 15bb d'écart) | Accepté, et la note précise « chart 100bb appliqué à 90bb » |
| Spot postflop | Jamais servi par un chart préflop |

## Tests

`test-preflop-charts.mjs` (37 assertions, inclus dans `npm test`) couvre notamment :
l'inertie sans données, le refus d'un chart sans attribution, la priorité de la clé
spécifique à l'adversaire, la tolérance de tapis, et le fait qu'un chart n'emprunte
jamais la provenance du solveur.
