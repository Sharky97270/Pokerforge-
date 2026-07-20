# 11 — SHARKSOLVER V2 ROADMAP
**Après Core V1** · commit `817b13d`

Ordre issu du §27, mis à jour avec l'état réel. Principe conservé :
**FIABILITÉ AVANT COMPLEXITÉ · CORRECTNESS BEFORE PERFORMANCE.**

---

## État de l'ordre §27

| Étape | Statut |
|---|---|
| CORE V1 | ✅ isolé, testé (95), benchmarké (17) |
| POSTFLOP MULTI-STREET | ✅ moteur prouvé — **non câblé UI** |
| SOLUTION LIBRARY | ✅ cache mémoire — **non persisté** |
| SOLVED NODE LOCK | ✅ re-solve réel, exploits analytiques exacts |
| EXPLOIT SOLVER | ✅ 8 profils → verrous → re-solve |
| ICM ENGINE | ⚠️ équité exacte, **stratégie non solvée** (`ICM_ESTIMATE`) |
| PKO ENGINE | ⚠️ valeur estimée (`PKO_ESTIMATE`) |
| ADVANCED CPU/GPU | ❌ non commencé |
| AI EXPLANATION | ✅ faits sourcés + garde-fou anti-hallucination |

---

## V2 — priorités, dans l'ordre

### 1. Câblage UI du moteur multi-rue (le plus gros écart valeur/effort)
Le moteur est prouvé mais **invisible**. Panneau dédié : choix du spot → solve →
stratégie **par street** + arbre navigable + `NashConv` affiché.
**Contrainte** : badge `CFR multi-street · expérimental` tant que le périmètre réel
n'est pas élargi (§2). Sans ce câblage, tout le travail moteur reste inexploité.

### 2. Persistance de la Solution Library (§16)
Aujourd'hui en mémoire (perdue au reload). Cible : IndexedDB local + table Supabase
partagée. Débloque le vrai flux « spot demandé → solution disponible ? chargement
immédiat », et la recherche de solution **proche** (fuzzy : texture de board
équivalente, stacks voisins) — aujourd'hui match exact seulement.

### 3. Élargissement de l'arbre
- Raises multiples par rue (au-delà de `maxRaisesPerStreet=1`).
- Stacks **asymétriques** ⇒ gestion des side-pots.
- Rake intégré au calcul d'EV (aujourd'hui purement décoratif).

### 4. Ranges non bornées + abstraction intelligente
`maxCombos` (100/camp) est une abstraction. Cible : bucketing par force/blockers
plutôt que troncature, pour approcher la range intégrale à coût maîtrisé.

### 5. Performance : workers + job queue (§25)
Solve hors du thread UI : progression, annulation, timeout, cache disque.
Prérequis pour des solves 3 rues sur ranges réelles en usage interactif.

### 6. Préflop solvé
Aujourd'hui heuristique et **explicitement étiqueté** comme tel. Nécessite un arbre
préflop dédié (open/3-bet/4-bet/jam) — ne pas réutiliser l'arbre postflop (§40).

### 7. ICM / PKO stratégiques
Passer de « équité exacte » à « stratégie solvée sous contrainte ICM » :
CFR avec utilités ICM au lieu de ChipEV. Idem PKO (bounty progressif, couverture,
probabilité d'élimination).

### 8. Intégrations (§28, §29)
- **Trainer** → interroge `solveMultiStreet` au lieu de son moteur local.
- **HH Import / Replayer** → extraction de spot → Solver API → analyse.
- **Coach AI** → consomme `buildCoachBrief` (déjà prêt côté moteur).
- **Leak Detector** → agrège `classifyLeak` sur l'historique.

---

## Dette technique identifiée

| Sujet | Décision à prendre |
|---|---|
| `solver-server/` non branché, edge function `solver-analyze` absente | Brancher **ou** déprécier proprement |
| Évaluateur dupliqué (`core/evaluator.js` vs `solver-server/solver.js`) | Unifier si le serveur est conservé |
| `SharkSolverTab.jsx` (~2 600 lignes) | Découper en sous-composants |
| Docs 03/04/05/07/09 non rédigés | Rédiger ou acter qu'ils sont couverts par 02/06/10 + code |

---

## Critère d'entrée en V2

Ne commencer un nouveau moteur qu'une fois le **multi-rue câblé et utilisé** :
un moteur prouvé mais non exposé n'apporte aucune valeur à l'utilisateur, et
accumuler des moteurs non câblés est le principal risque du projet.
