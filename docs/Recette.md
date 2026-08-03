# DartsOpen — Plan de recette / Campagne de tests

> Version : 1.0 — Mai 2026  
> Outil de référence : style Squash TM  
> Environnement cible : staging (`dartsopen.bichetapps.com`)

---

## Légende

| Priorité | Signification |
|---|---|
| 🔴 P1 | Bloquant — empêche l'utilisation de la fonctionnalité |
| 🟠 P2 | Important — dégradation significative de l'expérience |
| 🟡 P3 | Mineur — cosmétique ou cas limite |

**Format d'une étape :**  
`Action → Résultat attendu`

---

## Campagne C1 — Authentification

### T-001 — Connexion avec compte valide 🔴 P1

**Préconditions :** Compte existant sur SterPlatform (email/password)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à `/login` | Formulaire email + mot de passe affiché |
| 2 | Saisir email et mot de passe valides, cliquer "Se connecter" | Redirection vers `/dashboard` |
| 3 | Vérifier le header | Nom de l'association / utilisateur visible |

**Ligne de test rapide :** Se connecter → vérifier la redirection vers `/dashboard`.

---

### T-002 — Connexion avec identifiants incorrects 🟠 P2

**Préconditions :** /

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à `/login` | Formulaire affiché |
| 2 | Saisir un mot de passe incorrect | Message d'erreur affiché ("Identifiants invalides" ou similaire) |
| 3 | Vérifier qu'aucune redirection ne se produit | Reste sur `/login` |

**Ligne de test rapide :** Connexion avec mauvais mot de passe → vérifier message d'erreur.

---

### T-003 — Inscription d'un nouveau compte 🟠 P2

**Préconditions :** Email non encore utilisé sur SterPlatform

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à `/register` | Formulaire inscription affiché |
| 2 | Remplir tous les champs requis, soumettre | Compte créé, redirection ou message de confirmation |
| 3 | Se connecter avec le compte créé | Connexion réussie, accès dashboard |

**Ligne de test rapide :** Créer un compte avec un email unique → connexion réussie.

---

### T-004 — Accès dashboard sans authentification 🔴 P1

**Préconditions :** Session non initialisée (navigation privée)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder directement à `/dashboard` | Redirection automatique vers `/login` |
| 2 | Accéder directement à `/tournaments/new` | Redirection automatique vers `/login` |

**Ligne de test rapide :** Accéder à `/dashboard` sans être connecté → redirection vers `/login`.

---

### T-005 — Déconnexion 🟠 P2

**Préconditions :** Utilisateur connecté

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Cliquer sur "Déconnexion" (menu ou bouton) | Session supprimée, redirection vers `/login` |
| 2 | Tenter d'accéder à `/dashboard` | Redirection vers `/login` |

**Ligne de test rapide :** Se déconnecter → vérifier que `/dashboard` est inaccessible.

---

## Campagne C2 — Tableau de bord

### T-010 — Affichage des compteurs 🟠 P2

**Préconditions :** Utilisateur connecté avec au moins un tournoi existant

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à `/dashboard` | Compteurs affichés : Total, Ouvertes, En cours, Terminés |
| 2 | Vérifier la cohérence des chiffres avec la liste `/tournaments` | Compteurs identiques à la liste filtrée |

**Ligne de test rapide :** Vérifier que la somme Ouvertes + En cours + Terminés + Brouillon = Total.

---

### T-011 — Affichage des tournois récents 🟠 P2

**Préconditions :** Au moins un tournoi existant

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à `/dashboard` | Jusqu'à 5 tournois récents listés |
| 2 | Vérifier chaque carte : nom, date, lieu | Données correctes |
| 3 | Vérifier le compteur de joueurs sur une doublette (2 j/équipe, 8 équipes payées) | Affiche `16/32 joueurs` (pas 8/32) |
| 4 | Vérifier l'affichage du prix | Affiche `X,XX €/j` |
| 5 | Vérifier l'icône du mode d'inscription | 🌐 En ligne pour ONLINE, 🏠 Sur place pour ONSITE |
| 6 | Vérifier le badge de statut | Couleur et libellé corrects (Brouillon / Inscriptions ouvertes / En cours / Terminé) |

