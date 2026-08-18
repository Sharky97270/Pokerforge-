# Replayer — Analyse IA sécurisée

> **Le solveur calcule. PokerForge orchestre et contrôle. PokerForge AI explique.**

Ce document décrit la chaîne d'analyse du Replayer après la suppression de la clé
API côté utilisateur.

---

## 1. Ce qui a changé

**Avant.** Le Replayer affichait un champ « 🔑 CLÉ API », stockait la clé de
l'utilisateur dans `localStorage` (`pf_ak`, XOR + base64 — un encodage, pas un
chiffrement) et appelait `https://api.anthropic.com/v1/messages` **depuis le
navigateur**, avec l'en-tête `anthropic-dangerous-direct-browser-access`. Le
modèle recevait la hand history brute et rendait un texte libre contenant des
chiffres « GTO » qu'il produisait lui-même.

**Après.** Aucune clé côté utilisateur. Le navigateur appelle l'endpoint
PokerForge, qui détient seul le secret :

```
HAND HISTORY (locale)
      ↓ parser PokerForge
NormalizedHand
      ↓ buildHandState()          ↓ buildPokerState()
HandState normalisé (§6)     PokerState sémantique — qui a ouvert, ce que
                             Hero affronte, ce qu'il a fait, ses options
      ↓ buildSolverPackage()
SharkSolver · lookup · équité · heuristiques  →  valeurs + PROVENANCE
      ↓ validatePokerState()   ← un spot incohérent ne part JAMAIS au modèle
      ↓ POST /functions/v1/analyze-hand  (JWT utilisateur)
Backend PokerForge  ── auth, validation, rate limit, prompt versionné ──
      ↓ OpenAI Responses API (JSON schema strict)
      ↓ guardAnalysis()        ← rejet + régénération si nombre inventé
Explication structurée (aucun chiffre)
      ↓ validateAiResponse()   ← dernière barrière côté client
Replayer : les CHIFFRES viennent du solveur, le TEXTE de l'IA.
```

---

## 1 bis. Le moteur décrit le spot, l'IA l'explique

> **LE MOTEUR CALCULE ET DÉCRIT LE SPOT. L'IA EXPLIQUE.
> L'IA NE RECONSTRUIT JAMAIS LE COUP.**

**Le bug qui a motivé cette refonte.** Une big blind confrontée à un open du
hijack se voyait conseiller « ouvrir (raise) à 2.1bb avec une fréquence de
62 % ». Trois défauts se cumulaient :

1. Le moteur heuristique déduisait « Hero est-il confronté ? » d'une expression
   régulière sur le **libellé** de la dernière action adverse :

   ```js
   facing = /raise|bet|3-?bet|all-?in|relance|mise/i.test(prevAction)
   ```

   Dans « HJ open 2bb · BTN call · Hero BB », cette dernière action est
   « Call 2bb ». Le motif ne matchait pas, le moteur croyait le pot non ouvert
   et proposait une **ouverture** à un joueur qui ne pouvait que fold, call ou
   3-better. **Un libellé n'est pas un état.**
2. L'action recommandée n'était nommée qu'en famille mécanique (« raise »),
   donc jamais « 3-bet ».
3. Rien n'empêchait le modèle d'écrire un sizing **dans sa prose** — le schéma
   de sortie n'interdisait que les *champs* numériques.

**La correction.** Le contexte est reconstruit depuis les **montants** et
l'**ordre** des actions (`buildBettingContext`), jamais depuis leur intitulé ;
l'action est nommée avant l'appel IA ; et un inventaire des valeurs réellement
transmises sert de filtre au texte produit.

### Taxonomie sémantique (§3)

`OPEN_RAISE` · `LIMP` · `OVERLIMP` · `ISO_RAISE` · `CALL_OPEN` · `THREE_BET` ·
`CALL_THREE_BET` · `FOUR_BET` · `CALL_FOUR_BET` · `FIVE_BET` · `FOLD_TO_OPEN` ·
`FOLD_TO_THREE_BET` · `FOLD_TO_FOUR_BET` · `CHECK_OPTION` · `CHECK` · `BET` ·
`DONK_BET` · `CALL_BET` · `RAISE_BET` · `CHECK_RAISE` · `CALL_RAISE` ·
`RERAISE` · `FOLD_TO_BET` · `FOLD_TO_RAISE` · `ALL_IN` · `FOLD`

Le nom vient du **compteur d'agressions de la street** (`betLevel`), pas d'un
mot-clé : préflop `1` = la grosse blinde, `2` = open, `3` = 3-bet, `4` = 4-bet ;
postflop `0` = personne n'a misé, `1` = une mise, `2` = un raise.

