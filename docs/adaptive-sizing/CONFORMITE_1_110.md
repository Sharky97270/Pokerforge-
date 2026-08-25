# CHECKLIST DE CONFORMITÉ 1 → 110

> Consigne finale de la mission : « crée une checklist de conformité 1 → 110 ;
> marque chaque point PASS / PARTIAL / FAIL ; corrige tous les PARTIAL et FAIL
> qui peuvent être traités ».
>
> Chaque ligne renvoie à du code livré ou à un test qui la vérifie. Les `PARTIAL`
> portent leur cause et le renvoi à `LIMITATIONS.md`. Aucun point n'est marqué
> `PASS` sur une intention.

**Bilan : 92 PASS · 18 PARTIAL · 0 FAIL.**
Les 18 `PARTIAL` se ramènent à **six limitations réelles du moteur**
(L1 préflop, L2 heads-up, L3 mémoire flop, L4 EV par action, L5 rake, L11 ranges
heuristiques) et à **deux périmètres non couverts** (exploit produit par PFASE,
import externe). Toutes sont documentées, signalées à l'exécution, et aucune
n'est masquée.

---

## §0 — §10 · Fondations

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 0 | Aucune fausse précision GTO | **PASS** | `mayClaimSolved` exige provenance ET statut ; `distinguishable:false` sous le plancher ; `coachPayload.forbidden` ; aucun `if(dryBoard) size=33` nulle part |
| 1 | Audit complet avant modification | **PASS** | `AUDIT_BEFORE_IMPLEMENTATION.md` — 13 défauts hardcodés répertoriés, formats, dépendances, 10 risques |
| 2 | Ne pas casser l'existant | **PASS** | baseline 5 845 assertions → suite complète verte ; rien supprimé ; DB additive et réversible (`MIGRATION.md`) |
| 3 | Concept PFASE, architecture dédiée hors React | **PASS** | `src/sizing/` — 18 modules, aucun n'importe React |
| 4 | Modes FIXED / DYNAMIC / AUTOMATIC / SINGLE | **PASS** | `BettingTreeMode` ; `test-sizing-dynamic` (4 modes) ; CASE B/C |
| 5 | Complexités SINGLE/SIMPLE/ADVANCED/FULL centralisées | **PASS** | `COMPLEXITY_LIMITS` dans `config.js` — aucune borne ailleurs |
| 6 | Sizings pot % · géométrique · multiple de mise | **PASS** | `sizingSpec.js` (+ `bb`, `jam`) ; formule géométrique vérifiée analytiquement (4 contrôles) |
| 7 | Source unique pot/SPR/tapis/relances | **PARTIAL** | `gameState.js` fournit les 7 grandeurs ; testé SRP·3BP·4BP·limp·BvB·HU·antes·tapis asymétriques. **All-in partiel (side pots) non modélisé** → L2 |
| 8 | SizingCandidateGenerator | **PASS** | `candidateGenerator.js` ; `dropped[]` motive chaque écart |
| 9 | Dynamic Sizing Engine (référence, EV, argmin) | **PASS** | `dynamicOptimizer.js` ; convention d'EV documentée `ALGORITHM.md §0` |
| 10 | Sous-ensembles multi-size, pas les N meilleurs | **PASS** | fixture piège : `{33,150}` retenu contre `{33,75}` ; la paire écartée a bien été **évaluée** |

