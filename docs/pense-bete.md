# Pense-bête / Idées futures

> Notes informelles sur les idées à explorer, les pistes de fonctionnalités non prioritaires, et les questions ouvertes.

---

## Idées fonctionnelles

- **Statistiques joueur** : historique des tournois, moyenne de points par visite, meilleure serie
- **Classement général** : classement inter-tournois sur la plateforme (si plusieurs associations)
- **Mode équipe** : équipes de 2 ou 3 joueurs au lieu de joueurs individuels
- **Gestion des arbitres** : assigner un arbitre par cible
- **Notifications push** : alerter le joueur quand son match commence
- **Mode hors-ligne** : saisie des scores sans connexion, sync au retour réseau (PWA)
- **Application mobile native** : React Native / Expo si besoin dépasse le PWA
- **Intégration FFD** : import des licenciés, export des résultats

## Questions ouvertes

- Règle de classement de poule exacte à valider avec des arbitres FFD (victoires > sets > legs > average ?)
- Format Américain Cricket : faut-il gérer les points différemment ?
- Gestion des ex-aequo en phase finale ?
- Délai de versement Stripe : immédiatement en fin de tournoi ou différé de 7 jours ?

## Dette technique potentielle

- Penser à l'index PostgreSQL sur `match.status` + `match.board_number` pour les requêtes temps réel
- Supabase Realtime : prévoir un fallback polling si la connexion WebSocket est perdue
- Stripe webhooks : idempotence à implémenter dès le départ pour éviter les doubles versements