**Ligne de test rapide :** Sur un tournoi doublette avec 4 équipes payées → affiche `8/X joueurs`.

---

### T-012 — Lien "Voir tout" 🟡 P3

**Préconditions :** Plus de 5 tournois existants

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Vérifier la présence du lien "Voir tout →" dans la section tournois récents | Lien visible |
| 2 | Cliquer sur le lien | Redirection vers `/tournaments` |

**Ligne de test rapide :** Avec > 5 tournois, vérifier le lien "Voir tout →".

---

## Campagne C3 — Gestion des tournois

### T-020 — Création d'un tournoi minimal 🔴 P1

**Préconditions :** Utilisateur connecté

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Cliquer sur "+ Nouveau tournoi" | Redirection vers `/tournaments/new` |
| 2 | Remplir : Nom, Date, Lieu, Max joueurs, Frais d'inscription, Poules, Cibles | Formulaire accepté |
| 3 | Ajouter au moins une manche (ex. 501, Simple, Double Out) | Manche ajoutée |
| 4 | Soumettre | Tournoi créé en statut DRAFT, redirection vers la fiche du tournoi |

**Ligne de test rapide :** Créer un tournoi avec 1 manche → statut DRAFT visible dans la liste.

---

### T-021 — Création d'un tournoi en mode ONSITE 🟠 P2

**Préconditions :** Utilisateur connecté

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Créer un tournoi, sélectionner mode "Sur place (ONSITE)" | Option disponible |
| 2 | Vérifier qu'aucune organisation BApps Studio liée n'est requise | Création sans liaison SterPlatform |
| 3 | Vérifier l'icône 🏠 dans le dashboard | Affiché correctement |

**Ligne de test rapide :** Tournoi ONSITE → pas de paiement en ligne requis, icône 🏠 dans le dashboard.

---

### T-022 — Passage du statut DRAFT → OPEN 🔴 P1

**Préconditions :** Tournoi en DRAFT avec au moins une manche

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvrir la fiche du tournoi | Bouton "Ouvrir les inscriptions" visible |
| 2 | Cliquer sur ce bouton | Statut passe à OPEN |
| 3 | Vérifier le badge dans la liste | Affiche "Inscriptions ouvertes" |
| 4 | Vérifier que l'URL d'inscription publique est générée | Lien `/t/[id]/register` accessible |

**Ligne de test rapide :** DRAFT → OPEN → badge "Inscriptions ouvertes" visible.

---

### T-023 — Démarrage du tournoi (OPEN → IN_PROGRESS) 🔴 P1

**Préconditions :** Tournoi OPEN avec des joueurs inscrits et poules générées

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvrir la fiche du tournoi | Bouton "Démarrer le tournoi" visible |
| 2 | Cliquer | Statut passe à IN_PROGRESS |
| 3 | Vérifier les matchs IN_PROGRESS dans la vue live | 1 match IN_PROGRESS par cible (pas plus) |

**Ligne de test rapide :** IN_PROGRESS → vérifier 1 match par cible dans la vue live.

---

### T-024 — QR codes cibles 🟠 P2

**Préconditions :** Tournoi avec au moins 1 cible configurée

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la fiche du tournoi, section QR codes | QR codes générés, 1 par cible |
| 2 | Scanner un QR code avec un smartphone | Redirection vers la page de saisie de score de cette cible |
| 3 | Vérifier le numéro de cible affiché sur la page score | Correspond à la cible scannée |

**Ligne de test rapide :** Scanner QR Cible 2 → page score affiche "Cible 2".

---

## Campagne C4 — Inscriptions

### T-030 — Inscription en ligne (mode ONLINE) 🔴 P1

