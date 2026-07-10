# PokerForge Studio — Trainer 1T — V1.0 (Frozen) ❄️

> Tag Git : `trainer-1t-v1.0` · Commit de référence : `Trainer 1T V1.0 Frozen`
> Release GitHub suggérée : **v1.0.0 — Trainer 1T Frozen**

Version de référence **figée**. Audit graphique et technique terminé et validé.
Le Trainer 1T devient la **bibliothèque de référence** de PokerForge Studio.

## 📚 Bibliothèque de référence
Table · cartes · avatars · jetons · ancres de mises · pot · board · bouton dealer · animations · composants React · palettes de couleurs · effets visuels.
Les modes **2T / 3T / 4T** doivent être construits à partir de ces composants — pas de variantes graphiques inutiles.

## ✨ Changelog (refonte 1T + audit)
- **Layout** : feutre bleu-nuit ; boutons d'action Héro + barre de sizings centrés **sous la table** ; **timeline** (transport + progression de session) en pied du bandeau droit — aucun chevauchement vérifié à 1672×941, 1440×900, 1920×1080.
- **Jetons** : hauteur de pile **cohérente avec le montant misé** (barème logarithmique monotone, dénominations standards 0.5/1/2.5/3/4/5/25/100), piles à somme constante. Pot, blindes et mises unifiés.
- **Audit Codex intégré** : ancres de mises/blindes affinées, jeton `1t-board`, clamp anti-collision du board (`clampPointOutsideBoard`), cadres de badges & pot transparents (jetons posés sur le feutre), largeur 1T stable en focus, timeline compactée. Nettoyage : dé-duplication CSS `.pf-pot-readout`.

## 🔒 Politique de développement
- Aucune modification graphique / UX / restructuration de composants sans validation explicite.
- Corrections limitées aux bugs, régressions et optimisations techniques.
- Tout nouveau développement réutilise les composants existants du Trainer 1T.
- Cycle : Implémentation → Audit Codex → Validation utilisateur → Fusion.

## ⏪ Restauration
Retour instantané à cet état stable :
```
git checkout trainer-1t-v1.0
```

## ✅ Tests au gel
coach-engine 8/0 · coach-agents 4/0 · mental OK.
_(Seul échec : `mobile/1T rail` — périmètre Codex « multi-table mobile » déprioritisé.)_
