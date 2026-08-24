# AUDIT INTÉGRAL DU TRAINER — 2026-08-21

Audit complet du Trainer : options, gameplay, visuel, **arithmétique des mises et
comptabilité des tapis**. Tout est mesuré au navigateur sur des mains réellement
générées par l'application. Aucune anomalie n'est déclarée sans le nombre qui la
prouve, aucune conformité sans la mesure qui l'atteste.

Base : `3971f34` (main, arbre propre) · Serveur de dev 7788 / 7799 · Chrome headless.

---

## 0. Méthode et périmètre

| Instrument | Ce qu'il mesure | Mains |
|---|---|---:|
| `npm test` | 32 fichiers de tests unitaires + certification solveur | — |
| `npm run audit:provenance` | aucune solution surévaluée | 100 |
| `npm run audit:pause` | règle « Pause après » dans les deux sens, 4 options × 1T→4T | 16 combinaisons |
| `npm run audit:solution` | bascule globale, contamination croisée 2T/3T/4T | 3 configs |
| `npm run audit:layout` | déplacement de cadre 2T/3T/4T | 96 relevés |
| `npm run audit:finitions` | ellipse, air sous Hero, étiquettes | 1T→4T |
| **`npm run audit:money`** *(nouveau)* | **tailles de mises, tapis, pot, SPR** | **100** |
| Sonde visuelle | débordements et chevauchements 1T/2T/4T/1366/mobile | 5 rendus |

Résolutions couvertes : **1920×1080**, **1366×768**, **390×844 (mobile)**.
Configurations : 1T, 2T, 4T · Spot et Full Hand · stack Tous / 200bb.

Le nouvel audit `trainer-money-audit.mjs` ne lit pas des pixels : il lit les
**valeurs écrites par le rendu** (`.pf-pot-value`, `.seat-card-stack`,
`.gto-btn-sizing`…) et confronte chacune aux autres. Sept invariants, chaque
écart rendu avec les nombres qui l'établissent.

---

## 1. Ce qui tient — vérifié, pas supposé

