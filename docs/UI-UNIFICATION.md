# Migration UI BApps Studio — 2026-07-27

## Changements

- Parcours mot de passe oublié, connexion, inscription et réinitialisation migrés vers `Alert`,
  `Button` et `Input` de `@naviss29/design-system`.
- Palette, surface, typographie et focus clavier alignés sur les tokens BApps.
- Le mode sombre automatique local a été retiré : il produisait un contraste incohérent avec les
  cartes claires et n'existe pas encore comme thème officiel de plateforme.

## Dette restante

- Les formulaires tournoi, score et équipe restent constitués de contrôles HTML stylés localement.
- `ArbitrateMatchModal` nécessite un futur composant `Dialog`.
- Brackets, scoreboards et tableaux nécessitent des primitives spécialisées ou des recettes
  documentées ; ils ne doivent pas être généralisés sans audit d'usage.
- Navigation, cartes et badges de statut doivent encore être migrés.

## Description visuelle

Les quatre écrans d'authentification ont désormais les mêmes champs, boutons, alertes, focus,
rayons et palette que BSsite/BilletAsso, sur mobile comme sur desktop.

## Vérifications

- Build : OK
- Lint : OK
- Tests : 180/180
- Responsive : largeurs fluides existantes conservées ; focus clavier global ajouté.

Migration estimée : **20 %**.
