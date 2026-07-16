# Pense-bête / Idées futures

> Notes informelles sur les idées à explorer, les pistes de fonctionnalités non prioritaires, et les questions ouvertes.

---

## Modèle économique

- **Frais plateforme (0,10 €/joueur) — actuellement sur bonne volonté** : pas de blocage au lancement. Si de grandes associations utilisent la plateforme sans payer, envisager un seuil : gratuit jusqu'à N joueurs (ex. 32), paiement obligatoire au-delà. À implémenter dans `createTournament` ou au démarrage du tournoi (`IN_PROGRESS`).
- **Traçabilité PayPal** : les relevés mensuels PayPal (compte SEProduct) servent de justificatif comptable pour l'association. Webhooks PayPal à implémenter plus tard si le volume rend la vérification manuelle chronophage.

## Dépendances SterPlatform (à implémenter après SterPlatform)

- **Google OAuth** : login "Continuer avec Google" pour les organisateurs — disponible une fois SterPlatform Phase 7a terminée. Endpoint côté DartsOpen : bouton sur la page login → redirect `/api/auth/google` SterPlatform → callback → JWT.
- **SSO** : vision long terme — un compte unique pour DartsOpen + FestManager + autres apps. Architecture déjà compatible.

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
- Dépendances mortes `@supabase/ssr` / `@supabase/supabase-js` dans package.json (migration vers SterPlatform + Mercure terminée, à retirer)
