# feat(trainer) : le SOLVEUR passe au POSTFLOP — CFR flop/turn/river HU en arrière-plan

Branche : `feature/trainer-cfr-postflop` → `main`
Commits : `b6469dc` (flop) · `025436f` (turn/river) · `e2c03de` (face à une mise)

## Pourquoi

Jusqu'ici le Trainer n'affichait une solution **calculée** que sur un seul type de spot :
le **push/fold préflop HU ≤30bb** (`trainerStrategyProvider.js` → `solvePreflopPushFold`).
Tout le postflop (C-bet flop, barrels, décisions rivière…) tombait sur une solution
**heuristique** issue de templates — honnêtement étiquetée, mais non calculée.

Or le moteur CFR multi-street (`solveMultiStreet`) existait déjà, validé
(`test:solver` / `bench:solver`, NashConv ≈ équilibre) mais **n'était consommé que par
l'onglet SharkSolver**, sur clic explicite. Cette PR le branche au Trainer.

## Ce que ça apporte

| Situation | Avant | Après |
|---|---|---|
| Préflop push/fold HU ≤30bb | 🦈 Solveur exact | 🦈 Solveur exact (inchangé) |
| Flop / Turn — Héros mène (Check/Bet) | ≈ Heuristique | 🦈 **CFR** (expérimental) |
| Flop / Turn — Héros face à une mise | ≈ Heuristique | 🦈 **CFR** (expérimental) |
| **River** (les deux cas) | ≈ Heuristique | 🦈 **CFR EXACT** (NashConv réel) |
| Préflop open/3-bet, multiway, pots 3-bet | ≈ Heuristique | ≈ Heuristique (hors modèle) |

La stratégie affichée est celle de la **main précise du Héros** (pas l'agrégat de range) :
`avgOf(nœud, combo)` plutôt que `aggAt`.

## Architecture

- **`src/solver/preflopRanges.js`** *(nouveau)* — `buildSolverFreqs` / `VILLAIN_ACTION_MAP`
  **extraits** de `SharkSolverTab.jsx` vers un module **pur** (sans React), réimporté par
  le tab, le Replayer, le provider et le Worker. Code déplacé verbatim → **0 régression**.
- **`src/solver/cfrPostflop.worker.js`** *(nouveau)* — Web Worker. Le solve est **synchrone
  et CPU-bound (~0,6 à 10 s)** : hors du thread principal, il gèlerait l'entraînement.
  ⚠️ Les accesseurs `avgOf`/`aggAt` sont des **closures** → perdues par le structured clone
  de `postMessage`. Le worker les **consomme sur place** et ne renvoie que du plain-data.
  Supporte `opts.nodePath` pour naviguer jusqu'au nœud « face à une mise ».
- **`src/solver/cfrPostflopClient.js`** *(nouveau)* — promisifie, timeout de sécurité,
  **dégradation propre** si `Worker` indisponible (retour à l'heuristique).
- **`src/trainerPostflopSolver.js`** *(nouveau)* — provider **pur et testable** :
  `postflopMode` (`"leads"` / `"facing"`), `isSolvablePostflop`, `buildPostflopSolveRequest`,
  `mapWorkerResultToStrategy`.
- **`src/tabs/TrainerTab.jsx`** — **pré-solve en arrière-plan** : le spot reste jouable
  immédiatement (heuristique) ; à l'arrivée du CFR, la solution est substituée et le
  panneau parent est rafraîchi via `onCfrUpgrade` (le badge vit dans le parent, pas dans
  `SingleTable`). Annulation des résultats périmés au changement de spot.

## Honnêteté de provenance (§2)

Le CFR est **exact**, mais ses **ranges d'entrée restent heuristiques** — et la composition
de range pilote l'essentiel de la stratégie postflop. On ne présente donc jamais ça comme
un « solve GTO complet » :

- badge **cyan** « SOLUTION CFR POSTFLOP — expérimental (ranges heuristiques) »,
  distinct du **vert** « SOLUTION SOLVEUR — calcul exact » (push/fold) ;
- `strategySource="solver"` mais `strategyProvenance="cfr-experimental"` ;
- la note indique la rue, la main, et le NashConv — avec la mention **« (exact) »**
  uniquement sur river (board complet, aucun runout échantillonné).

## Détails techniques notables

- **Rues dérivées du board** : flop (3) → 2 rues à venir, turn (4) → 1, **river (5) → 0 =
  solve exact**, donc NashConv réel *et* bien plus rapide (~0,6-2 s contre ~6-10 s au flop).
- **Sizings réels** : les fractions de pot sont **parsées depuis les libellés des boutons**
  (33 % / ½ / PSB…) → le CFR résout les tailles réellement proposées au joueur.
- **Ranges inversées selon l'agresseur** : *leads* → Héros = opener, Villain = suiveur ;
  *facing* → Héros = suiveur, Villain = opener.
- **Bug corrigé au passage** : la range du suiveur mettait le 3-bet à zéro, si bien que
  AA/KK (3-bet pur dans `vs_open`) sortaient de la range avec un poids nul
  (`hand-not-in-range`) — les mains les plus fortes devenaient illisibles. La portion
  3-bet est désormais **reversée dans le call** (ce pot *est* un pot simple-relancé suivi).
- **Réglages** : `iters:100`, `maxCombos:140` (200 sur river). En dessous (`iters:70`) le
  solve est sous-convergé — à ne pas présenter comme une solution de solveur.

## Vérification

**Sanity GTO** (le solveur retrouve seul la théorie) :

| Spot | Résultat |
|---|---|
| AA sur A♠K♦7♣ (flop, mène) | mise ~88 % |
| 86s sur A♠K♦7♣ (air, mène) | check ~53 % |
| AA rivière A♠K♦7♣2♥9♠ | value-bet pot **91,8 %**, NashConv 0,11 *(exact)* |
| AA face à 10bb dans 30 (rivière) | **Raise 99,8 %** / Fold 0,1 % |
| 54s face à 10bb dans 30 (rivière) | **Fold 99,1 %** |

- `test-trainer-postflop-solver.mjs` — **38 assertions**, ajouté à `npm run test:refonte`.
- **`npm test` vert** · **`npm run build` OK** (Vite émet bien le chunk du worker).
- **Vérifié en navigateur** : le badge bascule heuristique → CFR après le pré-solve,
  la stratégie affichée est celle de la main du Héros, **aucun gel de l'interface**
  (worker), et le mode « face à une mise » renvoie le mapping FOLD/CALL/RAISE correct.

## Limites assumées

- Ranges d'entrée **heuristiques** (le préflop ne se solve pas en direct dans un navigateur).
- **Heads-up postflop uniquement** ; multiway et pots 3-bet non modélisés.
- Position exacte (IP/OOP) et texture de couleur approximées (abstraction par classe de main).
- Si le verdict est demandé **avant** la fin du pré-solve, il reste heuristique (choix assumé :
  ne jamais bloquer le rythme d'entraînement).
- Build **standalone** (fichier unique) : les Workers ES ne s'y inlinent pas → repli
  automatique sur l'heuristique.

## Suites possibles

- Préflop open/3-bet via **charts GTO embarqués** (ce serait un *lookup*, pas un solve —
  nécessite d'abord les données, absentes du dépôt).
- Ranges d'entrée dédiées aux **pots 3-bet**.
- Bibliothèque de solves **pré-calculés** pour supprimer l'attente.
