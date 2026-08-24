# CORRECTION STRUCTURELLE DU TRAINER — RAPPORT

Réponse à `AUDIT_TRAINER_INTEGRAL.md` (21 août 2026) : 4 défauts critiques,
6 majeurs, 4 mineurs. Branche `fix/trainer-correction-structurelle`, base `3971f34`.

Ce rapport ne déclare rien qu'un instrument ne mesure. Chaque ligne « après »
renvoie à une commande rejouable et à un relevé dans `design-qa-evidence/`.

---

## 1. Cartographie — les vérités concurrentes trouvées avant correction

L'audit demandait de nommer les sources de vérité avant d'y toucher. Elles
étaient **cinq**, et elles se contredisaient.

| Grandeur | Qui la produisait AVANT | Combien de fois |
|---|---|---|
| Tapis d'un siège | `spot.stack` pour Hero · **la constante `60`** pour tous les autres (`TrainerTab.jsx:5557`) | 2 sources |
| Engagement de street | `streetContributions` (mémo) · `streetContribRef` (ref) · la ligne préflop · le log de main | 4 entrées, 1 agrégat |
| Pot | `currentPotRef` (spot) · `fhPot` (coup complet) · `spot.pot` (repli du panneau) | 3 sources |
| SPR | `fmtSpr(spot.stack, pot)` en 1T · `fmtSpr(live.heroStack, live.pot)` au panneau | 2 formules, aucune ne lisait la table |
| Montant d'une action | libellé du bouton (`{l:"3-bet 9bb"}`) · sélecteur (`pot × mult`) · moteur (**relecture du TEXTE** du libellé par `explicitAmount()`) | **3 calculateurs indépendants** |
| Évaluation de main | `evalBest()` pour Hero (juste) · `handStrength7 → eval7i` pour le Vilain (**cassé**) | 2 chemins |
| Statut d'un siège | `trainerSeatStates` — qui terminait par « tout siège hors main est couché » | 1 source, fausse |
| Seuil de jam | table de constantes `baseTop × stackAdj`, nommée « Nash » | 1 source, mal nommée |
| Différence Exploit/GTO | `Math.round(freq × 1.08)` | 1 multiplicateur arbitraire |

**Après** : une seule source par grandeur, publiée par des modules purs, et
lisible depuis le DOM (`data-pf-ledger`) pour que l'instrument puisse la
confronter au rendu.

| Grandeur | Source unique APRÈS |
|---|---|
| Argent (tapis, engagements, pot, tapis effectif, SPR, cotes) | `src/trainerHandLedger.js` |
| Montant d'une action (bornes légales, préréglages, indices) | `src/trainerSizing.js` |
| Statut d'un siège | `src/trainerSeatStatus.js` (sur `livePositionsAtDecision`) |
| Règles No-Limit du coup complet | `src/fullHandEngine.js` (+ ledger interne) |
| Évaluation de main, 5/6/7 cartes | `evalBestI` dans `src/solver/core/evaluator.js` |
| Seuil de jam et sa provenance | `src/trainerJamThreshold.js` |
| Ajustement exploitant et sa provenance | `src/trainerExploit.js` |

---

## 2. Tableau avant / après — les 14 défauts de l'audit

### Critiques

