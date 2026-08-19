# Mission « cinématique des mises » — preuves de mesure

Tout ce dossier est produit par `npm run audit:table`
(`scripts/trainer-bet-anchor-audit.mjs`), qui pilote un vrai navigateur.

    npm run audit:table -- --tables=4T --n=12 --w=1600 --h=950

## Ce que les fichiers contiennent

`avant-*.json` — relevé AVANT la refonte. `apres-*.json` — après.
Chaque fichier porte un `summary` et le détail de chaque tirage.

| grandeur | ce qu'elle dit | §  |
|---|---|---|
| `ratioFeutre` | largeur/hauteur du feutre — doit être CONSTANTE | 6/19 |
| `ecartAngleDeg` | angle entre l'axe siège→pot et l'axe siège→mise | 4/9/20 |
| `attribution` | distance du tas à SON siège vs au siège étranger le plus proche | 43 |
| `misesAmbigues` | tas plus proches d'un autre joueur que du leur — doit rester vide | 43 |
| `couloir` | écarts verticaux pot↔board et board↔cartes du Hero, en px | 15/16 |
| `boutonDattribution` | même test d'attribution pour le bouton dealer | 29 |

## Le résultat, en un tableau

Mesuré à 1600×950, 6-max, n=10 à 12 tirages par mode.

| | ratio feutre | écart angulaire | attribution min | mises ambiguës |
|---|---|---|---|---|
| avant 1T | 1.34 … 1.54 | moy 47°, max 76° | **0.87** | 3 |
| avant 2T | **1.16** (un cercle) | 8° | 1.64 | 0 |
| avant 3T | 1.71 … 1.95 | 3° | 1.28 | 0 |
| avant 4T | 1.79 | moy 14° | 1.33 | 0 |
| après 1T | **1.70** | 0° sur les sièges de flanc | 1.31 | **0** |
| après 2T | **1.70** | 0° | 1.31 | **0** |
| après 3T | **1.70** | 0° | 1.31 | **0** |
| après 4T | **1.70** | 0° | 1.33 | **0** |

Les sièges de l'AXE VERTICAL (Hero en bas-centre, siège haut-centre) gardent un
écart angulaire : leur rayon traverse le board de part en part, ils posent donc
leur tas dans une poche latérale — comme tous les clients de poker pour la main
du Hero. Cette poche est bornée par le critère d'attribution, pas par un angle.

## Captures

`final-<mode>-<street>.png` : la matrice §40 (4 modes × préflop/postflop) à
1600×950. `final-4T-1366.png` : le format CONTRAINT, celui qui révèle les
défauts (à 1600 tout paraît propre — cf. mémoire « trainer-audit-jetons »).
`zoom-final-*.png` : agrandissements produits par `scripts/png-crop.mjs`.

---

# Cinématique des mises (§12/§13/§27/§28)

Produit par `npm run audit:cine:trainer` (`scripts/trainer-cine-audit.mjs`), qui
injecte un échantillonneur dans la page et relève, à chaque frame, l'état complet
de la table. Un relevé unique ne dirait rien : c'est la CHRONOLOGIE qui porte le
défaut.

    npm run audit:cine:trainer -- --tables=1T --n=14

`cine-avant-1T.json` / `cine-apres-1T.json`.

| grandeur | ce qu'elle dit | §  |
|---|---|---|
| `potChangeSansJetonEnMouvement` | le pot prend-il sa valeur AVANT qu'un jeton bouge | 12 |
| `collecteVisible` | les tas partent-ils vers le pot en fin de tour | 27 |
| `ghostChipsAprèsStreet` | un tas de la street précédente survit-il | 28 |
| `pointsDeDépartDeVolDistincts` | les vols partent-ils de sièges différents | 9 |

## Le défaut mesuré avant correction

    ghostChipsAprèsStreet : ["UTG:call10bb", "HJ:3-bet10bb"]

Des engagements du préflop encore peints alors que le board avait déjà changé.
Et aucune collecte : les tas disparaissaient sur place pendant que le pot
sautait, parce que `setPotWithDelta` écrivait la valeur finale de façon
synchrone puis animait un « +X » par-dessus.

## Après

`collecte.png` / `zoom-collecte.png` — capture prise EN COURS de collecte
(animations figées à l'instant du relevé, sinon on attrape une frame où le jeton
a déjà disparu). On y lit la règle du §12 : **POT 1.5bb** avec **+3bb** en
attente au-dessus, pendant que le jeton `3bb` parcourt l'axe joueur → pot. Le
pot ne prendra sa valeur qu'à l'arrivée.

---

# Le pot est-il reconstructible depuis la table ? (§3/§24/§37)

`npm run audit:table` mesure désormais, sur chaque table PRÉFLOP :

    pot peint  ==  somme des montants peints (mises + blindes)

Préflop cette égalité est vérifiable sans rien savoir de l'historique : tout ce
qui est dans le pot y a été mis sur cette street. Postflop elle ne tient plus —
les streets précédentes sont déjà au centre et n'appartiennent plus à personne —
donc on ne la teste pas.

