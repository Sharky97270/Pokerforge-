# PokerForge Trainer V2 — Bibliothèque d'assets

Reconstruction **propre** (SVG/CSS/React) des composants de la planche officielle
`ASSETS TRAINER V2 — DESIGN SYSTEM` (réf. 1779×884, thème *Dark Blue / Metallic*).

> Les PNG de la planche sont des extractions raster aplaties (fond/glow intégrés).
> Ici, les éléments **vectoriels** sont **redessinés en SVG/CSS** d'après la planche ;
> les PNG ne servent que de **référence** ou là où un rendu raster est nécessaire
> (dos de cartes, avatars). La planche complète n'est **jamais** un fond d'app.

## Statut
Bibliothèque **autonome, non câblée** dans le Trainer. Conforme aux règles :
aucune logique métier / hook / store / filtre / bandeau gauche / bandeau haut /
timeline / Coach AI / 1T figé n'est touché. Aucun asset existant supprimé.
Le câblage se fera **après validation visuelle**, mode par mode.

## Arborescence
```
trainer-v2/
├── tokens/        colors.css · typography.css · effects.css · spacing.css · trainer-v2.css
├── tables/        felt-blue.svg · ring-gold.svg            (feutre + anneau doré, vectoriels)
├── cards/         backs/*.png (dos PF) · deck/*.png · board/*.png   (référence raster)
├── chips/         chip-25/100/500/1k/5k.svg · pot-chip.svg  (vectoriels par dénomination)
├── dealer/        dealer-button.svg                         (bouton D vectoriel)
├── avatars/       hero/villain-avatar.png · profile-ring.svg
├── buttons/       action-buttons.css                        (états hover/active/disabled en CSS)
├── icons/         ui-icons-grid-ref.png                     (référence)
├── panels/        badges-ref.png · street-tabs-ref.png      (référence)
├── effects/       glow-blue/gold/green/red/purple.svg · border-states-ref.png
├── components/    ActionButton.jsx · DealerButton.jsx · PokerChip.jsx
└── reference/     master.png                                (planche source)
```

## Tokens (§09/§10/§11)
Palette exacte de la planche exposée en variables `--pf-*` (couleurs, typo, glow,
ombres, rayons, échelles multi-table, tailles de cartes dont board **+10 %**).

```css
@import "/assets/pokerforge/trainer-v2/tokens/trainer-v2.css";
```
Les tokens sont exposés sur `:root` **et** `.trainer-v2`. En cas de régression
globale, retirer `:root` et n'utiliser que le scope `.trainer-v2`.

## Usage
- **SVG/PNG** : directement par URL, ex. `/assets/pokerforge/trainer-v2/dealer/dealer-button.svg`.
- **Boutons** : `buttons/action-buttons.css` + classes `.pf-btn .pf-btn--check|call|bet|raise|cbet|betpot|fold|allin` (texte/montant en HTML dynamique).
- **Composants React** : templates dans `components/`. Pour les exécuter, les
  **importer depuis `src/`** (les .jsx sous `public/` ne sont pas transpilés) ;
  ils référencent les assets ci-dessus par URL absolue.

```jsx
// exemple (après copie/import dans src/)
import ActionButton from ".../ActionButton.jsx";
<div className="trainer-v2"><ActionButton variant="cbet" label="C-bet 33%" amount="6.9bb" /></div>
```

## Cartes du board (+10 %)
Tailles cibles : base **48×68**, +10 % **≈53×75**, gap 3px, ratio conservé,
`object-fit:contain`, 5 emplacements (flop×3 + turn + river), Turn/River réservés.
Voir `tokens/spacing.css` (`--pf-board-card-*`).

## À affiner (si besoin)
- Détourage propre des avatars Hero/Villain (les PNG fournis sont approximatifs).
- Dos de cartes en SVG si un rendu vectoriel net est souhaité (actuellement PNG PF).
- Icônes UI en SVG individuels (référence : `icons/ui-icons-grid-ref.png`).