| # | Défaut mesuré | Cause racine | Après | Preuve |
|---|---|---|---|---|
| **G1** | Le Vilain évalue une main fantôme : **95,7 %** des flops et **39,8 %** des turns faussés ; force moyenne 0,419 au lieu de 0,138 | `eval7i` bouclait sur 0..6 ; avec 5 ou 6 cartes les indices manquants valaient `undefined`, donc **2♠** | **Corrigé.** `evalBestI` accepte strictement 5/6/7 cartes et **lève** sinon ; `cardToInt` refuse une carte illisible au lieu de la ramener à 2♠ ; Hero et Vilain partagent le même chemin | `test-evaluator-card-count.mjs` — 37 assertions, 20 000 tirages, 0 divergence ; force moyenne au flop mesurée **0,20 < 0,30** |
| **M1** | **58 mains / 60** : tous les sièges non-Hero portent `60bb`, quel que soit le spot ; **29 SPR / 60** incohérents (jusqu'à 3,3× d'écart) | `const displayStack = isH ? spot.stack : 60` | **Corrigé.** Le tapis descend du ledger : profondeur du spot − engagement du siège. 1T et mosaïque lisent la même valeur | `npm run audit:money` — **0 écart / 60 mains** ; `I1-plaque-vs-ledger` contrôle l'égalité exacte siège par siège ; **63 valeurs de tapis distinctes** relevées en 4T |
| **M2** | Le sélecteur de tailles ne pilote rien : le pot bouge du libellé, jamais du sélecteur. `3×` = 4,5bb pour un open (multiple du **pot**). `MIN` = 0,75bb, sous la grosse blinde | `raiseAmt`/`customBB`/`raiseSzIdx` n'existaient que dans le rendu ; `handleHeroAct(i)` ne recevait qu'un index | **Corrigé.** `resolvedActs` est LA réponse : le rendu l'affiche, le clavier l'utilise, le moteur la reçoit. Préréglages contextuels (× BB à l'ouverture, × la mise adverse face à une relance, % du pot postflop) | `npm run audit:sizing` — **10 scénarios, les 6 préréglages, 0 écart** : `libellé = sélecteur = variation du pot = débit du tapis` |
| **M6** | Full Hand : pot 8 + 20 + 20 = **48bb** pour deux tapis de 20bb — 8bb créés. La plaque disait 20bb quand le panneau disait 16bb | `createFullHand({heroStack: stackBb, villStack: stackBb})` recevait la profondeur **entière** avec le pot préflop | **Corrigé.** Les tapis restants et les engagements viennent du ledger ; `createFullHand` documente que ses tapis sont ceux **d'après le préflop** | `npm run audit:fullhand` — **20 coups complets, 0 écart** ; `test-full-hand-rules.mjs` — 400 mains aléatoires, 0 écart de conservation |

### Majeurs

| # | Défaut mesuré | Après | Preuve |
|---|---|---|---|
| **M3** | Un bouton porte **deux** montants (« Squeeze 12bb » / sélecteur 19.5) — 15 mains/60 en 1T, 10/40 en 4T | **Corrigé.** Libellé et ligne de sizing sortent du même `resolvedActs[i]` | `I7-bouton-deux-montants` : 0 · `S1-bouton-deux-montants` : 0 |
| **M4** | Le sélecteur propose plus que le tapis (63bb pour 60 ; **109,5bb pour 40**) | **Corrigé.** Tout préréglage est borné par `min(capacité d'Hero, capacité adverse)`, avec la raison affichée | `I3-mise-hors-tapis` : 0 · `S3-au-dessus-du-tapis` : 0 |
| **M5** | L'indice contredit le libellé (« Bet 50% » annoncé *33 % pot*) — 12/60 et 7/40 | **Corrigé.** L'indice est **calculé** depuis le montant exécutable ; la table indexée par identifiant est supprimée | `I4-indice-vs-montant` : 0 sur les 6 configurations |
| **M7** | ① mise non suivie non rendue (pot 55bb au lieu de 20) ② relance à 6,5bb acceptée face à 6bb ③ **une égalité comptée comme une victoire** ④ pot jamais reversé | **Corrigé (4/4).** Remboursement automatique, relance minimale contrôlée, all-in incomplet qui ne rouvre pas l'action, `split` distinct, pot versé aux tapis, résultat net dérivé du ledger | `test-full-hand-rules.mjs` — 76 assertions ; audit navigateur : **1 split sur 20 mains, étiqueté « POT PARTAGÉ »**, 0 pot orphelin |
| **G2** | Des sièges portent `FOLD` avant d'avoir parlé (BTN, SB, BB sur un spot « CO premier à parler ») | **Corrigé.** Six statuts dérivés de l'ordre de parole ; `FOLD` exige une action de fold **enregistrée** — et les deux constructeurs de ligne enregistrent désormais aussi le fold des blindes | `test-trainer-seat-status.mjs` — 48 assertions, 36 contrôles, **0 badge injustifié** |
| **G3** | « Seuil Nash » = produit de deux constantes ; écart mesuré **+10,2 points** à 15bb face au solveur du dépôt | **Corrigé.** Dans le domaine certifié : la fréquence **réellement calculée**, avec modèle, barème, profondeur et source. Hors domaine : « Repère heuristique », badge `≈ Heuristique`, raison affichée — le mot « Nash » ne peut plus y apparaître | `test-trainer-honesty.mjs` — 156 assertions ; garde-fou de vocabulaire testé sur 6 cas hors domaine |
| **G4** | Exploit ≠ GTO seulement par `freq × 1,08` | **Corrigé.** Le multiplicateur est supprimé. L'ajustement lit des données réelles du profil (VPIP/PFR, fold-to-cbet, call-cbet, bluff, fold-to-raise), chaque adaptation porte **le chiffre qui la fonde**, et il ne publie **ni fréquence ni EV** | `assertExploitHonesty` : 0 surévaluation ; une station et un nit produisent des directions **opposées** |

### Mineurs

| # | Défaut mesuré | Après | Preuve |
|---|---|---|---|
| **M8** | « Bet ½ » affiche `fmt(pot*.5|0)` — tronqué : bouton 3bb, moteur 3,5bb | **Corrigé.** Un seul arrondi (`roundStep`, demi-blind) pour le libellé et l'exécution ; le montant est de plus borné par les règles du moteur | `test-trainer-sizing.mjs` : `roundStep(7*0.5) === 3.5` · audit Full Hand : `F6` 0 écart |
| **V1** | 1366×768 : INFORMATIONS déborde de 7px, **3 chevauchements** avec la TIMELINE, « SPR » coupé | **Corrigé.** INFORMATIONS + TIMELINE forment un **pied de panneau épinglé** ; le bloc passe en deux colonnes sous 860px de haut ; et `minWidth:0` empêche la mosaïque de pousser le panneau hors écran | `npm run audit:responsive` — 1366×768 1T **et** 2T conformes |
| **V2** | Mobile : la pile de jetons recouvre « POT 1.5bb » sur 17×17px, un jeton de fold sur 34×6px | **Corrigé.** Une règle héritée (`.pf-pot-chip-stack span`) capturait le nouveau conteneur et le sortait du flux ; le badge d'un siège haut passe du côté opposé au feutre | `npm run audit:responsive` — 390×844 conforme ; **0 chevauchement sur les 6 configurations** |
| **G5** | Le Vilain ne regarde pas ses cartes hors Full Hand ; 3-bet à `pot×2.8+1.5` = **5,2× l'ouverture** | **Partiellement corrigé — voir §5.** Le sizing est corrigé (3× IP / 4× OOP / +1× par suiveur, borné au tapis). Le tirage pondéré reste, et il est désormais **dit** | `test-trainer-sizing.mjs` §10 : ratio ≤ 4,5× ; borne au tapis vérifiée |
| **G6** | 97 % des solutions sont des constantes de template | **Conservé et renforcé (C13).** C'était déjà correctement étiqueté. La fréquence de référence n'est plus appelée « GTO » quand la provenance ne l'est pas, et la fiche publie désormais **moteur + version + confiance + barème + motif de repli** (il manquait la version et la confiance) | `npm run audit:provenance` — **0 provenance surévaluée / 100 mains** ; `test-trainer-honesty.mjs` §7 : la confiance **découle** de la source, jamais réglée à la main |
| **V4** | `audit:finitions` conclut ✅ sur des mesures absentes | **Non traité — voir §5.** Hors du périmètre des 15 correctifs demandés | — |

---

## 3. Défauts trouvés **pendant** la correction

Le ledger mesure ce que personne ne mesurait. Il a fait apparaître trois défauts
qui n'étaient pas dans l'audit — tous corrigés, tous couverts par un invariant.

| Trouvé par | Défaut | Correction |
|---|---|---|
| `I8-siege-non-conserve`, 2 mains / 60 | Un siège de 46bb engagé à 49,5bb : la **relance postflop du Vilain** (`Math.round(pot*rzPct)`) ne regardait ni son tapis ni ce qu'il avait déjà engagé | Bornée au tapis, annoncée « Tapis » quand elle l'atteint |
| Idem, spots de river | Les générateurs postflop tiraient le **tapis et le pot indépendamment** : un pot de 75bb pouvait sortir face à une profondeur de 40bb — un coup que personne n'a pu jouer | `stackPourPot()` relève la profondeur au minimum que la ligne exige ; `validateSpotConsistency` refuse le reste (le spot est régénéré, rien n'est masqué) |
| `I3` sur un 3-bet « to 8.5bb » | Une relance que **personne ne peut égaler** était proposée | Le plafond est `min(capacité d'Hero, capacité du mieux doté des adversaires)` ; quand c'est l'adversaire qui plafonne, l'écran le **dit** |
| Audit responsive 2T | À 1366×768 la mosaïque **poussait le panneau hors de la fenêtre** sans même un scroll pour l'atteindre — un ancêtre en `overflow:hidden` le masquait en silence | `minWidth:0` sur le conteneur de la mosaïque (piège classique de flexbox : `min-width:auto` empêche de rétrécir) |
| Capture mobile relue à l'œil | **Troisième poche de M1** : les barres HUD (`📊 stack`, `SPR`) lisaient encore `spot.stack`. Mesuré : barre « 73bb · SPR 5.6 » quand la table peignait un tapis effectif de 65bb (SPR réel 5.0). Aucun invariant ne les couvrait — l'audit money lit le panneau, absent sur mobile | Les trois HUD (1T mobile, 1T bureau, barre du bas) lisent le ledger. Un chip « ⚖ tapis effectif » est ajouté sur mobile. Vérifié : **20 relevés sur deux résolutions, 0 écart** |
| Capture 1366 relue à l'œil | Le **ratio** d'une relance était arrondi au demi-blind : 8,5 / 2,5 = 3,4 s'affichait « 3.5× la mise » | Un ratio n'est pas un montant : arrondi à une décimale |

