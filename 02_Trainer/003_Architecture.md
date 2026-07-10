# PokerForge Trainer - Architecture

## Objectif

Définir l'architecture complète du Trainer Desktop et Mobile.

## Architecture générale

Modules :
- Spot Generator
- Game Engine
- Villain AI
- UI Renderer
- Session Manager
- Statistics Engine
- Coach AI Connector
- SharkSolver Connector

## Flux

Dashboard → Trainer → Décision Hero → IA → Analyse → Coach AI → Dashboard

## Zones de l'interface

1. Header
2. Table
3. Pot
4. Joueurs
5. Actions Hero
6. Panneau droit
7. Barre inférieure

## Contraintes

- Aucun chevauchement
- Table centrée
- Responsive obligatoire
- Aucune régression fonctionnelle

## Composants

PF-TBL-001 Table
PF-PLY-001 Avatar
PF-CRD-001 Card
PF-POT-001 Pot
PF-BTN-001 Fold
PF-BTN-002 Call
PF-BTN-003 Raise
PF-BTN-004 Solution

## Checklist Claude

Respecter les dimensions validées.
Conserver toutes les fonctionnalités existantes.
Moderniser uniquement le design et l'ergonomie.

## Checklist Codex

Contrôler :
- Responsive
- Alignements
- Chevauchements
- Animations
- Régressions
- Performances

