# 01 — EXISTING ARCHITECTURE AUDIT
**PokerForge — SharkSolver Core V1**
Phase 1 (obligatoire) du cahier des charges `SHARKSOLVER_CORE_V1_MASTER`.
Objectif : cartographier l'existant **avant toute refonte**, classer chaque brique
(KEEP / REFACTOR / ISOLATE / REPLACE / DEPRECATE), distinguer ce qui est **réellement
calculé** de ce qui est **heuristique**, et identifier les risques de régression.

Branche de travail : `feature/sharksolver-core-v1` (Phase 0 faite).
Aucune modification de code n'a été faite pour produire cet audit — lecture seule.

---

## 0. Résumé exécutif (les 6 faits qui comptent)

1. **Tout tourne dans le navigateur.** `src/solverApi.js` (client des edge functions +
   serveur « pro ») **n'est jamais importé** par `SharkSolverTab.jsx`. Le serveur
   `solver-server/` et l'edge function `solver-analyze` sont **débranchés** de l'app.
2. **L'edge function `solver-analyze` est absente du repo** (`supabase/functions/` ne
   contient que `meditation-tts`). Le README du serveur décrit un branchement qui
   n'existe pas côté code.
3. **Le vrai moteur mathématique existe et est correct** : évaluateur 5/7 cartes
   (`eval5i`/`eval7i`), équité Monte-Carlo (`monteCarloEquity`), et **un vrai CFR+**
   heads-up 1-street (`solveRiverCFR`, regret-matching clampé + moyennage pondéré).
4. **La stratégie affichée par défaut est HEURISTIQUE**, pas solvée. `buildSolverFreqs`
   génère des ranges/fréquences codées à la main (par position/stack). Le CFR n'est
   lancé **qu'à la demande** (bouton « Résoudre CFR », `runCFR` ligne 2735).
   → C'est exactement le risque que le §2 du cahier des charges veut éliminer :
   une heuristique présentée comme « GTO ».
5. **Aucun système de provenance (`ResultSource`).** Rien dans l'UI ne distingue
   `HEURISTIC_ESTIMATE` de `CFR_SOLVE` ou `NUMERICAL_APPROXIMATION`. La barre du bas
   affiche « estimation » de façon globale mais pas par donnée.
6. **Duplication de moteur.** L'évaluateur, les ranges et l'équité existent **en double** :
   une fois dans `SharkSolverTab.jsx` (utilisé), une fois dans `solver-server/solver.js`
   (non utilisé par l'app). Un seul doit devenir la source de vérité.

**Conclusion de cadrage :** le socle mathématique est bon (à isoler et fiabiliser), mais
l'architecture (1 fichier de 2989 lignes mêlant moteur + UI), le branchement serveur et
surtout **la provenance des résultats** sont à construire. La priorité V1 selon le
cahier des charges : *fiabilité + transparence de la provenance*, pas plus de complexité.

---

## 1. Cartographie des fichiers

| Fichier | Lignes | Rôle | Statut réel |
|---|---|---|---|
| `src/tabs/SharkSolverTab.jsx` | 2989 | **Moteur (heuristique + CFR + équité) ET toute l'UI** | Actif — monolithe |
| `src/solverApi.js` | 58 | Client edge functions + persistance spots (Supabase) | **Non importé / mort côté UI** |
| `solver-server/solver.js` | 248 | Moteur « pro » Node zéro-dépendance (eval, ranges, equity, solve) | **Non branché à l'app** |
| `solver-server/server.js` | ~80 | Serveur HTTP `/solve` `/health` | Déployable (Render) mais non appelé |
| `solver-server/test.js` | ~90 | 10 tests moteur serveur | OK mais ne couvre que le serveur |
| `supabase/functions/solver-analyze/` | — | **Absent** | MISSING |
| `src/tabs/RangesTab.jsx` | — | Éditeur de ranges (séparé) | À relier au Range Engine plus tard |

**Risque structurel n°1 :** le monolithe de 2989 lignes empêche la séparation exigée
(§5, §31 : *séparer UI REFACTOR et SOLVER CORE REFACTOR*). Toute isolation du Core
commencera par extraire les fonctions moteur de ce fichier vers des modules dédiés.

---

## 2. Classification brique par brique

Légende statut cahier des charges :
`WORKS/KEEP` · `NEEDS REFACTOR` · `UNRELIABLE` · `MISSING/TO BUILD` · `FUTURE/NOT V1`
Légende action : **KEEP** · **REFACTOR** · **ISOLATE** · **REPLACE** · **DEPRECATE**

### 2.1 — Moteur mathématique (le « calcul »)

| Brique | Emplacement | Nature réelle | Statut | Action |
|---|---|---|---|---|
| **Hand Evaluator** `eval5i` / `eval7i` | tab 830–868 | Vrai éval 5-parmi-7, catégories complètes, wheel A2345, kickers, ties | WORKS/KEEP | **ISOLATE** vers `core/handEvaluator` |
| **Equity Engine** `monteCarloEquity` | tab 881–904 | Vrai Monte-Carlo, card-removal, board fixé (postflop) | WORKS mais **pas de seed, pas d'énumération exacte, pas de variance** | **REFACTOR** (+ seed §15, + mode EXACT §10, + marge d'erreur) |
| **CFR Engine** `solveRiverCFR` | tab 946–1127 | **Vrai CFR+** 1-street HU : check/bet-S/bet-B, call/raise/check-raise, regrets clampés, moyennage pondéré (t+1) | WORKS/KEEP (périmètre 1-street assumé) | **ISOLATE** vers `core/cfr` + exposer métriques de convergence |
| Combo/Card utils `comboCardsInt`, `exactComboList`, `rangeComboList`, `parseBoardToken` | tab 796–932 | Expansion combos + parsing board corrects | WORKS/KEEP | **ISOLATE** vers `core/cardEngine` + `core/comboEngine` |
| Sampler `_buildSampler`/`_sample` | tab 869–879 | Échantillonnage pondéré (binary search) | WORKS/KEEP | **ISOLATE** |

