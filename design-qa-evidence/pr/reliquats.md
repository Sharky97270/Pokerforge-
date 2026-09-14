Trois reliquats de la PR #40, tous de la même famille : **un objet décrit autrement qu'il n'est écrit ou peint**.

## 1. Un pique double-encodé dans la bibliothèque de spots

`RangeError: cardToInt : carte invalide {"r":"A","s":"♠"}` — un message impossible à diagnostiquer, puisque les deux caractères ont l'air justes. Ils ne l'étaient pas : la couleur valait `U+00E2 U+2122 U+00A0`, c'est-à-dire les trois octets UTF-8 de ♠ (`E2 99 A0`) relus en cp1252 puis ré-encodés. Deux cartes de `src/data/content.js` (spot `mw1`, « BB — Squeeze vs CO open + BTN call — AQs ») étaient touchées, et le défaut ne se déclenchait qu'à l'**abattage** de ce spot-là : presque jamais, et jamais pendant une revue.

Trouvé par **balayage statique**, pas par chasse au navigateur — trois passes de 14 tirages n'avaient rien reproduit.

Quatre suites :

- les octets sont corrigés ;
- `cardToInt` publie désormais les **points de code** du champ fautif — un message d'erreur doit permettre d'agir ;
- `cardToInt` exige un caractère, **un seul**. `String.indexOf` cherche une sous-chaîne et rend `0` sur la chaîne vide : un `{r:"",s:""}` devenait donc un 2 de pique **silencieux**, celui-là même que le commentaire de la fonction s'engage à ne jamais fabriquer ;
- `test-card-alphabet.mjs` (308 assertions, ajouté à `npm run test:refonte`) balaie les 96 cartes écrites en dur dans `src/` et vérifie qu'aucune ne sort de l'alphabet. Vérifié **comme test** : réinjecter le mojibake le fait échouer.

## 2. Le pot 2T débordait sa bande de 20 px

Même défaut qu'en 1T, non corrigé dans ce mode : bande déclarée 98,4 × 24, bloc peint jusqu'à **138 × 44,5**. Ce nombre n'est pas cosmétique — `trainerCentreLayout` finance le couloir central avec `potH`, et le couloir est la ressource rare de la mosaïque. Même remède : le gabarit du jeton suit la bande (base 16 / rise 1). Peint 44,5 → **25**.

## 3. La bande centrale interdite protégeait un pot qui n'existe pas

`POT_WIDTH_FACTOR_BY_TABLES` décrivait un pot plus étroit que le peint dans les **quatre** modes :

| mode | déclaré | peint max | écart |
|---|---|---|---|
| 1T | 156,0 | 169,9 | +13,9 |
| 2T | 98,4 | 138,0 | +39,6 |
| 3T | 73,8 | 94,4 | +20,6 |
| 4T | 69,7 | 86,0 | +16,3 |

Les facteurs valent désormais le peint mesuré (5.7 / 5.8 / 5.3 / 5.2). Effet mesuré à 1366×768 : **3T `misesAmbigues` 9 → 0** et dégagement minimal au pot 10,6 → 30,3 px ; **2T `misesCollesAuPot` 2 → 0**.

### L'arbitrage du 4T — à lire avant d'y retoucher

Élargir seul y a été mesuré et **rejeté** : dans cette cellule déjà saturée, le solveur de marqueurs ne trouvait plus de point légal et retombait sur son repli de dernier recours, **qui ne vérifie pas la bande**. Résultat : une mise *posée* sur le pot et un dégagement minimal tombé de 19,3 px à **0**. Élargir la zone interdite au-delà de ce que la géométrie peut absorber produit exactement le défaut qu'elle est censée empêcher.

On a donc aussi **rétréci l'objet** : le montant du pot passe de 15 px à 12,5 px en 4T seulement (les boutons d'action de ce mode sont à 11 px — le pot reste le plus gros nombre de la tuile). Mesure après : mise sur le pot **0**, mises collées **0**, dégagement minimal 7,8 à 12 px.

## L'instrument

`misesCollesAuPot` comparait à 12 px dans les quatre modes. Sur le feutre de 710 px du 1T ce seuil désigne un contact ; sur celui de 226 px du 4T il condamne un tas posé à plus de 5 % de la table du bloc du pot. Le seuil suit désormais la largeur du feutre, et il est publié (`seuilCollePx`).

## Vérifications

`npm run test:refonte` complet. Matrice d'audit finale en 1T/2T/3T à 1366×768 **et** 1914×927, en 4T à 1366×768 et en mobile 390×844 (`design-qa-evidence/ancres/*-final.json`) : pot peint **dans** le pot déclaré partout (dépassement max −1,1 px), 0 jeton coupé, 0 mise sur le pot, 0 rognage, 0 erreur de page.

`1T-6J-1914-PROD.json` est l'audit de la production après la PR #40, versé comme point de repère.

## Résidu assumé

En 4T, un montant très long (« 111.5bb ») peint encore jusqu'à 94,4 px pour une bande déclarée à 88,4. **Ne pas élargir davantage sans relire l'arbitrage du 4T ci-dessus** : c'est ce qui a produit une mise sur le pot.

Cette branche et `fix/trainer-hero-fold-sous-brillance` ajoutent chacune un fichier de test à la fin de `test:refonte` dans `package.json` : la seconde fusionnée entrera en conflit sur cette ligne. La résolution est de garder les deux.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