### Matrice de légalité (§4)

| Hero affronte | Options |
|---|---|
| `OPEN_RAISE` / `ISO_RAISE` | `FOLD_TO_OPEN` · `CALL_OPEN` · `THREE_BET` |
| `THREE_BET` | `FOLD_TO_THREE_BET` · `CALL_THREE_BET` · `FOUR_BET` |
| `FOUR_BET` | `FOLD_TO_FOUR_BET` · `CALL_FOUR_BET` · `FIVE_BET` |
| `BET` / `DONK_BET` | `FOLD_TO_BET` · `CALL_BET` · `RAISE_BET` / `CHECK_RAISE` |
| `RAISE_BET` / `CHECK_RAISE` | `FOLD_TO_RAISE` · `CALL_RAISE` · `RERAISE` |
| `CHECK` | `CHECK` · `BET` / `DONK_BET` |

Rien à payer ⇒ `CALL` impossible. Une mise à suivre ⇒ `CHECK` impossible.
Une contradiction **suspend l'analyse** (`INCOHERENT_STATE`) au lieu de
demander à une IA d'expliquer une situation qui n'existe pas.

### Provenance et vocabulaire imposé (§6)

| Provenance | Formulation autorisée |
|---|---|
| `SOLVER_EXACT` / `SOLVER_LOOKUP` | « La solution calculée indique… » |
| `SOLVER_APPROXIMATION` (CFR) | « Le calcul CFR indique… » — ranges d'entrée estimées |
| `POKERFORGE_HEURISTIC` | « Selon l'estimation PokerForge disponible pour ce spot… » |
| `UNAVAILABLE` | « Les données disponibles ne permettent pas d'établir cette conclusion avec suffisamment de fiabilité. » |

`strategyScope` complète la provenance : `"range"` signifie que les fréquences
décrivent le mix de la range entière à ce nœud, **pas** la stratégie de la main
précise de Hero — une nuance que le coach n'a pas le droit d'écraser.

### Sizing : calculé ou absent, jamais estimé

`recommendedSizingBb` obéit à une règle simple : il n'existe que s'il se
**calcule depuis une mise réelle**. Une re-relance préflop est dimensionnée à
partir de l'open effectivement posé — 3× en position, 4× hors de position,
+1× par joueur ayant déjà payé — puis plafonnée au tapis effectif (proposer
12bb à un joueur qui en a 9 serait injouable).

Sans mise de référence (Solver manuel, nœud sans contexte), le champ vaut
`null` et le coach doit écrire *« le sizing exact n'est pas disponible pour ce
spot »*. Il porte par ailleurs sa provenance (`recommendedSizingOrigin`) :
l'UI l'annote « repère usuel » et le prompt interdit de le présenter comme la
taille optimale d'un solveur.

### Ce que l'inventaire des nombres ne contient PAS

`collectNumbers` exclut les clés qui ne sont pas des quantités de poker —
`step`, `seat`, `order`, `betLevel`, `samples`, durées. Sans cette exclusion,
un `step: 7` rendait « 7bb » citable : la garde s'auto-affaiblissait avec des
indices internes.

### Les deux gardes doivent être JUMELLES

La garde vit en double : `guardAnalysis` (edge function) avant de renvoyer la
réponse, `validateAiResponse` (client) avant de l'afficher. Les deux doivent
inventorier **les mêmes sources** — `handState` + `pokerState` + `solverData` —
et **scanner les mêmes champs**. Une divergence ne rend pas le système plus sûr,
elle le rend incohérent : le client rejetait des réponses que le serveur venait
de valider *et de facturer*, parce que son inventaire ignorait le HandState (un
tapis cité devenait « valeur inventée »). Le même écart existait sur les champs
scannés : le client lisait `concepts`, alors que le schéma produit `keyConcepts`
— ce tableau n'était donc contrôlé que d'un seul côté.

`test-replayer-ai-analysis.mjs` compare les deux listes de champs et les deux
appels à `allowedNumbers` : toute désynchronisation fait échouer la suite.

### Streets de HERO ≠ streets de la MAIN (prompt v4)

Quand Hero se couche, **le coup continue sans lui**. Le HandState transporte
alors le board complet et les mises des adversaires jusqu'à la river : rien,
dans les données, ne dit que Hero n'y était plus. Le modèle pouvait donc
commenter « son » flop — sur la main la plus fréquente d'une session.

`solverPackage` expose désormais `heroStreets` (les streets portant une décision
Hero). Le prompt les énonce en toutes lettres et impose `not_played` partout
ailleurs ; les deux gardes refusent une street analysée hors de cette liste ; et
le panneau filtre l'affichage en dernier recours.