### 2.2 — Couche heuristique (le « estimé »)

| Brique | Emplacement | Nature | Statut | Action |
|---|---|---|---|---|
| **Ranges préflop/postflop** `buildSolverFreqs` | tab 13–194 | Fréquences **codées à la main** par position/stack/catégorie | UNRELIABLE **en tant que « GTO »** (OK comme baseline étiquetée) | **KEEP mais ÉTIQUETER** `RangeSource = HEURISTIC` |
| **EV estimée** `estimateEV` | tab 310–327 | EV dérivée d'un score de force (commentée « toujours estimée ») | UNRELIABLE comme EV solvée | **KEEP + ÉTIQUETER** `HEURISTIC_ESTIMATE` |
| `handStrengthScore`, `handTier`, `splitRaiseBucket` | tab 210–307 | Heuristiques de force / découpe 3bet-4bet-jam | KEEP (baseline) | ÉTIQUETER |
| **Exploit** `applyExploitAdjustment` | tab 382–408 | Ajustement heuristique par profil | UNRELIABLE comme « exploit solve » | **KEEP + ÉTIQUETER** ; cible future = re-solve (§20) |
| **ICM** `applyICMAdjustment` | tab 409–429 | Ajustement heuristique | UNRELIABLE comme ICM exact | **KEEP + label `ICM_ESTIMATE`** (§21) |
| **PKO** `applyPKOAdjustment`, `pkoEvBreakdown` | tab 430–454 | Ajustement heuristique bounty | UNRELIABLE comme PKO exact | **KEEP + label `PKO_ESTIMATE`** (§22) |
| **Node Lock** `applyNodeLockToFreqs`, `nodeLockAdvice` | tab 719–748 | Verrouillage de fréquences (édition, pas re-solve) | = « Quick Node Lock » | **KEEP + label** ; « Solved Node Lock » = re-solve CFR (§19, FUTURE) |

### 2.3 — Explication / analyse (le « L'IA explique »)

| Brique | Emplacement | Nature | Statut | Action |
|---|---|---|---|---|
| `explainHand` | tab 479–526 | Texte pédagogique déterministe (pas de LLM) | KEEP | Alimenter depuis données sourcées |
| `buildSolverInsights` | tab 527–569 | Synthèse de spot | KEEP | idem |
| `validateSpot` | tab 570–643 | Détection spot impossible + fix proposé | WORKS/KEEP | **ISOLATE** |
| `handEquityVsRange`, `rangeVsRangeEquity` | tab 685–708 | Raccourcis équité (heuristiques légers) | À vérifier vs MC réel | **REFACTOR** (rediriger vers Equity Engine) |