| Point | Mesure |
|---|---|
| Suite de tests | `npm test` → **exit 0**, l'ensemble des 32 fichiers passe |
| Provenance des solutions | 100 mains, **0 badge surévalué** ; échantillon **bilatéral** (97 heuristique / 3 solveur), donc le chemin positif est exercé |
| « Pause après » | **16/16** combinaisons conformes, persistance après rechargement partout |
| « Afficher la solution » | **3/3** configs, aucune contamination croisée entre tables |
| Géométrie multi-table | **0 écart > 1px** sur 96 relevés (2T/3T/4T), du début à la fin d'une main |
| **Pot préflop reconstructible** | **0 écart sur 60 mains** : `pot == Σ jetons peints` (§24 tenu à l'écran) |
| Cotes du pot | vérifiées à la main : `à payer 18bb` dans un pot de 36.5 → **33 %** affiché, exact |
| Ligne préflop | `Face à 4-Bet 27bb · à payer 18bb` ⇒ pot 27 + 9 + 0.5 = **36.5bb** affiché, exact |
| Erreurs console | **0** sur ~200 mains jouées, toutes résolutions confondues |
| Mosaïque 4T à 1920 | **0 débordement, 0 chevauchement** |

---

## 2. Anomalies — argent et tapis

> C'est le cœur de l'audit. Une table de poker est d'abord une comptabilité :
> un tapis, un pot, des mises, et un rapport entre les trois. Si le tapis est
> faux, le SPR est faux ; si le SPR est faux, la décision enseignée est fausse —
> quel que soit le moteur derrière.

### M1 — Les tapis adverses sont une constante · **CRITIQUE** · 58 mains / 60

**Mesure.** Sur 60 mains relevées en 1T, **58** présentent la même signature :
tous les sièges non-Hero portent **60bb**, quel que soit le spot.

| Main | Spot | Tapis Hero | Tapis adverses |
|---|---|---:|---:|
| 1 | CO vs BB, river | 49bb | 60bb ×5 |
| 2 | BB vs BTN, river | 80bb | 60bb ×5 |
| 3 | BTN vs BB, river | 100bb | 60bb ×5 |
| — | filtre « 200bb » | 200bb | 60bb ×5 |
| — | push/fold court | 10bb | 60bb ×5 |

**Cause racine.** [`src/tabs/TrainerTab.jsx:5557`](src/tabs/TrainerTab.jsx:5557) :

```js
const displayStack = isH ? parseFloat(spot.stack)||100 : 60;
```

Le tapis adverse n'est pas lu, il est **écrit en dur**. Il ne dépend ni du spot,
ni du format, ni du filtre « STACK EFFECTIF », ni de ce que le vilain vient
d'engager : un vilain qui vient de 4-better à 27bb affiche toujours 60bb.

**Conséquences en chaîne, toutes mesurées :**

1. **Le tapis effectif lu sur la table contredit le panneau.** Avec le filtre
   200bb, la table dit « le plus court a 60bb » et le panneau dit
   « Stack Hero 200bb · SPR 5.3 ». Le vrai SPR de ce qui est peint vaut
   60 / 38 = **1.6**. Facteur d'écart : **3,3×**.
2. **29 mains sur 60** portent un SPR incohérent avec les tapis peints
   (invariant I2). Exemples mesurés : `BTN vs BB` pot 37 → SPR affiché **2.7**,
   SPR de la table **1.62** ; `BB vs UTG` pot 4.5 → **18.2** affiché contre
   **13.33** peint ; `BB vs BTN` pot 58.1 → **1.4** contre **1.03**.
3. Un push/fold « BTN 10bb » se joue visuellement contre des tapis de 60bb — or
   le modèle résolu suppose des tapis symétriques.

**Le correctif n'est pas une constante mieux choisie** : le tapis d'un siège doit
descendre du spot (tapis effectif) puis être **débité de son engagement**, exactement
comme le fait déjà `remainingStackAfterAction` dans
[`src/trainerActionEvent.js`](src/trainerActionEvent.js) — le calcul existe, il
n'atteint pas le rendu.

---

### M2 — Le sélecteur de tailles de mise ne pilote rien · **CRITIQUE**

**Symptôme.** Sous les boutons d'action vivent six préréglages (`MIN · 2.5× · 3× ·
3.5× · 4× · ALL-IN`) et un pas à pas `− valeur +`. Ils changent un nombre affiché.
Ils **ne changent pas l'action jouée**.

**Preuve — expérience dirigée, répétée 3 fois sur des spots différents :**

| Bouton | Montant du sélecteur | Préréglage forcé | Pot avant → après | Montant réellement engagé |
|---|---:|---|---|---:|
| `4-bet 22bb` | 31.5bb | ALL-IN | 10.5 → 30 | **19.5bb** (= le libellé) |
| `3-bet 9bb` | 12bb | ALL-IN | 4 → 12 | **8bb** (= le libellé) |
| `Squeeze 11.5bb` | 19.5bb | ALL-IN | 6.5 → 18 | **11.5bb** (= le libellé) |
| `3-bet 8.5bb` | 12bb | ALL-IN | 4 → 12.5 | **8.5bb** (= le libellé) |

Le pot ne bouge jamais de la valeur annoncée par le sélecteur, ni du tapis
demandé par `ALL-IN` : il bouge exactement de ce que dit le **libellé du bouton**.

**Cause racine.** `raiseAmt`, `customBB` et `raiseSzIdx` n'apparaissent qu'entre
[`TrainerTab.jsx:4914`](src/tabs/TrainerTab.jsx:4914) et
[`4973`](src/tabs/TrainerTab.jsx:4973) — c'est-à-dire **uniquement dans le rendu**.
`handleHeroAct(i)` ([`3772`](src/tabs/TrainerTab.jsx:3772)) ne reçoit qu'un
**index** et transmet `spot.acts[i]` tel quel à `commitTableAction` ; le montant
est ensuite déduit du **texte du libellé** par `explicitAmount()`.

**Deuxième défaut, dans la formule elle-même** ([`4916`](src/tabs/TrainerTab.jsx:4916)) :

```js
const raiseAmt = sp.mult===999 ? bbSize
               : customBB!==null ? customBB
               : Math.round(currentPotBb * sp.mult * 10)/10;
```

Le multiplicateur porte sur **le pot**, alors que « 2.5× / 3× » désigne au poker
préflop un multiple de **la grosse blinde**. D'où, mesuré :

- pot 1.5bb, préréglage `3×` → **4.5bb** annoncé pour un open (au lieu de 3bb) ;
- préréglage `MIN` = 0.5 × pot = **0.75bb** préflop — sous la grosse blinde ;
- le pas à pas plafonne par le bas à `currentPotBb`, soit 1.5bb — toujours sous
  la relance minimale légale de 2bb.

---

### M3 — Un bouton porte deux montants qui se contredisent · **MAJEUR** · 15 / 60 mains (1T), 10 / 40 (4T)

Parce que M2 affiche `raiseAmt` sur les boutons de la famille RAISE, chaque bouton
de relance annonce **deux mises différentes**.

| Main | Bouton | Montant du libellé | Montant du sélecteur | Pot |
|---|---|---:|---:|---:|
| 7 | `Squeeze 12bb` | 12 | **19.5** | 6.5 |
| 10 | `3-bet 6bb` | 6 | **13.5** | 4.5 |
| 15 | `4-bet 22bb` | 22 | **33** | 11 |
| 17 | `3-bet 8.5bb` | 8.5 | **12** | 4 |
| — | `Open 2.5bb` (mobile) | 2.5 | **4.5** | 1.5 |

C'est visible sur toutes les résolutions, y compris mobile.

---

### M4 — Le sélecteur propose des mises supérieures au tapis · **MAJEUR**

| Main | Bouton | Montant proposé | Tapis effectif peint |
|---|---|---:|---:|
| 18 | `X/R 14bb` | **63bb** | 60bb |
| (tirage antérieur) | `3-bet 9bb` | 10.5bb | 10bb |
| (tirage antérieur) | `X/R 17bb` | **72bb** | 60bb |
| — | vs 4-bet, hero 40bb | **109.5bb** | 40bb |
| — | Full Hand, hero 20bb | 19.5bb (97 % du tapis, non étiqueté tapis) | 20bb |

`ALL-IN` est le seul préréglage borné par le tapis ; les cinq autres multiplient
le pot sans jamais regarder ce qu'il reste devant le joueur.

---

### M5 — L'indice sous le bouton contredit son libellé · **MAJEUR** · 12 / 60 (1T), 7 / 40 (4T)

| Bouton | Indice affiché | Montant | Pot | Fraction réelle |
|---|---|---:|---:|---:|
| `Bet 50%` | *33 % pot* | 20bb | 39 | **51 %** |
| `Bet 66%` | *75 % pot* | 26bb | 39 | **67 %** |
| `Barrel 66%` | *75 % pot* | 14bb | 21 | **67 %** |
| `Open 3bb` | *75 % pot* | 3bb | 1.5 | **200 %** |
| `Overbet` | *Pot* | 46bb | 38 | **121 %** |

**Cause racine.** `neutralHints` ([`TrainerTab.jsx:4917`](src/tabs/TrainerTab.jsx:4917))
associe une fraction fixe à l'**identifiant** de l'action (`BET33` → « 33 % pot »),
tandis que les générateurs réutilisent ces identifiants pour des libellés qui
disent autre chose (`{id:"BET33", l:"Bet 50%"}`, `{id:"BET75", l:"Open 3bb"}`).
Le libellé est juste ; c'est l'indice qui ment.

**Écart marginal du libellé lui-même** — absent du tirage de référence, relevé sur
deux tirages antérieurs (2 mains / 60) : `Math.round(pot*.33)` sur un petit pot
donne `Cbet 33%` → 2bb dans un pot de 5 = **40 %**, et `Cbet 75%` → 5bb dans un
pot de 6 = **83 %**. L'arrondi à l'entier fausse l'annonce sur les petits pots.

---

### M6 — Full Hand : les engagements préflop ne sont pas débités des tapis · **CRITIQUE**

**Mesure au navigateur, main complète suivie pas à pas (BB 20bb, session Full Hand) :**

| Instant | Pot | `Stack Hero` (panneau) | Plaque du siège BB |
|---|---:|---:|---:|
| Préflop, avant décision | 6.5bb | 20bb | 20bb |
| Après `Call 1.5bb` → flop | 8bb | **20bb** | 20bb |
| Après `Bet ½ 4bb` → turn | 16bb | 16bb | **20bb** |

Deux défauts distincts, tous deux visibles sur cette même main :

1. **Les 2.5bb engagés au préflop ne quittent jamais le tapis.** Au flop, le pot
   vaut 8bb et les deux joueurs ont encore leur tapis entier. Bilan des jetons :
   pot 8 + Hero 20 + Vilain 20 = **48bb** pour deux tapis de 20bb — **8bb créés
   à partir de rien**.
   Cause : [`TrainerTab.jsx:3971`](src/tabs/TrainerTab.jsx:3971) —
   `createFullHand({ startPot, heroStack: stackBb, villStack: stackBb })` reçoit
   le pot **et** les tapis de départ non entamés.
2. **La plaque du siège ne suit pas le moteur.** Au turn, le panneau dit 16bb et
   le siège dit encore 20bb : deux nombres contradictoires sur le même écran
   (conséquence de M1 — la plaque lit `spot.stack`, jamais l'état vivant).

---

### M7 — Full Hand : trois règles de No-Limit non tenues · **MAJEUR**

Prouvé par exécution directe du moteur ([`src/fullHandEngine.js`](src/fullHandEngine.js)) :

**① La mise non suivie n'est pas rendue.** Hero mise 40bb ; le Vilain n'a que 5bb
et suit à tapis. Résultat : **pot 55bb** au lieu de 20bb. Les 35bb excédentaires
d'Hero restent dans un pot que le Vilain peut remporter — un tapis de 5bb
encaisserait 55bb.
Cause : [`fullHandEngine.js:133`](src/fullHandEngine.js:133) — `commit(toCall)`
plafonne le paiement du suiveur mais ne restitue jamais le surplus du mieux doté.

**② La relance minimale n'est pas contrôlée.** Face à une mise de 6bb, une
« relance » à 6.5bb est acceptée ; le Vilain se retrouve à devoir 0.5bb.
Cause : [`fullHandEngine.js:149`](src/fullHandEngine.js:149) —
`delta = Math.max(toCall, raiseTo - contrib)` n'exige pas `raiseTo ≥ mise + relance précédente`.

**③ Une égalité est comptée comme une victoire.** Le moteur rend correctement
`{winner:"split"}` ; le rendu écrit
[`TrainerTab.jsx:3930`](src/tabs/TrainerTab.jsx:3930) :

```js
setFhResult(st.result.winner==="villain" ? "lose" : "win"); // hero win / split → "win"
```

Le partage est donc porté au crédit du joueur dans le bilan de la main.

**④ Corollaire :** le pot n'est **jamais reversé** à un tapis en fin de main. Le
coup se termine avec un pot orphelin, donc aucun résultat en bb n'est dérivable
des jetons.

---

### M8 — Full Hand : le libellé « Bet ½ » sous-estime la mise réelle · **MINEUR**

[`TrainerTab.jsx:5009`](src/tabs/TrainerTab.jsx:5009) affiche `fmt(fhPot*.5|0)` —
l'opérateur `|0` **tronque à l'entier**. La mise réellement engagée est
`Math.max(1, roundBb(pot*0.5))`, arrondie au demi-blind.

Pot 7bb ⇒ le bouton annonce **3bb**, le moteur engage **3.5bb**.

---

## 3. Anomalies — gameplay

### G1 — En Full Hand, le Vilain évalue une main fantôme au flop et au turn · **CRITIQUE**

**Cause racine.** [`fullHandEngine.js:31`](src/fullHandEngine.js:31) :

```js
export function handStrength7(hole2, board5) {
  const cards = [...hole2, ...board5].filter(Boolean).map(cardToInt);
  if (cards.length < 5) return -1;
  return eval7i(cards.slice(0, 7));   // ← eval7i suppose EXACTEMENT 7 cartes
}
```

[`evaluator.js:40`](src/solver/core/evaluator.js:40) boucle sur les indices 0..6
et retire 2 cartes. Avec 5 cartes (flop) ou 6 (turn), les indices manquants
valent `undefined` ; or `undefined>>2 === 0` et `undefined&3 === 0` : **chaque
carte absente devient un 2♠**. Le Vilain évalue donc sa main *plus deux 2 de pique
imaginaires* — d'où des couleurs à pique et des paires de 2 qui n'existent pas.

**Mesure — 20 000 tirages aléatoires par street :**

| Street | Catégorie de main faussée | Force moyenne (moteur) | Force moyenne (vraie) |
|---|---:|---:|---:|
| **Flop** | **95,7 %** | 0,419 | 0,138 |
| **Turn** | **39,8 %** | 0,266 | 0,186 |
| River | 0,0 % | 0,253 | 0,253 |

Exemple : `K♥8♠` sur `K♠ 6♦ T♥` → catégorie « double paire » au lieu de « paire ».

**Conséquence sur le jeu.** `defaultVillainPolicy`
([`fullHandEngine.js:229`](src/fullHandEngine.js:229)) mise si la force dépasse
0,6 et suit au lieu de se coucher sous 0,28. Au flop, le Vilain se croit
**trois fois plus fort qu'il ne l'est** : il mise, relance et paye massivement
trop. Le Full Hand n'entraîne pas contre un adversaire plausible.

**Le correctif existe déjà dans le dépôt** : `evalBest()` de
[`src/postflopHeuristic.js`](src/postflopHeuristic.js) traite correctement 5, 6 et
7 cartes — c'est ce module qui évalue la main d'**Hero**. Seul le Vilain passe par
le chemin cassé.

---

### G2 — Des sièges sont marqués « couchés » avant d'avoir parlé · **MAJEUR** · toujours ouvert

Relevé de l'audit précédent (limite **L1**), **non corrigé**, et désormais visible
à l'œil sur trois rendus :

- **1T mobile**, spot `CO — premier à parler, ouvre ou fold` : BTN, SB et BB
  portent le badge `FOLD` alors que **le BTN parle après le CO** ;
- **4T, table 3**, même configuration : idem sur les cinq sièges ;
- **1T bureau**, RFI au BTN : la SB affiche `FOLD` et son jeton de 0.5bb.

**Cause.** [`TrainerTab.jsx:2969`](src/tabs/TrainerTab.jsx:2969) :

```js
allPositions.forEach(pos=>{ if(!states[pos].inHand && !states[pos].folded) states[pos].folded = true; });
```

Tout siège qui n'est ni Hero ni le vilain désigné est déclaré couché. La fonction
qui sait répondre correctement — `livePositionsAtDecision()` de
[`src/trainerSolutionScope.js`](src/trainerSolutionScope.js) — existe et alimente
déjà le contrôle de périmètre du solveur ; **le rendu ne l'appelle pas**.

---

### G3 — Le « Seuil Nash : top X % » est une table codée en dur · **MAJEUR** · toujours ouvert

[`TrainerTab.jsx:2712`](src/tabs/TrainerTab.jsx:2712) :

```js
const baseTop = {BTN:60, CO:42, HJ:30, MP:24, "UTG+1":20, UTG:16, SB:55, BB:38}[hpos] ?? 35;
const stackAdj = sv<=10 ? 1.18 : sv<=15 ? 1.0 : sv<=20 ? 0.85 : 0.72;
```

Le mot **« Nash »** désigne un produit de deux constantes. Or le dépôt **sait
calculer cette range** : `solvePreflopPushFold` est certifié par 49 assertions et
publie ses fréquences de jam.

Comparaison sur les seules profondeurs comparables (SB, heads-up chip-EV) :

| Profondeur | Carte affichée | Solveur du dépôt | Écart |
|---:|---:|---:|---:|
| 6bb | 65 % | 68,7 % | −3,7 pt |
| 10bb | 65 % | 58,2 % | **+6,8 pt** |
| 15bb | 55 % | 44,8 % | **+10,2 pt** |
| 20bb | 47 % | 39,0 % | **+8,0 pt** |
| 25bb | 40 % | 35,6 % | +4,4 pt |

*(Réserve d'honnêteté : la carte affiche ce seuil pour toutes les positions d'une
table 6-max, le solveur ne modélise que SB vs BB. Les deux ne décrivent pas le
même jeu — c'est précisément le problème : un nombre non calculé porte le nom
d'un équilibre.)*

---

### G4 — Le mode Exploit ne se distingue du GTO que par un facteur 1,08 · **MAJEUR** · toujours ouvert

[`TrainerTab.jsx:2697`](src/tabs/TrainerTab.jsx:2697) :

```js
exploitFrequency: trainerMode==="exploit" ? Math.max(0,Math.min(100,Math.round(freq*1.08))) : freq,
```

C'est la **seule** différence chiffrée entre les deux modes. Elle ne dépend ni du
profil du vilain, ni de son VPIP/PFR, ni du niveau de field. La **meilleure
action reste identique** (`spot.ok` est inchangé), donc le verdict aussi. Ce qui
change réellement : l'agressivité du vilain dans `villainDecide` et des conseils
textuels statiques par archétype (`exploitTip`).

---

### G5 — Hors Full Hand, le Vilain ne regarde pas ses cartes

`villainDecide` ([`TrainerTab.jsx:1075`](src/tabs/TrainerTab.jsx:1075)) décide par
tirage aléatoire pondéré par le profil, la position, le SPR et le field. **Sa main
n'entre dans aucune de ces formules.** C'est défendable pour un drill de spot
isolé — mais alors le résultat de la main n'est pas une information de poker, et
rien à l'écran ne le dit.

Sizing du 3-bet vilain : `Math.round(pot*2.8 + 1.5)`
([`TrainerTab.jsx:1124`](src/tabs/TrainerTab.jsx:1124)) — sur un pot de 4bb après
un open à 2.5bb, cela donne un 3-bet à **13bb, soit 5,2× l'ouverture**.

---

### G6 — 97 % des solutions restent des constantes de template · toujours ouvert

Sur 100 mains tracées : **97 heuristique**, 3 solveur, 0 chart. Motifs de repli :
street postflop (46), ICM non modélisé (9), profondeur hors domaine (9), PKO (4),
3 joueurs encore dans le coup (4).

Ce n'est pas une régression et **c'est correctement étiqueté** (0 provenance
surévaluée sur 100 mains). Mais les EV et fréquences affichées pour ces 97 mains
sont des constantes dérivées d'une force de main à 6 niveaux (`hStr`, 0–5), pas
des calculs.

---

## 4. Anomalies — visuel

### V1 — Panneau droit : débordement et chevauchements à 1366×768 · **MINEUR**

Mesuré en 1T à **1366×768** (0 défaut à 1920×1080) :

- `pf-p2-sec` « INFORMATIONS » dépasse le bas de la fenêtre de **7 px** ;
- **3 chevauchements** entre le bloc INFORMATIONS et la TIMELINE :
  `Stack Hero 72bb` / `pf-p2-tl-track`, `Pot 15bb` / `1/20 Décision en cours…`,
  `Pot Odds —` / `1/20 Décision en cours…`.

À l'image, « SPR 4.8 » est coupé par le bord inférieur. C'est la limite **L6** de
l'audit précédent — elle n'est plus visible à 1920 mais reste entière à 1366.

Preuve : `design-qa-evidence/probe/visuel-1T-1366.png`, `visuel.json`.

### V2 — Mobile : les jetons du pot recouvrent le libellé « POT » · **MINEUR**

À 390×844, le bloc `.pf-pot-readout` (78×23 px) est recouvert par sa propre pile
de jetons `.pf-pot-chip-cluster` sur **17×17 px**, et par un `.pf-fold-chip` sur
**34×6 px**. « POT 1.5bb » est partiellement illisible.

Preuve : `design-qa-evidence/probe/visuel-mobile.png`.

### V3 — Ce qui est propre

- 1T, 2T et 4T à 1920×1080 : **0 débordement, 0 chevauchement, 0 scroll horizontal**.
- Mosaïque 4T : ellipse régulière (écart-type 0,014 pour un seuil de 0,06),
  aucune étiquette sur le board ou le pot (348 mesures), géométrie figée du début
  à la fin d'une main.
- Mobile : aucun débordement de la fenêtre, aucun scroll horizontal.

### V4 — L'audit de finitions conclut ✅ sur des mesures absentes

`npm run audit:finitions` imprime `① ellipse : non mesurable ici`, `② Hero : non
mesurable ici` et `③ surface : feutre ?% de la largeur · ?% de la hauteur` pour le
1T — puis marque **✅**. Un instrument qui ne mesure pas ne doit pas valider.

---

## 5. Ordre de correction recommandé

| # | Correctif | Coût | Ce qu'il débloque |
|---|---|---|---|
| 1 | `handStrength7` → `evalBest` (5/6/7 cartes) | 3 lignes | Rend le Full Hand jouable contre un adversaire plausible (G1) |
| 2 | `displayStack` lit le tapis du siège, débité de son engagement | ~15 lignes | Referme M1, M4 et les 28 SPR incohérents d'un coup |
| 3 | `createFullHand` reçoit les tapis **après** le préflop | 2 lignes | Referme M6 ① |
| 4 | Le sélecteur de sizing transmet son montant à `handleHeroAct`, ou est retiré | moyen | Referme M2, M3, M4 |
| 5 | `neutralHints` dérivé du montant réel, plus de l'identifiant | ~10 lignes | Referme M5 |
| 6 | Mise non suivie rendue + relance minimale + partage ≠ victoire | ~20 lignes | Referme M7 |
| 7 | Rendu des sièges branché sur `livePositionsAtDecision()` | moyen | Referme G2 (L1), ouverte depuis l'audit précédent |
| 8 | « Seuil Nash » : calculer, ou renommer en « repère indicatif » | faible | Referme G3 (L3) |

Les six premiers sont des correctifs **locaux et mesurables** : chacun est
vérifiable par `npm run audit:money`, qui doit passer de **116 écarts sur 60 mains
en 1T** (58 + 29 + 15 + 12 + 1 + 1) et **18 sur 40 mains en 4T** à **0**.

---

## 6. Ce que cet audit n'a pas couvert

- Modes `Street`, `Session` et `Mix` : lancés, non exercés en profondeur.
- Onglets **Coach AI**, **Leak Hunter** et **Review & Leaks** : hors périmètre Trainer.
- Le build autonome (`index-standalone.html`) : couvert par `npm run check:standalone`, non rejoué ici.
- Statistique de population : 100 mains suffisent à verrouiller des règles, pas à
  décrire une distribution.
- Les tapis adverses en mosaïque (2T/3T/4T) : l'invariant I1 ne s'y déclenche pas
  faute de plaque `.pf-seat-nameplate` lisible par la sonde — la valeur 60bb y est
  néanmoins **visible à l'image** sur les quatre tables.

---

## 7. Fichiers produits

| Fichier | Nature |
|---|---|
| `scripts/trainer-money-audit.mjs` | **Nouveau** — audit des mises, tapis, pot, SPR (7 invariants) |
| `package.json` | `npm run audit:money` enregistré et ajouté à `audit:trainer` |
| `design-qa-evidence/trainer-money.json` | Relevé 1T — 60 mains |
| `design-qa-evidence/trainer-money-4T.json` | Relevé 4T — 40 mains |
| `design-qa-evidence/probe/visuel.json` | Débordements et chevauchements, 5 rendus |
| `design-qa-evidence/probe/visuel-*.png` | Captures 1T / 2T / 4T / 1366 / mobile |

**Aucune modification du code applicatif n'a été faite.** Cet audit constate et
mesure ; les correctifs du §5 restent à décider.