## §11 — §22 · Moteur

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 11 | CombinationPlanner (limites, cache, dédup, pruning justifié, budget, instrumentation) | **PASS** | `combinationPlanner.js` ; `pruned[]` ; `combinatorialSize` montre 23 244 solves évités |
| 12 | Évaluation à profondeur limitée, config explicite | **PASS** | `SizingEvaluationConfig` voyage avec le résultat ; `depthLimited` dans `partialReasons` |
| 13 | Solve final séparé | **PASS** | arbre reconstruit et re-résolu ; clés `EVAL:` distinctes ; `noStore` sur les micro-solves |
| 14 | Métrique de perte d'EV, sans ratio trompeur | **PASS** | `retainedEV` refusé sur référence ≤ 0 ; `evLossPotPct` toujours défini ; **deux** planchers rapportés — `distinguishable` (mesuré) et `guaranteed` (borné par NashConv), voir L7 |
| 15 | Écart d'EV entre actions | **PASS** | `actionRanking` mesuré à l'étage 1 ; affiché en barres dans le panneau |
| 16 | `maxAcceptableEVLoss` + complexité minimale | **PASS** | `selectUnderTolerance` ; tolérance non tenue → **dite**, pas masquée |
| 17 | Solution store versionné, tous les champs | **PASS** | `solutionSchema.js` ; 30 champs vérifiés un par un par test |
| 18 | SolutionProvenance + badges | **PASS** | provenance **dérivée** ; `APPROXIMATION.gtoClaim === false` |
| 19 | Hash canonique | **PASS** | clés triées, nombres quantifiés, `-0` normalisé ; 5 000 chaînes voisines → 5 000 hashs |
| 20 | Cache à plusieurs niveaux, invalidation | **PASS** | 3 étages ; `EVAL:` ≠ solution ; 2ᵉ passage = 0 solve |
| 21 | Convergence réelle, jamais fabriquée | **PASS** | NashConv exact sur board complet ; `null` + motif sinon — y compris sous rake, où la somme nulle tombe et où l'exploitabilité cesse d'être définie |
| 22 | États du solve, PARTIAL annoncé | **PASS** | `SolveStatus` ; `partialReasons` remontent jusqu'à l'écran |

## §23 — §28 · SharkSolver

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 23 | Betting Structure + Complexity | **PASS** | `AdaptiveSizingPanel` ; vérifié au navigateur |
| 24 | Réglages Dynamic (candidats, plafonds) | **PASS** | sélecteurs de mise et de relance, géo, JAM |
| 25 | Sélecteur d'unité % · e · x · JAM | **PASS** | `SIZING_UNIT_LABEL` ; « JAM » et jamais « AI » |
| 26 | Tree Editor | **PASS** | navigation nœud par nœud, actions affichées, sizing retenu visible, définition **propre à un nœud** (Fixed) ou héritée (Dynamic), ajout/suppression, invalidation des résultats — vérifié au navigateur |
| 27 | Presets | **PASS** | 5 préréglages PF ; aucun ne porte de vérité stratégique |
| 28 | Bibliothèque : 1 état → 4 niveaux, normalisée | **PASS** | 1 enregistrement d'état, 4 solutions ; CASE §110 |

