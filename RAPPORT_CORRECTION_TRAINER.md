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
| **G5** | Le Vilain ne regarde pas ses cartes hors Full Hand ; 3-bet à `pot×2.8+1.5` = **5,2× l'ouverture** | **Corrigé — voir §5.1.** Le sizing suit des règles contextuelles ; le Vilain reçoit une main tirée dans sa range, qui infléchit ses quatre décisions et le suit jusqu'au showdown | `test-trainer-villain-hand.mjs` — 65 assertions ; la main déplace le fold de **plus de 25 points** (écart nul avant) |
| **G6** | 97 % des solutions sont des constantes de template | **Conservé et renforcé (C13).** C'était déjà correctement étiqueté. La fréquence de référence n'est plus appelée « GTO » quand la provenance ne l'est pas, et la fiche publie désormais **moteur + version + confiance + barème + motif de repli** (il manquait la version et la confiance) | `npm run audit:provenance` — **0 provenance surévaluée / 100 mains** ; `test-trainer-honesty.mjs` §7 : la confiance **découle** de la source, jamais réglée à la main |
| **V4** | `audit:finitions` conclut ✅ sur des mesures absentes | **Corrigé — voir §5.4.** Les quatre mesures sont prises, l'ancrage et la référence sont nommés ; une mesure absente est désormais un **échec** | 4 modes × 4 mesures, exit 0 |

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
| `audit:fullhand`, après §5.1 | Le point neutre de la force de main était fixé à **0.22** au postflop, alors que la médiane mesurée au flop vaut **0.075**. Presque toute main tombait « sous la moyenne » : le Vilain se couchait à tout va — **17 coups complets, 17 gagnés par Hero** | La référence vient de la distribution mesurée (`neutralStrength`), une médiane par street. Une référence fausse suffisait à vider la correction de son sens |
| `audit:money`, entrée impossible | Un pot que plus aucun joueur en jeu ne dispute était rendu à **tous** les joueurs de la main, y compris ceux qui n'avaient jamais atteint ce palier | Chaque palier trace ses contributeurs ; il leur est rendu au prorata, et la situation est **signalée** comme impossible au poker |
| Garde du refus multiway, §5.3 | Elle comptait comme « en jeu » les sièges qui **n'avaient pas encore parlé** — un « BTN vs open du CO » en comptait 4. Le coup complet était refusé presque à chaque fois | Elle compte qui est réellement dans le pot : Hero, le vilain, les suiveurs déclarés |
| `audit:fullhand`, compteurs ajoutés | **257 tentatives sur 280 sans action** : l'instrument brûlait son plafond à attendre la fin d'une animation ou l'activation de la CTA, et concluait « 17 mains sur 20 » | Il patiente explicitement jusqu'à un état jouable ; 36 tentatives suffisent désormais pour 20 coups |

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
51 fichiers de tests · 5 626 assertions · exit 0
```

dont les huit fichiers ajoutés :

| Fichier | Ce qu'il verrouille | Assertions |
|---|---|---:|
| `test-evaluator-card-count.mjs` | C1 — aucune carte fantôme (20 000 tirages flop/turn/river) | 37 |
| `test-full-hand-rules.mjs` | C3/C7/C8 — conservation, remboursement, min-raise, split (400 mains aléatoires) | 76 |
| `test-trainer-hand-ledger.mjs` | C2 — tapis réels, SPR, cotes, tapis inégaux par siège (1 000 tirages) | 141 |
| `test-trainer-sizing.mjs` | C4→C8/C12 — un montant par action, bornes, indices (300+ combinaisons) | 81 |
| `test-trainer-seat-status.mjs` | C9 — aucun badge FOLD injustifié (36 contrôles + 9-max) | 48 |
| `test-trainer-honesty.mjs` | C10/C11/C13 — Nash, Exploit, fiche de provenance | 175 |
| `test-pot-distribution.mjs` | C8 — pot principal, side pots, jeton indivisible (3 000 configurations de 2 à 5 joueurs) | 77 |
| `test-trainer-villain-hand.mjs` | C12/G5 — le Vilain regarde ses cartes, et elles pèsent ; point neutre calibré sur la distribution | 85 |

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
| `npm run audit:fullhand` | 20 coups complets jusqu'à l'attribution (36 tentatives, 12 mains résolues au préflop) | **0 écart** · 16 gagnés / 4 perdus |
| `npm run audit:responsive` | 7 configurations (1920 1T/2T/3T/4T · 1366 1T/2T · 390 1T), 267 à 774 boîtes peintes mesurées par config | **0 débordement, 0 chevauchement, 0 ligne rognée** |
| `npm run audit:finitions` | 4 modes × 4 mesures (ellipse, air sous Hero, labels, surface) | **4/4 conformes** — et les quatre mesures sont désormais PRISES |
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

## 5. Les quatre limites du premier passage — traitées

Le premier livrable annonçait quatre choses non faites. Elles le sont.

### 5.1 · G5 — le Vilain regarde ses cartes

**Avant** : hors coup complet, `villainDecide` tirait au sort, pondéré par le
profil, la position, le SPR et le field. Sa main n'entrait dans **aucune**
formule. Deux mains opposées produisaient la même distribution de décisions.

**Après** — `src/trainerVillainHand.js` :

- le Vilain reçoit une main **tirée dans sa range**, le VPIP du profil servant
  de quantile sur la distribution réelle des 169 mains (pondérée par les
  combinaisons) — un nit reçoit le haut 12 %, une station le haut 48 % ;
- la main **exclut** les cartes connues (main d'Hero, board) ;
- sa force — force de départ au préflop, catégorie réalisée postflop —
  **infléchit** les quatre décisions : payer un tapis, 3-better, miser après un
  check, répondre à l'agression ;
- il **garde les mêmes cartes** du préflop au showdown : le coup complet ne lui
  en tire plus de nouvelles.

Ce qui est **conservé** : le tirage pondéré. Il porte le style du joueur, et le
multiplicateur de main est borné (±75 %) — une main faible garde une part de
bluff, une main forte ne devient pas un automate.

Ce qui n'est **pas** prétendu : une stratégie résolue. La réserve reste
affichée, mais elle dit maintenant la bonne chose.

*Mesuré* : `test-trainer-villain-hand.mjs`, 65 assertions. Ordre du poker
respecté (AA > KK > QQ > JJ > AKs > AKo > T9s > 72o) ; **la main déplace le
fold de plus de 25 points et la relance de plus de 10** — l'écart qui était nul.

### 5.2 · Tapis inégaux par siège

**Avant** : une profondeur pour toute la table. Honnête, mais faux — et le
tapis effectif, celui qui décide du SPR, naît précisément de l'inégalité.

**Après** : `spot.seatStacks` donne à chaque siège sa profondeur.
`spot.stack` garde son sens exact — le tapis **effectif**, c'est-à-dire le plus
court des tapis encore en jeu, c'est-à-dire ce que règle le filtre. Le contrat
est vérifié : personne sous la profondeur demandée, et **au moins un siège en
jeu exactement dessus**, sinon le réglage serait trahi.

Un spot sans `seatStacks` retombe sur la profondeur commune : aucun spot ancien
ne change de nature.

*Mesuré* : `test-trainer-hand-ledger.mjs` §9-10 — **1 000 tirages sur 5
profondeurs, 0 écart**, et plus de 950 produisent des tapis réellement inégaux.

### 5.3 · Side pots

**Avant** : « heads-up par construction » — c'est-à-dire un refus silencieux.

**Après** — `src/potDistribution.js` calcule la vérité pour **N joueurs** :
empilage par paliers, pot principal + side pots, joueur couché qui alimente
sans disputer, mise non suivie détachée avant tout découpage, partage au
demi-blind avec le jeton indivisible à l'OOP.

L'attribution du coup complet **passe par ce module** : en heads-up il n'y a
qu'un palier, donc le résultat est identique — mais la règle n'est plus câblée
pour deux joueurs.

Et quand le moteur de jeu ne peut pas suivre, **le refus est affiché** avec sa
raison : « COUP COMPLET INDISPONIBLE — 3 joueurs encore en jeu… il faudrait des
side pots pendant le déroulé ; le calcul existe, le moteur de jeu ne les joue
pas encore ».

*Réserve d'honnêteté* : sur l'échantillon navigateur, ce refus **ne s'est pas
déclenché** (`refusExplicite: 0` sur 36 tentatives) — le mode Full Hand filtre
déjà les spots vers du heads-up. Le chemin est couvert par le test unitaire
(`potDistributionSupport`), pas par une observation à l'écran.

*Mesuré* : `test-pot-distribution.mjs`, 77 assertions dont **3 000
configurations aléatoires de 2 à 5 joueurs, 0 écart** de conservation, de
plafond ou de signe. Le cas dégénéré (entrée impossible au poker) est
**signalé** et son contenu **rendu à ses contributeurs**, jamais égaré.

### 5.4 · V4 — `audit:finitions`

**Avant** : « ① non mesurable ici », « ② non mesurable ici », « ③ feutre ?% » —
puis ✅. Trois mesures sur quatre absentes, verdict vert.

**Après** : les trois causes étaient des défauts d'instrument, pas des modes qui
« ne s'y prêtent pas ».

| Mesure | Cause réelle | Correction |
|---|---|---|
| ① ellipse | le 1T pose ses médaillons sous `.pf-avatar-premium`, pas `.pf-seat-avatar-slot` | le sélecteur manquait ; l'ancrage utilisé est nommé |
| ② air sous Hero | en 1T le bandeau d'action est en colonne : rien n'est sous le bloc Hero | on mesure la distance au bas de la zone de table, et on dit quelle référence |
| ③ surface | calculée **après** 4 tours de clics, sur un nœud détaché : rect à zéro → `Infinity` → `null` → « ?% » | prise sur des nœuds vivants — le défaut touchait les **quatre** modes |

Une mesure absente est désormais un **échec**. Il n'y a plus de porte de sortie
« non applicable ».

Ce que l'instrument révèle une fois qu'il mesure : le Hero est tiré vers
l'intérieur (ρ 0.678 en 1T contre 0.84→0.99 pour l'anneau). Ce n'est pas un
défaut d'alignement mais la mise en page hero-centrique. **L'exclusion est
nommée et le ρ du Hero reste publié**, jamais escamoté.

*Mesuré* : 4 modes × 4 mesures, exit 0. Anneau 1T à 0.05 d'écart-type (seuil
0.06), mosaïque à 0.012.

---

## 6. Limites qui restent

1. **Le pot reporté d'un spot postflop est réparti, pas connu.** Il est
   attribué selon la ligne préflop reconstruite quand elle existe, à parts
   égales sinon. La somme est exacte ; l'attribution est une hypothèse écrite.

2. **Le coup complet reste heads-up.** `potDistribution` sait calculer les side
   pots ; le moteur de jeu ne sait pas les **jouer** (il n'a qu'un tour
   d'enchères à deux). La différence est maintenant dite à l'écran au lieu
   d'être subie.

3. **La force préflop du Vilain est un barème, pas une équité calculée.** Elle
   est ordonnée correctement — c'est ce que les tests vérifient — mais ce n'est
   pas une table d'équité. Sa provenance reste « heuristique ».

4. **Les 97 % de solutions heuristiques restent des heuristiques** (G6). La
   correction porte sur leur **nom** et sur la complétude de leur fiche de
   provenance, pas sur leur calcul. Aucune EV n'a été fabriquée.

5. **`audit:responsive` mesure 7 configurations sur 3 à 5 mains chacune.** Assez
   pour verrouiller une règle de mise en page, pas pour décrire une
   distribution de tirages.

---

## 7. Fichiers touchés

**Modules créés (purs, testés) :**
`src/trainerHandLedger.js` · `src/trainerSizing.js` · `src/trainerSeatStatus.js` ·
`src/trainerJamThreshold.js` · `src/trainerExploit.js` · `src/potDistribution.js` ·
`src/trainerVillainHand.js`

**Modules corrigés :**
`src/solver/core/evaluator.js` (+`evalBestI`) · `src/fullHandEngine.js` (règles
No-Limit + ledger) · `src/postflopHeuristic.js` (abstraction unique) ·
`src/preflopLine.js` (fold des blindes enregistré) · `src/trainerActionEvent.js`
(cohérence pot/profondeur)

**Rendu :** `src/tabs/TrainerTab.jsx` · `src/styles.js` · `src/styles/chips.css`

**Tests ajoutés :** `test-evaluator-card-count.mjs` · `test-full-hand-rules.mjs` ·
`test-trainer-hand-ledger.mjs` · `test-trainer-sizing.mjs` ·
`test-trainer-seat-status.mjs` · `test-trainer-honesty.mjs` ·
`test-pot-distribution.mjs` · `test-trainer-villain-hand.mjs`

**Instruments :** `scripts/trainer-money-audit.mjs` (renforcé) ·
`scripts/trainer-finitions-audit.mjs` (mesure enfin ses quatre points) ·
`scripts/trainer-sizing-audit.mjs` · `scripts/trainer-fullhand-audit.mjs` ·
`scripts/trainer-responsive-audit.mjs`