### 2.4 — UI (≈ 1900 lignes du fichier, composants `Solver*`)

Tous les composants d'affichage (`SolverModeBar`, `SolverSidebar`, `SolverMatrixGrid`,
`SolverSelectedHandPanel`, `SolverCFRPanel`, `SolverStatsBar`, `SolverEVChart`,
`SolverDecisionTree`, `SolverDetailsTabs`, `SolverEquityDonut`, `SolverSummaryCard`,
`SolverLegend`, `SolverNotesPanel`, `SolverActionBar`, `SpotConfigPanel`…) :

- Statut : **EXISTS / NEEDS REFACTOR** pour coller à la nouvelle maquette (§33–§52).
- Action : **REFACTOR UI** — séparé du Core (§31). La maquette validée introduit
  notamment : barre supérieure (Solve ID, Confidence, Iterations, NashConv), colonne
  gauche `SCÉNARIO / RANGE SOURCE / FILTRES & BLOCKERS` (remplace les scénarios
  préchargés dans la colonne principale, §36/§54), panneau **SOURCE DU RÉSULTAT** (§46),
  **STATUT DU SOLVE** (§44), légende de provenance en bas (§52).

### 2.5 — Serveur « pro » (`solver-server/`)

| Brique | Nature | Statut | Action |
|---|---|---|---|
| `eval5` / `best7` (C75 précalculé) | Évaluateur serveur (variante plus rapide via table de combinaisons) | WORKS mais **duplique** `eval5i` | **REPLACE** l'un des deux (garder le plus rapide comme Core partagé) ou **ISOLATE** en package commun |
| `villainRange`, `combosOfClass`, `equity`, `solve` | Ranges + équité + décision 1-nœud serveur | WORKS mais **non branché** | **ISOLATE / décision à prendre** : brancher, ou déprécier au profit du in-browser |
| `server.js`, `Dockerfile`, `render.yaml` | Hébergement | KEEP si on branche | Sinon **DEPRECATE** proprement (ne pas supprimer sans décision) |

---

## 3. Vérité sur les données affichées (crucial pour §2 / §6 / §46)

| Donnée UI actuelle | Provenance réelle | Devrait être étiquetée |
|---|---|---|
| Matrice Hero / Villain (fréquences) | `buildSolverFreqs` | `HEURISTIC` (sauf après « Résoudre CFR ») |
| Fréquences après « Résoudre CFR » | `solveRiverCFR` (overlay `heroByKey`) | `CFR_SOLVE` |
| Équité Hero/Villain (donut, %) | `monteCarloEquity` (2500 iters) | `NUMERICAL_APPROXIMATION` |
| Équité main sélectionnée | `monteCarloEquity` (1800 iters) | `NUMERICAL_APPROXIMATION` |
| EV par action | `estimateEV` (heuristique) OU CFR si résolu | `HEURISTIC_ESTIMATE` / `CFR_SOLVE` |
| Iterations / NashConv de la barre haute | **valeurs d'affichage** (non issues d'un solve réel par défaut) | doivent refléter le solve réel ou être masquées |
| ICM / PKO | ajustements heuristiques | `ICM_ESTIMATE` / `PKO_ESTIMATE` |

**Action prioritaire V1 (faible risque, fort impact) :** introduire un `ResultSource`
central (§6) et l'afficher partout (panneau SOURCE DU RÉSULTAT + légende bas + badges).
Cela rend l'app **honnête** sans toucher au calcul.

---

## 4. Manquant à construire (MISSING / TO BUILD)

| Élément (cahier des charges) | Priorité V1 |
|---|---|
| `ResultSource` central (§6) + affichage provenance (§46, §52) | **V1 — haute** |
| `RangeSource` par range (§11, §37) | **V1 — haute** |
| Isolation `SharkSolver Core` hors du monolithe (§5) | **V1 — haute** |
| Seed + variance + mode énumération exacte pour l'équité (§10, §15) | **V1 — moyenne** |
| Métriques de convergence réelles exposées (Average Regret, exploitability, statut) (§14) | **V1 — moyenne** |
| `SolveID` + reproductibilité (§15) | **V1 — moyenne** |
| Solver API interne stable (`createSolve`, `getSolveResult`…) (§17) | **V1 — moyenne** |
| Validation Suite automatisée (§23) | **V1 — moyenne** |
| Refonte UI selon maquette (§33–§52) | **V1 — haute (livrable visible demandé)** |
| Game Tree Engine générique multi-nœud (§12) | FUTURE / amorce V1 |
| Solution Library pré-solvée (§16) | FUTURE (préparer le schéma) |
| Postflop multi-street, Exploit solver, ICM/PKO engines, CPU/GPU (§20–§27) | **FUTURE / NOT V1** |

