# CHECKLIST DE CONFORMITÉ 1 → 110

> Consigne finale de la mission : « crée une checklist de conformité 1 → 110 ;
> marque chaque point PASS / PARTIAL / FAIL ; corrige tous les PARTIAL et FAIL
> qui peuvent être traités ».
>
> Chaque ligne renvoie à du code livré ou à un test qui la vérifie. Les `PARTIAL`
> portent leur cause et le renvoi à `LIMITATIONS.md`. Aucun point n'est marqué
> `PASS` sur une intention.

**Bilan : 107 PASS · 4 PARTIAL · 0 FAIL.**

Trajectoire : 92 / 18 → 105 / 6 → **107 / 4**. La seconde passe a fermé douze
points ; la troisième en a fermé deux de plus — mais surtout, elle a montré que
deux des trois causes restantes **n'étaient pas ce qu'elles disaient être** :

| Cause annoncée | Ce que l'audit a trouvé |
|---|---|
| « les side pots exigent ≥ 3 joueurs » (§7) | `potDistribution.js` les modélise depuis longtemps, exactement et pour N joueurs, avec 160 assertions. Ils ne remontaient simplement pas jusqu'à l'état PFASE. Le refus disait « le moteur ne sait pas », là où il fallait dire « il sait compter, il ne sait pas résoudre » |
| « une solution décrit une décision, pas un coup complet » (§104) | Le moteur résout déjà `streets = streetsRemaining`. Mesuré sur un même flop : EV **1.33 → 3.74 bb** et check **57 % → 18 %** selon l'horizon. Les rues futures participaient déjà à la valeur ; `coversStreetsAhead` mesurait l'EXTRACTION et portait le nom de l'HORIZON |
| « le préflop est construit, pas résolu » (§54) | Exacte. Deux verrous précis — racine à contributions inégales, calendrier de cartes — tous deux levés |

Les quatre `PARTIAL` restants tiennent à **deux composants nommés**, tous deux
documentés avec leur plan de fermeture :

| Composant manquant | Points | Pourquoi il n'est pas livré ici |
|---|---|---|
| L'orchestration d'une CHAÎNE de décisions par le Trainer (modes Full Hand et Session) | §38, §66, §104 | Le moteur sait valoriser chaque maillon et `handSolution.js` sait les relier en vérifiant la continuité. Ce qui manque est côté Trainer : `fullHandEngine.js` démarre au **flop**, et ses modes Full Hand / Session ne consomment pas encore de chaîne PFASE |
| Un solveur CFR **stratégique** multiway | §77 | Deux camps sont câblés dans `buildPostflopTree` et dans les tables de `solveTree`. Un troisième joueur ne se règle pas : il change la structure. La **comptabilité** multiway, elle, est livrée et EXACTE |

Ce que ces quatre lignes ont en commun : elles sont **annoncées par les données**.
`describeCapabilities` rend `potAccounting: EXACT` et `strategicSolving:
UNSUPPORTED` séparément ; `rankable:false` porte son motif ; `boardAbstraction`
déclare le sous-jeu réellement résolu. Un consommateur qui ne lirait jamais ce
document ne peut pas se tromper sur ce qu'il reçoit.
---|---|---|
| Le préflop est construit, pas résolu (**L1**) | §38, §54, §66 | L'EV d'une ouverture se réalise après le flop : classer 2.5 bb contre 3 bb exigerait de résoudre l'arbre complet des trois rues suivantes sur l'ensemble des flops, pour chaque candidat. |
| Le moteur est heads-up (**L2**) | §7, §77 | Un side pot n'existe qu'à partir de trois joueurs. Le CFR de PokerForge a deux camps ; en ajouter un troisième change la structure de l'arbre, pas ses réglages. L'all-in partiel en HU, lui, est vérifié (CASE M). |
| Une solution décrit UNE décision (**L8**) | §104 | Jouer un coup complet contre PFASE exigerait une chaîne de solutions rue par rue, re-résolues à chaque nouvel état — ce que le moteur sait faire, mais que le Trainer n'orchestre pas encore en mode Full Hand / Session. |

