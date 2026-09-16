Quand Hero se couche, sa main disparaissait de la table. Elle sert pourtant de repère pédagogique pendant que le coup se déroule : on veut voir ce qu'on a jeté face à ce qui tombe. Elle reste donc affichée jusqu'à la fin du coup, mais passe au **second plan**.

## Un seul langage visuel

Classe `.hero-cards--folded` et tokens `--pf-hero-fold-*` dans `styles.js`, partagés par le Trainer (1T et mosaïque 2T/3T/4T) et par le Replayer : même état, même rendu. Cible mesurée : opacité effective **0.42**, `saturate(.55) brightness(.72)`, transition 140 ms.

Les cartes restent parfaitement lisibles — rang et couleur se distinguent à l'œil nu. Ce n'est pas un masquage, c'est une mise en retrait. Les cartes des **vilains** ne changent pas de règle : un vilain couché ne rend plus de cartes du tout.

## Cinq pièges, chacun mesuré

1. **`opacity` doit porter `!important`.** La carte porte `animation:deal … both`, et une déclaration d'animation bat une déclaration d'auteur normale : le `opacity:1` de la dernière keyframe gagnait, et la règle n'existait tout simplement pas à l'écran.
2. **Le halo du Hero actif est posé en style inline** (Trainer 1T et Replayer). Seul un `!important` sur le conteneur peut le remplacer par une ombre neutre — sans quoi un siège couché gardait la lueur d'un siège encore dans le coup.
3. **Deux atténuations se multipliaient en mosaïque.** Le voile « table répondue » (0.72) × 0.42 rendait **0.30** au navigateur, au bord de l'illisible, quand le 1T rendait 0.42. D'où le token `--pf-mt-answered-opacity` et une règle de compensation : le contrat porte sur le rendu **final**, pas sur le nombre déclaré. Le voile « tuile non focalisée » (filtre seul) se cumule légitimement, lui.
4. **Le coup complet ne passe pas par `handLog`.** `heroFolded` lit donc deux sources : `seatStates[spot.hpos].folded` (ligne du spot) et `fhStateRef.current.players.hero.folded` (`fullHandEngine`). Sans la seconde, la main se rallumait au flop. Le fold est un état de la **main**, pas de la street : il tient jusqu'à la main suivante, qui remonte un spot neuf.
5. **Mesurer le déplacement avant/après la réponse d'Hero ne prouve rien** : toute réponse, Check compris, agrandit son médaillon d'1 px et descend ses cartes d'environ 9 px. Pour isoler l'effet de la sous-brillance, l'audit retire la classe **sur place** et compare.

## Vérifications

- `node test-hero-fold-dim.mjs` — 58 assertions, ajouté à `npm run test:refonte` ;
- `npm run audit:herofold` (1T → 4T), `audit:herofold:replayer`, `audit:herofold:mobile` — nouveaux instruments ; captures avant/après et zooms dans `design-qa-evidence/hero-fold*`.

## Notes pour le reviewer

`design-qa-evidence/trainer-layout-shift.json` est un simple réveil de l'audit de stabilité après la refonte du plan de travail : `stable` reste vrai.

Cette branche et `fix/trainer-reliquats-pot-cardtoint` ajoutent chacune un fichier de test à la fin de `test:refonte` dans `package.json` : la seconde fusionnée entrera en conflit sur cette ligne. La résolution est de garder les deux.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
