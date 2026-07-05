# Prompt Codex — Recréation fidèle de la table PokerForge

Tu dois recréer la table de poker de la maquette à l’identique. Utilise le dossier `pokerforge_table_assets` comme référence.

## Priorité
Ne touche pas à la logique métier, aux filtres, au trainer, aux calculs GTO, aux routes ou aux données. Travaille uniquement le rendu graphique, le layout et les micro-animations.

## Références
- `05_poker_table_full.png` : composition globale.
- `06_table_felt_texture_center.png` : feutre/texture.
- `08_hero_seat_cards_avatar_banner.png` à `13_sb_seat.png` : sièges/avatars/cartes/stacks.
- `07_pot_chips.png`, `19_bb_chip.png`, `20_sb_chip.png` : pot, blinds et proportions jetons.
- `14_action_panel_right.png`, `16_action_buttons.png`, `17_bottom_controls.png` : style UI.
- `style_guide.json` : couleurs, effets, animations.

## Visuel à reproduire
- Fond bleu nuit/noir avec vignette premium.
- Table ovale centrée, feutre vert sombre texturé.
- Double bordure : métal/cyan externe + liseré or interne.
- Pot au centre : jetons réalistes + texte `POT` + montant en BB.
- Avatars en médaillons métalliques, glow coloré par profil.
- Hero actif : cartes visibles, badge HERO cyan, ring lumineux.
- Villains : dos de cartes bleu foncé avec monogramme PF.
- Blinds visibles près de SB/BB, sans chevauchement.
- Dealer button or lumineux.
- Panneaux glassmorphism bleu nuit, bordures lumineuses fines.
- Boutons d’action grands, lisibles, couleurs identiques à la maquette.

## Palette
Background : #020817 #06142B #0A1F3F  
Cyan : #006DFF #00B7FF #00E5FF  
Gold : #FFD05A #FFB02E #FF9D2E  
Danger : #FF4A3D #FF6B3D  
Success : #00FF9D #17D465  
Felt : #0B5C3B #0F7A4D #062617  
Violet : #7C4DFF #B14DFF

## Typographie
- UI : Inter ou Manrope.
- Compteurs / labels : Rajdhani ou Sora SemiBold.
- Logo : conserver l’image fournie ou redessiner un logo display italique condensé.

## Animations
- Active player ring pulse : 1.4s infinite, glow cyan.
- Jetons joueur → pot : 350–500ms ease-out.
- Hover boutons : glow 150ms + translateY(-1px).
- Reveal solution : fade/slide 180ms.
- Transition street : pulse léger bleu autour de la table.

## Contraintes
- Aucun chevauchement avatars/cartes/jetons/board/blinds/dealer.
- Layout stable en 1T, 2T, 3T, 4T.
- Responsive desktop/tablette/mobile.
- Si une situation est impossible, afficher un message d’erreur propre au lieu d’un spot visuel incohérent.
