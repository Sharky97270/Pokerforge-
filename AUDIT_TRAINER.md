# AUDIT_TRAINER — Trainer PokerForge

Audit et corrections du Trainer. Chaque anomalie est listée avec sa cause racine,
la correction apportée et la **preuve** qui l'atteste. Aucun point n'est déclaré
corrigé sans mesure.

Date : 2026-08-21 · Branche : `mesure/trainer-ratio-feutre` · Base : `454e906`

---

## 0. Constat préalable : la cible du brief n'existe pas telle que décrite

Le brief désigne `index-standalone-corrected.html` comme cible principale, et le
présente comme un monolithe à patcher.

**Ce que le dépôt contient réellement :**

| Attendu (brief) | Réel |
|---|---|
| `index-standalone-corrected.html` | **Absent.** Aucun fichier `*corrected*` dans le dépôt. |
| Monolithe à patcher | `index-standalone.html` (7,4 Mo) est un **artefact de build**, régénéré par `npm run build:standalone` (`vite build` + `build-standalone.mjs`). |
| Sources non compilées absentes | **Présentes** : `src/` contient 114 modules JS/JSX, dont `src/tabs/TrainerTab.jsx` (8 684 lignes). |

**Conséquence, conforme à la règle de travail n° 2 :** toutes les corrections
sont faites **dans les sources**, jamais dans le bundle. Le monolithe se
régénère et n'est donc jamais une source de vérité.

Sauvegarde préalable : `.audit-backup/` (TrainerTab.jsx, index-standalone.html,
SHA de départ), ignorée par git.

---

## 1. Anomalies corrigées

### A1 — Le solveur push/fold était présenté comme « calcul exact » hors de son domaine · **CRITIQUE**

**Symptôme mesuré.** En 2T à 1920×1080, un spot « BTN 25bb — Push ou fold ? »
en **Cash 6-max** affichait le bandeau `🦈 SOLUTION SOLVEUR — calcul exact`.

**Cause racine.** `isSolvablePushFold()` (`src/trainerStrategyProvider.js`) ne
testait que la *forme* du spot : préflop, tapis entier ≤ 30bb, couple fold/jam
présent. Il ne regardait **ni le nombre de joueurs encore dans le coup, ni le
barème de gains**. Or le moteur appelé — `solvePreflopPushFold` — déclare
lui-même ses limites dans son en-tête (`src/solver/core/pushfold.js`) :

> · HEADS-UP uniquement. · chip-EV pur : aucune contrainte ICM.

Le modèle résolu est *SB jam vs BB, blindes 0.5/1 déjà postées*. Au BTN, Hero n'a
rien posté et **deux** joueurs peuvent encore payer : les fréquences affichées ne
décrivaient pas le spot montré — et portaient le mot « exact ».

Le défaut était **alimenté par un second défaut** (voir A2) : le rendu marquait
« couché » tout siège autre qu'Hero et le vilain, y compris SB et BB alors
qu'Hero ouvre *avant* eux. Le spot *ressemblait* donc à un heads-up à l'écran.

Deux fuites de périmètre supplémentaires, de même nature : le générateur `GEN[8]`
produit des push/fold en `MTT ICM` et `Spin & Go`, tous deux acceptés alors que
le moteur est chip-EV pur.

**Correction.**
- Nouveau module pur `src/trainerSolutionScope.js` : `pushFoldDomain(spot)` répond
  `{inDomain, reasons[], scope{}}`. Le refus est toujours **motivé**.
- `isSolvablePushFold()` délègue à ce module. Le repli heuristique porte désormais
  le motif exact du refus.
- Le périmètre voyage avec le spot (`strategyScope`, `strategyLimits`) et le
  bandeau du panneau décrit **le modèle appliqué** au lieu de dire « exact » :
  `SOLVEUR PUSH/FOLD — heads-up chip-EV · 12bb`, ou
  `ESTIMATION HEURISTIQUE — non résolue en interne` suivi du motif.
