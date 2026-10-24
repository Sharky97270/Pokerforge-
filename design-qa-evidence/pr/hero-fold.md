Quand Hero se couche, sa main disparaissait de la table. Elle sert pourtant de repère pédagogique pendant que le coup se déroule : on veut voir ce qu'on a jeté face à ce qui tombe. Elle reste donc affichée jusqu'à la fin du coup, mais passe au **second plan**.

## Un seul langage visuel

Classe `.hero-cards--folded` et tokens `--pf-hero-fold-*` dans `styles.js`, partagés par le Trainer (1T et mosaïque 2T/3T/4T) et par le Replayer : même état, même rendu. Cible mesurée : opacité effective **0.42**, `saturate(.55) brightness(.72)`, transition 140 ms.

Les cartes restent parfaitement lisibles — rang et couleur se distinguent à l'œil nu. Ce n'est pas un masquage, c'est une mise en retrait. Les cartes des **vilains** ne changent pas de règle : un vilain couché ne rend plus de cartes du tout.

## Cinq pièges, chacun mesuré

1. **`opacity` doit porter `!important`.** La carte porte `animation:deal … both`, et une déclaration d'animation bat une déclaration d'auteur normale : le `opacity:1` de la dernière keyframe gagnait, et la règle n'existait tout simplement pas à l'écran.
2. **Le halo du Hero actif est posé en style inline** (Trainer 1T et Replayer). Seul un `!important` sur le conteneur peut le remplacer par une ombre neutre — sans quoi un siège couché gardait la lueur d'un siège encore dans le coup.
3. **Deux atténuations se multipliaient en mosaïque.** Le voile « table répondue » (0.72) × 0.42 rendait **0.30** au navigateur, au bord de l'illisible, quand le 1T rendait 0.42. D'où le token `--pf-mt-answered-opacity` et une règle de compensation : le contrat porte sur le rendu **final**, pas sur le nombre déclaré. Le voile « tuile non focalisée » (filtre seul) se cumule légitimement, lui.
4. **Le coup complet ne passe pas par `handLog`.** `heroFolded` lit donc deux sources : `seatStates[spot.hpos].folded` (ligne du spot) et `fhStateRef.current.players.hero.folded` (`fullHandEngine`). Sans la seconde, la main se rallumait au flop. Le fold est un état de la **main**, pas de la street : il tient jusqu'à la main suivante, qui remonte un spot neuf.
5. **Mesurer le déplacement avant/après la réponse d'Hero ne prouvait rien** : à l'époque, toute réponse — Check compris — descendait ses cartes d'environ 9 px. Pour isoler l'effet de la sous-brillance, l'audit retire la classe **sur place** et compare. Ce décalage n'était pas une fatalité : il est corrigé plus bas.

## Deux défauts de la table 1T, corrigés sur la même branche

### La table bougeait de ~9 px en pleine main

Le bandeau d'actions réclame 219 px tant qu'Hero doit parler, puis retombe sur son plancher CSS (206 px) dès qu'il a répondu ; la zone de table, élastique, récupère les 13 px et **tous les sièges descendent**. Mesuré : 13 mains sur 20 à 1600×950. `trainer-layout-shift-audit` ne le voyait pas — il surveille le cadre des tuiles, qui ne bouge pas.

La réserve est désormais **mesurée** (`scrollHeight` du bandeau → `--pf-t1-actions-reserve`) plutôt que choisie : sa hauteur dépend du spot *et* de la résolution (206 px à 1366×768, 219 px à 1600×950), et un nombre en dur aurait volé 13 px de feutre au 1366 qui ne bougeait pas. Elle vit dans une mémoire de module indexée par largeur, parce que `SingleTable` est remonté à chaque main. **Résultat : 0 main sur 132 où la table bouge**, sept configurations.

### Les jetons s'installaient sur les mains

