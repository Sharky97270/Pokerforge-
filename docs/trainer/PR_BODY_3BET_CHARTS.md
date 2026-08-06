# feat(trainer) : pots 3-bet, solves persistants, charts préflop et calage 8-max

Branche : `feature/trainer-cfr-3bet-pots` → `main`
Commits : `e643633` (pots 3-bet + 8-max) · `dabf464` (persistance) · `8d790d0` (charts)

Suite de la PR #10. Quatre sujets indépendants, chacun vérifié séparément.

---

## 1. CFR en pots 3-bet — une correction de justesse, pas un confort

Le provider supposait **toujours** un pot simple-relancé : Héros = openeur (range RFI),
Villain = suiveur. Sur un flop de pot 3-bet, les deux ranges étaient donc bien trop
larges. Un solve exact sur les mauvaises ranges reste une réponse exacte à la mauvaise
question — et la composition de range pilote l'essentiel de la stratégie postflop.

**Détection** — `potKind(spot)` → `"srp"` | `"3bp"`, deux signaux :
1. l'**historique d'actions** (une relance de relance avant le flop = preuve directe) ;
2. repli sur la **taille du pot** rapportée à la grosse blinde (seuil 12bb : un pot
   simple-relancé fait ~5-8bb, un pot 3-bet ~18-24bb).

Volontairement conservateur : dans le doute on reste sur `"srp"`, le cas dominant.

**Ranges** — désormais fonction du couple (type de pot, rôle) :

| | Agresseur | Suiveur |
|---|---|---|
| Pot simple-relancé | open (`rfi`) | `vs_open` |
| Pot 3-bet | portion 3-bet de `vs_open` | `vs_3bet` |

Dans les deux cas la portion relance est **reversée dans le call** côté suiveur : ce pot
*est* un pot suivi, donc conditionner sur « a payé » inclut les mains fortes qui, dans
cette branche, ont choisi de call. Sans ça, AA/KK sortent de la range avec un poids nul
et leur stratégie postflop devient illisible.

**Mesuré** : largeur de range Héros **9177 → 1541** (~17 %) entre pot simple-relancé et
pot 3-bet — resserrement réaliste (open BTN ≈ 45 % des mains, range de 3-bet ≈ 7-8 %).
Le type de pot retenu apparaît dans la note affichée, donc l'hypothèse est visible.

---

## 2. Les solves CFR survivent au rechargement

Le worker CFR a sa **propre mémoire** : la Solution Library y repartait vide à chaque
démarrage (rechargement de page, worker recyclé). L'écriture sur disque fonctionnait déjà
— IndexedDB est disponible dans un worker — mais sans hydratation le cache n'était
**jamais relu**, donc un spot déjà calculé était re-solvé intégralement.

Correctif : `hydrateLibrary()` appelée une fois avant le premier solve (idempotent, ne
rejette jamais — en cas d'échec on solve normalement, on perd juste le cache).

**Mesuré en navigateur, avec un rechargement complet de page entre les deux passes :**

| | Passe 1 (à froid) | Passe 2 (après rechargement) |
|---|---|---|
| Temps de solve | 1280 ms | **4 ms** |
| Origine | calcul | **bibliothèque disque** |
| Stratégie | X 13,5 / B0 41 / B1 45,5 | **bit-à-bit identique** |

Le résultat identique prouve qu'il s'agit bien de la même solution rechargée, pas d'un
recalcul approximatif. La réponse expose maintenant `fromLibrary` et `solveMs`.

*Note :* `nodePath` n'entre pas dans la signature du solve — c'est voulu : il ne change
pas le solve, seulement le nœud qu'on lit. Deux spots qui n'en diffèrent que par là
partagent donc le même cache.

---

## 3. Charts préflop — l'infrastructure, sans les données

Le préflop profond (open / 3-bet / 4-bet) **n'est pas solvable en direct** dans un
navigateur : contrairement au push/fold (2 actions terminales, abattage immédiat), un open
traîne tout le jeu postflop derrière lui. La seule voie honnête pour de vraies fréquences
préflop est d'embarquer des charts pré-calculés.

Cette PR pose **l'accueil** et **n'apporte aucune donnée** — écrire ces fréquences
soi-même reviendrait à fabriquer des chiffres et à les habiller d'un badge qui inspire
confiance, c'est-à-dire pire que l'heuristique actuelle, qui au moins s'annonce comme telle.

- Provenance `"chart"` — **jamais `"solver"`** : des nombres lus dans un fichier ne sont
  pas un calcul. Badge ambre « 📊 CHART PRÉFLOP — fréquences lues (non calculées ici) »,
  distinct du vert solveur et du cyan CFR.
- **Attribution obligatoire** : un chart sans `attribution` est refusé par le registre.
  Des fréquences dont on ne sait plus d'où elles viennent sont indiscernables de chiffres
  inventés. L'attribution est affichée dans la note du spot.
- **Garde-fous** : main absente → `null` (on n'invente jamais) ; position/action non
  couverte → `null` ; tapis éloigné de plus de 15bb → `null` (une range d'open 100bb
  servie à 20bb serait fausse) ; tapis proche → accepté mais la note le précise ; spot
  postflop → jamais servi par un chart préflop.
- **Inerte par défaut** : sans chart chargé, le lookup renvoie `null` et le Trainer se
  comporte exactement comme avant. C'est explicitement testé.
- `docs/trainer/CHARTS_PREFLOP.md` documente le format et la marche à suivre.

---

## 4. Ancrage du feedback en 8-max

La valeur posée en best-effort dans la PR #10 (`{x:78, y:24}`) tombait **en plein sur le
siège haut-droite** (mesuré x71-83 / y21-36) — l'inconvénient d'une valeur non vérifiée.

Corrigée en `{x:63, y:14}` : le couloir **diagonal** entre le siège haut-centre (x44-56)
et le siège haut-droite. Vérifié en live : macaron x61-65 / y13-15, **zéro collision**
(sièges, cartes Hero, pot, board).

---

## Vérification

- `test-trainer-postflop-solver.mjs` — **50 assertions** (dont détection du type de pot,
  resserrement des ranges, présence d'AA des deux côtés).
- `test-preflop-charts.mjs` — **37 assertions** (inertie sans données, refus sans
  attribution, priorité de la clé spécifique, tolérance de tapis, provenance jamais
  usurpée). Nouveau, ajouté à `npm run test:refonte`.
- **`npm test` vert** · **`npm run build` OK**.
- Vérifications en navigateur : persistance après rechargement complet, détection du pot
  3-bet sur un spot réel, position du macaron en 8-max.

## Limites inchangées

Ranges d'entrée toujours heuristiques (d'où le badge « expérimental » du CFR) ; heads-up
postflop uniquement ; multiway non modélisé. Les charts ne changeront rien tant qu'aucune
donnée ne sera fournie.