---

## 4. Instruments — ce qui a été renforcé, et pourquoi ce n'est pas un relâchement

`npm run audit:money` **sortait toujours en 0**, même avec 116 écarts : un audit
qui ne peut pas échouer ne garde rien. Il échoue désormais sur un écart, une
erreur console, ou un relevé incomplet.

Trois invariants ont été **remplacés par leur version exacte**. Chacun comparait
deux grandeurs différentes, donc ratait de vrais défauts autant qu'il en
inventait :

| Invariant | Avant | Après | Pourquoi c'est plus fort |
|---|---|---|---|
| `I1` | « tous les tapis adverses sont égaux » — un *proxy* de la constante 60 | `tapis peint == profondeur − engagement`, **siège par siège**, sur le ledger publié + « le tapis adverse varie d'une main à l'autre » | Attrape la constante ET toute autre divergence ; **fonctionne enfin en mosaïque** (limite §6 de l'audit précédent) |
| `I3` | un **total** (« relancer à X ») comparé au plus petit tapis **restant** | deux bornes : `total ≤ capacité d'Hero` **et** `total ≤ capacité adverse` | Deux contrôles au lieu d'un, sur les grandeurs qui existent réellement |
| `I4` | tout `%` dans un indice traité comme une fraction de pot | fraction de pot **et** cote du pot testées chacune contre sa définition | Une cote fausse était invisible ; elle ne l'est plus |
| `I2` | le panneau comparé au feutre de **n'importe quelle** table | comparé à la table qui a le **focus** — la seule qu'il décrit | Supprime 3 faux écarts en 4T sans rien masquer |

Ajouts : `I8` (conservation par siège + pot reconstructible), `I9` (statut
cohérent avec le badge), `S1/S2/S3` (sélecteur), `F1→F6` (coup complet),
`①→④` (responsive).

**Aucune tolérance n'a été élargie, aucun nombre d'itérations réduit.**
Le relevé de référence est passé de 60 à 60 mains, et de 116 écarts à 0.

---

## 4 bis. Résultats des commandes — relevés bruts

Toutes les mesures ci-dessous sont rejouables. Le serveur de dev doit tourner
(`pokerforge-verify`, port 7799) ; les scripts acceptent `--url`.

### Suite unitaire — `npm test`

```
50 fichiers de tests · 5 414 assertions · exit 0
```

dont les six fichiers ajoutés :

| Fichier | Ce qu'il verrouille | Assertions |
|---|---|---:|
| `test-evaluator-card-count.mjs` | C1 — aucune carte fantôme (20 000 tirages flop/turn/river) | 37 |
| `test-full-hand-rules.mjs` | C3/C7/C8 — conservation, remboursement, min-raise, split (400 mains aléatoires) | 76 |
| `test-trainer-hand-ledger.mjs` | C2 — tapis réels, SPR, cotes, 20 combinaisons profondeur × ligne | 110 |
| `test-trainer-sizing.mjs` | C4→C8/C12 — un montant par action, bornes, indices (300+ combinaisons) | 81 |
| `test-trainer-seat-status.mjs` | C9 — aucun badge FOLD injustifié (36 contrôles + 9-max) | 48 |
| `test-trainer-honesty.mjs` | C10/C11/C13 — Nash, Exploit, fiche de provenance | 175 |

### Audits navigateur

| Commande | Périmètre | Résultat |
|---|---|---|
| `npm run audit:money` | 60 mains · 1T · 1920×1080 | **0 écart** (116 avant) |
| `audit:money --tables=3` | 30 mains · 3T | **0 écart** |
| `audit:money --tables=4` | 40 mains · 4T | **0 écart** (18 avant) |
| `audit:money --stack=200bb` | 30 mains · deep | **0 écart** |
| `audit:money --stack=10bb` | 30 mains · short | **0 écart** |
| `audit:money --w=1366` | 25 mains | **0 écart** |
| `audit:money --w=390` | 15 mains · mobile | **0 écart** |
| `npm run audit:sizing` | 10 scénarios dirigés, 6 préréglages, pas à pas | **0 écart** — `libellé = sélecteur = pot = tapis` |
| `npm run audit:fullhand` | 20 coups complets jusqu'à l'attribution | **0 écart** · 19 gagnés / 1 perdu |
| `npm run audit:responsive` | 7 configurations (1920 1T/2T/3T/4T · 1366 1T/2T · 390 1T), 267 à 774 boîtes peintes mesurées par config | **0 débordement, 0 chevauchement, 0 ligne rognée** |
| `npm run audit:provenance` | 100 mains | **0 provenance surévaluée** |
| `npm run audit:pause` | 16 combinaisons | **16/16 conformes** |
| `npm run audit:solution` | 3 configurations | **conforme, 0 contamination croisée** |
| `npm run audit:layout` | 31 relevés 2T/3T/4T | **0 écart > 1px** |

**Erreurs console : 0** sur l'ensemble des sessions jouées.

**Le cas « pot partagé » au navigateur** : une égalité est rare au tirage. Elle a
été observée et correctement étiquetée « 🤝 POT PARTAGÉ » sur un relevé
intermédiaire de 20 coups (15 / 4 / **1 partagé**) ; le relevé final n'en a pas
tiré. Le partage exact, jeton indivisible compris, est verrouillé sans
dépendre du hasard par `test-full-hand-rules.mjs` §7.

---

## 5. Limites assumées et risques résiduels

Ce que la correction **ne** fait **pas**, dit explicitement.

1. **Le Vilain hors Full Hand reste un tirage pondéré** (G5). Ses cartes
   n'entrent dans aucune formule. Le *sizing* est corrigé, mais la décision
   n'est pas une décision de poker. La mission autorisait deux issues ; celle
   retenue est la simulation honnête, pas la simulation cachée.
   **Risque résiduel** : un joueur peut lire le showdown comme un verdict sur sa
   décision. Le libellé de simulation est en place, mais il n'a pas d'instrument
   dédié.

2. **La profondeur des sièges est une convention, pas une donnée.** Un spot du
   Trainer ne porte qu'un tapis (`spot.stack`, le tapis effectif). Tous les
   sièges démarrent donc à cette profondeur. Ce n'est pas une constante — la
   valeur suit le filtre et le format — mais ce n'est pas non plus une table de
   tapis hétérogènes. **Les stacks inégaux entre sièges ne sont pas modélisés.**

3. **Le pot reporté d'un spot postflop est réparti, pas connu.** Il est
   attribué selon la ligne préflop reconstruite quand elle existe, à parts
   égales sinon. La somme est exacte ; l'attribution est une hypothèse écrite.

4. **Pas de side pots.** Le coup complet est heads-up par construction
   (`fullHandEngine`), et les spots à plus de deux joueurs actifs ne vont pas au
   coup complet. La mission demandait « sinon bloque explicitement les
   configurations non prises en charge » : c'est le cas, mais par construction,
   pas par un refus explicite qui le dirait à l'écran.

5. **`audit:finitions` (V4) n'a pas été corrigé.** Il imprime toujours
   « non mesurable ici » puis marque ✅. Le défaut est réel et reconnu ; il est
   hors du périmètre C1→C15.

6. **Les 97 % de solutions heuristiques restent des heuristiques** (G6). La
   correction porte sur leur **nom**, pas sur leur calcul. Aucune EV n'a été
   fabriquée pour combler l'écart.

7. **`audit:responsive` mesure 6 configurations sur 3 mains chacune.** C'est
   assez pour verrouiller une règle de mise en page, pas pour décrire une
   distribution de tirages.

---

## 6. Fichiers touchés

**Modules créés (purs, testés) :**
`src/trainerHandLedger.js` · `src/trainerSizing.js` · `src/trainerSeatStatus.js` ·
`src/trainerJamThreshold.js` · `src/trainerExploit.js`

**Modules corrigés :**
`src/solver/core/evaluator.js` (+`evalBestI`) · `src/fullHandEngine.js` (règles
No-Limit + ledger) · `src/postflopHeuristic.js` (abstraction unique) ·
`src/preflopLine.js` (fold des blindes enregistré) · `src/trainerActionEvent.js`
(cohérence pot/profondeur)

**Rendu :** `src/tabs/TrainerTab.jsx` · `src/styles.js` · `src/styles/chips.css`

**Tests ajoutés :** `test-evaluator-card-count.mjs` · `test-full-hand-rules.mjs` ·
`test-trainer-hand-ledger.mjs` · `test-trainer-sizing.mjs` ·
`test-trainer-seat-status.mjs` · `test-trainer-honesty.mjs`

**Instruments :** `scripts/trainer-money-audit.mjs` (renforcé) ·
`scripts/trainer-sizing-audit.mjs` · `scripts/trainer-fullhand-audit.mjs` ·
`scripts/trainer-responsive-audit.mjs`