## Ce que la mesure a trouvé

Deux générateurs de spots calculaient le pot par une FORMULE qui ajoutait la
blinde d'un joueur une seconde fois, alors qu'elle est déjà comprise dans sa
relance :

| générateur | formule | rendait | correct |
|---|---|---|---|
| défense de blinde | `toCall + 3.5` | 5 | **4** |
| face à un 3-bet | `3bet + open + 1.5` | 11.5 | **10.5** |

Vu à l'écran : « POT 7.5bb » avec 3bb devant la SB et 3bb devant la BB — 1.5bb
que rien n'expliquait. Ce pot alimente les **cotes du pot et le SPR** affichés :
le Trainer enseignait une décision à partir d'un prix faux. Corrigé par
`preflopPot()` (`src/potAccounting.js`), couvert par des tests.

## Ce qui restait, et qui ne reste plus

Plusieurs générateurs préflop (squeeze, vs 4-bet) posaient un pot **tiré au
hasard** — `pot = rndI(8,14)` — sans historique de contributions. Leur pot
n'était pas reconstructible *par construction* : les contributions n'existaient
pas en tant que données, la table ne pouvait donc pas les peindre. Ce n'était
pas une erreur d'arithmétique mais une limite de la génération de spots, et la
corriger demandait de donner une vraie séquence d'actions à chaque générateur.

→ C'est l'objet de la section suivante : **le pot préflop est une séquence**.

---

# Le pot préflop est une SÉQUENCE (§3/§24/§37)

La section précédente s'arrêtait sur une limite assumée : plusieurs générateurs
préflop posaient un pot **tiré au sort** (`pot = rndI(8,14)`) ou **écrit en dur**
(`pot: 36`, quelles que soient les positions), sans historique de contributions.
Leur pot n'était pas reconstructible *par construction* — il n'y avait rien à
peindre. Cette limite est levée.

## Ce qui a changé

`src/preflopLine.js` déroule un vrai tour d'enchères préflop : engagement total
par siège (blinde comprise), pot = somme de ces engagements, montant que Hero
doit payer, et l'historique exact que la table peint. **Les trois fabriques de
spots** y passent désormais :

| fabrique | ce qu'elle faisait | maintenant |
|---|---|---|
| catalogue statique (`src/data/content.js`) | pot écrit à la main — **6 des 17 spots préflop faux** | pot = somme de la ligne |
| générateur dynamique (`TrainerTab`) | `rndI(8,14)` pour le squeeze, `rndI(30,50)` vs 4-bet | ligne authored, sizings de référence |
| moteur de spots IA (`spotAiEngine`) | `pot: 13.5`, `pot: 36` quelles que soient les positions | ligne authored |

Corrections de données mesurées au passage :

| spot | pot annoncé | pot réel |
|---|---|---|
| `b1` BTN vs 3-bet BB | 11.5 | **12** |
| `p4` BB vs open CO | 5.5 | **4.5** |
| `p5` CO vs 3-bet BB | 13.5 | **13** |
| `n2` HJ vs open UTG | toCall 2 (open à 2bb) | **toCall 2.5** |
| `n3` UTG vs 3-bet HJ | 11 | **12.5** |
| `pko2` BB vs open CO | 5.5 | **6** |

## Trois défauts que la mesure a fait apparaître ensuite

**1. Le pot gonflait à chaque relance de blindeur.** `normalizeTrainerActionEvent`
ajoutait au pot le montant ANNONCÉ. Or un call s'annonce par ce qu'il reste à
payer et une relance par le total « to X » : un joueur qui avait déjà des jetons
devant lui les remettait une seconde fois. Mesuré : open 3bb du BTN suivi par la
SB → « POT 7.5bb » pour 7bb réels. Le pot n'encaisse plus que
`potContribution` — ce qui a quitté le tapis.

**2. Un engagement posé disparaissait dès qu'un autre joueur parlait.** Les
jetons « pré-décision » étaient conditionnés à `answered === null && !vact`.
Mesuré en 4T : **« POT 16bb » avec pour tout jeton la blinde de la SB**. Un
engagement quitte le siège quand il est COLLECTÉ (§27), pas avant.

**3. Le marqueur de blinde s'effaçait pour un siège qui ne peignait rien.**
`seatShowsChips` répondait par des conditions, le rendu calculait un montant
avec d'autres conditions, et les deux divergeaient — « POT 4.5bb » pour 1bb de
jetons. Une seule fonction (`seatChipAmount`) répond désormais, et le marqueur
de blinde n'est que sa conséquence.