**Préconditions :** Tournoi en statut OPEN, mode ONLINE, organisation BApps Studio liée à
l'organisateur avec Stripe Connect opérationnel (`canReceivePayments: true` côté SterPlatform)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à `/t/[id]/register` | Formulaire d'inscription affiché |
| 2 | Remplir les informations (nom, email, téléphone, nom des coéquipiers si > 1 joueur/équipe) | Champs présents et obligatoires |
| 3 | Soumettre → redirection vers le checkout créé par SterPlatform, payer (carte test : 4242 4242 4242 4242) | Redirection vers page de succès |
| 4 | Vérifier la page de confirmation `/t/[id]/register/success` | Message de confirmation affiché |
| 5 | Vérifier dans la liste des joueurs (dashboard) | Équipe apparaît avec statut PAID |
| 6 | Vérifier l'email de confirmation | Email reçu sur l'adresse fournie |

**Ligne de test rapide :** Inscription en ligne avec carte test → statut PAID + email reçu.

---

### T-031 — Inscription sur place (mode ONSITE) 🟠 P2

**Préconditions :** Tournoi en statut OPEN, mode ONSITE, utilisateur connecté (organisateur)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la page joueurs du tournoi (`/tournaments/[id]/players`) | Formulaire d'ajout manuel visible |
| 2 | Ajouter une équipe manuellement | Équipe ajoutée avec statut PAID |
| 3 | Vérifier le compteur de joueurs dans le dashboard | Mis à jour correctement |

**Ligne de test rapide :** Ajouter une équipe ONSITE → compteur joueurs mis à jour.

---

### T-032 — Limite maximale de joueurs 🟠 P2

**Préconditions :** Tournoi OPEN avec `max_players - players_per_team` places restantes

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ajouter la dernière équipe possible | Inscription acceptée, tournoi plein |
| 2 | Tenter une nouvelle inscription | Inscription refusée ou bouton désactivé |

**Ligne de test rapide :** Remplir jusqu'à la limite → nouvelle inscription bloquée.

---

### T-033 — Annulation d'une inscription en ligne 🟡 P3

**Préconditions :** Inscription PENDING (paiement abandonné)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Démarrer une inscription en ligne | Checkout créé côté SterPlatform (`sterPaymentId` enregistré) |
| 2 | Fermer la page avant de payer | Inscription reste PENDING (non annulée) |
| 3 | Vérifier que la place n'est pas bloquée définitivement | Place libérable ou timeout géré |

**Ligne de test rapide :** Abandonner un paiement → inscription PENDING, place non bloquée.

---

## Campagne C5 — Génération des poules

### T-040 — Génération des poules round-robin 🔴 P1

**Préconditions :** Tournoi OPEN avec au moins `nb_pools × 2` équipes PAID

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la page poules du tournoi (`/tournaments/[id]/pools`) | Bouton "Générer les poules" visible |
| 2 | Cliquer sur "Générer" | Poules créées avec répartition homogène des joueurs |
| 3 | Vérifier que le nombre de matchs générés est correct | Toutes les paires round-robin présentes dans chaque poule |
| 4 | Vérifier l'affectation des cibles | Matchs répartis sur toutes les cibles (pas tous sur Cible 1) |
| 5 | Pour un tournoi à 4 poules et 4 cibles | Matchs de poules différentes sur chaque cible |

**Ligne de test rapide :** Générer poules avec 4 cibles → vérifier que les matchs ne sont pas tous sur Cible 1.

---

### T-041 — Régénération des poules 🟡 P3

**Préconditions :** Poules déjà générées, aucun match IN_PROGRESS ou FINISHED

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Cliquer à nouveau sur "Générer les poules" | Poules réinitialisées et régénérées |
| 2 | Vérifier qu'aucun match précédent n'est conservé | Anciens matchs supprimés |

**Ligne de test rapide :** Régénérer les poules → anciens matchs supprimés.

---

## Campagne C6 — Scoring — Mode électronique

### T-050 — Saisie du vainqueur (mode ELECTRONIC) 🔴 P1