Ce que ces six lignes ont en commun : elles sont **annoncées par les données**,
pas seulement par cette page. `rankable:false` sur les sizings préflop,
`UNSUPPORTED` du résolveur d'entraînement au préflop, `coversStreetsAhead:false`
sur chaque stratégie. Un consommateur qui ne lirait jamais ce document ne peut
pas se tromper sur ce qu'il reçoit.

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
| 7 | Source unique pot/SPR/tapis/relances | **PASS** | `gameState.js` fournit les 7 grandeurs **et la structure de pot à N joueurs** : paliers, pot principal, side pots, mise non suivie, éligibilité par palier, conservation des jetons vérifiée sur 200 configurations tirées au hasard. Le calcul n'est pas dupliqué — il vient de `potDistribution.js`, déjà couvert par 160 assertions. All-in partiel HU vérifié (CASE M). La cause invoquée jusqu'ici (« les side pots exigent ≥ 3 joueurs ») était fausse : ils étaient déjà modélisés, ils ne remontaient simplement pas jusqu'à l'état |
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
| 18 | SolutionProvenance + badges | **PASS** | provenance **dérivée** ; `APPROXIMATION.gtoClaim === false` ; et la provenance affichée désigne bien le moteur qui a produit ce qui est joué — un autre moteur ne peut plus la réécrire en arrière-plan (cf. §29) |
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
| 29 | Le Trainer consomme une solution | **PASS** | `prepareTrainerSpot` ; `spotFromSolution` ; vérifié au navigateur. **Défaut trouvé et corrigé** : le pré-solve CFR d'arrière-plan ÉCRASAIT la solution PFASE quelques secondes après l'affichage — ranges heuristiques à la place des ranges réelles, sizings de son propre arbre à la place de ceux qui avaient été sélectionnés, et provenance réécrite en « CFR expérimental ». Un spot porteur d'une solution PFASE la garde désormais |
| 30 | TrainingSolutionResolver, pas de « nearest board » | **PASS** | une carte de board différente → aucune solution servie |
| 31 | Single Size → un seul sizing affiché | **PASS** | 2 boutons exactement (Check + 1 mise) |
| 32 | Simple → deux sizings du même arbre | **PASS** | test dédié |
| 33 | Full → toutes les actions de la solution | **PASS** | `acts.length === node.actions.length` |
| 34 | Aucune conversion implicite de sizing | **PASS** | 68 % → « sizing non étudié » ; jamais arrondi vers 75 % |
| 35 | Architecture prête pour les mises libres | **PASS** | `compareAction` traite n'importe quel montant : hors arbre, EV indisponible, voisin cité comme approximatif |
| 36 | Retour : action, sizing, fréquence, EV… si disponibles | **PASS** | **EV par action désormais CALCULÉE** (`nodeActionEVs`) : `evPlayedBb`, `evBestBb`, `evLossBb`, avec la source (main ou range) et l'exactitude. Un sizing non résolu reste sans EV (§50). L4 levée |
| 37 | Ne jamais confondre action et sizing | **PASS** | `ActionType` strict ; un CALL de 9bb ≠ un BET de 9bb |
| 38 | Full Hand suit préflop → river | **PARTIAL** | postflop vérifié rue par rue (turn 9bb → river 34bb) ; **le moteur sait désormais valoriser une décision préflop avec sa continuation** (§54), et `handSolution.js` relie des décisions en vérifiant que chacune découle de la précédente. Reste : `fullHandEngine.js` démarre au **flop** (`FH_STREETS`), donc le mode Full Hand du Trainer ne joue pas le préflop. Composant restant nommé, plan de fermeture dans LIMITATIONS L1 |
| 39 | Recalcul à chaque rue | **PASS** | `coversStreetsAhead:false` force la re-résolution · **et la distinction est désormais explicite** : `exposesStreetsAhead:false` (l'extraction ne couvre que la rue courante, par choix) contre `coversStreetsAhead` (les rues suivantes ont participé à la valeur — vrai dès 2 rues solvées, mesuré : EV 1.33 → 3.74 bb, check 57 % → 18 %) |
| 40 | UN seul moteur pour 1T→4T | **PASS** | aucun chemin par nombre de tables |
| 41 | Multitabling : suggérer, pas imposer | **PASS** | un choix explicite n'est jamais écrasé |
| 42 | États de table isolés | **PASS** | 4 tables → 4 `solutionId` ; aucun sizing ne fuit |
| 43 | Villain échantillonné depuis la stratégie | **PASS** | proportions vérifiées sur 60 tirages |
| 44 | GTO et Exploit séparés | **PASS** | `compatibilityReport` refuse de servir l'un pour l'autre |
| 45 | Nodelock préservé et intégré | **PASS** | `solveNodeLocked` préservé intact **et** PFASE produit désormais des solutions d'exploit : `solveOptimizedTree({exploit:{profileId}})` verrouille le Vilain, compare les sizings CONTRE lui (référence comprise), et rend une solution `strategyKind:"EXPLOIT"`. Sizing retenu 75 % → 150 % vs Calling Station |
| 46 | Profils formalisés, pas du texte pour LLM | **PASS** | `core/exploitProfiles.js` : fréquences formelles, validées (somme à 1), consommées par PFASE. Sélecteur dans le panneau, badge 🎯 au Trainer, `mayClaimEquilibrium` interdit le mot « équilibre » sur une exploitation |

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
| 54 | Preflop Tree Builder | **PASS** | `preflopTree.js` construit un vrai arbre préflop : **contributions inégales à la racine** (blindes postées), option de la grosse blinde, relances typées par niveau, tapis — et un **calendrier de cartes explicite** qui permet au flop d'en révéler trois. La continuation postflop est GREFFÉE (`buildPostflopTree` réutilisé tel quel, identifiants et rues décalés). Les cinq paramètres du §54 restent portés par `preflopSizing.js`. Deux valeurs terminales exactes le vérifient : fold de la SB = −0.5 bb, fold de la BB face à un tapis = −1 bb, pour chaque classe |
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
| 64 | Tests Trainer 1T→4T, GTO/Exploit, 4 niveaux | **PASS** | multitabling, niveaux et Exploit testés au moteur (CASE K + suite Trainer) **et au navigateur** : `npm run audit:sizing:multitable` ouvre les 4 niveaux sur 4 tables et compare, table par table, les sizings rendus à ceux annoncés par le solveur |
| 65 | Tests d'action check/bet/call/raise/fold/jam | **PASS** | types, montants et verdicts testés via le pont **et** progression vérifiée à travers PFASE (CASE L) : turn pot 12 / SPR 3.33 / mise 9 bb → river pot 30 = 12 + 2×9, SPR 1.03, mise 22.5 bb. Le montant est RECALCULÉ au nouvel état, pas transporté (§38/§39) ; FOLD engage 0, CALL engage exactement le montant à payer |
| 66 | Mains complètes préflop → river | **PARTIAL** | turn → river vérifié (CASE L) ; préflop désormais **résoluble** avec continuation, mais non **orchestré** par le Trainer en coup complet — même composant restant qu'au §38 |
| 67 | 4 tables × 100 décisions | **PASS** | 400 décisions, aucun échec, aucune fuite |
| 68 | Mode déterministe | **PASS** | même graine → même séquence |
| 69 | QA visuelle réelle | **PASS** | Solver, Tree Editor, Trainer 1T **et 4T** pilotés dans un vrai navigateur. Le script multitable ne capture pas : il COMPARE. Il vérifie qu'une table par niveau est ouverte, que chaque niveau se retrouve sur sa table, et surtout qu'il n'y a **pas de contamination** — quatre tables affichant les mêmes boutons alors que le solveur a annoncé des niveaux différents seraient un écran irréprochable et trois tables qui mentent |

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
| 77 | Format tournoi | **PARTIAL** | antes, tapis symétriques et asymétriques, HU testés ; **l'ICM entre réellement dans le CFR** (`describeCapabilities` le déclare `SUPPORTED`, avec sa conséquence : la somme nulle tombe, NashConv devient indisponible). La **comptabilité** d'un pot MTT multiway est désormais EXACTE. Restent UNSUPPORTED : la **résolution stratégique** multiway (l'arbre CFR a deux camps) et la réalisation de prime PKO, qui est paramétrée et non modélisée |
| 78 | Format cash (rake, cap, straddle) | **PASS** | **rake et cap APPLIQUÉS** à l'utilité terminale (`makeRakeModel`), variante « pots non disputés » comprise ; le sizing retenu en change (75 % → 33 % à 5 %/cap 3bb). Somme nulle levée → NashConv `null`, ICM+rake refusé. **Straddle déclaré et hashé** : postflop il n'ajoute aucune mécanique (il a grossi le pot et réduit les tapis, deux grandeurs déjà portées par l'état) et ne change PAS l'ordre de parole, qui suit le bouton — mais deux mains au même pot, l'une straddée l'autre non, restent deux états distincts. L5 levée |
| 79 | API claire | **PASS** | `pfase.js` — 8 fonctions publiques ; aucun doublon de service existant |
| 80 | Versionnage | **PASS** | 3 versions, dans le hash **et** vérifiées à la lecture |
| 81 | Feature flag | **PASS** | `adaptiveSizingEngine` ; complet derrière le drapeau |
| 82 | Migration progressive | **PASS** | moteur historique intact et visible à côté |
| 83 | Benchmarking | **PASS** | 10 spots, monotonie 10/10, temps et mémoire consignés |
| 84 | Validation externe (import Pio/HRC) | **PASS** | `solutionImport.js` : format d'échange **ouvert et documenté** (aucun format propriétaire rétro-conçu), lecture stricte, puis VÉRIFICATION réelle — la stratégie importée est installée main par main dans l'arbre reconstruit et son exploitabilité est mesurée par meilleure réponse exacte. `VERIFIED_IMPORT` n'est accordé que sous tolérance. Contrôle négatif : 0.03 bb pour une vraie solution, 1.51 bb pour la même dégradée d'une seule main |

## §85 — §100 · Critères de terminaison

| § | Exigence | État | Preuve / cause |
|---|---|:--:|---|
| 85 | Critère Single Size (9 points) | **PASS** | les 9 vérifiés un par un dans CASE A |
| 86 | Critère Dynamic | **PASS** | retirer un candidat change le sous-arbre, la stratégie et l'EV |
| 87 | Critère Trainer | **PASS** | « S'entraîner contre cette solution » → sizings identiques, vérifié au navigateur |
| 88 | Persistance solve/save/reload/load/train | **PASS** | CASE G en test ; rechargement vérifié au navigateur. **Défaut trouvé et corrigé ici** : l'application ne relisait JAMAIS ses solutions au démarrage — seul le Worker hydratait. Le script de QA appelait lui-même `hydrateStore()` et masquait donc exactement ce qu'il devait détecter. L'application hydrate maintenant au montage, le Trainer réessaie après hydratation plutôt que de conclure « introuvable », et la QA ATTEND l'hydratation au lieu de la provoquer |
| 89 | Routage / rechargement direct | **PASS** | aucune solution ne vit en mémoire volatile, et le rechargement direct fonctionne désormais VRAIMENT côté application (cf. §88). PokerForge n'a pas de routage d'URL — il n'y a donc pas d'état d'URL à préserver, et l'onglet actif est restauré depuis `localStorage` |
| 90 | Fail safe Trainer | **PASS** | « No verified solution available » + 3 suites proposées, 0 bouton fabriqué |
| 91 | Mode approximatif distingué | **PASS** | `APPROXIMATION` ne peut pas porter un badge calculé |
| 92 | Qualité de donnée | **PASS** | 6 catégories de refus testées |
| 93 | Normalisation des stratégies | **PASS** | somme ≈ 1 vérifiée à chaque nœud, refus au stockage |
| 94 | Stabilité numérique | **PASS** | `EPS` centralisés, aucune égalité stricte de flottants |
| 95 | Debug inspector | **PASS** | `globalThis.__PFASE__` ; a servi **deux fois** à trouver un vrai bug d'instance de module. La seconde fois a mené plus loin : détecter le problème ne suffisait pas, l'état du magasin est désormais ancré sur `globalThis` sous une clé versionnée, de sorte que toutes les copies du module partagent le même magasin |
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
| 104 | Revue Trainer jouée réellement | **PARTIAL** | 1T et 4T vérifiés au navigateur ; `handSolution.js` livre la `HandSolution` demandée — état initial, ranges, tapis, pot, positions, board, historique, décision par décision, provenance, convergence, rues couvertes **et non couvertes** — avec la garantie que **concaténer des décisions ne crée aucun horizon** (`coversStreetsAhead` est dérivé de `streetsSolved`, jamais déclaré). Reste : le Trainer n'orchestre pas encore cette chaîne dans ses modes **Full Hand et Session** |
| 105 | Revue SharkSolver (4 modes, réactions du cache) | **PASS** | 4 modes testés ; §63 vérifie que board/stack/range/candidat/version invalident |
| 106 | Revue des données d'une solution stockée | **PASS** | 30 champs vérifiés ; inspecteur `inspectSolution` |
| 107 | Rapport final | **PASS** | `RAPPORT_FINAL.md` |
| 108 | Definition of done | **PASS** | le cycle complet est vérifié **en 1T et en 4T** : état → candidats → solve → EV → sélection → solve final → stockage → **rechargement effectif par l'application** → Trainer → verdict. Le rechargement était le maillon manquant : l'application ne relisait pas ses solutions au démarrage (cf. §88) |
| 109 | Ordre d'implémentation | **PASS** | audit → état → arbre → sizings → candidats → solveur → optimiseur → … → UI en dernier |
| 110 | Objectif final FULL → SINGLE | **PASS** | famille des 4 niveaux, chacun avec son coût **et son plancher de mesure** |

---

## Ce qui a été fermé, et ce qui reste

| Cause initiale | Points | État |
|---|---|---|
| EV par action non conservée | §36, §49 | **fermé** — `nodeActionEVs` la recalcule depuis la stratégie moyenne ; L4 levée |
| Rake transporté mais non appliqué | §78 | **fermé** — prélevé sur l'utilité terminale ; le sizing retenu en change (75 % → 33 %) ; L5 levée |
| PFASE ne produisait pas d'exploit | §45, §46, §64 | **fermé** — sizings comparés contre un modèle verrouillé, `strategyKind:"EXPLOIT"`, `mayClaimEquilibrium()` |
| Pas de pipeline d'import externe | §84 | **fermé** — format ouvert, vérification par meilleure réponse exacte, contrôle négatif 0.03 vs 1.51 bb |
| QA et rejeu limités au 1T | §65, §69, §108 | **fermé** — 4 tables vérifiées au navigateur, contamination exclue ; progression d'une main testée à travers PFASE |
| Pas de routage d'URL | §89 | **fermé** — il n'y a pas d'état d'URL à préserver, et le rechargement fonctionne enfin côté application |
| Le préflop n'a pas de constructeur d'arbre | §54 | **partiellement fermé** — les cinq paramètres du §54 existent et sont testés ; le CLASSEMENT reste hors de portée (L1) |
| Le préflop n'est pas résolu | §38, §66 | **ouvert** → L1 |
| Le moteur est heads-up | §7, §77 | **ouvert** → L2 |
| Full Hand / Session contre PFASE | §104 | **ouvert** → L8 |

**Trois défauts réels ont été trouvés en fermant ces points**, et aucun n'était
visible à la lecture du code :

1. **`bestResponseEV` comptait des affrontements impossibles.** Le dénominateur
   incluait des paires de mains partageant une carte. Invisible tant que seul
   NashConv le consommait — le biais s'applique aux deux termes — et révélé en
   comparant cette valeur à `strategyEV` : l'écart au meilleur jeu ressortait
   **négatif**, ce qui est impossible.
2. **L'EV rapportée ne décrivait pas la stratégie servie.** `solveTree.ev`
   moyenne les itérations ; la stratégie stockée est la stratégie moyenne. La
   bonne grandeur converge ~9 fois plus vite.
3. **L'application ne relisait jamais ses solutions au démarrage.** Le script de
   QA appelait `hydrateStore()` lui-même : il prouvait la persistance du
   stockage sans jamais tester celle de l'application. Une QA qui compense le
   défaut qu'elle doit détecter ne détecte rien.
