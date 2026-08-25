# BENCHMARKS — PokerForge Adaptive Sizing Engine

> Mission §83. Reproduire : `node scripts/sizing-bench.mjs`
> Données brutes : `design-qa-evidence/sizing-bench.json` et `sizing-bench-river.json`.

**Ce que ce banc mesure** : le comportement du moteur — temps, mémoire, monotonie
de la perte d'EV, mesurabilité du classement. **Ce qu'il ne mesure pas** : des
vérités stratégiques. Les ranges sont réduites à huit classes par camp pour que
l'énumération de combos soit exacte et que dix spots tiennent en dix minutes.

Configuration : évaluation 200 itérations (escalade jusqu'à 800, cible de
convergence 0.03 bb, budget 30 s) · solve final 400 itérations · combos non
plafonnés · graine 4242 · candidats `33 % · 75 % · 150 % · géo 2e · JAM`,
relance `2.5x`.

---

## 1. Vue d'ensemble — 10 spots, 625 s

| Spot | SPR | Durée | Δ tas | FULL | ADVANCED | SIMPLE | SINGLE |
|---|---:|---:|---:|---:|---:|---:|---:|
| SRP OOP · river · SPR moyen | 3.33 | 15.2 s | +19 Mo | 0.000 | 0.019 | 0.019 | 0.019 |
| SRP OOP · river · SPR bas | 0.50 | 2.1 s | −14 Mo | 0.000 | −0.005 | −0.005 | −0.005 |
| SRP OOP · river · SPR haut | 11.25 | 11.7 s | +28 Mo | 0.000 | 0.000 | 0.000 | 0.000 |
| 3BP OOP · river | 2.05 | 14.5 s | −5 Mo | 0.000 | 0.048 | 0.048 | 0.048 |
| 4BP OOP · river · SPR très bas | 0.42 | 3.2 s | −5 Mo | 0.000 | 0.000 | 0.000 | 0.000 |
| BvB · river apparié | 4.50 | 14.4 s | +19 Mo | 0.000 | 0.011 | 0.011 | 0.011 |
| SRP OOP · turn | 3.33 | 143 s | +151 Mo | 0.000 | −0.095 | −0.095 | −0.095 |
| 3BP OOP · turn | 2.05 | 118 s | +149 Mo | 0.000 | −0.098 | −0.098 | −0.098 |
| SRP OOP · flop sec | 3.33 | 145 s | +602 Mo | 0.000 | −0.200 | −0.200 | −0.200 |
| SRP OOP · flop humide monotone | 3.33 | 157 s | −153 Mo | 0.000 | −0.155 | −0.155 | −0.155 |