**Préconditions :** Tournoi IN_PROGRESS, mode ELECTRONIC, match IN_PROGRESS sur une cible

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Scanner le QR code de la cible ou accéder à `/t/[id]/score?board=X` | Page de score affichée, match actif visible |
| 2 | Cliquer sur le nom du joueur/équipe vainqueur | Proposition de vainqueur enregistrée côté joueur 1 |
| 3 | Sur le smartphone du 2ème joueur, confirmer le même vainqueur | Set marqué comme terminé avec le vainqueur |
| 4 | Si la manche est la dernière → match terminé | Match passe à FINISHED, prochain match démarre automatiquement |

**Ligne de test rapide :** Proposer vainqueur depuis P1 → confirmer depuis P2 → set validé.

---

### T-051 — Désaccord sur le vainqueur (contestation) 🟠 P2

**Préconditions :** Mode ELECTRONIC, match IN_PROGRESS, set en cours

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Joueur 1 propose vainqueur A | Vainqueur proposé affiché |
| 2 | Joueur 2 conteste (propose vainqueur B) | État de contestation affiché |
| 3 | L'organisateur ou un des joueurs résout la contestation | Vainqueur correct enregistré |

**Ligne de test rapide :** Proposer deux vainqueurs différents → état contesté visible.

---

### T-052 — Avancement automatique au prochain set 🟠 P2

**Préconditions :** Tournoi avec 2+ manches (rounds), match IN_PROGRESS

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Valider le vainqueur du premier set | Set 1 terminé, set 2 démarre automatiquement |
| 2 | Valider le vainqueur du dernier set | Match passe à FINISHED |

**Ligne de test rapide :** Valider chaque set → progression automatique jusqu'à FINISHED.

---

## Campagne C7 — Scoring — Mode traditionnel

### T-060 — Saisie des scores par volée (mode TRADITIONAL) 🔴 P1

**Préconditions :** Tournoi configuré en mode TRADITIONAL, match IN_PROGRESS

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la page score de la cible | Tableau de saisie avec scores P1 / P2 affiché |
| 2 | Saisir les scores de la volée pour P1 et P2 | Scores enregistrés et affichés |
| 3 | Continuer jusqu'à la fin du set | Set terminé automatiquement à 0 points ou score gagnant selon game_type |
| 4 | Vérifier le vainqueur du set | Vainqueur calculé automatiquement |

**Ligne de test rapide :** Saisir scores jusqu'à 0 → vainqueur du set calculé.

---

### T-061 — Tableau de bord scores TRADITIONAL 🟠 P2

**Préconditions :** Tournoi TRADITIONAL IN_PROGRESS

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la vue live `/t/[id]/live` | Scores détaillés affichés par manche (traditionnel) |
| 2 | Saisir une volée | Vue live mise à jour en temps réel |

**Ligne de test rapide :** Saisir un score → vue live mise à jour sans rechargement.

---

## Campagne C8 — File d'attente des cibles

### T-070 — Un seul match actif par cible 🔴 P1

**Préconditions :** Tournoi IN_PROGRESS avec plusieurs matchs générés par cible

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Démarrer le tournoi | Exactement 1 match IN_PROGRESS par cible |
| 2 | Vérifier les matchs sur la vue live | Pas deux matchs IN_PROGRESS sur la même cible |
| 3 | Vérifier les matchs suivants | Affichés comme PENDING avec le numéro de cible |

**Ligne de test rapide :** Démarrer tournoi avec 4 cibles → 4 matchs IN_PROGRESS maximum, 1 par cible.

---

### T-071 — Démarrage automatique du match suivant 🔴 P1

**Préconditions :** Match IN_PROGRESS sur Cible X, match PENDING en attente sur Cible X

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Terminer le match actif sur Cible X (valider dernier set) | Match actuel passe à FINISHED |
| 2 | Vérifier immédiatement le match suivant | Le prochain match PENDING sur Cible X passe automatiquement à IN_PROGRESS |
| 3 | Vérifier la vue live | Nouveau match affiché comme actif sur Cible X |

**Ligne de test rapide :** Finir match Cible 2 → match suivant Cible 2 démarre automatiquement.

