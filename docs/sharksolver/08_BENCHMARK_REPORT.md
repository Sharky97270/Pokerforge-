# 08 — SHARKSOLVER BENCHMARK REPORT
**Conformité mathématique du moteur** (§24) · commit `817b13d`
Reproduire : `npm run bench:solver` — résultats déterministes (Monte-Carlo seedé, §15).

> Priorité du projet : **CORRECTNESS BEFORE PERFORMANCE**. Ce banc détecte toute
> régression grossière de l'évaluateur, de l'équité ou du CFR.

---

## A. Équité vs références publiques (heads-up préflop all-in)

Monte-Carlo 120 000 itérations, moyenné sur toutes les couleurs.

| ScenarioID | Référence | SharkSolver | Δ | Tolérance | Verdict |
|---|---|---|---|---|---|
| KK vs QQ (pair > pair) | 82.6 % | 82 % | −0.6 | ±2.5 | **PASS** |
| AA vs 22 (pair > pair) | 82.4 % | 82 % | −0.4 | ±2.5 | **PASS** |
| AKo vs AQo (dominé) | 73.5 % | 74 % | +0.5 | ±3.0 | **PASS** |
| AKs vs AQs (dominé, assorti) | 69.5 % | 71 % | +1.5 | ±3.5 | **PASS** |
| JJ vs AKo (race) | 56.9 % | 57 % | +0.1 | ±3.0 | **PASS** |
| AKs vs 22 (race, assorti) | 49.5 % | 50 % | +0.5 | ±3.0 | **PASS** |
| AKo vs KK (dominé) | 30.0 % | 30 % | 0.0 | ±3.0 | **PASS** |
| QQ vs AKs (race) | 53.8 % | 54 % | +0.2 | ±3.0 | **PASS** |

**8 PASS / 0 FAIL** — écart max 1.5 %.

---

## B. Multi-street — famille analytique (jeu de clairvoyance)

Range Hero polarisée (nuts + air) vs bluffcatcher, 1 street, sans raise.
Solution GTO **exacte connue** : bluff = `b/(P+b)`, call = `P/(P+b)`.

| Sizing | Réf bluff | SharkSolver | Réf call | SharkSolver | Verdict |
|---|---|---|---|---|---|
| bet ½ pot | 33.3 % | **33.7 %** | 66.7 % | **66.8 %** | PASS |
| bet 1 pot | 50.0 % | **49.7 %** | 50.0 % | **49.1 %** | PASS |
| bet 2× pot | 66.7 % | **66.5 %** | 33.3 % | **33.0 %** | PASS |

Écart max **0.9 %** sur toute la famille de sizings.

---

## C. Multi-street — exploitabilité (NashConv)

`NashConv` = somme des gains de **meilleure réponse exacte** contre la stratégie
produite. `≈ 0` ⟺ le solveur atteint l'équilibre du jeu modélisé. C'est la mesure
rigoureuse (auto-vérification, ne dépend d'aucune référence externe).

| Configuration | NashConv | Tolérance | Verdict |
|---|---|---|---|
| 1 street, sans raise | **0.0371 bb** | ≤0.15 | PASS |
| 1 street, avec raise | **0.0376 bb** | ≤0.20 | PASS |
| 2 streets, raise + probe | **0.0060 bb** | ≤0.30 | PASS |

---

## D. Ranges larges — performance & convergence

| Scénario | Temps | Résultat | Verdict |
|---|---|---|---|
| River 120×120 combos, 2 sizings + raise | **1 070 ms** | NashConv **0.036 bb** | PASS |
| Flop 3 rues, 100×100 combos, 120 itérations | **7 948 ms** | EV −0.582 bb · bet 20.2 % | PASS |
| Reproductibilité (même seed ⇒ même solve) | — | Identique | PASS |

---

## Synthèse

**17 scénarios / 17 PASS / 0 FAIL.**

Deux niveaux de preuve indépendants :
1. **Externe** — l'équité colle aux valeurs publiques ; les fréquences collent à la
   solution analytique du jeu de clairvoyance sur toute une famille de sizings.
2. **Interne** — l'exploitabilité par meilleure réponse exacte est ≈0, y compris avec
   raise et sur 2 rues : le solveur ne se contente pas de « ressembler » à un équilibre,
   il en est un pour le jeu modélisé.

**Non couvert par ce banc** (cf. `10_SHARKSOLVER_LIMITATIONS`) : multiway, préflop solvé,
ICM/PKO stratégiques, ranges intégrales non bornées, board incomplet avec exploitabilité
exacte (impossible : runouts échantillonnés).