*(perte d'EV en bb ; `FULL` vaut 0 par définition — il ne simplifie rien)*

**Monotonie : 10/10.** La perte d'EV ne diminue jamais quand la complexité baisse,
au-delà du plancher de mesure. C'est la propriété que garantit la définition
asymétrique de la perte (ALGORITHM.md §5.1) ; le banc la vérifie automatiquement
et échouerait bruyamment sinon.

---

## 2. Ce que ces chiffres disent — et ne disent pas

### 2.1 Toutes les pertes sont sous le plancher de mesure

| Spot | perte SINGLE | plancher | distinguable |
|---|---:|---:|:--:|
| river · SPR moyen | 0.019 | 0.058 | non |
| river · SPR bas | −0.005 | 0.022 | non |
| river · SPR haut | 0.000 | 0.068 | non |
| 3BP river | 0.048 | 0.076 | non |
| 4BP river | 0.000 | 0.054 | non |
| BvB river | 0.011 | 0.058 | non |
| turn | −0.095 | 0.324 | non |
| 3BP turn | −0.098 | 0.139 | non |
| flop sec | −0.200 | 0.203 | non |
| flop monotone | −0.155 | 0.316 | non |

Aucune de ces pertes ne peut être affirmée. Le moteur le dit
(`distinguishable: false`), et l'interface affiche : *« Ce niveau ne coûte rien de
mesurable — ce qui n'est pas la même chose que "ne coûte rien". »*

C'est le résultat honnête, et il est cohérent avec la théorie : un Single Size
**bien choisi** coûte très peu face à un arbre complet. Ce qui coûte, c'est un
sizing **mal** choisi — et cela, le moteur le mesure (§2.2).

### 2.2 Le classement des sizings, lui, est mesurable

Sur les six spots river (`sizing-bench-river.json`) :

| Spot | retenu | écarts d'EV du classement (bb) | plancher | mesurable |
|---|---|---|---:|:--:|
| river · SPR moyen | 75 % | 0 · −0.232 · −0.387 · −0.810 | 0.058 | **oui** |
| river · SPR bas | JAM | 0 · −0.005 | 0.022 | non |
| river · SPR haut | 75 % | 0 · −0.265 · −0.393 · −1.443 | 0.068 | **oui** |
| 3BP river | 33 % | 0 · −0.017 · −0.319 · −0.476 | 0.076 | **oui** |
| 4BP river · SPR 0.42 | 33 % | 0 · −0.004 | 0.054 | non |
| BvB river apparié | 75 % | 0 · −0.053 · −0.513 · −0.862 | 0.058 | **oui** |

Là où les sizings **diffèrent réellement**, l'écart entre le meilleur et le pire
atteint 0.8 à 1.4 bb — dix à vingt fois le plancher. Le moteur départage sans
ambiguïté.

Les deux spots « non mesurables » sont à SPR 0.42 et 0.50 : à cette profondeur,
`75 %`, `150 %`, `géo 2e` et `JAM` valent **le même montant** (le tapis). Il ne
reste que deux actions distinctes, et l'écart entre elles est nul. Le moteur
refuse de les classer — parce qu'il n'y a rien à classer. C'est la déduplication
par montant (ALGORITHM.md §1) qui produit ce comportement, pas une règle écrite.

### 2.3 Les sizings retenus varient réellement avec le spot

`75 %` · `JAM` · `75 %` · `33 %` · `33 %` · `75 %` sur les six river,
`150 %` et `75 %` sur les turn, `géo 2e` sur les deux flops. Le moteur ne
converge pas vers une constante déguisée : le sizing retenu dépend du board, du
pot et du SPR. C'est le critère §86 (« modifier les candidats change réellement
le sous-arbre retenu »), vérifié aussi par test unitaire.

---

## 3. Coût par rue

| Rue | Durée famille (4 niveaux) | Δ tas | Profondeur effective | Exploitabilité |
|---|---:|---:|---|---|
| River | 2 – 15 s | ≤ 28 Mo | 1 rue (exacte) | **NashConv exact** 0.010 – 0.054 bb |
| Turn | 118 – 143 s | ~150 Mo | 2 rues | indisponible (runouts échantillonnés) |
| Flop | 145 – 157 s | jusqu'à 600 Mo | 2 rues sur 3 (dégradé) | indisponible |

La river est le seul cas où l'exploitabilité est **calculable exactement** : le
board est complet, il n'y a pas d'échantillonnage. C'est aussi le cas le plus
rapide. Turn et flop coûtent dix fois plus et rendent une solution `PARTIAL`
annotée — voir LIMITATIONS.md L3.

---

## 4. Efficacité du cache

Le cache d'évaluation est **partagé entre les quatre niveaux** d'une même famille :
les candidats et les micro-solves de l'étage 1 sont identiques d'un niveau à
l'autre. Mesuré : **20 à 34 réutilisations pour 16 à 17 solves réels**, soit une
famille complète au prix d'environ un niveau et demi.

Deux corrections mémoire ont été nécessaires pour que ce banc tourne jusqu'au bout :

1. le cache d'évaluation conservait l'objet solution complet (tables CFR) —
   il ne mémorise plus que des nombres ;
2. les micro-solves entraient dans `solver/library.js`, qui garde 500 solutions
   complètes en mémoire — ils la contournent désormais (`noStore`).

Sans ces deux corrections, le banc tombait à court de tas (4 Go) dès le 9ᵉ spot.

---

## 5. Reproduire

```bash
node scripts/sizing-bench.mjs
node scripts/sizing-bench.mjs --only=river --out=design-qa-evidence/sizing-bench-river.json
```

Le banc est **déterministe** (graine fixe) : deux exécutions donnent les mêmes EV
aux arrondis près. Il échoue bruyamment si la monotonie de la perte d'EV est
violée au-delà du plancher de mesure.