---

### T-072 — Annonce "Dernière manche" 🟠 P2

**Préconditions :** Tournoi avec 2+ manches (rounds), match IN_PROGRESS dans sa dernière manche, match PENDING en attente sur la même cible

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Progresser un match jusqu'à la dernière manche (dernier set non validé) | Bannière amber "⚡ Cible X — Dernière manche en cours. Prochain match : A vs B" apparaît |
| 2 | Vérifier le contenu de la bannière | Numéro de cible correct, noms du prochain match corrects |
| 3 | Valider la dernière manche | Bannière disparaît, nouveau match démarre |

**Ligne de test rapide :** Avancer un match à la dernière manche → vérifier bannière amber dans la vue live.

---

## Campagne C9 — Vue live (spectateurs)

### T-080 — Accès spectateur via QR code salle 🟠 P2

**Préconditions :** Tournoi IN_PROGRESS, QR code salle généré

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Scanner le QR code salle | Accès à `/t/[id]/live` sans connexion requise |
| 2 | Vérifier l'affichage des matchs en cours | Matchs IN_PROGRESS avec scores et cibles |
| 3 | Vérifier l'affichage des matchs à venir | PENDING avec numéro de cible visible |

**Ligne de test rapide :** Accéder à `/t/[id]/live` sans être connecté → affichage correct.

---

### T-081 — Mise à jour en temps réel 🟠 P2

**Préconditions :** Tournoi IN_PROGRESS, vue live ouverte sur smartphone

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Valider un set depuis la page score | Vue live mise à jour sans rechargement manuel |
| 2 | Terminer un match | Match disparaît des "en cours", match suivant apparaît |

**Ligne de test rapide :** Valider un set → vérifier mise à jour automatique de la vue live.

---

### T-082 — Tableau récapitulatif des scores par poule 🟠 P2

**Préconditions :** Quelques matchs terminés dans plusieurs poules

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la vue poules | Classement avec victoires/défaites/points affiché |
| 2 | Vérifier la cohérence après un nouveau match terminé | Classement mis à jour |

**Ligne de test rapide :** Terminer un match → vérifier le classement de la poule mis à jour.

---

## Campagne C10 — Phases finales (bracket)

### T-090 — Génération du bracket 🔴 P1

**Préconditions :** Phase de poules terminée (tous les matchs FINISHED), au moins 2 qualifiés

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la page bracket (`/tournaments/[id]/bracket`) | Bouton "Générer le bracket" visible |
| 2 | Générer | Tableau d'élimination directe généré avec les qualifiés de chaque poule |
| 3 | Vérifier les byes | Si nombre de qualifiés non puissance de 2, des byes sont insérés |
| 4 | Vérifier l'affichage | Toutes les colonnes affichées dès le départ (avec placeholders pour les rounds futurs) |

**Ligne de test rapide :** Générer bracket → vérifier présence des byes si nécessaire.

---

### T-091 — Avancement automatique dans le bracket 🔴 P1

**Préconditions :** Bracket généré, match de bracket IN_PROGRESS

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Terminer un match de bracket | Vainqueur automatiquement placé dans le match suivant du bracket |
| 2 | Vérifier le bracket visuel | Vainqueur affiché dans la case du tour suivant |
| 3 | Gérer un bye | Le joueur recevant le bye avance automatiquement sans jouer |

**Ligne de test rapide :** Finir un match de bracket → vainqueur placé automatiquement au tour suivant.

---

### T-092 — Accès au bracket en lecture seule 🟡 P3

**Préconditions :** Bracket généré, tournoi IN_PROGRESS

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la vue live, section bracket | Bracket visible sans connexion |
| 2 | Vérifier les mises à jour en temps réel | Bracket mis à jour après chaque avancement |

**Ligne de test rapide :** Accéder au bracket en vue spectateur → affiché sans connexion.

---

## Campagne C11 — Paiements (SterPlatform / Stripe Connect, mission DO-003)