## §29 — §46 · Trainer

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 29 | Le Trainer consomme une solution | **PASS** | `prepareTrainerSpot` ; `spotFromSolution` ; vérifié au navigateur |
| 30 | TrainingSolutionResolver, pas de « nearest board » | **PASS** | une carte de board différente → aucune solution servie |
| 31 | Single Size → un seul sizing affiché | **PASS** | 2 boutons exactement (Check + 1 mise) |
| 32 | Simple → deux sizings du même arbre | **PASS** | test dédié |
| 33 | Full → toutes les actions de la solution | **PASS** | `acts.length === node.actions.length` |
| 34 | Aucune conversion implicite de sizing | **PASS** | 68 % → « sizing non étudié » ; jamais arrondi vers 75 % |
| 35 | Architecture prête pour les mises libres | **PASS** | `compareAction` traite n'importe quel montant : hors arbre, EV indisponible, voisin cité comme approximatif |
| 36 | Retour : action, sizing, fréquence, EV… si disponibles | **PASS** | **EV par action désormais CALCULÉE** (`nodeActionEVs`) : `evPlayedBb`, `evBestBb`, `evLossBb`, avec la source (main ou range) et l'exactitude. Un sizing non résolu reste sans EV (§50). L4 levée |
| 37 | Ne jamais confondre action et sizing | **PASS** | `ActionType` strict ; un CALL de 9bb ≠ un BET de 9bb |
| 38 | Full Hand suit préflop → river | **PARTIAL** | postflop vérifié rue par rue (turn 9bb → river 34bb) ; **préflop hors périmètre PFASE** → L1 |
| 39 | Recalcul à chaque rue | **PASS** | `coversStreetsAhead:false` force la re-résolution |
| 40 | UN seul moteur pour 1T→4T | **PASS** | aucun chemin par nombre de tables |
| 41 | Multitabling : suggérer, pas imposer | **PASS** | un choix explicite n'est jamais écrasé |
| 42 | États de table isolés | **PASS** | 4 tables → 4 `solutionId` ; aucun sizing ne fuit |
| 43 | Villain échantillonné depuis la stratégie | **PASS** | proportions vérifiées sur 60 tirages |
| 44 | GTO et Exploit séparés | **PASS** | `compatibilityReport` refuse de servir l'un pour l'autre |
| 45 | Nodelock préservé et intégré | **PARTIAL** | `solveNodeLocked` **préservé intact** ; PFASE ne produit pas encore de solution d'exploit par nodelock |
| 46 | Profils formalisés, pas du texte pour LLM | **PARTIAL** | `EXPLOIT_PROFILES` sont déjà des verrous formels (préexistant, préservé) ; PFASE ne les consomme pas encore |

## §47 — §59 · Coach, Replayer, moteur

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 47 | Le Coach reçoit la solution, le nœud, l'action… | **PASS** | `buildCoachPayload` + liste des **interdits** dans la charge utile |
| 48 | Explication structurée en 7 rubriques | **PASS** | chaque rubrique porte `supported` et son motif d'indisponibilité |
| 49 | Replayer : joué vs Single/Simple/Full | **PASS** | `compareReplayDecision` ; les trois niveaux confrontés — et `formatReplayComparison` rend enfin les trois lignes « EV jouée / EV la meilleure / écart », avec la mention explicite quand l'écart tient dans le résidu d'indifférence du nœud |
| 50 | Sizing joué absent de l'arbre | **PASS** | aucune EV attribuée ; voisin cité et **étiqueté approximatif** |
| 51 | Analyse HH : niveau demandé, type conservé | **PASS** | `verdictSource` ; dénominateur partiel annoncé |
| 52 | Couche de données pour rapports agrégés | **PASS** | `aggregateSolutions` par texture, SPR, type de pot, complexité |
| 53 | Textures dérivées, jamais des heuristiques cachées | **PASS** | aucune propriété ne porte de sizing/fréquence/action |
| 54 | Preflop Tree Builder | **PARTIAL** | types et candidats préflop existent et sont testés ; **constructeur d'arbre préflop absent** → L1 |
| 55 | `evaluationModel` ChipEV/ICM/PKO, pas de faux ICM | **PASS** | badge ICM sans paramètres → solution **refusée** |
| 56 | Multiway prévu, activé seulement si supporté | **PASS** | `TABLE_FORMAT_SUPPORT` ; 3 joueurs → `UNSUPPORTED` |
| 57 | Instrumentation | **PASS** | durées, cache, taille d'arbre, itérations ; silence en production |
| 58 | Workers | **PASS** | `pfase.worker.js` ; plain-data strict |
| 59 | Annulation | **PASS** | coopérative puis terminaison ; `CANCELLED` distinct de `FAILED` |

