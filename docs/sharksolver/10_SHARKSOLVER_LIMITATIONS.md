# 10 — SHARKSOLVER LIMITATIONS
**Ce que SharkSolver Core V1 NE fait PAS** · commit `817b13d`

> Ce document existe pour appliquer le §2 et le §58 : ne jamais laisser croire qu'une
> capacité existe alors qu'elle n'existe pas. Toute limite ici doit être visible dans
> l'UI (badge de provenance, mention « expérimental », `NO_SOLUTION`).

---

## 1. Ce qui est RÉELLEMENT calculé ✅

| Capacité | Statut | Preuve |
|---|---|---|
| Évaluateur 5-parmi-7 | Exact | 95 tests, ordre des catégories + wheel |
| Équité (énumération exhaustive) | Exact | River/turn énumérés, benchmark 8/8 |
| Équité (Monte-Carlo) | Approximation seedée | Écart ≤1.5% vs références publiques |
| CFR+ 1-street | Solve réel | Convergence mesurée (stabilité, regret) |
| CFR+ multi-rue | Solve réel | Clairvoyance analytique ≤0.4%, NashConv ≈0 |
| Node lock solvé | Re-solve réel | Exploits analytiques exacts (§19) |
| Exploit vs profil | Re-solve réel | EV exploit conforme au calcul manuel (§20) |
| Équité ICM (Malmuth-Harville) | Exact | Symétries + monotonie vérifiées |
| Reproductibilité | Garantie | Même seed ⇒ solve identique |

## 2. Limites de MODÉLISATION ⚠️

### 2.1 Arbre de jeu
- **Heads-up uniquement.** Aucun support multiway (3+ joueurs) dans l'arbre.
- **Sizings bornés** : ceux fournis dans `betSizes` ; l'arbre ne « découvre » pas de
  sizing hors liste. Un sizing absent de l'arbre n'est jamais affiché (§40).
- **Raises plafonnés** par `maxRaisesPerStreet` (défaut 1). Pas de guerre de relances illimitée.
- **Stacks symétriques** : `effStack` identique des deux côtés ⇒ **aucun side-pot**.
- **Pas de rake dans le calcul.** Le rake affiché dans l'UI est un paramètre de contexte,
  il n'entre pas dans les EV.

### 2.2 Multi-rue (§26)
- **Board incomplet ⇒ runouts échantillonnés** : l'exploitabilité exacte (`nashConv`)
  n'est disponible **que** sur board complet. Sinon `null` + note explicative.
- **Ranges bornées** (`maxCombos`, défaut 100/camp) : abstraction, pas la range intégrale.
- Marqué `experimental: true` : **non câblé à l'UI** à ce jour.

### 2.3 Préflop
- Le CFR est un solveur **postflop**. En préflop il est **désactivé** (garde §40) :
  l'arbre check/bet ne correspond pas à l'arbre préflop (open/3-bet/fold).
- Les ranges préflop affichées restent **heuristiques** (`buildSolverFreqs`), étiquetées
  `HEURISTIC_ESTIMATE`. Ce ne sont **pas** des ranges solvées.

### 2.4 ICM / PKO (§21, §22)
- L'**équité** ICM est exacte (Malmuth-Harville) ; la **stratégie** ICM ne l'est pas.
  Aucun solve GTO sous contrainte ICM n'existe → provenance `ICM_ESTIMATE`.
- PKO : valeur de bounty **estimée** → `PKO_ESTIMATE`. Pas de modèle complet
  (bounty progressif, couverture, éliminations futures).
- **Interdit** : afficher « EXACT ICM SOLVE » ou « EXACT PKO SOLVE ».

### 2.5 Ranges (§11)
- Les ranges d'entrée sont majoritairement **heuristiques**. Un solve CFR parfait sur une
  mauvaise range d'entrée reste un bon calcul sur un mauvais modèle → c'est pourquoi
  `RangeSource` reste affiché « Heuristique » **même** quand la stratégie est `CFR_SOLVE`.

### 2.6 IA (§30)
- L'IA **n'est pas** une source de vérité stratégique. `explain.js` ne produit que des
  faits dérivés d'une solution calculée ; garde-fou testé (aucune fréquence hors solution).

## 3. Limites de PERFORMANCE

| Scénario | Mesure |
|---|---|
| River 120×120 combos, 2 sizings + raise | ~1.1 s (NashConv 0.036 bb) |
| Flop 3 rues 100×100 combos, 120 itérations | ~8.8 s |
| Équité exacte préflop main-vs-main | Hors budget ⇒ bascule Monte-Carlo |

- Tout est **synchrone, mono-thread, dans le navigateur**. Pas de job queue, pas de
  workers, pas d'annulation, pas de GPU (§25 = futur).

## 4. Ce qui n'existe PAS du tout ❌

- Bibliothèque pré-solvée persistée (le cache est **en mémoire**, perdu au reload).
- Recherche de solution « proche » (fuzzy) — `getClosest` = match exact seulement.
- Solveur multiway, ICM solvé, PKO solvé, preflop solvé.
- Serveur de solve (`solver-server/` existe mais **n'est pas branché** ; l'edge function
  `solver-analyze` est absente du repo — cf. `01_EXISTING_ARCHITECTURE_AUDIT`).

## 5. Règle d'affichage (rappel §58)

Ne jamais : appeler une heuristique « GTO exact » · un Monte-Carlo « énumération exacte » ·
un Quick Node Lock « Solved Node Lock » · un ICM/PKO estimé « solve exact » ·
présenter un résultat `experimental` sans le dire.
