# PLAN DE TEST — PokerForge Adaptive Sizing Engine

> Mission §60 → §69, §97, §101, §102.

```bash
npm run test:sizing        # les 8 suites PFASE
npm test                   # tout PokerForge, PFASE compris
npm run audit:sizing:all   # QA navigateur : panneau, Trainer, persistance
node scripts/sizing-bench.mjs
```

---

## 1. Les huit suites

| Fichier | Couvre | Assertions |
|---|---|---:|
| `test-sizing-math.mjs` | §6, §7, §37, §60, §72, §73, §75, §76, §92 | 111 |
| `test-sizing-gametree.mjs` | non-régression v2 + §6, §10, §26, §74 | 60 |
| `test-sizing-hash.mjs` | §19, §20, §28, §63, §80 | 49 |
| `test-sizing-dynamic.mjs` | §9, §10, §11, §14, §15, §16, §22, §59, §61, §62, §86, §93 | 94 |
| `test-sizing-store.mjs` | §17, §18, §22, §28, §55, §80, §88, §92 | 106 |
| `test-sizing-trainer.mjs` | §29 → §44, §56, §64, §67, §68, §71, §87, §90, §91 | 139 |
| `test-sizing-replayer-coach.mjs` | §0, §47 → §53 | 103 |
| `test-sizing-pipeline.mjs` | §101 CASE A → H, §110 (vrai solveur) | 88 |
| **Total** | | **750** |

---

## 2. Deux régimes de test, et pourquoi

### 2.1 Solveur INJECTÉ — `test-sizing-dynamic.mjs`

§61 demande des « fixtures avec EV connues ». La raison est méthodologique : si la
sélection n'était testée qu'à travers un vrai solve CFR, un mauvais choix serait
**indiscernable d'un bruit d'échantillonnage**. En fixant les EV, on teste la
logique de sélection seule.

Les fixtures sont construites pour piéger l'erreur que §10 interdit :

```
33 seul  12.41       {33,75}     12.52
75 seul  12.48       {33,150}    12.55   ← LA MEILLEURE PAIRE
150 seul 12.31       {75,150}    12.50
                     {33,75,150} 12.56   (référence)
```

75 % est le meilleur sizing **seul**, mais la meilleure **paire** ne le contient
pas. Un moteur qui prendrait « les deux meilleurs » retiendrait `{33,75}` et
perdrait 0.04 bb au lieu de 0.01. Le test vérifie que `{33,150}` est retenu **et**
que `{33,75}` a bien été évaluée puis écartée sur mesure — pas ignorée.

### 2.2 Vrai solveur — `test-sizing-pipeline.mjs`

Aucune fixture. Les EV ne sont pas connues d'avance, donc les assertions portent
sur ce qui doit être vrai **quelles que soient les valeurs** : structure du
résultat, relations entre niveaux, honnêteté des annonces.

Ranges réduites à six classes par camp → énumération exacte (aucun `PARTIAL`
parasite) et 85 s pour les huit cas.

---

## 3. Acceptance Test Master (§101)

| Cas | Ce qui est vérifié | Résultat observé |
|---|---|---|
| **A — SINGLE** | un seul sizing retenu · EV et perte enregistrées · plancher · les 9 critères du §85 · le Trainer affiche exactement ce sizing (2 actions, pas une de plus) | retenu `75 %`, perte −0.012 bb, plancher 0.082 bb |
| **B — SIMPLE** | ≤ 2 sizings · des **paires** réellement solvées et comparées · les 4 candidats évalués seuls · la sélection est l'argmin de la perte | 6 paires comparées |
| **C — FIXED** | les 3 sizings restent disponibles · perte nulle · **aucun** sous-ensemble évalué · le Trainer les affiche tous les trois | `33 % · 75 % · 150 %` conservés |
| **D — GEOMETRIC** | même board, deux tapis → deux montants · deux hashs distincts | 6.49 bb (tapis 20) vs 21.50 bb (tapis 120) |
| **E — MULTITABLE** | 4 boards → 4 `solutionId` et 4 hashs distincts · chaque table lit **sa** solution | sizings `75 % | 150 % | 33 % | 150 %` |
| **F — FULL HAND** | turn et river du même coup → pot, SPR et montant différents · `coversStreetsAhead:false` | turn `75 %` = 9 bb (pot 12) ; river `150 %` = 34 bb (pot 24) |
| **G — SAVE/LOAD** | rechargée à l'identique : sizings, perte, fréquences, graine, convergence · directement entraînable sans recopie · provenance devient `POKERFORGE_DATABASE` | identique au bit près |
| **H — INVALID** | range vide → échec · board dupliqué → refus · rien stocké · le Trainer ne fabrique **aucun** bouton | `acts.length === 0`, « No verified solution available » |
| **§110** | 4 niveaux sous **un** `gameStateHash` · cache partagé · chaque niveau annonce son coût et son plancher | 1 état, 4 solutions |

---

## 4. Non-régression (§102)

Baseline capturée **avant** toute modification : `BASELINE_TESTS.txt`,
**5 845 assertions, exit 0**.

Après implémentation : `npm test` → exit 0, **61 suites vertes, 6 595 assertions**,
dont les huit nouvelles. Aucun test supprimé, aucun test affaibli.