DartsOpen ne dialogue plus jamais directement avec Stripe : la liaison à une organisation
BApps Studio, le statut Stripe Connect et la création des paiements passent exclusivement par
l'API interne de SterPlatform (`lib/api/sterplatformInternal.ts`, `lib/actions/organization.ts`).

### T-100 — Liaison d'une organisation BApps Studio 🟠 P2

**Préconditions :** Utilisateur connecté, aucune organisation liée (`Organization.sterOrganizationSlug` = null)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à la page paramètres (`/settings`) | Sélecteur d'organisations BApps Studio affiché (rôle OWNER/ADMIN uniquement) |
| 2 | Choisir une organisation et valider | Organisation liée, retour sur `/settings` avec le statut Stripe Connect de cette organisation |
| 3 | Retenter avec une organisation où l'utilisateur n'a que le rôle MEMBER | Liaison refusée (erreur explicite) |

**Ligne de test rapide :** Lier une organisation OWNER/ADMIN → statut affiché ; tenter avec MEMBER → refus.

---

### T-101 — Reversement automatique à l'association 🟠 P2

**Préconditions :** Inscription payée, organisation liée avec Stripe Connect opérationnel

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Payer une inscription (carte test 4242...) | Paiement créé via `createPaymentCheckout` (SterPlatform), `platformFeeCents` transmis |
| 2 | Vérifier côté SterPlatform / Stripe Dashboard | Le montant de l'inscription (hors frais) est versé sur le compte Connect de l'organisation |

**Ligne de test rapide :** Payer inscription test → vérifier reversement côté SterPlatform.

---

### T-102 — Webhook entrant SterPlatform (payment.succeeded) 🔴 P1

**Préconditions :** Tournoi ONLINE, inscription initiée (`sterPaymentId` renseigné)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Compléter le paiement | Notification `payment.succeeded` reçue sur `POST /api/webhooks/sterplatform-payments`, signature HMAC vérifiée |
| 2 | Vérifier la base de données | Inscription passe de PENDING à PAID |
| 3 | Vérifier l'email | Email de confirmation envoyé à l'adresse de l'équipe |
| 4 | Rejouer la même notification (signature valide) | Idempotent — pas de double email, statut déjà PAID inchangé |
| 5 | Envoyer une notification avec une signature invalide ou expirée (> 5 min) | Requête rejetée (400), aucune modification en base |

**Ligne de test rapide :** Payer → inscription PAID en base + email reçu ; signature invalide → 400.

---

### T-103 — Paiement bloqué si Stripe Connect non opérationnel 🔴 P1

**Préconditions :** Organisation liée mais Stripe Connect non opérationnel (onboarding incomplet, restreint, etc.)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Tenter une inscription en ligne sur un tournoi payant de cette organisation | Message d'erreur explicite, aucun paiement créé |
| 2 | Vérifier la page paramètres | Statut "Paiements non activés" avec lien vers BSsite pour configurer Stripe Connect |

**Ligne de test rapide :** Organisation sans Stripe Connect opérationnel → inscription payante refusée proprement.

---

## Campagne C12 — Emails transactionnels

### T-110 — Email de confirmation d'inscription 🟠 P2

**Préconditions :** Inscription PAID (ONLINE ou ONSITE)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Compléter une inscription | Email envoyé à l'adresse fournie |
| 2 | Vérifier le contenu | Nom de l'équipe, nom du tournoi, date, lieu présents |
| 3 | Vérifier l'expéditeur | Domaine `bichetapps.com` ou domaine vérifié Brevo |

**Ligne de test rapide :** Inscription payée → email reçu avec nom du tournoi.

---

### T-111 — Non-envoi en mode ONSITE sans email 🟡 P3

**Préconditions :** Joueur ajouté manuellement sans email renseigné

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ajouter un joueur ONSITE sans email | Pas d'erreur levée, inscription créée |
| 2 | Vérifier les logs / erreurs | Aucune erreur d'envoi d'email |

**Ligne de test rapide :** Créer inscription sans email → aucune erreur côté serveur.

---

## Campagne C13 — Cas limites et robustesse