### « EV perdue » et « écart à l'équilibre » ne se remplacent pas

`analyzeHand.totalEvLoss` vaut **`null`**, jamais `0`, quand aucune décision n'a
été chiffrée en bb. Le préflop est aujourd'hui mesuré en *points d'écart à la
fréquence d'équilibre* : sommer un ensemble vide donnait `0`, et l'UI affichait
« EV perdue totale −0bb » à côté d'un fold noté **D**. Le pendant fréquentiel
(`worstFreqGapPts`) expose le **pire** écart — deux mesures ne s'additionnent
jamais entre elles.

---

## 2. Fichiers

| Fichier | Rôle |
|---|---|
| `src/replayer/pokerState.js` | **Taxonomie sémantique + PokerState normalisé** — décrit le spot |
| `src/replayer/pokerStateValidator.js` | **Cohérence du spot (§4) + garde anti-invention (§5/§7)** |
| `src/replayer/heuristicEngine.js` | Moteur heuristique de scénario, extrait de `ReplayerTab.jsx` pour être testable |
| `src/replayer/handState.js` | HandState normalisé (§6) + validation stricte (§23) |
| `src/replayer/solverPackage.js` | Agrégation solveur/équité + provenance (§7/§8) + niveaux (§19) |
| `src/replayer/aiAnalysis.js` | Client de l'endpoint : cache (§20), erreurs (§18), historique (§28) |
| `src/replayer/AiAnalysisPanel.jsx` | Panneau droit (§15/§16/§17) |
| `src/replayer/leakEngine.js` | Motifs de la main (§13) et leaks récurrents (§14) |
| `src/replayer/handoff.js` | Passerelle structurée vers Trainer / Coach AI (§30/§32) |
| `supabase/functions/analyze-hand/index.ts` | Endpoint backend (§4, §9, §10, §21–§26) |
| `test-replayer-ai-analysis.mjs` | 138 assertions, branchées sur `npm test` |
| `test-replayer-poker-state.mjs` | **246 assertions** — 13 spots, validateur, anti-invention, cohérence inter-couches |
| `scripts/replayer-ai-shot.mjs` | Capture visuelle des états du panneau (§34/§35) |
| `scripts/replayer-semantic-shot.mjs` | **Validation visuelle** : rejoue de vraies mains et confronte l'écran au déroulement (`npm run shot:semantic`) |

---

## 3. Garantie anti-hallucination (§9)

Six verrous indépendants, pas un seul :

1. **Le prompt système** interdit d'inventer une fréquence, une EV, une équité,
   une range ou une valeur ICM, et impose de déclarer les données manquantes.
2. **Le schéma de sortie** (`json_schema`, `strict: true`) ne contient **aucun
   champ numérique**. Même en cherchant à produire un chiffre, le modèle n'a pas
   de case où le mettre. Un test le vérifie sur le source de la fonction.
3. **`heroAction` et `recommendedAction` sont des énumérations** dont la valeur
   attendue est fournie dans le prompt. Le modèle recopie ; il ne choisit pas.
   Une divergence avec le moteur est rejetée.
4. **La garde numérique du texte** (`guardAnalysis` serveur, `validateAiResponse`
   client) inventorie tous les nombres réellement transmis et rejette tout
   nombre **porteur d'une unité** (`bb`, `%`, `x`, `pot`) absent de l'inventaire.
   C'est ce verrou qui manquait : le schéma bloquait les champs, pas la prose.
   La tolérance d'arrondi va dans un seul sens — une source à `2.04` autorise
   « 2bb », mais « 2.1bb » reste refusé.
5. **Une régénération, puis un refus.** Une réponse fautive est renvoyée au
   modèle avec la liste des erreurs. Si la seconde tentative échoue, l'analyse
   est **refusée** (`FABRICATED_DATA`) : l'UI affiche un état contrôlé et
   conserve les chiffres SharkSolver. Mieux vaut pas d'analyse qu'une fausse.
6. **L'UI n'affiche jamais un nombre venant du modèle.** Fréquences, EV, EV
   perdue et équité sont lues dans `solverData`. Le texte du modèle est rendu
   avec un badge `◌ IA` en pointillés, visuellement distinct des badges pleins
   `◉ SOLVER / ◉ EQUITY` des valeurs calculées.

### Traçabilité inter-couches (§11)

En développement (ou avec `localStorage.pf_debug_ai = "1"`), chaque analyse
imprime les couches côte à côte — hand history, snapshot, PokerState, solveur,
payload, réponse — et signale toute divergence entre ce que le moteur a calculé
et ce que l'IA a répondu. La console reste muette en production.