Points de régression surveillés spécifiquement :

* forme exacte de l'arbre v2 (comptage de nœuds, labels, montants) ;
* `src/solver/core/validate.mjs` → 178 ✓ / 0 ✗ après modification de `api.js` ;
* `test-solver-reduced-games`, `test-solver-properties`,
  `test-solver-equilibrium-scope`, `test-trainer-postflop-solver`,
  `test-replayer-cfr` — tous verts après l'extension du Game Tree.

---

## 5. Ce que les tests ont trouvé

Onze défauts réels, tous corrigés, tous verrouillés par un test :

| # | Défaut | Trouvé par |
|---|---|---|
| 1 | Collision de clé de cache : trois sizings crédités de la même EV | test bout-en-bout |
| 2 | Signature de solve incomplète (`effStack`, `raiseMult` absents) — §63 | revue puis test |
| 3 | Perte d'EV négative systématique : mauvaise définition de la restriction | test bout-en-bout |
| 4 | Sous-convergence : un Single Size « battait » le solve complet | mesure de convergence |
| 5 | Plancher de mesure sous-estimé d'un facteur 3 | banc d'essai |
| 6 | Relance sous le minimum légal **promue** au minimum au lieu d'être écartée | `test-sizing-gametree` |
| 7 | `normalizeStreet` acceptait « PRE-TURN » → PREFLOP | `test-sizing-math` |
| 8 | `roundTo` rendait `-0` | `test-sizing-math` |
| 9 | `autoEscalate:false` escaladait quand même | `test-sizing-dynamic` |
| 10 | Les 4 niveaux ne partageaient pas le même `gameStateHash` | test de famille |
| 11 | La complexité `FULL` simplifiait, au lieu de ne rien simplifier | test de famille |

Et neuf de plus, trouvés **au navigateur** ou **au banc** — c'est-à-dire hors de
portée de toute relecture de code :

| # | Défaut | Trouvé par |
|---|---|---|
| 12 | Le budget temps affamait l'étage 1 → aucune solution rendue | QA navigateur |
| 13 | Le Worker plantait en nettoyant un échec, masquant le vrai motif | QA navigateur |
| 14 | Trois fuites mémoire distinctes (cache d'évaluation, bibliothèque, estimateur) | banc d'essai |
| 15 | Le Trainer cherchait la solution avec la mauvaise clé (hash au lieu d'id) | QA navigateur |
| 16 | Les solutions du Worker n'entraient jamais dans le magasin du thread principal | inspecteur §95 |
| 17 | §73 : solveur 1.125bb vs Trainer 1bb — deux montants pour une action | QA navigateur |
| 18 | Une étiquette « 75 % » désignait une mise de 67 % après quantification | QA navigateur |
| 19 | Le badge du Trainer étiquetait PFASE « SOLVEUR PUSH/FOLD » | QA navigateur |
| 20 | Le profil Chrome de QA, créé dans le dépôt, tuait le watcher de Vite | QA persistance |

---

## 6. QA visuelle (§69)

`scripts/sizing-shot.mjs` pilote un vrai Chrome : navigue vers SharkSolver, saisit
un board, choisit un mode, lance le solve, **attend le résultat**, lit le DOM par
ancres `data-pfase-*` et capture le panneau.

Lire `innerText` à coups d'expressions régulières s'est révélé fragile (le
`text-transform` CSS renvoie le titre en majuscules) : les ancres de données
rendent la mesure exacte.

Deux pièges de capture rencontrés et documentés dans le script :

* `elementHandle.screenshot()` sur un élément dans une colonne défilante capture
  une région tronquée par le viewport ;
* `page.screenshot({clip})` avec `captureBeyondViewport` (défaut) **relance une
  mise en page** et annule le défilement du conteneur interne — d'où
  `captureBeyondViewport: false`.

---

## 7. Déterminisme (§68)

Tout ce qui est aléatoire est seedé et injectable :

* runouts CFR → `config.seed`, partagée par tous les sous-arbres (CRN) ;
* actions Villain → `seededRng(seed)` ; vérifié sur 60 tirages, même graine →
  séquence identique ;
* banc d'essai → graine fixe 4242, deux exécutions donnent les mêmes EV.


---

## 8. QA navigateur : les trois scripts

| Script | Ce qu'il prouve |
|---|---|
| `npm run audit:sizing:ui` | le panneau existe, résout, et affiche perte d'EV, plancher, écart entre sizings, exploitabilité, provenance ; le Tree Editor navigue et son édition invalide les résultats (§23→§27) |
| `npm run audit:sizing:trainer` | « S'entraîner contre cette solution » → le Trainer rend EXACTEMENT les sizings du solveur, et affiche la provenance ⚖️ Adaptive Sizing avec le coût de la simplification (§87, §18, §71) |
| `npm run audit:sizing:persistence` | solve → sauvegarde → **rechargement de page** → la solution est retrouvée et IDENTIQUE : id, sizings, perte, plancher, exploitabilité, nœuds, classes (§88, §108) |

Chacun échoue bruyamment : ce ne sont pas des captures d'écran, ce sont des
comparaisons. Le second confronte les sizings annoncés par le solveur aux boutons
réellement rendus par le Trainer ; le troisième compare l'empreinte de la solution
avant et après rechargement.