### T-120 — Tournoi avec une seule poule 🟡 P3

**Préconditions :** Tournoi configuré avec `nb_pools = 1`

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Générer les poules | Une seule poule avec tous les joueurs |
| 2 | Vérifier les matchs | Tous les matchs round-robin de la poule générés |
| 3 | Vérifier les cibles | Matchs distribués sur les cibles disponibles |

**Ligne de test rapide :** 1 poule, 4 cibles → matchs répartis sur les 4 cibles.

---

### T-121 — Tournoi avec 1 seul joueur par équipe (solo) 🟡 P3

**Préconditions :** Tournoi configuré avec `players_per_team = 1`

| # | Action | Résultat attendu |
|---|---|---|
| 1 | S'inscrire | Formulaire sans champ coéquipier |
| 2 | Vérifier le dashboard | Compteur affiche 1 joueur par inscription payée |

**Ligne de test rapide :** Inscription solo → compteur joueurs = inscriptions payées × 1.

---

### T-122 — Navigation mobile sur la vue live 🟠 P2

**Préconditions :** Tournoi IN_PROGRESS

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvrir la vue live sur un smartphone (Chrome mobile) | Affichage responsive, texte lisible sans zoom |
| 2 | Vérifier la bannière "Dernière manche" sur mobile | Visible et non tronquée |
| 3 | Vérifier la liste des matchs à venir sur mobile | Numéros de cibles visibles |

**Ligne de test rapide :** Ouvrir la vue live sur mobile → aucun débordement horizontal.

---

### T-123 — Rechargement de la page score en cours de match 🟠 P2

**Préconditions :** Match IN_PROGRESS, page score ouverte

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Recharger la page score (`F5` ou retour/relance) | Match actif rechargé, aucune perte de données |
| 2 | Vérifier l'état du set en cours | Validations précédentes conservées |

**Ligne de test rapide :** Recharger la page score → état du match préservé.

---

### T-124 — Accès à un tournoi inexistant 🟡 P3

**Préconditions :** /

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Accéder à `/t/00000000-0000-0000-0000-000000000000/live` | Page 404 ou message d'erreur |
| 2 | Accéder à `/tournaments/00000000-0000-0000-0000-000000000000` | Page 404 ou redirection |

**Ligne de test rapide :** UUID invalide → 404 ou erreur propre, pas de crash serveur.

---

## Récapitulatif par priorité

| Priorité | Nb de tests |
|---|---|
| 🔴 P1 — Bloquants | 12 |
| 🟠 P2 — Importants | 20 |
| 🟡 P3 — Mineurs | 7 |
| **Total** | **39** |

---

## Matrice de régression minimale (smoke test)

> Exécuter avant chaque déploiement en production. Durée estimée : **20 minutes**.

| # | Test | Campagne |
|---|---|---|
| S-01 | Se connecter avec un compte valide → redirection `/dashboard` | C1 — T-001 |
| S-02 | Accéder à `/dashboard` sans session → redirection `/login` | C1 — T-004 |
| S-03 | Dashboard : compteur joueurs doublette (4 équipes) = 8 joueurs | C2 — T-011 |
| S-04 | Créer un tournoi ONSITE avec 1 manche → statut DRAFT | C3 — T-020 |
| S-05 | Passer DRAFT → OPEN → lien inscription public accessible | C3 — T-022 |
| S-06 | Ajouter 2 équipes ONSITE → compteur mis à jour | C4 — T-031 |
| S-07 | Générer les poules avec 2 cibles → matchs sur Cible 1 ET Cible 2 | C5 — T-040 |
| S-08 | Démarrer le tournoi → 1 match IN_PROGRESS par cible | C8 — T-070 |
| S-09 | Valider un match (ELECTRONIC) → match suivant démarre automatiquement | C8 — T-071 |
| S-10 | Vue live accessible sans connexion → matchs affichés | C9 — T-080 |
| S-11 | Inscription en ligne (checkout SterPlatform, carte test) → statut PAID + email reçu | C11 — T-102 |