Deux corrections de lisibilité s'y ajoutent : le libellé du tas ne répète plus
son montant (mesuré : « 3-bet 9bb » posé sur 88bb de jetons, parce que le
libellé racontait la décision initiale et le tas l'engagement réel), et le
format compact s'applique dès 2 tables — le 2T gardait le tas pleine taille sur
un feutre deux fois plus petit (**24.8 % de la largeur du feutre** contre 14 à
16.5 % partout ailleurs), ce qui poussait le tas du Hero sur le board.

## La mesure

    npm run audit:table -- --tables=4T --types="Open Raise,Défense BB,3bet,Défense vs 3bet,4bet,Squeeze" --n=22

Deux options ont été ajoutées à l'audit parce que sans elles il ne mesurait pas
ce qu'il prétendait : `--types=` (sans lui, la session reprenait la config
persistée — vingt relevés de spots turn/river en 1T, donc **zéro table
préflop**) et `--shotAt=` (la capture finale attrapait une table en cours de
collecte). La table publie aussi sa signature dans `data-pf-spot` : sans elle,
un écart de reconstruction est une mesure qu'on ne peut pas reproduire.

| mode | pot reconstructible | mises mesurées | attribution min | mises ambiguës | tas sur le board | montant (px) |
|---|---|---|---|---|---|---|
| 1T | **22/22** | 29 | 1.30 | 0 | 0 | 10 |
| 2T | **17/17** | 29 | 1.31 | 0 | 0 | 7.4 |
| 3T | **33/33** | 76 | 1.30 | 0 | 0 | 7.4 |
| 4T | **68/68** | 124 | 1.30 | 0 | 0 | 7.4 |
| 4T à 1366×768 | **56/56** | 118 | 1.31 | 0 | 12 | 7.4 |

**196 tables préflop sur 196** — contre 3 sur 22 avant. Couverture : RFI, défense
de blinde, vs 3-bet, vs 4-bet, squeeze, push/fold, blind vs blind, AVANT et
APRÈS la décision de Hero, coup complet compris.

`montantPx` valait `null` dans tous les relevés précédents : le sélecteur de
l'audit ne trouvait pas l'élément du montant. La lisibilité du §36 n'était donc
pas mesurée du tout ; elle l'est maintenant.

## Ce qui reste, mesuré

À **1366×768 seulement**, 12 tas effleurent le board — tous ceux du HERO en coup
complet, sur **5.2 à 5.4 % de la surface du tas**. C'est l'exception de l'AXE
VERTICAL documentée plus haut (le rayon du Hero traverse le board, son tas va
dans une poche latérale), au format le plus contraint. Le corriger revient à
retoucher la poche latérale — un des arbitrages de géométrie déjà tranchés.

## Preuve côté code

`test-preflop-line.mjs` — **1111 assertions**. La matrice complète des positions
(6-max et 9-max × cinq types de spot, plus de 400 combinaisons), les 17 spots
statiques, plus de 300 spots IA sur toutes les paires de positions, et les
séquences impossibles (« CO vs 3-bet HJ » : le HJ a déjà parlé quand le CO
ouvre — la table le montrait à la fois couché ET 3-betteur).

## Captures

`ligne-1T.png` / `ligne-4T.png`, `zoom-ligne-1T.png`.

---

# États de table (§14/§30/§31/§32)

## §30 — le résultat ne couvre rien : DÉJÀ satisfait, et mesuré

Sonde dédiée : on répond, on échantillonne la fenêtre d'apparition du macaron
(il ne dure que ~1.7 s et n'apparaît qu'une fois la phase passée à « done » —
parier sur un délai fixe ne relève rien), et on mesure ses recouvrements avec le
board, le pot, les mises, les blindes et le bloc du Hero.

    1T   6 macarons observés, 93×90 px, 0 recouvrement
    4T   aucun macaron — le verdict vit déjà dans le bandeau SOUS la table

C'est exactement ce que le §30 demande en multitabling. Aucune correction.

## §14 — un tapis se dit, il ne se devine pas

Le drapeau `isAllIn` était déjà calculé par le moteur — il se lève même quand un
simple CALL épuise le tapis, cas qu'aucun libellé ne dit — mais il n'atteignait
pas le badge. Mesuré : un « Call 6bb » qui était un tapis recevait bien le style
rouge (donc le TYPE le savait) pendant que le drapeau, lui, se perdait. Lire une
seule des deux sources laisse passer des tapis.

`trainerIsAllInAction(type, drapeau)` lit les deux. Le mot ALL-IN **remplace** le
libellé au lieu de s'y ajouter : c'est lui qui change la décision, et le badge ne
doit pas s'élargir au point de mordre les cartes. Il vit dans le badge, donc il
ne peut recouvrir ni board, ni stack, ni pot.

Vérifié en 4T sur un vrai 5-bet shove — `allin.png` : tas rendus
`ALL-IN 28.3bb` et `ALL-IN 9bb`.

## §31 / §32 — active, secondaire, terminée

`zoom-actif-4T.png` : Table 1 active (cadre bleu + pastille), Table 2 secondaire.
Le retrait est volontairement minuscule (saturation .9, luminosité .97) — on
retire de la PRÉSENCE, jamais de la lisibilité : sur la table secondaire le pot,
le board, les cartes du Hero et « C-Bet 4bb » se lisent intégralement.

`zoom-etats-4T.png` : « TABLE n ✓ TERMINÉE » écrit en toutes lettres, et le
bandeau de décision désaturé pour qu'il cesse de réclamer une action — le FEUTRE
n'est pas touché, comme le §32 l'exige.