## §60 — §69 · Tests

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 60 | Tests mathématiques + cas limites | **PASS** | 111 assertions ; tapis 5→200bb |
| 61 | Fixtures à EV connues | **PASS** | solveur injectable ; table d'EV |
| 62 | Test de cohérence (ordre, cache, index) | **PASS** | 3 ordres d'entrée → même sélection |
| 63 | Test de cache (board, stack, range, rake, candidat, version) | **PASS** | 49 assertions |
| 64 | Tests Trainer 1T→4T, GTO/Exploit, 4 niveaux | **PARTIAL** | multitabling et niveaux testés ; **Exploit non testé** faute de solution d'exploit produite (§45/§46) |
| 65 | Tests d'action check/bet/call/raise/fold/jam | **PARTIAL** | types, montants et verdicts testés via le pont ; la progression pot/tapis/rue d'une main jouée reste couverte par les suites **existantes** du Trainer, pas re-testée à travers PFASE |
| 66 | Mains complètes préflop → river | **PARTIAL** | turn → river vérifié ; préflop hors périmètre → L1 |
| 67 | 4 tables × 100 décisions | **PASS** | 400 décisions, aucun échec, aucune fuite |
| 68 | Mode déterministe | **PASS** | même graine → même séquence |
| 69 | QA visuelle réelle | **PARTIAL** | Solver, Tree Editor et Trainer 1T pilotés dans un vrai navigateur ; **2T/3T/4T non re-vérifiés visuellement** avec PFASE (l'injection d'un spot PFASE est mono-table par construction) |

## §70 — §84 · Qualité, formats, API

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 70 | Aucune régression visuelle | **PASS** | aucun composant existant redessiné ; jetons du thème réutilisés |
| 71 | Boutons dynamiques, rien hors solution | **PASS** | vérifié au navigateur : Check · Bet 67% · Tapis, rien d'autre |
| 72 | Montants internes, jamais des chaînes | **PASS** | `toSizingSpec("33%")` → `null` |
| 73 | Politique d'arrondi centralisée | **PASS** | **trois** arrondis distincts (plafond tronqué, plancher relevé, demande au plus proche) ; pas de mise partagé solveur/Trainer |
| 74 | All-in : action explicite | **PASS** | label `J`, montant issu du tapis |
| 75 | Tapis courts 5→30bb | **PASS** | testé |
| 76 | Tapis profonds 50→200bb | **PASS** | testé, aucun débordement |
| 77 | Format tournoi | **PARTIAL** | antes, tapis symétriques et asymétriques, HU testés ; **MTT/ICM** limité par L6 |
| 78 | Format cash (rake, cap, straddle) | **PARTIAL** | **rake et cap APPLIQUÉS** à l'utilité terminale (`makeRakeModel`), variante « pots non disputés » comprise ; le sizing retenu en change (75 % → 33 % à 5 %/cap 3bb). Somme nulle levée → NashConv `null`, ICM+rake refusé. L5 levée. **Straddle toujours non modélisé** |
| 79 | API claire | **PASS** | `pfase.js` — 8 fonctions publiques ; aucun doublon de service existant |
| 80 | Versionnage | **PASS** | 3 versions, dans le hash **et** vérifiées à la lecture |
| 81 | Feature flag | **PASS** | `adaptiveSizingEngine` ; complet derrière le drapeau |
| 82 | Migration progressive | **PASS** | moteur historique intact et visible à côté |
| 83 | Benchmarking | **PASS** | 10 spots, monotonie 10/10, temps et mémoire consignés |
| 84 | Validation externe (import Pio/HRC) | **PARTIAL** | provenance `VERIFIED_IMPORT` et schéma prêts ; **aucun pipeline d'import** construit |