---

## 4. Provenance (§8) et niveaux de confiance (§19)

Vocabulaire transporté de bout en bout : `SOLVER`, `LOOKUP_DB`, `EQUITY_EXACT`,
`EQUITY_MONTE_CARLO`, `ICM`, `CHIPEV`, `HEURISTIC`, `AI_INTERPRETATION`,
`UNAVAILABLE`.

| Niveau | Condition | Affichage |
|---|---|---|
| 1 | Solution pré-solvée trouvée | `NIVEAU 1 · Lookup exact` |
| 2 | SharkSolver résout le spot (push/fold HU ≤ 30bb) | `NIVEAU 2 · SharkSolver` |
| 3 | Équité calculée + heuristiques PokerForge | `NIVEAU 3` + avertissement explicite |
| 4 | Aucune référence | `NIVEAU 4 · Analyse pédagogique uniquement` |

Aux niveaux 3 et 4, le panneau affiche : *« Résultat solveur exact indisponible
sur ce spot : les valeurs affichées sont des estimations PokerForge, pas des
fréquences GTO. »*

---

## 5. Sécurité

- **Auth (§22)** — l'endpoint exige un JWT Supabase de rôle `authenticated`,
  vérifié auprès de `/auth/v1/user` **avant** tout appel payant. La clé anon est
  un JWT valide de rôle `anon` : elle ne suffit pas. Sans session, le client ne
  tente même pas la requête.
- **Rate limit (§21)** — fenêtre glissante par utilisateur, quotas configurables
  (`PF_AI_RATE_STANDARD`, `PF_AI_RATE_PREMIUM`, `PF_AI_RATE_WINDOW_S`), plus un
  garde-fou client (5 appels/min) contre le spam bouton.
  *Limite connue :* le compteur est en mémoire d'instance. Il protège du spam,
  d'une boucle frontend et des appels parallèles, mais un quota strict
  multi-instances demande une table Postgres (voir §8 ci-dessous).
- **Validation (§23)** — le HandState est revalidé côté serveur (positions,
  format de cartes, cohérence flop/turn/river, doublons, nombre d'actions,
  taille du payload). Le client ne fait pas foi.
- **Logs (§24)** — `userId` tronqué, `handId`, mode, modèle, versions, durée,
  tokens, coût, statut. Jamais la clé, jamais l'en-tête d'autorisation, jamais
  le contenu de la main.
- **Coût (§25)** — estimé par appel à partir des tokens et d'une table de tarifs,
  journalisé (`costUsd`) et renvoyé dans `meta` pour un futur quota.

---

## 6. Cache (§20) et historique (§28)

Clé = `hash(handId | solverVersion | promptVersion | modelVersion | mode | step)`.
Une analyse identique n'est jamais repayée : `meta.cache` vaut `HIT` ou `MISS`.
Faire évoluer `SOLVER_PACKAGE_VERSION` ou `PROMPT_VERSION` invalide
automatiquement le cache — c'est le mécanisme de migration.

---

## 7. Ce que le propriétaire doit faire

1. **Vérifier le secret serveur.** `OPENAI_API_KEY` est déjà configuré pour
   `coach-chat` et `meditation-tts`. La fonction `analyze-hand` **réutilise le
   même secret** : aucun nouveau projet OpenAI, aucune nouvelle clé.

   ```bash
   supabase secrets list
   ```

2. **Déployer la fonction :**

   ```bash
   supabase functions deploy analyze-hand
   ```

3. **(Optionnel) Ajuster modèle et quotas :**

   ```bash
   supabase secrets set PF_AI_MODEL="gpt-4.1-mini" PF_AI_RATE_STANDARD="6"
   ```

4. **Rien à faire côté Vercel.** Aucune variable frontend n'est nécessaire : y
   ajouter une clé IA l'exposerait publiquement.

---

## 8. Évolutions identifiées (non incluses)

- **Rate limit persistant** : table `ai_usage(user_id, created_at, cost_usd)` +
  `count(*)` sur fenêtre → quota strict et facturation par utilisateur.
- **Cache serveur partagé** : aujourd'hui le cache est local au navigateur ; une
  table `ai_analysis(hash, result)` mutualiserait les analyses entre appareils.
- **Analyse de session complète** : l'ancien bouton envoyait 6 000 caractères de
  hand history brute au modèle et lui faisait produire des chiffres non sourcés
  — incompatible avec §9. Le remplacement propre est une boucle sur les mains
  avec agrégation solveur, à spécifier.