---

## 5. Risques de régression identifiés

1. **Extraire le moteur du monolithe** peut casser des imports/états React internes
   (beaucoup de `useMemo` dépendent de closures locales). → Extraire les **fonctions pures**
   d'abord (evaluator, combos, equity, cfr, validate) ; laisser les hooks dans la vue.
2. **Refonte UI** : risque de casser le cross-link Trainer→Solver
   (`buildScenarioFromTrainerParams`, exporté et utilisé ailleurs) et Solver→Trainer/Replayer
   (`SolverActionBar`). → Conserver les exports publics.
3. **`solverApi.js` mort** : le brancher réactiverait un chemin réseau non testé
   (edge function absente). → Ne pas brancher sans recréer/valider l'edge function.
4. **Duplication d'évaluateur** : si on unifie, valider que `eval5i` (tab) et `eval5`
   (serveur) donnent le **même ordre** sur un jeu de tests exhaustif avant bascule.
5. **Étiquetage provenance** : ne doit pas dégrader les perfs (calcul déjà fait) —
   c'est du métadonnée, pas du recalcul.
6. Interdits absolus (§58) à respecter : ne jamais présenter heuristique = GTO exact,
   Monte-Carlo = énumération exacte, Quick Node Lock = Solved Node Lock, ne pas
   remplacer le logo, ne pas mélanger code couleur *action* et *provenance*.

---

## 6. Séquencement recommandé (réconcilie le cahier des charges et le livrable demandé)

Le §31 impose de **séparer** UI REFACTOR et CORE REFACTOR. Le cahier des charges met
l'UI en Phase 19, mais tu as fourni la maquette « à appliquer + rendre fonctionnel ».
Proposition en 2 voies parallèles à faible risque, sans réécrire le moteur :

**Voie A — Fondations Core (invisible, sûr) :**
A1. `ResultSource` + `RangeSource` centralisés (métadonnée, zéro recalcul).
A2. Isoler les fonctions pures du monolithe → `src/solver/core/*` (evaluator, combo,
    equity, cfr, validate) sans changer leur comportement.
A3. `SolveID` + seed équité (reproductibilité minimale).

**Voie B — Refonte UI selon la maquette (visible, demandé) :**
B1. Nouvelle structure de page (barre haute, colonne gauche `SCÉNARIO/RANGE SOURCE/
    FILTRES & BLOCKERS`, panneaux STATUT DU SOLVE + RÉSULTAT + SOURCE DU RÉSULTAT,
    onglets bas RANGES/RÉSUMÉ/GRAPHS/DÉTAILS/NOTES, légende de provenance).
B2. Câbler chaque composant sur les **vraies** données (équité MC, CFR à la demande)
    **avec le bon badge de provenance** → « rendre tout fonctionnel » sans mentir.
B3. Matrices Hero/Villain plus lisibles (§42).

Chaque étape : IMPLEMENT → TEST → VALIDATE → capture visuelle → commit.

---

## 7. État des livrables du cahier des charges

- [x] `01_EXISTING_ARCHITECTURE_AUDIT.md` — **ce document**
- [ ] `02_SHARKSOLVER_CORE_ARCHITECTURE.md`
- [ ] `03_SHARKSOLVER_MATH_SPEC.md`
- [ ] `04_RESULT_SOURCE_SPEC.md`
- [ ] `05_RANGE_SOURCE_SPEC.md`
- [ ] `06_SOLVER_API_SPEC.md`
- [ ] `07_VALIDATION_TEST_PLAN.md`
- [ ] `08_BENCHMARK_REPORT.md`
- [ ] `09_UI_REFACTOR_SPEC.md`
- [ ] `10_SHARKSOLVER_LIMITATIONS.md`
- [ ] `11_SHARKSOLVER_V2_ROADMAP.md`

Principes immuables rappelés : **FIABILITÉ AVANT COMPLEXITÉ · CORRECTNESS BEFORE
PERFORMANCE · LE SOLVER CALCULE, L'IA EXPLIQUE.**
