# SharkSolver Core V1 + Trainer Mission Master

Deux chantiers majeurs sur `feature/sharksolver-core-v1` : **(1)** la refonte du
solveur en moteur isolé/testé/à provenance honnête (+ roadmap V2), **(2)** la
refonte du Trainer en moteur d'entraînement immersif adaptatif (Mission Master).
105 commits, 115 fichiers, +12 146 / −1 427.

**Principe directeur commun : « LE MOTEUR CALCULE. L'IA EXPLIQUE. »** — ne jamais
présenter une heuristique comme un résultat GTO calculé. Côté Trainer, l'IA (Coach,
Orchestrateur) transforme et explique, mais n'invente jamais la vérité stratégique
(§6/§28).

---

# Partie 2 — Trainer Mission Master (Adaptive Immersive Training Engine)

Refonte **purement additive** du Trainer (aucune option existante supprimée), en
pipeline de couches découplées :

`TrainingConfig → ConstraintEngine → SpotGenerator → SpotValidator → GameEngine → multi-table → ImmersionEngine`

### Nouveaux modules purs et testés

- **`trainingConfig.js`** (§3) — source unique de vérité : unifie l'objet de filtres
  `f` + 6 states React frères (session, tables, mode, plateforme, type, street).
  Mappers round-trip, persistance unifiée.
- **`constraintEngine.js`** (§25) — détecte **et auto-résout** les incompatibilités
  (position × structure, phase × structure Heads-Up/Top 3, cash × ICM, type de spot).
  Ne bloque jamais l'utilisateur (§72).
- **`spotSchema.js`** (§26) — contrat canonique du `TrainingSpot` + `generationSeed`
  déterministe (reproductibilité §65), sans retirer aucun champ legacy.
- **`spotRecovery.js`** (§42) — génération à la demande quand la queue s'épuise ;
  un spot défectueux n'est jamais comptabilisé comme erreur joueur.
- **`immersionEngine.js`** (§30, §61-64) — `AnimationQueue` **par table**, ordonnée
  (§62), interruptible (§63), avec timeout de sécurité (§61) ; exécuteur DOM injecté.
