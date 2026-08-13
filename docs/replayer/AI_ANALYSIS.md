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
      ↓ buildHandState()
HandState normalisé (§6)
      ↓ buildSolverPackage()
SharkSolver · lookup · équité · heuristiques  →  valeurs + PROVENANCE
      ↓ POST /functions/v1/analyze-hand  (JWT utilisateur)
Backend PokerForge  ── auth, validation, rate limit, prompt versionné ──
      ↓ OpenAI Responses API (JSON schema strict)
Explication structurée (aucun chiffre)
      ↓
Replayer : les CHIFFRES viennent du solveur, le TEXTE de l'IA.
```

---

## 2. Fichiers

| Fichier | Rôle |
|---|---|
| `src/replayer/handState.js` | HandState normalisé (§6) + validation stricte (§23) |
| `src/replayer/solverPackage.js` | Agrégation solveur/équité + provenance (§7/§8) + niveaux (§19) |
| `src/replayer/aiAnalysis.js` | Client de l'endpoint : cache (§20), erreurs (§18), historique (§28) |
| `src/replayer/AiAnalysisPanel.jsx` | Panneau droit (§15/§16/§17) |
| `src/replayer/leakEngine.js` | Motifs de la main (§13) et leaks récurrents (§14) |
| `src/replayer/handoff.js` | Passerelle structurée vers Trainer / Coach AI (§30/§32) |
| `supabase/functions/analyze-hand/index.ts` | Endpoint backend (§4, §9, §10, §21–§26) |
| `test-replayer-ai-analysis.mjs` | 138 assertions, branchées sur `npm test` |
| `scripts/replayer-ai-shot.mjs` | Capture visuelle des états du panneau (§34/§35) |

---

## 3. Garantie anti-hallucination (§9)

Trois verrous indépendants, pas un seul :

1. **Le prompt système** interdit d'inventer une fréquence, une EV, une équité,
   une range ou une valeur ICM, et impose de déclarer les données manquantes.
2. **Le schéma de sortie** (`json_schema`, `strict: true`) ne contient **aucun
   champ numérique**. Même en cherchant à produire un chiffre, le modèle n'a pas
   de case où le mettre. Un test le vérifie sur le source de la fonction.
3. **L'UI n'affiche jamais un nombre venant du modèle.** Fréquences, EV, EV
   perdue et équité sont lues dans `solverData`. Le texte du modèle est rendu
   avec un badge `◌ IA` en pointillés, visuellement distinct des badges pleins
   `◉ SOLVER / ◉ EQUITY` des valeurs calculées.

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
