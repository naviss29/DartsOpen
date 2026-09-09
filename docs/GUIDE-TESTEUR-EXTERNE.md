# Guide testeur externe — DartsOpen

> Version courte et pratique, en complément de [`Recette.md`](Recette.md) (plan de test
> exhaustif, style Squash TM). Écrit lors de l'audit pré-recette (2026-09).

## Obtenir un compte de test

DartsOpen n'a pas de formulaire de connexion propre — le compte se crée sur **BSsite** (le
Portail BApps Studio), qui redirige automatiquement vers DartsOpen une fois connecté. Aucune
notion d'organisation BApps Studio n'est nécessaire pour DartsOpen (contrairement à
BilletAsso/EventManager) : `tournament.association_id` compare directement à l'id utilisateur.

## Paiement en mode test

Un tournoi payant (`registration_mode = ONLINE`, `entry_fee > 0`) nécessite que l'organisation
liée à votre compte ait un compte Stripe Connect opérationnel (page Paramètres → lien vers
BSsite). **Le CHANGELOG interne admet ne jamais avoir rejoué un parcours de paiement réel de
bout en bout** — c'est donc une zone à tester en priorité. Utilisez le mode test Stripe (carte
`4242 4242 4242 4242`) : aucune carte réelle n'est jamais débitée en environnement de recette.

## Scénarios prioritaires

1. **Tournoi standard complet** — création, inscription de plusieurs joueurs, génération des
   poules, saisie des scores, génération du bracket, désignation d'un champion, vérification du
   classement inter-tournois (`/classement`).
2. **Tournoi rapide** (`quick_mode`) — inscriptions sur place (nom/pseudo uniquement, aucun
   email), génération du bracket rapide, arbitrage, clôture automatique.
3. **Inscription payante en ligne** — de la page publique du tournoi jusqu'à la confirmation
   de paiement Stripe (mode test) et l'email de confirmation.
4. **Contestation de résultat / forfait** — depuis le terrain (`/t/[id]/field`), signaler un
   incident, déclarer un forfait, vérifier la résolution côté organisateur (pilotage).

## Ce qui n'est pas un bug si vous le rencontrez

- Pas de champ "date de fin" pour un tournoi sur plusieurs jours — limitation connue.
- Aucun frais n'est retenu par DartsOpen sur les inscriptions (le README l'a longtemps décrit
  autrement — corrigé) : le modèle économique se joue sur l'abonnement/crédit tournoi
  au-delà de 10 joueurs, pas sur les inscriptions elles-mêmes.
- Une commande créée avant la migration des paiements (très ancienne, peu probable sur des
  données de recette récentes) ne peut pas être remboursée depuis DartsOpen.

## Comment remonter un problème

Si vous rencontrez un comportement qui ne correspond à aucun des points ci-dessus, c'est
potentiellement un vrai bug — merci de préciser : ce que vous avez fait, ce que vous
attendiez, ce qui s'est passé à la place, et si possible une capture d'écran.