- **`aiTrainingOrchestrator.js`** (§57) — langage naturel → `TrainingConfig` →
  ConstraintEngine. Mapping déterministe (n'invente pas de GTO). Câblé dans l'UI.
- **`fullHandEngine.js`** — vrai moteur heads-up postflop (No-Limit), transitions de
  street correctes, **showdown réel via `eval7i`** (plus de résultat aléatoire).
- **`spotSimilarityEngine.js`** (§51/§52) — variantes pédagogiques depuis une vraie
  main (verrouille positions/potType/street/historique ; varie board/main/stack/
  sizing/villain/ICM/phase).

### Intégrations dans `TrainerTab.jsx`

- **Main suivante PAR TABLE** (§44) — pointeurs indépendants `tableIdx[]`, `idx`
  dérivé = `min(tableIdx)` ; avancer une table ne réinitialise plus les autres.
- **Full Hand jouable street-par-street** *(fix majeur)* — les boutons full-hand
  n'étaient rendus que dans le conteneur mobile-only (invisibles sur desktop) ; +
  logique probabiliste remplacée par le moteur réel. Le Héro joue flop→turn→river.
- **AnimationQueue** adoptée pour les révélations Villain (spot + full hand),
  annulation propre sur « Main suivante » (§63) — corrige un `setTimeout` non nettoyé.
- **Replayer → Trainer** (§48) : « Générer des spots similaires » / « Créer une
  session depuis cette main ». Import HH et reprise de session branchés sur le
  contrat §26.

### Périmètre / limites assumées

Le Replayer est en chantier — son crash à l'import d'une main est attendu et sera
traité lors de sa refonte dédiée (les boutons §48 sont en place, vérifiables une
fois l'import réparé). Adoption DOM des animations de jetons fire-and-forget (§31-33)
laissée volontairement de côté pour ne pas casser le design superposé des tables (§0).

---

# Partie 1 — SharkSolver Core V1 + roadmap V2 (§11)

Refonte du solveur en moteur isolé, testé et à provenance honnête, puis les quatre
premiers items de la roadmap V2.

**Principe directeur (§2) : « LE SOLVER CALCULE. L'IA EXPLIQUE. »** — ne jamais
présenter une heuristique comme un résultat GTO calculé. Plusieurs changements
ci-dessous consistent uniquement à *retirer* des chiffres trompeurs.

## Moteur extrait du monolithe

`src/solver/core/` — evaluator, combos, equity, cfr, gametree, multistreet, icm.
Le solveur vivait entièrement dans `SharkSolverTab.jsx` (2989 lignes de moteur + UI).
Tout passe désormais par la Solver API (`src/solver/api.js`) ; l'onglet ne touche
plus jamais le CFR directement.

- **Convergence réelle (§14)** — stabilité, regret moyen, borne d'exploitabilité.
  Le statut du solve affichait « n/d ».
- **Équité exacte (§10)** — énumération exhaustive quand elle est calculable,
  Monte-Carlo sinon, et le badge de provenance bascule pour de vrai.
- **Reproductibilité (§15)** — seed dérivée du spot : même spot, même solve.
- **Multi-rue (§26)** — arbre postflop complet, sous-arbres par carte, raises,
  all-in. Validé contre la clairvoyance analytique (≤0.4 %) et NashConv ≈ 0.
- **Node lock (§19), Exploit Solver (§20), ICM/PKO (§21/§22), Coach AI (§30)**.

## Roadmap V2

**Solution Library persistante (§16)** — IndexedDB, cache mémoire synchrone +
écriture disque asynchrone. Les accesseurs de stratégie étaient des closures, qui ne
survivent pas au structured clone : ils sont reconstruits par une fabrique unique
partagée avec le solve frais. Une charge incomplète est rejetée plutôt que servie
amputée. Vérifié : solve 35 ms → rechargement disque 0.1 ms, bit-identique.

**Ranges non plafonnées (§8)** — *bug de correction, pas une limite de perf.*
`rangeComboList` itère dans l'ordre d'insertion (paires → suited → offsuit), donc
`slice(0,maxCombos)` gardait le haut de cet ordre. Mesuré sur une range BTN RFI de
1134 combos aux réglages de production : **90 % de la range jetée et les 744 combos
offsuit supprimés en totalité, à chaque solve**. Le solveur résolvait une autre range,
bien plus nuttée, que celle saisie. Remplacé par une réduction stratifiée qui conserve
le poids de chaque classe (forme 9.1/31.9/58.9 % identique avant/après).

**ICM stratégique (§21)** — le CFR optimise des $EQ, plus des jetons. Le zéro-somme
était câblé en dur (`-terminalUtility`) ; il est faux dès qu'un troisième joueur
existe. NashConv est donc masqué en ICM multi-joueurs — sauf en heads-up, où la somme
nulle tient exactement. Effet validé sur le call d'all-in : fold 73.4 % → 76.3 %
(table finale) → 80.6 % (bulle).

**PKO stratégique (§22)** — capture de prime à l'élimination. Gain asymétrique :
chacun encaisse en éliminant l'autre. Le modèle de prime reste `PKO_ESTIMATE`.

## Correctifs trouvés en chemin

- `finishProbabilities` : un joueur à exactement 0 jeton n'obtenait aucune place, son
  gain s'évaporait (Σ$EQ = 70 au lieu de 100). Atteint par tout all-in tapis complet.
- `cfr.js` faisait `opts.maxCombos||50` : le mode non plafonné (`0`) était inatteignable.
- `solveSubgame` calculait son défaut pour la **signature de cache** sans le passer au
  solve — la clé annonçait 200 pendant que 50 était calculé.
- **(hors solveur) Trainer `_checksum` orphelin** — laissé dans `TrainerTab.jsx` lors du
  refactor 3.3 alors que `stats.js` l'appelle. `safeStore` jetait un `ReferenceError`
  avalé à chaque fin de session : la couche de stockage intègre (`pf_stats_s` /
  `pf_hands_s` / `pf_history_s`) n'écrivait jamais rien. Définition rapatriée dans
  `stats.js`, copie morte supprimée. Vérifié : round-trip `saveStatsSafe`/`loadStatsSafe`
  OK, console propre, `test-trainer-engine.mjs` passe.

## Tests

**Solveur** — `npm run test:solver` **160/160** · `npm run bench:solver` **17/17**.
Le benchmark compare l'équité à des références publiées et le multi-rue à la
clairvoyance analytique.

**Trainer (Mission Master)** — `npm test` inclut désormais `test:refonte` : 8 suites,
**387 assertions** (trainingConfig, constraintEngine, spotSchema, spotRecovery,
immersionEngine, aiTrainingOrchestrator, fullHandEngine, spotSimilarity). Vérifié en
runtime : 1T/2T, Main suivante par table, Full Hand street-par-street, orchestrateur NL.

Le standalone (`index-standalone.html`) est régénéré et à jour (le CI le vérifie).
Chaque module ajoute des tests qui verrouillent le comportement en régression.

## Limites assumées

Multi-rue marqué `experimental` dans l'UI. Réduction de range : la granularité par
couleur est approchée (compte sur board monotone), l'UI le signale. ICM/PKO : le calcul
Malmuth-Harville est exact, la stratégie est re-solvée, mais ce n'est pas un solve ICM
complet (pas de future game simulation) — provenance `ICM_ESTIMATE`/`PKO_ESTIMATE`.
Préflop toujours non solvé (§40 garde le CFR désactivé préflop).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