## §85 — §100 · Critères de terminaison

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 85 | Critère Single Size (9 points) | **PASS** | les 9 vérifiés un par un dans CASE A |
| 86 | Critère Dynamic | **PASS** | retirer un candidat change le sous-arbre, la stratégie et l'EV |
| 87 | Critère Trainer | **PASS** | « S'entraîner contre cette solution » → sizings identiques, vérifié au navigateur |
| 88 | Persistance solve/save/reload/load/train | **PASS** | CASE G en test ; rechargement de page vérifié au navigateur (`audit:sizing:persistence`) |
| 89 | Routage / rechargement direct | **PARTIAL** | aucune solution ne vit uniquement en mémoire volatile (IndexedDB + hydratation) ; **PokerForge n'a pas de routage d'URL**, donc rien à préserver de ce côté |
| 90 | Fail safe Trainer | **PASS** | « No verified solution available » + 3 suites proposées, 0 bouton fabriqué |
| 91 | Mode approximatif distingué | **PASS** | `APPROXIMATION` ne peut pas porter un badge calculé |
| 92 | Qualité de donnée | **PASS** | 6 catégories de refus testées |
| 93 | Normalisation des stratégies | **PASS** | somme ≈ 1 vérifiée à chaque nœud, refus au stockage |
| 94 | Stabilité numérique | **PASS** | `EPS` centralisés, aucune égalité stricte de flottants |
| 95 | Debug inspector | **PASS** | `globalThis.__PFASE__` ; a servi à trouver un vrai bug d'instance de module |
| 96 | Fonctions pures | **PASS** | tous les modules `sizing/` sont purs et testés hors navigateur |
| 97 | Documentation | **PASS** | 9 fichiers dans `docs/adaptive-sizing/` |
| 98 | ALGORITHM.md avec formules | **PASS** | formule géométrique, perte d'EV, plancher, budget |
| 99 | LIMITATIONS.md | **PASS** | 11 limitations, chacune avec cause, livraison, reste à faire |
| 100 | Aucun faux dans le chemin de production | **PASS** | revue §103 : aucun TODO/MOCK/placeholder ; 5 `Math.random`, tous des générateurs **par défaut injectables** (§43/§68) ou l'identifiant d'instance du diagnostic |

## §101 — §110 · Acceptation et objectif

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 101 | Acceptance Test Master CASE A→H | **PASS** | 8 cas, vrai solveur, 88 assertions |
| 102 | Tests de non-régression | **PASS** | suite complète verte ; aucun test supprimé ni affaibli |
| 103 | Revue finale (TODO/MOCK/random/hardcodé) | **PASS** | 5 occurrences, chacune analysée et justifiée |
| 104 | Revue Trainer jouée réellement | **PARTIAL** | 1T joué de bout en bout au navigateur ; 2T/3T/4T, Full Hand et Session non rejoués manuellement avec PFASE |
| 105 | Revue SharkSolver (4 modes, réactions du cache) | **PASS** | 4 modes testés ; §63 vérifie que board/stack/range/candidat/version invalident |
| 106 | Revue des données d'une solution stockée | **PASS** | 30 champs vérifiés ; inspecteur `inspectSolution` |
| 107 | Rapport final | **PASS** | `RAPPORT_FINAL.md` |
| 108 | Definition of done | **PARTIAL** | le cycle complet est vérifié **en 1T** (état → candidats → solve → EV → sélection → solve final → stockage → Trainer → verdict → rechargement) ; **non rejoué en 2T/3T/4T** |
| 109 | Ordre d'implémentation | **PASS** | audit → état → arbre → sizings → candidats → solveur → optimiseur → … → UI en dernier |
| 110 | Objectif final FULL → SINGLE | **PASS** | famille des 4 niveaux, chacun avec son coût **et son plancher de mesure** |

---

## Les 18 PARTIAL, regroupés par cause

| Cause | Points concernés | Renvoi |
|---|---|---|
| Le préflop n'a pas de constructeur d'arbre | §38, §54, §66 | L1 |
| Le moteur est heads-up | §7 (all-in partiel), §77 | L2 |
| Mémoire du flop à 3 rues | (aucun PARTIAL : dégradé et annoncé) | L3 |
| ~~EV par action non conservée~~ | **levé** — §36 et §49 passent en PASS calculé | ~~L4~~ |
| ~~Rake non appliqué~~ | **levé** — §78 reste PARTIAL pour le seul straddle | ~~L5~~ |
| PFASE ne produit pas encore de solution d'exploit | §45, §46, §64 | — |
| Pas de pipeline d'import externe | §84 | — |
| QA visuelle et rejeu manuel limités au 1T | §65, §69, §104, §108 | — |
| PokerForge n'a pas de routage d'URL | §89 | — |