Dans `trainerMarkerPoint`, trois erreurs se combinaient :
- le repli « mordre ses cartes » était testé **avant** la poche latérale, qui ne sortait jamais ;
- le contrôle de bloc comparait la largeur **écran** du badge à la profondeur du bloc — juste en haut et en bas, inversé sur un siège de flanc ;
- le bloc était décrit le long de l'axe siège→pot, alors que cartes, portrait et badge sont peints **alignés sur l'écran** (écart relevé : paire modélisée à 23 % de recouvrement, peinte à 76 %).

Le placement travaille maintenant en **rectangles d'écran** et, quand aucune place propre n'existe, choisit le point le moins coûteux : part des cartes recouverte (double pour la main du Hero, face visible), portrait (poids triple : il dit *qui* joue), et écart angulaire au carré. Rien de ce qui ne se lâchait pas ne se lâche : board, pot, attribution (§43), et **aucune mise au-delà de 35°** — y compris pour le Hero, conformément à l'audit de géométrie.

| 1T, 20 mains | avant | après |
|---|---|---|
| 1600×950 6-max — cartes du Hero / dos / portrait (max) | 67 % / 93 % / 12 % | 46 % / 81 % / 8 % |
| 1366×768 6-max | 50 % / 87 % / 57 % | 50 % / 67 % / 57 % |
| 1920×1080 9-max | 43 % / 48 % / 0 % | 26 % / 47 % / 0 % |
| 4T — écart angulaire moyen, attribution min | 3.8°, 1.47 | 2.1°, 1.32 |

Deux limites restent, **bornées par des arbitrages existants** et non par le placement : le Hero bas-centre mord encore ~50 % de sa main à 1366/1600 (une poche propre existe à 49°, interdite par la règle des 35°), et les dos de cartes des vilains de flanc en 9-max (l'attribution interdit toute place qui dégage la paire). Le portrait à 57 % du vilain haut-centre à 1366 est identique à l'origine.

**Écarté après mesure** : la variante `compact` du badge (96 → 72 px pour une petite mise, mais 104 → 110 px pour un tapis, et un texte réduit) et l'empilement jetons/texte (les piles font la largeur des grosses mises).

## Vérifications

- `node test-hero-fold-dim.mjs` — 58 assertions, ajouté à `npm run test:refonte` ;
- `npm run audit:herofold` (1T → 4T), `audit:herofold:replayer`, `audit:herofold:mobile` — nouveaux instruments ; captures avant/après et zooms dans `design-qa-evidence/hero-fold*` ;
- `npm run audit:1t` — nouvel audit de stabilité et de recouvrement : défauts (jeton sur le siège d'un autre joueur, placement qui se croyait propre, table qui bouge) et compromis connus bornés par des plafonds de non-régression. L'état d'origine y échoue (45, 4 et 27 défauts) ; synthèse dans `design-qa-evidence/trainer-1t-stabilite-synthese.json` ;
- `test-trainer-table-geometry.mjs` — 766 → 862 assertions ; `npm test` complet vert ; audit des mises 4T, audit de layout 2T/3T/4T et audit de géométrie 1T (0 mise au-delà de 35°) inchangés.
- Le mode de placement est publié sur le DOM (`data-marker-mode`, `data-marker-deg`) : un audit qui voit un jeton sur des cartes dit maintenant *pourquoi* il y est.

## Notes pour le reviewer

**Hors périmètre, signalé** : le placement mobile n'a pas de modèle de tailles mobile (badge `compact` 65×24 décrit comme 104×44, portraits et cartes décrits à ~2×). Le portrait d'un siège du haut y est recouvert à ~50 % — valeur identique à l'origine (48 %).

`design-qa-evidence/trainer-layout-shift.json` est un simple réveil de l'audit de stabilité après la refonte du plan de travail : `stable` reste vrai.

Cette branche et `fix/trainer-reliquats-pot-cardtoint` ajoutent chacune un fichier de test à la fin de `test:refonte` dans `package.json` : la seconde fusionnée entrera en conflit sur cette ligne. La résolution est de garder les deux.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
