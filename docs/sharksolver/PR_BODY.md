# SharkSolver Core V1 + roadmap V2 (§11)

Refonte du solveur en moteur isolé, testé et à provenance honnête, puis les quatre
premiers items de la roadmap V2. 55 commits, 28 fichiers, +5345 / −481.

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

## Tests

`npm run test:solver` **160/160** · `npm run bench:solver` **17/17** · build OK.

Le benchmark compare l'équité à des références publiées et le multi-rue à la
clairvoyance analytique. Chaque section de la roadmap ajoute des tests qui verrouillent
l'ancien comportement en régression.

## Limites assumées

Multi-rue marqué `experimental` dans l'UI. Réduction de range : la granularité par
couleur est approchée (compte sur board monotone), l'UI le signale. ICM/PKO : le calcul
Malmuth-Harville est exact, la stratégie est re-solvée, mais ce n'est pas un solve ICM
complet (pas de future game simulation) — provenance `ICM_ESTIMATE`/`PKO_ESTIMATE`.
Préflop toujours non solvé (§40 garde le CFR désactivé préflop).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