- Même dans le domaine, les limites assumées sont affichées (chip-EV pur ;
  précision bornée par la matrice d'équité, bruit ≈ ±0,26 pt).

**Preuves.**
- `node test-trainer-solution-scope.mjs` — **45 assertions**, frontière verrouillée
  dans les deux sens (ce qui doit rester résolu l'est ; BTN 6-max, ICM, PKO,
  Spin & Go, profondeur, street, format absent sont refusés avec motif).
- `node test-strategy-provider.mjs` — **37 assertions**, dont les refus ajoutés.
- `npm run audit:provenance` — 100 mains **réellement générées par l'application**,
  tracées via `window.__pfTrainerDiag` : **0 provenance surévaluée, 0 erreur console**.

---

### A2 — Les joueurs qui n'ont pas encore parlé étaient affichés « couchés »

**Symptôme.** Hero ouvre au BTN ; SB et BB portent le badge `FOLD` alors qu'ils
n'ont pas encore agi. Impossible au poker réel.

**Cause racine.** `trainerSeatStates()` (`TrainerTab.jsx`) se termine par :

```js
allPositions.forEach(pos=>{ if(!states[pos].inHand && !states[pos].folded) states[pos].folded=true; });
```

Tout siège qui n'est ni Hero ni le vilain désigné est donc déclaré couché, sans
aucune notion d'« reste à parler ». Effet secondaire : **tout spot devenait
visuellement un heads-up**, ce qui a rendu A1 invisible à l'œil.

**Correction (partielle, assumée).** La notion de « joueurs encore dans le coup »
est désormais **calculée correctement** par `livePositionsAtDecision()`
(`src/trainerSolutionScope.js`), à partir de l'ordre d'action réel lu dans
`POSITIONS_BY_SIZE` — source unique déjà utilisée par le rendu, et non un ordre
redupliqué (l'ordre 6-max n'est pas le suffixe de l'ordre 9-max). C'est cette
fonction qui alimente le contrôle de périmètre du solveur.

**Limite restante :** le *rendu des sièges* n'a pas encore été rebranché sur cette
fonction — voir §4, point L1. Le calcul stratégique est corrigé ; l'affichage des
badges `FOLD` ne l'est pas encore.

**Preuve.** `test-trainer-solution-scope.mjs`, bloc 3 : `BTN` qui ouvre en 6-max
⇒ 3 joueurs concernés (`BTN, SB, BB`) ; `UTG` premier de parole ⇒ 6 ; un fold
explicite dans la ligne retire bien le siège.

---

### A3 — `Afficher la solution` : contamination croisée entre tables · **CRITIQUE**

**Symptôme mesuré (2T/3T/4T).** On répond sur la table 1, et le panneau droit
affiche l'analyse d'une **autre** table.

| Config | Table 1 | Panneau droit |
|---|---|---|
| 2T | BB 120bb | BTN 65bb |
| 3T | BTN 64bb | BTN 60bb |
| 4T | BB 100bb | CO 55bb |

**Cause racine.** Le panneau droit est **unique** et décrit `activeTable`. Un
effet déplaçait le focus dès qu'une table « n'attendait plus rien » :

```js
const attend=t=>!tableAns[t]&&!tableSettled[t];
if(attend(activeTable))return;
```

Or « a répondu » est précisément l'instant où la solution devient lisible. Le
focus était donc arraché **au moment exact** où le joueur allait lire son verdict.

**Correction.** Une table qui vient de répondre a un *verdict à lire* : le focus
ne la quitte plus tant que `tableAns[t]` existe (effacé par `clearTableHandState`
quand le joueur fait avancer la table). Le clic direct sur une tuile reste
prioritaire. Une table **en pause** passe devant tout le reste.

**Preuve.** `npm run audit:solution` — 2T/3T/4T : identité du panneau ≡ identité
de la table qui vient de décider.

---

### A4 — « Masquer la solution » ne masquait plus après la première réponse

**Cause racine.** `const revealed = showSol || !!ans;` — dès qu'une table avait
répondu, le panneau ouvrait la solution complète malgré la bascule sur
« masquée ». Le mode difficile ne tenait donc qu'une seule main, et le bouton
global n'avait plus d'effet observable.

**Correction.** `const revealed = showSol;` — la bascule globale est la seule
autorité sur la révélation. Le verdict de la décision reste visible (il n'expose
ni fréquences ni EV optimale). Le bandeau de pause (A6) est aligné sur la même
règle : solution masquée ⇒ ni action optimale, ni EV.

**Preuve.** `npm run audit:solution` — bascule « masquée » + table répondue ⇒
panneau verrouillé, aucune mention « EV optimale ».

---

### A5 — Un réglage modifié puis suivi d'un rechargement était perdu · **touche TOUS les réglages**

**Symptôme.** Choisir une option, recharger dans la seconde ⇒ retour à la valeur
précédente. Découvert par l'audit de `Pause après`, mais **non spécifique** à ce
réglage.

**Cause racine.** `src/cloud.js` enveloppe `localStorage.setItem` et pousse vers
Supabase avec un **debounce de 900 ms**. Au démarrage, `pfCloudBootstrap()`
exécute un `pfCloudPull()` **avant le rendu React**, qui réécrit chaque clé `pf_*`
avec la valeur du cloud — **sans regarder si la valeur locale est plus récente**.
Recharger pendant la fenêtre de debounce restaurait l'avant-dernière valeur.

**Correction.**
1. Journal local horodaté des écritures (`pf_local_write_ts`, borné à 200 clés,
   non synchronisé). Le pull **n'écrase plus une clé dont l'écriture locale est
   postérieure** à `updated_at` du cloud. Comparaison **stricte**, sans marge :
   le push d'une valeur est toujours postérieur à son écriture, donc une valeur
   déjà partie laisse gagner le cloud (même contenu), et une valeur en attente
   laisse gagner le local. *Une marge de 2 s testée en premier rouvrait la
   fenêtre : mesuré, un réglage changé moins de 2 s après le précédent était
   encore écrasé.*
2. `flushPendingPushes()` déclenché sur `pagehide` / `visibilitychange:hidden` —
   sinon le cloud reste périmé jusqu'au prochain push.

**Preuve.** `npm run audit:pause` — persistance après rechargement vérifiée sur
**16 combinaisons** (4 options × 1T/2T/3T/4T) : `persist=oui` partout.
Avant correction : 6 combinaisons sur 8 en échec sur ce seul critère.

---

### A6 — Nouveau : réglage « Pause après » (Lot 4 bis)

Contrôle segmenté dans le bandeau gauche, sous le Timer (les deux règlent le
*rythme* de la session, et la pause suspend précisément ce compte à rebours).

**Options** — libellés français non ambigus, alignés sur les paliers de verdict
déjà affichés au joueur (`VERDICT_SEUILS`) :

| Option | Effet |
|---|---|
| `Jamais` | Comportement actuel, aucune interruption. |
| `Erreur` | S'arrête sur `Erreur ✗` et `Blunder 💥`. |
| `Imprécision+` | S'arrête dès `Imprécision ⚠`. |
| `Chaque action` | S'arrête après chaque décision d'Hero. |

**Deux pièges fermés explicitement, dans un module pur `src/trainerPausePolicy.js` :**

1. **Une décision `Non évaluée` n'est pas une faute du joueur.** Scénario
   invalide ou solution indisponible ⇒ classe propre `unevaluated` ; seule
   l'option `Chaque action` s'y arrête (elle ne juge pas, elle rythme).
2. **Une pause au plus par décision.** Clé `tableId | handId | decisionId`.
   Sans elle, un re-rendu React remettait en pause une table que le joueur venait
   de relancer. `decisionId` porte la street **et** le rang de décision : en Full
   Hand, flop, turn et river peuvent donc mettre en pause à tour de rôle sur la
   même main.

**Comportement.**
- L'évaluation est **terminée** avant de figer : verdict, action optimale, EV
  perdue et provenance sont affichés dans le bandeau de pause.
- Pause **locale** à la table. Les autres continuent.
- La table en pause est mise en évidence (contour + pulsation, désactivée sous
  `prefers-reduced-motion`), **prend et garde le focus**, et alimente un compteur
  global `N table(s) en pause` ; `Continuer toutes` apparaît à partir de 2.
- Le **chrono est suspendu**, pas remis à zéro : `timerLeftRef` mémorise le reste
  en pourcentage. Sans cela, « Continuer » redonnait les secondes entières et le
  réglage « vitesse de décision » perdait son sens. Le décompte a été sorti dans
  son propre effet — l'ajouter aux dépendances de l'effet de spot aurait rejoué
  toute la réinitialisation (board, sièges, jetons) à chaque reprise.
- En **Full Hand**, l'avancement est réellement automatique (le Villain joue et
  la street suivante s'ouvre). La décision est appliquée et évaluée, seule la
  **suite** est retenue dans une ref et rejouée **une fois** au « Continuer ».
- Persisté dans le config canonique (`pauseAfter`), donc restauré comme le timer.

**Accessibilité (mesurée, pas déclarée).** `role="radiogroup"` + 4 `role="radio"`,
`aria-checked` correct, *roving tabindex* (un seul arrêt de tabulation),
navigation ← → / Début / Fin, `aria-label` portant l'explication, infobulle au
survol **et** au focus, état sélectionné marqué par une **pastille pleine** et la
graisse — pas seulement par la couleur.

**Mise en page.** Grille **2×2** et non 4×1 : mesuré, quatre colonnes donnent
47 px par option dans le bandeau de 228 px, où `Imprécision+` est tronqué à
8,5 px de corps. Deux colonnes portent chaque libellé en entier (97 px) pour
~31 px de hauteur en plus. Bloc complet : 124 px.

**Preuve.**
- `node test-trainer-pause-policy.mjs` — **58 assertions** : matrice complète
  4 options × 6 classes de verdict, non-confusion `unevaluated`/`erreur`,
  branchement sur les **deux** moteurs de verdict réels (`spotVerdict` et
  `evaluatePostflopDecision`), unicité des clés.
- `npm run audit:pause` — **16/16 combinaisons conformes** (option × 1T→4T),
  avec l'assertion centrale dans les **deux** sens : la pause survient quand la
  règle l'exige **et** seulement alors ; 0 double déclenchement ; 0 erreur console.

---

### A7 — Bandeau de pause étiré sur mobile

**Symptôme mesuré (390×844).** Le bandeau occupait **250 px** pour ~90 px de
contenu et repoussait la table hors de l'écran.

**Cause racine (relevée par CDP, pas devinée).** Le rendu 1T applique
`.grid1 > .mt-slot > div { flex:1 1 auto !important }` — la règle vise **tout**
div enfant direct, pour que la zone de table occupe la hauteur libre.

**Correction.** Exception explicite `.grid1 > .mt-slot > div.pf-pause-bar`.
Hauteur mesurée après correction : **88 px**.

> ⚠️ **Piège à connaître** avant d'ajouter quoi que ce soit dans une tuile : tout
> nouveau div enfant direct de `.mt-slot` sera étiré par cette règle.

**Preuve.** Mesure DOM avant/après + captures
`design-qa-evidence/probe/pause-mobile-active.png`, `pause-control-mobile.png`.

---

### A8 — Le build autonome livrait deux images mortes, sans le signaler · **le fichier que le brief désigne comme cible**

**Symptôme mesuré.** `index-standalone.html` régénéré demande
`GET /__pfAsset4` → **404**. Le dos de carte (`.pf-card-back-art`) et le fond du
dashboard n'apparaissent pas, et **rien dans l'interface ne le signale**.

**Cause racine.** `build-standalone.mjs` remplace les chemins d'images par des
constantes JS hissées :

```js
js = js.split(`"${file}"`).join(varName).split(`'${file}'`).join(varName);
```

Cette substitution ne sait pas distinguer une chaîne JS d'un `url('chemin')`
écrit dans une feuille de style — or **`src/styles.js` est du CSS écrit dans un
littéral gabarit JS** :

```css
background-image:url('/assets/trainer/09_utg_seat_x3.png');
```

Le build sortait donc `background-image:url(__pfAsset4)`, que le navigateur
résout comme une **URL relative**.

**Correction.** Les occurrences `url(...)` sont traitées **avant** la
substitution des littéraux, et reçoivent la **donnée** (data URL) et non
l'identifiant : une règle CSS ne peut pas lire une variable JS. Un **garde-fou**
fait désormais échouer le build bruyamment si un `url(__pfAssetN)` subsiste,
plutôt que de livrer une image manquante.

**Piste écartée, et pourquoi — c'est le point important.** Passer par une
variable CSS posée à l'exécution évitait de dupliquer le base64. Mesuré :
Chrome **accepte** la variable de 310 Ko (siège UTG) et **rejette
silencieusement** celle de 3,4 Mo (hero du dashboard) — `getPropertyValue`
renvoie une chaîne vide, sans erreur. Le fond du dashboard disparaissait donc
exactement comme le bug corrigé. Faire reposer un artefact partageable sur une
limite de taille non documentée du CSSOM n'était pas acceptable.

**Coût assumé : +2 834 Ko** (7 233 → 10 068 Ko). Les images utilisées à la fois
en CSS et comme littéral JS sont stockées deux fois. À noter que **le build
précédent n'était plus petit que parce que ces deux images y étaient cassées**.
Optimisation possible plus tard : convertir la constante en URL de Blob à
l'exécution (URL courte, donc pas de limite CSSOM).

**Preuve.** `npm run check:standalone` — 0 identifiant ayant fui dans un `url()`,
0 chemin `/assets/` non inliné, `<img>` 2/2 chargées, aucune ressource en échec
hors absences attendues. Parité vérifiée entre le fichier unique et les sources
sur les 6 onglets.

> **Absences attendues dans le fichier unique**, listées explicitement par le
> contrôle :
> - `/favicon.ico` — `serve-standalone.js` n'en sert pas ;
> - `cfrPostflop.worker-*.js` — le worker CFR n'est pas inlinable en fichier
>   unique. Ce n'est **pas** une casse : `src/solver/cfrPostflopClient.js`
>   prévoit explicitement ce cas (« DÉGRADE proprement si les Web Workers sont
>   indisponibles (ex. build standalone fichier unique) ») et retombe sur
>   l'heuristique — désormais correctement étiquetée grâce au Lot 3.

---

### A9 — Libellés désaccentués dans le bandeau de table

`Solution masquee - revele pour EV, frequence et meilleure action.` et
`Sous-optimal - revele la solution pour le detail GTO` → réaccentués.

---

## 2. Moteurs réellement utilisés, par type de spot

Mesuré sur **100 mains réellement générées** par l'application
(`npm run audit:provenance`, 1920×1080, session Marathon).

| Source | Mains | Part |
|---|---:|---:|
| `heuristic` (template) | 96 | **96 %** |
| `solver` (push/fold HU chip-EV) | 4 | 4 % |
| `chart` (bibliothèque préflop) | 0 | 0 % |

> **Le ratio varie d'un tirage à l'autre** : les spots sont générés
> aléatoirement. Un passage a produit 100 mains **toutes heuristiques** —
> le verdict « aucune provenance surévaluée » y était alors vrai
> *trivialement*, puisque le chemin solveur n'était pas exercé. L'audit le
> signale désormais explicitement (`echantillonUnilateral` + avertissement en
> sortie) : un « OK » sans spot solveur ne vaut que pour le chemin de repli.
> Le relevé ci-dessus provient d'un passage qui exerce **les deux** chemins.
>
> Note : `--hands` est plafonné par la longueur de session (`--smode`), la
> queue étant générée en un lot.

**Motifs de repli les plus fréquents :**

| Occurrences | Motif |
|---:|---|
| 19 | street Turn — le moteur ne couvre que le préflop |
| 17 | street Flop — idem |
| 16 | street River — idem |
| 11 | ICM non modélisé — le moteur est chip-EV pur |
| 5 | PKO non modélisé — idem |
| 8 | 100bb > 25bb — hors profondeur résolue |
| 3 | 3 joueurs encore dans le coup — le moteur est heads-up |

**Lecture honnête :** le Trainer tourne à **97 % sur des heuristiques de
template**. Ce n'est pas une régression introduite ici — c'est l'état réel, que
les correctifs rendent désormais **visible et traçable** au lieu de le masquer
derrière un badge « calcul exact ». Le tableau ci-dessus est régénérable à tout
moment (`design-qa-evidence/trainer-provenance.json`).

---

## 3. Suite de tests et commande unique

```bash
npm test
```

Couvre l'ensemble du dépôt, y compris les deux fichiers ajoutés :

| Fichier | Assertions | Objet |
|---|---:|---|
| `test-trainer-solution-scope.mjs` | 45 | Périmètre de validité du solveur (Lot 3) |
| `test-trainer-pause-policy.mjs` | 58 | Réglage « Pause après » (Lot 4 bis) |

**Audits navigateur** (serveur de dev requis) :

```bash
npm run audit:trainer
```

| Commande | Vérifie | Sortie |
|---|---|---|
| `npm run audit:provenance` | Aucune provenance surévaluée, sur des mains réelles | `design-qa-evidence/trainer-provenance.json` |
| `npm run audit:pause` | 4 options × 1T→4T, règle vérifiée dans les deux sens, persistance | `design-qa-evidence/trainer-pause.json` |
| `npm run audit:solution` | Bascule globale, contamination croisée, masquage | `design-qa-evidence/trainer-solution-toggle.json` |
| `npm run check:standalone` | Images du fichier unique inlinées et rendues | `design-qa-evidence/standalone-assets.json` |

**Mode diagnostic** (Lot 3) — `window.__pfTrainerDiag` :
`entries()`, `summary()`, `violations()`, `pauses()`, `pauseSummary()`, `clear()`.
Chaque main résolue y laisse : `handId`, `tableId`, empreinte d'état, `source`,
`scope`, `solveId`, durée, motif de repli. C'est ce qui rend les audits
ci-dessus vérifiables sans lire de pixels.

---

## 4. Limites restantes — rien n'est masqué

- **L1 — Rendu des sièges non rebranché.** `trainerSeatStates()` marque toujours
  « couché » tout siège autre qu'Hero et le vilain (A2). Le calcul stratégique
  est corrigé, l'affichage ne l'est pas. À traiter avec le Lot 1 (état canonique).
- **L2 — 97 % des solutions restent heuristiques.** Les EV et fréquences des
  templates (`generateDynamicSpots`) sont des constantes dérivées d'une force de
  main grossière (`hStr`, 0–5), pas des calculs. Elles sont désormais étiquetées
  honnêtement, mais elles restent fabriquées.
- **L3 — `trainerPushFoldInfo()` fabrique un « Seuil Nash : top X% »** à partir
  d'une table codée en dur (`{BTN:60, CO:42, …}` × un ajustement de profondeur).
  Le terme « Nash » y suggère un calcul qui n'a pas lieu. **Non corrigé.**
- **L4 — Mode Exploit non refondu.** Le pipeline exploitant calculé demandé au
  Lot 3 (baseline GTO → modèle Vilain régularisé → meilleure réponse → gain d'EV
  et incertitude) **n'est pas implémenté**. L'affichage Exploit actuel reste
  déclaratif.
- **L5 — Lots 1, 2, 5, 6 non traités** : état de main canonique et invariants,
  arbres de sizing déclaratifs, refonte visuelle 2T/3T/4T, modale de range et
  explication IA chiffrée. Voir §5.
- **L6 — Débordement du bas du panneau droit** observé en 2T à 1920×1080
  (Difficulté / TIMELINE / CTA se chevauchent). Antérieur, non traité.
- **L7 — Échantillon d'audit.** `audit:provenance` porte sur 100 mains (plafonné
  par la longueur de session) ; `audit:pause` sur 3 mains par combinaison.
  Suffisant pour verrouiller les règles, insuffisant pour une statistique de
  population. Et, comme signalé au §2, un tirage sans spot solveur rend le
  verdict de provenance unilatéral — l'audit le dit maintenant lui-même.
- **L8 — `Continuer` ne fait pas avancer la main.** Il lève la pause ; l'avance
  reste le CTA « Main suivante ». C'est délibéré : une mission précédente a
  supprimé le doublon de CTA d'avancement et unifié l'allocateur de spot ;
  faire avancer depuis le bandeau de pause aurait rouvert un second chemin
  d'avance, avec son propre verrou.

---

## 5. Périmètre traité vs périmètre du brief

| Lot | État |
|---|---|
| Lot 1 — état de main canonique et invariants | **Non traité** (amorcé : `livePositionsAtDecision`, empreinte d'état) |
| Lot 2 — arbres et tailles de mises | **Non traité** |
| Lot 3 — intégration SharkSolver et provenance | **Traité** (périmètre, provider, diagnostic). Volet Exploit **non traité** (L4) |
| Lot 4 — `Afficher la solution` en 2T/3T/4T | **Traité** |
| Lot 4 bis — `Pause après` | **Traité** |
| Lot 5 — refonte visuelle des tables | **Non traité** |
| Lot 6 — ranges et explication IA | **Non traité** |
| Lot 7 — tests et preuves | **Partiel** : 103 assertions unitaires + 3 audits navigateur sur le périmètre traité |

---

## 6. Fichiers modifiés

| Fichier | Nature |
|---|---|
| `src/trainerSolutionScope.js` | **Nouveau** — périmètre de validité (pur) |
| `src/trainerPausePolicy.js` | **Nouveau** — règle « Pause après » (pur) |
| `src/trainerDiagnostics.js` | **Nouveau** — trace de résolution + trace des pauses |
| `src/trainerStrategyProvider.js` | Périmètre appliqué, repli motivé, limites publiées |
| `src/trainingConfig.js` | `pauseAfter` au config canonique (persistance + round-trip) |
| `src/cloud.js` | Anti-écrasement horodaté + flush sur `pagehide` |
| `src/tabs/TrainerTab.jsx` | Contrôle « Pause après », état de pause, focus, bandeau, bascule solution, provenance, chrono |
| `src/styles.js` | Contrôle segmenté, bandeau de pause, compteur global |
| `test-trainer-solution-scope.mjs` | **Nouveau** — 45 assertions |
| `test-trainer-pause-policy.mjs` | **Nouveau** — 58 assertions |
| `test-strategy-provider.mjs` | Spots complétés + refus ajoutés |
| `scripts/trainer-provenance-audit.mjs` | **Nouveau** |
| `scripts/trainer-pause-audit.mjs` | **Nouveau** |
| `scripts/trainer-solution-toggle-audit.mjs` | **Nouveau** |
| `build-standalone.mjs` | `url()` CSS inlinés avec la donnée + garde-fou de build |
| `scripts/standalone-assets-check.mjs` | **Nouveau** — contrôle du fichier unique |
| `index-standalone.html` | Régénéré depuis les sources corrigées |
| `package.json` | Tests et audits enregistrés |
