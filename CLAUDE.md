# DartsOpen — Notes développeur

## Stack
- **Next.js 16** (App Router, standalone output) + TypeScript
- **Prisma 7** + PostgreSQL (port 5433 en local)
  - `overrides` npm (`deepmerge-ts` ^8, `mysql2` ^3.24) : le CLI `prisma` 7.10 (dernière stable au
    29/09/2026, 8.0 encore en RC) embarque des versions vulnérables (GHSA-ggr8-5vv4-36mx,
    GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3). Exposition réelle quasi nulle (MySQL inutilisé),
    mais `npm audit` redevient propre. À retirer quand une version stable de Prisma les corrige.
- **SterPlatform** — auth organisateurs via le SSO central (JWT, cookies httpOnly), aucune
  page de connexion/inscription locale — voir "Authentification (SSO central)" ci-dessous
- **Tailwind CSS 4**
- **Vitest** — tests unitaires

## Démarrage local
```bash
# 1. Base de données
docker compose up -d

# 2. Variables d'env
# Créer .env.local à partir de .env.example — voir « Variables d'environnement requises » ci-dessous

# 3. Dépendances + migration
npm install
npx prisma migrate dev
npx prisma generate

# 4. Lancer
npm run dev   # http://localhost:3000
```

## Structure
```
app/
  (dashboard)/          → espace organisateur (auth requise)
    tournaments/        → liste, création, gestion tournoi
    settings/           → paramètres compte
  (public)/
    t/[id]/live/        → suivi live public d'un tournoi
    t/[id]/tv/          → mode écran TV (plein écran, polling 5s)
    classement/         → classement inter-tournois
    p/[slug]/           → profil public d'un joueur

lib/
  api/      → client SterPlatform + helpers auth (cookies JWT)
  db/       → requêtes Prisma (tournament.ts, ranking.ts)
  actions/  → Server Actions Next.js

components/ → composants React (tournament/, ui/)
prisma/     → schema + migrations
scripts/    → seed de données de test, scripts opérationnels (purges planifiées)
```

## Authentification (SSO central — migration écosystème SSO)

BSsite (le Portail BApps Studio) est l'unique portail de connexion visible de
l'écosystème ; DartsOpen n'a plus aucun écran de login/register/forgot-password/
reset-password local (retirés par cette migration, pas seulement masqués). SterPlatform
reste l'unique fournisseur d'identité. Protocole : Authorization Code + PKCE (S256),
échange de code serveur-à-serveur — jamais de JWT/refresh token dans une URL. Même
architecture que BilletAsso (pilote AUTH-002) et BSsite, voir leurs CLAUDE.md
respectifs pour le détail du protocole côté SterPlatform.

- **`app/api/auth/sso/start/route.ts`** — point d'entrée unique de toute redirection "non
  authentifié" (`proxy.ts`, `app/(auth)/login/page.tsx`). Ouvre une transaction locale :
  `state` + vérificateur PKCE CSPRNG, stockés dans un cookie `do_sso_tx` (HttpOnly, à usage
  unique, 10 min — voir `lib/sso/transaction.ts`), puis redirige vers SterPlatform
  `GET /api/auth/sso/authorize`. Le paramètre `?next=` (chemin relatif exact demandé, validé
  contre l'open redirect — `lib/sso/redirect.ts`) est conservé dans cette même transaction
  pour revenir sur la page d'origine après connexion.
- **`app/api/auth/sso/callback/route.ts`** — reçoit `?code=&state=` de SterPlatform, vérifie
  le `state` local, échange le code contre une session via `POST /api/auth/sso/exchange`
  (secret client serveur `STER_SSO_CLIENT_SECRET`, jamais `NEXT_PUBLIC_`), pose les cookies de
  session existants (`ster_token`/`ster_refresh_token`, mécanisme inchangé), puis redirige
  vers `next`. Contrairement à BilletAsso, **aucune création d'organisation** n'est déclenchée
  ici — les droits sont lus dans l'organisation SterPlatform du tournoi (ADR-0021, voir
  « Droits d'organisation » ci-dessous).
- **`app/(auth)/login/page.tsx`** — ne rend plus de formulaire : redirige immédiatement vers
  `/api/auth/sso/start` (compat pour tout lien historique/favori vers `/login`).
- **`proxy.ts`** — redirige toute page protégée (`/dashboard`, `/tournaments`, `/settings`)
  sans session vers `ssoStartPath(pathname)` au lieu d'un `/login?next=` local. Les règles de
  rate limiting sur `/login`/`/register`/`/forgot-password`/`/reset-password` ont été retirées
  (routes disparues ; le rate limiting du login est déjà assuré côté SterPlatform,
  `AuthRateLimiterSubscriber`, 5 tentatives/minute/IP).
- **Déconnexion globale** (`components/LogoutButton.tsx`) — un vrai POST de formulaire
  top-level (pas `fetch()`) vers SterPlatform `/api/auth/sso/logout` coupe la session partout
  dans l'écosystème, pas seulement sur DartsOpen (utile en contexte tournoi : un ordinateur/
  une tablette partagé(e) entre plusieurs organisateurs). `app/api/auth/logout/route.ts`
  révoque en plus le refresh token local avant ce POST global.

### Variables d'environnement SSO
- `STER_SSO_CLIENT_SECRET` — secret client échangé côté serveur uniquement avec SterPlatform
  (`/api/auth/sso/exchange`), doit être identique à `SSO_CLIENT_SECRET_DARTSOPEN` côté
  SterPlatform.
- En local, DartsOpen et BSsite tournent tous deux par défaut sur le port 3000 : pour valider
  le parcours SSO complet en local (les deux apps démarrées simultanément), lancer DartsOpen
  sur le port 3002 (`SSO_CALLBACK_DARTSOPEN`/`SSO_DEFAULT_URL_DARTSOPEN` déjà configurés sur ce
  port dans `SterPlatform/.env.local` et `.env.example`).

## Droits d'organisation (ADR-0021 option A, lots L6 et L7)

Un seul rôle par organisation, lu dans SterPlatform : **OWNER/ADMIN gèrent, MEMBER consulte**
(données personnelles visibles à l'écran, aucune action). Le créateur (`Tournament.userId`) reste
enregistré (idempotence, emails, purge) mais ne donne plus de droits, sauf repli transitoire.

- **Données** : `Tournament.organizationId` (UUID SterPlatform = clé d'autorité) et
  `organizationSlug` (affichage seulement), nullables et indexés (migration
  `20260930200000_tournament_organization`, additive, aucun backfill — rattachement : règle à arrêter par Alan).
- **Module unique** `lib/auth/organizationAccess.ts` :
  - `getMyMemberships()` — `GET /api/me/organizations` (`id`, `slug`, `role`), `cache()` par rendu +
    Map mémoire indexée par SHA-256 du jeton : relue toutes les **60 s** (retrait d'un membre
    effectif sous 60 s). SterPlatform injoignable (réseau, délai 5 s, 5xx, réponse illisible) :
    **dernier rôle connu gardé 15 min au plus** (D10), puis `UNAVAILABLE`. Un 401/403 n'est jamais
    une panne (aucun repli sur l'ancien rôle).
  - `LEGACY_SHARED_ORG_SLUGS = ["dartsopen", "billetasso"]` (`lib/auth/legacyOrganizations.ts`, module
    pur importable par `lib/db` et les scripts) : ces organisations partagées ne donnent **jamais** de
    droits (ni comme organisation d'un tournoi, ni comme organisation courante), même si l'UUID correspond.
  - `getCurrentOrganization()` — cookie `do_current_org` (préférence httpOnly, toujours revérifiée
    parmi les vraies appartenances), sinon l'unique vraie organisation, sinon aucune (compte hérité)
    ou sélecteur si plusieurs (`needsSelection`).
  - `getTournamentAccess(id)` → `OK {tournament, canManage, via, staleRole}` / `NOT_FOUND` /
    `UNAUTHENTICATED` / `ROLE_UNAVAILABLE`. Tournoi avec organisation ⇒ rôle dans l'organisation
    **du tournoi** (pas l'organisation courante) ; non-membre ⇒ 404 indiscernable d'un tournoi
    inexistant. Sans organisation ⇒ **repli créateur** (droits complets), journalisé
    `[organizationAccess] repli créateur … tournoi=<id>` (aucune donnée personnelle), sans appel à
    `/api/me/organizations`.
  - `requireTournamentReader(id)` (pages) : non connecté ⇒ SSO, pas d'accès ⇒ `notFound()`, rôle
    invérifiable depuis plus de 15 min ⇒ `/tournaments?access=unavailable` (message D10). Un tournoi
    d'organisation n'est alors plus consultable (appartenance improuvable) ; les tournois hérités restent accessibles.
  - `requireTournamentManager(id)` (**toutes** les Server Actions de gestion) : throws Next.js pour
    non connecté / pas d'accès (**ne jamais les envelopper dans un `.catch()`**) et **refus retourné**
    `{ ok: false, error }` traduit pour un MEMBER (`orgAccess.managerRequired`) ou un rôle
    invérifiable (`orgAccess.roleUnavailable`) — une erreur levée dans une Server Action perd son
    message en production. Motif : `const guard = await requireTournamentManager(id); if (!guard.ok) return { error: guard.error };`.
  - `isTournamentManager(id)` : voie organisateur de `authorizeScoring` (`lib/actions/fieldAccess.ts`) ;
    un MEMBER retombe sur la session terrain comme n'importe quel appareil.
- **Actions gardées** : `tournament.ts` (modification, statut, manches, confirmation de crédit),
  `admin.ts` (arbitrage), `bracket.ts`, `quickTournament.ts`, `pool.ts`, `player.ts` (dont
  **`addPlayer`**, ajout manuel PAID sans paiement, qui n'avait aucune garde avant L6),
  `tournamentOps.ts`, `fieldReferee.ts` (**accès arbitre : OWNER/ADMIN, D7**), voie organisateur du
  score. Inchangés : saisie de score publique (`proposeWinner`/`confirmWinner`/`disputeResult`),
  sessions terrain joueur/arbitre, inscription publique (`createRegistration`). Helpers internes
  `doAdvanceToNextRound`/`doAdvanceQuickTournament` toujours protégés par leurs appelants.
- **Pages** `(dashboard)/tournaments/[id]/**` : lecture pour tout rôle ; `canManage` masque les
  boutons de gestion (statut, édition, manches, joueurs, poules, bracket — y compris la génération
  automatique à l'affichage —, arbitrage, accès arbitre, scoring, incidents) et affiche
  `ReadOnlyNotice`. Les états paiement/crédits ne sont chargés que pour un gestionnaire.
- **Création** (`createTournament` → `resolveTournamentCreationTarget()`) : dans l'organisation
  courante si OWNER/ADMIN (`organizationId`/`organizationSlug` renseignés) ; MEMBER ⇒ refus ;
  plusieurs organisations sans choix ⇒ refus (choisir dans le sélecteur) ; aucune vraie organisation
  ⇒ création sans organisation tant que **`LEGACY_CREATION_WITHOUT_ORGANIZATION_ALLOWED`** vaut
  `true` (D3 : Alan annoncera la date de fin ; ce jour-là, passer ce seul drapeau à `false`).
- **Listes** (`dbListTournaments(scope)` / `dbListAllTournaments(scope)`, `scope = { userId,
  organization }` issu de `getCurrentOrganization()`) : organisation courante (tout rôle) + tournois
  hérités créés par l'utilisateur ; `is_mine` remplacé par `can_manage` (+ `can_view` au tableau de
  bord : lien vers la gestion ou vers la vue publique). Pastille « Lecture seule » pour un MEMBER.
- **Sélecteur** `components/layout/OrganizationSelector.tsx` (charte §10.1 : organisation active,
  nom tronqué 160/240 px dans le header dès 768 px, première information du drawer mobile en
  dessous) ; `selectCurrentOrganization` (`lib/actions/currentOrganization.ts`) revérifie l'id.
- **Paiement en ligne et crédits (L7, BUG-4)** : résolus par l'organisation du tournoi (garde,
  affichage, checkout d'inscription, création/modification/relance de crédit), par l'organisation
  courante à la création, et par la liaison locale du créateur uniquement pour un tournoi sans
  organisation (`lib/organizations/billingOrganization.ts`, voir « Inscriptions et paiement »).
  Pages `tournaments/[id]`, `tournaments/new` (liens BSsite compris) et Paramètres alignées ;
  `scripts/audit-online-payment-consistency.ts` suit la même règle. La création résout sa cible
  AVANT les contrôles paiement/crédits ; la page de création affiche d'emblée le motif d'un refus.
- **Rappel de clôture (L7, D6)** : envoyé à tous les OWNER/ADMIN de l'organisation du tournoi
  (`send-to-organization`), au créateur seul pour un tournoi sans organisation (voir « Purge des
  tournois jamais terminés »).
- **Reste après L7 (code)** : rattachement des tournois sans organisation (règle de rattachement à
  arrêter par Alan, simulation d'abord — aucun script fourni à ce stade) ; lot **L8** (feu vert
  d'Alan) : suppression de la table locale `Organization`, de `lib/actions/organization.ts` et de
  la liaison de la page Paramètres, une fois tous les tournois rattachés.
- **Tests** : `lib/auth/organizationAccess.test.ts` (matrice des rôles, exclusion héritée, repli
  créateur, cache 60 s / 15 min, 401, cible de création), `lib/auth/organizationAccess.db.test.ts`
  (vrai PostgreSQL, base jetable : OWNER/ADMIN/MEMBER/extérieur/compte hérité sur `addRound`,
  `addPlayer`, `generateRefereeAccess`, `authorizeScoring`, listes),
  `components/layout/OrganizationSelector.test.tsx`, `app/(dashboard)/layout.test.tsx` ; L7 :
  `lib/organizations/billingOrganization.test.ts`, `lib/payments/onlinePaymentGuard.test.ts`,
  `lib/entitlements/tournamentSizeGuard.test.ts`, `lib/actions/tournament.test.ts`,
  `lib/actions/registration.test.ts`, `app/(dashboard)/settings/page.test.tsx`,
  `app/(dashboard)/tournaments/new/page.test.tsx`.

### Autres règles d'accès

- **Saisie de score publique** (`proposeWinner`/`confirmWinner`/`disputeResult`, `lib/actions/score.ts`) — un joueur n'a pas de compte SterPlatform dédié (inscription par nom/e-mail uniquement, aucun `Registration.userId`). L'autorisation (`lib/actions/scoreAuthorization.ts::loadMatchSetChain`/`resolveAuthorizedSide`, SEC-001) recharge le set → match → tournoi réel côté serveur, rejette tout `matchSetId` dont le tournoi réel ne correspond pas au `tournamentId` transmis, puis fait correspondre l'e-mail de l'utilisateur authentifié à `Registration.playerEmail` (côté 1 ou 2) — jamais au `playerSide` déclaré par le client. `markWinnerDirect` (mode traditionnel, protégé par `authorizeScoring` : gestionnaire ou session terrain) réutilise `loadMatchSetChain` pour la même cohérence d'identifiants, sans changement de son modèle d'autorisation (organisateur uniquement).
- Les sous-ressources (`round`, `registration`, `match`) sont scopées par `tournamentId` côté DB (`deleteMany`/`updateMany` avec `where` composé) pour empêcher la substitution d'un identifiant appartenant à un autre tournoi
- Transitions de statut validées côté serveur par `lib/utils/tournamentStatus.ts` (`DRAFT → OPEN → IN_PROGRESS → FINISHED`, séquentiel, `FINISHED` terminal), appliqué dans `dbUpdateTournamentStatus`
- Clôture automatique en fin de tournoi (mode standard et mode rapide) : voir « Garde-fous »

## Incidents terrain

Mécanisme unique — jamais un système de tickets générique — pour gérer deux situations
terrain : joueur absent (forfait) et résultat contesté. Repose entièrement sur le modèle
d'autorisation déjà établi par DO-FIELD-ACCESS (`authorizeScoring`, `lib/actions/
fieldAccess.ts`) : organisateur OU session terrain PLAYER/REFEREE liée strictement au match.
Un arbitre (session REFEREE, `FieldRefereeGrant`) n'a autorité que sur le match précis pour
lequel sa session a été émise — jamais sur un autre match, jamais un droit organisateur.

- **Modèle** (`FieldIncident`, `prisma/schema.prisma`) — `type` (`PLAYER_ABSENT` /
  `RESULT_DISPUTED` / `OTHER`), `status` (`OPEN` / `RESOLVED`), `reportedBy` (`PLAYER` /
  `REFEREE` / `ORGANIZER`), commentaire court facultatif. Ne stocke jamais le token terrain.
  Un index unique partiel manuscrit (`field_incidents_open_dedup`, migration SQL) garantit au
  plus un incident `OPEN` par `(match, type)` — un double-clic/retry ne crée jamais de doublon,
  y compris sous concurrence réelle. `Match.forfeitedPlayerId` trace explicitement une victoire
  par forfait, pour que l'historique ne la confonde jamais avec un résultat sportif normal.
- **`reportFieldIncident`** (`lib/actions/fieldIncident.ts`) — "Appeler l'organisation",
  accessible aux trois profils, ne modifie jamais un résultat sportif : crée uniquement un
  incident `OPEN`.
- **`declareForfeit`** — réservé à l'organisateur et à l'arbitre du match (jamais un joueur).
  Délègue à `dbDeclareForfeit` (`lib/db/tournament.ts`), qui décide les manches encore
  indécises en faveur de l'adversaire puis réutilise `tryFinalizeMatch` (même primitive que
  `markWinnerDirect`/`dbArbitrateMatch`) pour la libération de cible et la progression —
  jamais un second moteur. Idempotent (rejeu du même forfait sur un match déjà décidé par lui
  → succès sans nouvelle progression).
- **Mode rapide** (DO-FIELD-INCIDENT-002, décision Product Owner) — un forfait équivaut à une
  défaite normale : `dbDeclareForfeit` ne traite jamais le mode rapide différemment (même code
  que standard) ; c'est `declareForfeit` (`lib/actions/fieldIncident.ts`) qui, une fois le
  match finalisé, déclenche `doAdvanceQuickTournament()` si `match.quickMode` — exactement la
  même bifurcation externe que `markWinnerDirect`/`arbitrateMatch`, jamais une troisième
  implémentation. Seul `doAdvanceQuickTournamentTx` décrémente une vie
  (`dbDecrementLives`) et fait progresser le bracket rapide (WB/LB, Grande Finale, clôture) —
  un seul chemin de vérité pour la perte de vie, jamais dupliqué dans `dbDeclareForfeit`.
  Idempotence garantie par `Match.forfeitedPlayerId` (rejeu) et `Match.quickAdvanceProcessedAt`
  (garde déjà existante contre une double perte de vie).
- **Résolution d'un résultat contesté** — aucune action dédiée : l'arbitre réutilise
  `markWinnerDirect` (déjà accessible en session REFEREE), l'organisateur réutilise
  l'arbitrage existant (`arbitrateMatch`/`ArbitrateMatchModal`, inchangés). `verifyFieldToken`
  refuse déjà toute session dont le match n'est plus `IN_PROGRESS` : un résultat déjà propagé
  est donc automatiquement protégé contre une session REFEREE, sans code supplémentaire.
- **Auto-résolution paresseuse** (`dbListFieldIncidents`, `lib/db/fieldIncident.ts`) — un
  incident sportif (`PLAYER_ABSENT`/`RESULT_DISPUTED`) encore `OPEN` dont le match a désormais
  un vainqueur réel est marqué `RESOLVED` à la lecture, quel que soit le mécanisme qui a
  tranché (forfait, arbitrage organisateur, désignation directe) — jamais recalculée par
  chaque chemin de résolution séparément. Un incident `OTHER` ne s'auto-résout jamais : seule
  `resolveOtherIncident` (organisateur/arbitre) le fait, sans mutation sportive.
- **Pilotage** (`app/(dashboard)/tournaments/[id]/pilotage/page.tsx`) — section "Interventions
  demandées" listant les incidents `OPEN` (`FieldIncidentCard`, `components/ops/`), avec
  action dédiée par type : forfait (`ForfeitControl`, partagé avec le terrain), lien vers
  l'arbitrage existant, ou résolution manuelle. Alimentée par `loadTournamentConsoleData` →
  `dbListFieldIncidents`, rafraîchie par le même mécanisme Mercure/polling que le reste de la
  console (`ConsoleAutoRefresh`) — aucune infrastructure temps réel nouvelle.
- **Terrain** (`components/tournament/ScoreForm.tsx`) — `CallOrganizerButton` (tous profils) et
  `ForfeitControl` (organisateur/arbitre uniquement) rendus une seule fois au niveau du
  wrapper, communs aux modes de saisie traditionnel et électronique.

## Garde-fous contre les états cassés et les pertes de données

- **Clôture automatique** : en mode standard, `doAdvanceToNextRound` (`lib/actions/bracket.ts`) passe le tournoi en `FINISHED` dès que le dernier match du bracket est joué (`bracketMatches.length === 1`), sans action manuelle de l'organisateur — miroir exact du comportement déjà en place en mode rapide (`doAdvanceQuickTournament`). Le classement (`lib/db/ranking.ts`, filtré sur `status: "FINISHED"`) est donc alimenté automatiquement. La transition manuelle *"Clôturer le tournoi"* (`TournamentStatusButton`) reste disponible en secours et exige désormais une confirmation explicite (case à cocher) car elle coupe immédiatement la saisie des scores en cours.

- **Manche obligatoire avant ouverture** : `dbUpdateTournamentStatus` refuse la transition vers `OPEN` si le tournoi n'est pas en mode rapide et n'a aucune manche (`rounds.length === 0`) — sans manche, aucun `MatchSet` n'est créé et un match ne peut jamais passer en `FINISHED`. Le mode rapide est exempté : ses manches (501/Cricket/701) sont générées automatiquement par `generateQuickBracket`. En complément, `deleteRound` refuse toute suppression de manche hors statut `DRAFT`, pour garantir qu'un tournoi qui a passé la porte `OPEN` ne peut plus revenir à 0 manche.
- **Arbitrage destructeur** : en mode standard, corriger un match de bracket dont le vainqueur change supprime les matchs des tours suivants déjà générés (`dbArbitrateMatch`). `ArbitrateMatchModal` calcule ce risque côté client (`laterMatchesCount`, transmis par `BracketView`) et bloque le bouton de validation tant qu'une case à cocher explicite n'a pas été confirmée. Les matchs de poule (`bracket_round` null) et le mode rapide (jamais destructeur) ne sont pas concernés.
- **Régénération des poules** : `generatePools` refuse la régénération dès qu'au moins un match de poule est `FINISHED` (contrôle serveur, dans l'action). Tant qu'aucun match n'est terminé, `GeneratePoolsButton` affiche un avertissement et exige une case à cocher avant de permettre la régénération (poules + matchs existants supprimés, joueurs redistribués aléatoirement).

## Inscriptions et paiement

- `lib/actions/registration.ts` (`createRegistration`) — inscription publique. Tournoi
  gratuit (`entry_fee === 0`) : confirmée immédiatement (`status: "PAID"`), email envoyé,
  aucun paiement. Tournoi payant : DartsOpen ne dialogue **jamais** directement avec Stripe —
  la session de paiement est créée côté SterPlatform via
  `lib/api/sterplatformInternal.ts::createPaymentCheckout`
  (`POST /api/internal/organizations/{slug}/payments/checkout`), qui encaisse **directement sur
  le compte Stripe de l'organisation du tournoi** (ADR-0021 / L7 ; repli : liaison locale du
  créateur pour un tournoi sans organisation — voir le point suivant).
- **Qui encaisse quoi (ADR-0022)** : BApps ne touche jamais l'argent des inscriptions — session
  créée par SterPlatform sur le compte connecté de l'organisation (*direct charge*), `payee`
  absent = `ORGANIZATION` (défaut SterPlatform, jamais `PLATFORM` ici : test dans
  `lib/api/sterplatformInternal.test.ts`), aucune commission (`PLATFORM_FEE_CENTS = 0`, garde-fou
  `lib/platformFee.test.ts`). Les **crédits tournoi** et l'**abonnement** DartsOpen ne passent
  pas par DartsOpen : achetés sur BSsite (`/dashboard/organisations/{slug}/credits/dartsopen`,
  `/abonnement/dartsopen`), session Stripe créée par SterPlatform sur le compte Stripe de
  **BApps** (`TournamentCreditService`/Billing, webhook plateforme) ; DartsOpen ne fait que
  consommer/lire les crédits (`lib/api/tournamentCredits.ts`). CGU : textes
  `legal.terms.fees.*` / `legal.terms.payment.*` (`lib/i18n/catalogs.ts`).
- **Organisation qui encaisse et porte les droits** (`lib/organizations/billingOrganization.ts`,
  L7) — règle unique pour Stripe Connect, abonnement et crédits tournoi : organisation du tournoi
  (`effectiveOrganizationId`), organisation courante retenue par `resolveTournamentCreationTarget()`
  à la création, sinon repli sur la liaison locale du créateur (tournoi sans organisation ou
  rattaché à une organisation héritée partagée ; création sans organisation tant que D3 le
  permet). Slug relu par UUID dans `getMyMemberships()` quand un JWT est disponible (le staff peut
  renommer un slug dans EasyAdmin), slug enregistré sur le tournoi sinon (inscription publique).
  Une erreur de lecture de la liaison locale lève un message clair, jamais « aucune organisation ».
- **Liaison organisation (repli, suppression au lot L8)** (`lib/actions/organization.ts`,
  `Organization.sterOrganizationSlug` en base) — ne sert plus qu'aux tournois sans organisation
  et aux comptes sans vraie organisation ; le slug soumis est toujours revérifié côté serveur
  contre `GET /api/me/organizations` (rôle OWNER/ADMIN requis). Page Paramètres
  (`app/(dashboard)/settings/page.tsx`) : d'abord l'état Stripe Connect de l'**organisation
  courante** (sans « Délier » : on en change avec le sélecteur), puis la liaison locale, titrée
  « Tournois créés sans organisation » dès qu'une vraie organisation existe ; statut via
  `getPaymentAuthorization` (JWT, même endpoint que BSsite) et lien vers la page Stripe Connect
  de l'organisation dans BSsite (`NEXT_PUBLIC_BSSITE_URL`).
- **Garde-fou paiement en ligne** (`lib/payments/onlinePaymentGuard.ts`, DO-PAYMENT-GUARD-001)
  — **le paiement en ligne est disponible uniquement pour une organisation disposant de
  Stripe Connect opérationnel** (`canReceivePayments` via `getStripeConnectStatus`, jamais
  déduit de la seule présence d'un `stripeAccountId`). Vérifié à trois niveaux indépendants
  (défense en profondeur) : `lib/actions/tournament.ts` (`createTournament`/
  `updateTournament`, avant toute écriture — aucun tournoi ne peut être créé ou modifié en
  paiement en ligne sans Stripe opérationnel), `lib/actions/registration.ts`
  (`createRegistration`, juste avant l'appel à `createPaymentCheckout` — une suspension
  Stripe après coup bloque immédiatement les nouveaux paiements, même sur un tournoi déjà
  configuré), et l'interface (`TournamentForm`/`EditTournamentForm`, champ des droits
  d'inscription désactivé + lien vers la page Stripe Connect de l'organisation dans BSsite
  quand Stripe n'est pas opérationnel). Ne s'applique qu'à `registration_mode = ONLINE` avec
  `entry_fee > 0` — un tournoi ONLINE gratuit ou un tournoi ONSITE (quel que soit son
  `entry_fee`, jamais transmis à Stripe) ne nécessite aucun Stripe.
- **Webhook entrant** (`app/api/webhooks/sterplatform-payments/route.ts`) : reçoit les notifications de paiement signées par SterPlatform
  (`X-SterPlatform-Signature`, HMAC-SHA256 avec `STER_PAYMENTS_CALLBACK_SECRET`). Sur
  `payment.succeeded`, appelle `dbConfirmPendingPayment()` (jamais un `UPDATE` aveugle — voir
  "Capacité, paiement tardif et remboursement" ci-dessous) : `CONFIRMED` → email de
  confirmation ; `ALREADY_CONFIRMED`/`NOT_FOUND`/`ALREADY_REFUNDED` → no-op silencieux
  (redélivraison ou état déjà terminal) ; `REFUND_NEEDED`/`REFUND_IN_PROGRESS` → tentative de
  remboursement via `refundPayment()` (`lib/api/sterplatformInternal.ts`,
  `POST /api/internal/payments/{id}/refund`, ciblé par le `paymentId` du webhook lui-même —
  jamais uniquement la copie locale `ster_payment_id`), un échec renvoyant un statut non-2xx
  pour permettre une redélivraison ultérieure. Sur `payment.refunded` **et** `payment.refund_failed`
  (F13), relit l'état réel du paiement puis fait converger l'inscription (voir « Issue d'un
  remboursement » ci-dessous) ; `payment.refund.succeeded`/`payment.refund.failed` (portions)
  sont ignorés explicitement (200) : DartsOpen ne rembourse jamais par portion.
- `PLATFORM_FEE_CENTS` (`lib/platformFee.ts`) — reste une décision métier propre à DartsOpen
  (transmise en paramètre `platformFeeCents` à l'appel de checkout, jamais calculée côté
  SterPlatform, qui reste générique entre modules).
- `Tournament.entryFee` et `registration_mode` (ONLINE/ONSITE) inchangés en base.

### Capacité, paiement tardif et remboursement (DARTSOPEN-MONETIZATION-003/004, contre-audit P1/P3/P4)

`dbReserveRegistrationSlot()` (verrou + comptage + insertion atomiques, voir mission
DARTSOPEN-MONETIZATION-002) réserve la place à la création de l'inscription. Elle relit
`status`/`maxPlayers`/`playersPerTeam` du tournoi **sous le même verrou** (jamais une valeur lue
par l'appelant avant un appel réseau, ex. le statut Stripe Connect) et n'accepte que si le
tournoi est encore dans un statut autorisé par l'appelant (`allowedStatuses` — `["OPEN"]` pour
l'inscription publique, `["DRAFT","OPEN"]` pour l'ajout organisateur). Règle de capacité :
`(occupied + 1) * playersPerTeam <= maxPlayers` (jamais `occupied * playersPerTeam < maxPlayers`,
qui laissait passer une équipe de trop quand `maxPlayers` n'est pas un multiple de
`playersPerTeam`).

**Inscription publique (F17/F18, audit du 04/10/2026)** — `createRegistration()` passe
`{ publicRegistration: true }` : sous le même verrou, `dbReserveRegistrationSlot()` refuse
`ONLINE_REGISTRATION_DISABLED` si `registrationMode` n'est pas `ONLINE` (la page publique masque le
formulaire, mais une Server Action s'appelle directement) et `INVALID_TEAM_SIZE` si le nombre de
noms n'est pas exactement `playersPerTeam` (relu sous verrou). Le schéma borne le tableau à 10 noms
(borne de `players_per_team` à la création). L'ajout organisateur (`addPlayer`) n'est pas concerné.
Avant toute lecture, l'action applique une limite propre (`checkRateLimit`, clé
`registration:<IP>:<tournoi>`, 10 tentatives / 10 min, valides ou non ; fail-open si la table est
indisponible) en plus de la limite générale du proxy sur `/t/`. Messages `registration.*` FR/EN/ES.
Tests : `lib/actions/registration.test.ts`, `lib/db/registrationGuards.db.test.ts` (vrai PostgreSQL).

Mais un paiement en ligne peut arriver **après** l'expiration de sa réservation (place reprise
par quelqu'un d'autre) ou **après** le démarrage du tournoi (`IN_PROGRESS`) — `dbConfirmPendingPayment()`
(`lib/db/tournament.ts`) est le seul point qui peut faire passer une inscription PENDING → PAID
sur réception du webhook : verrouille le tournoi, relit la réservation et le tournoi sous ce
verrou, et ne confirme que si la réservation est encore valide **et** le tournoi encore `OPEN`
(ou, réservation expirée, si la capacité re-vérifiée reste disponible). Si l'une de ces
conditions manque, l'inscription passe `REFUND_PENDING` — jamais `REFUNDED` directement.

**`REFUND_PENDING` vs `REFUNDED`** (DARTSOPEN-MONETIZATION-004, P1) — un remboursement décidé
n'est jamais supposé terminé avant confirmation financière réelle : `REFUND_PENDING` signifie
« remboursement nécessaire/en cours », `REFUNDED` signifie « confirmé par SterPlatform ». Seule
`dbMarkRefundConfirmed()` (idempotente) transitionne vers `REFUNDED`, appelée soit
immédiatement après un `refundPayment()` synchrone confirmé (`RefundOutcome` `REFUNDED` ou
`ALREADY_REFUNDED` — ce dernier couvrant le 409 « déjà remboursé », distingué du 409 « non
remboursable » par une relecture explicite du paiement via `getPayment()`, jamais par le
message d'erreur), soit plus tard par le webhook `payment.refunded` (remboursement Stripe
resté asynchrone). Un échec de `refundPayment()` (réseau, timeout, 5xx, Stripe indisponible)
laisse l'inscription `REFUND_PENDING` et fait répondre le webhook par un statut non-2xx — le
mécanisme de retry est la file de notifications sortantes déjà existante côté SterPlatform
(Module Payments, `PaymentNotificationService`, backoff jusqu'à 15 tentatives sur 6h ; voir
CLAUDE.md de SterPlatform) plutôt qu'une infrastructure dédiée côté DartsOpen — voir les
limites du rapport de mission pour sa portée opérationnelle réelle (dispatch non planifié en
cron aujourd'hui).

### Issue d'un remboursement : confirmation, échec, réconciliation (F13, audit du 04/10/2026)

- **Un seul point de décision** : `syncRegistrationRefund()` (`lib/payments/refundSync.ts`) relit
  `GET /api/internal/payments/{id}` (`getPayment()`) et applique la règle pure
  `decideRefundConvergence()` : paiement `REFUNDED` → `dbMarkRefundConfirmed()` ; `SUCCEEDED` +
  `refundStatus: FAILED` → `dbMarkRefundFailed()` ; `refundStatus` `PENDING`/`SUCCEEDED` → rien
  (en cours) ; `refundStatus` absent → « jamais demandé », rien ; autre `externalReference` ou
  statut inattendu → rien + avertissement ; relecture impossible → rien. Relire plutôt que croire
  l'événement rend le traitement indifférent à l'ordre et aux doublons (un vieux
  `payment.refunded` livré après un échec ne marque jamais l'inscription remboursée).
- **Webhook** (`payment.refunded`, `payment.refund_failed`) : 2xx **seulement après écriture
  durable**. Erreur base → 500 ; relecture SterPlatform impossible → 503 ; SterPlatform redélivre
  (outbox). Le chemin synchrone (`attemptRefund`) répond aussi 502 si l'écriture locale échoue
  après un remboursement réussi (la redélivraison retombe sur `ALREADY_REFUNDED`).
- **État d'échec** : `Registration.refundFailedAt` (colonne nullable `refund_failed_at`, migration
  `20261005120000_registration_refund_failed_at`), le statut restant `REFUND_PENDING` (pas de
  nouveau statut : migration additive, l'ancienne image voit un simple `REFUND_PENDING`, aucune
  incidence sur la capacité). `dbMarkRefundFailed()` est conditionnelle : `REFUND_PENDING` sans
  échec → horodaté ; déjà en échec → no-op (premier horodatage conservé) ; `REFUNDED` → revient
  `REFUND_PENDING` en échec (un remboursement d'abord réussi peut échouer ensuite, PAY-003) ;
  `PAID`/`PENDING`/`CANCELLED` → jamais touchés. `dbMarkRefundConfirmed()` efface `refundFailedAt`.
  Jamais de retour à `PAID`.
- **Aucune relance automatique** : un échec confirmé est journalisé `[ALERTE remboursement]`
  (identifiants seulement) ; `dbConfirmPendingPayment()` renvoie `REFUND_FAILED` sur une
  inscription en échec, et le webhook `payment.succeeded` ne redemande alors aucun remboursement.
- **Interface organisateur** : page Joueurs, bandeau `UnresolvedRefundsNotice` (gestionnaires
  seulement, `dbListUnresolvedRefunds()`) listant les inscriptions `REFUND_PENDING` — « en cours »
  ou « refusé le … » avec la consigne (contacter le joueur, rembourser depuis le tableau de bord
  Stripe de l'organisation). Textes `refunds.*` FR/EN/ES.
- **Réconciliation planifiée** : `npm run reconcile:refunds -- --dry-run|--apply`
  (`scripts/reconcile-refunds.ts` → `reconcilePendingRefunds()`, `lib/payments/refundReconciliation.ts`).
  Relit les `REFUND_PENDING` sans échec constaté, créées il y a plus de `--min-age-minutes` (défaut
  60), plus anciennes d'abord, au plus `--limit` (défaut 100, max 1000) par passage ; try/catch par
  inscription ; **ne demande jamais de remboursement**. Bilan : confirmés, en échec, en cours,
  jamais demandés (journalisés « décision humaine requise »), sans identifiant de paiement local,
  incohérents, illisibles, erreurs. Codes de sortie : 0 succès, 1 erreur ou paiement illisible,
  2 usage/configuration (`DATABASE_URL`, `NEXT_PUBLIC_API_URL`, `STER_API_TOKEN`).
  **Tâche Coolify à créer par Alan** (staging puis production) : Scheduled Task sur le conteneur
  DartsOpen, `npm run reconcile:refunds -- --apply`, horaire proposé `30 * * * *` (toutes les
  heures) ; lancer d'abord `-- --dry-run` à la main.
- **Points non tranchés** : (1) une inscription `REFUND_PENDING` dont le remboursement n'a jamais
  été demandé chez SterPlatform (`refundStatus` absent, notifications épuisées) est seulement
  signalée — faut-il que la réconciliation le demande ? (2) Un remboursement refusé : qui
  rembourse, et faut-il un bouton « relancer » côté organisateur ?
- **Tests** : `app/api/webhooks/sterplatform-payments/route.test.ts` (panne base → 500 puis rejeu
  200, relecture impossible → 503, doublons, ordre inversé, vieux `payment.refunded` après échec,
  portions ignorées, `REFUND_FAILED`), `lib/payments/refundSync.test.ts` (règle pure),
  `lib/payments/refundReconciliation.db.test.ts` (vrai PostgreSQL : écritures conditionnelles,
  REFUNDED → échec, lots bornés, dry-run), `scripts/reconcile-refunds.test.ts` (CLI),
  `components/tournament/UnresolvedRefundsNotice.test.tsx` (FR/EN/ES).

### Entitlement >10 joueurs : idempotence, réconciliation, état intermédiaire (DARTSOPEN-MONETIZATION-003/004, contre-audit P2/P3/P4)

- **Idempotence de création scopée par propriétaire** — `Tournament.idempotencyKey` est unique
  sur `(userId, idempotencyKey)`, jamais globalement unique : une clé soumise par un
  organisateur B ne peut jamais résoudre au tournoi d'un organisateur A (voir le docblock du
  champ, `prisma/schema.prisma`).
- **Référence de consommation de crédit dérivée du tournoi, jamais de `idempotencyKey`**
  (DARTSOPEN-MONETIZATION-004, P2) — `createTournament()`/`retryTournamentEntitlementConfirmation()`
  envoient `tournament.id` (identifiant serveur) à `consumeTournamentSizeCredit()`, jamais la
  valeur `idempotencyKey` fournie par le client. SterPlatform scope sa propre idempotence sur
  `(organisation, produit, référence)`, pas sur l'utilisateur DartsOpen appelant : deux
  organisateurs de la même organisation choisissant volontairement la même valeur
  `idempotencyKey` auraient sinon partagé une seule consommation de crédit pour deux tournois
  distincts. `tournament.id` est unique par tournoi et jamais choisi par le client.
- **Trois issues de consommation de crédit** (`lib/entitlements/tournamentSizeGuard.ts`,
  `CreditConsumptionOutcome`) — `CONFIRMED`/`REJECTED`/`INDETERMINATE`, jamais un booléen : une
  erreur réseau/timeout sur `POST .../tournament-credits/consume` n'est jamais assimilée à un
  refus métier (`REJECTED`, réservé au 409 explicite de SterPlatform). Un résultat
  `INDETERMINATE` déclenche une réconciliation en lecture seule
  (`GET .../tournament-credits/status?product=X&reference=Y`, `reconcileTournamentCredit()`)
  qui interroge SterPlatform — seule source de vérité — « cette référence a-t-elle déjà
  consommé un crédit ? », sans jamais retenter la mutation elle-même.
- **État `PENDING_ENTITLEMENT`** (`Tournament.status`) — un tournoi >10 joueurs nécessitant un
  crédit démarre dans cet état, jamais directement `DRAFT` : aucune transition définie hors de
  `dbConfirmTournamentEntitlement()` (voir `lib/utils/tournamentStatus.ts`, absent de
  `TRANSITIONS`) — ni publiable, ni ouvrable aux inscriptions, ni compté comme autorisé >10 tant
  que l'entitlement n'est pas confirmé. Sur `REJECTED`, le tournoi est supprimé
  (compensation) — mais si cette suppression échoue elle-même, le tournoi reste
  `PENDING_ENTITLEMENT` (jamais exploitable par construction, la cohérence commerciale ne
  dépend donc jamais du succès de cette seule suppression). Sur `INDETERMINATE`, le tournoi
  reste `PENDING_ENTITLEMENT` — réconciliable via une nouvelle soumission du même formulaire
  (même `idempotencyKey`, donc même tournoi retrouvé) ou via
  `retryTournamentEntitlementConfirmation()` (`RetryEntitlementButton`, page
  `/tournaments/[id]`), qui réutilise `tournamentId` (même référence que celle déjà tentée).

### Dette métier assumée : `RegistrationStatus.PAID` ne prouve pas un encaissement (DARTSOPEN-MONETIZATION-003, contre-audit P6)

`PAID` recouvre trois réalités distinctes : inscription gratuite confirmée, paiement en ligne
réellement encaissé par Stripe, paiement sur place pas encore encaissé. `feeCollected`
(`Registration`) est le champ qui distingue correctement ces cas — `true` uniquement pour un
paiement en ligne confirmé par `dbConfirmPendingPayment()`, `false` pour gratuit/sur place (voir
`lib/db/tournament.concurrency.test.ts`, describe "Sémantique PAID/feeCollected"). Aucune
logique de DartsOpen ne considère `PAID` seul comme preuve d'encaissement aujourd'hui (DartsOpen
ne calcule ni revenu ni reversement — SterPlatform gère l'argent réel). Une séparation propre
`registrationStatus`/`paymentStatus` (deux axes indépendants plutôt qu'un seul statut qui les
mélange) reste à faire si une logique financière venait un jour à dépendre de cette distinction
— non traitée ici pour rester proportionné (aucun besoin actuel ne le justifie).

## Conservation des données personnelles — purge planifiée (BAPPS-LEGAL-005 §9, RGPD-001)

- **Règle (décision PO, inchangée)** : l'email et le téléphone d'une inscription sont vidés
  (`playerEmail = ""`, `playerPhone = null`) **12 mois** (`CONTACT_RETENTION_MONTHS`,
  `lib/db/contactRetention.ts`) après la date d'un tournoi `FINISHED` (comparaison stricte
  `date < now - 12 mois`). Le nom/pseudo, les coéquipiers (`playerNames`), les résultats et les
  champs de paiement sont conservés — classement inter-tournois. Un tournoi jamais passé
  `FINISHED` n'est pas concerné.
- **Déclenchement** : `purgeExpiredContacts()` — balayage **global** (tous organisateurs),
  paginé par curseur sur `Tournament.id` (100 tournois/lot par défaut), idempotent (le filtre ne
  retient que les inscriptions portant encore une coordonnée), un lot en échec est journalisé et
  compté sans bloquer les suivants. Avant RGPD-001, la purge était déclenchée de façon
  opportuniste par la visite de `/tournaments` (promesse non attendue, organisateur par
  organisateur) : un organisateur qui ne revenait jamais ne voyait jamais ses données purgées.
  Ce déclenchement a été retiré de la page.
- **Script** : `scripts/purge-expired-contacts.ts` — un mode explicite est obligatoire
  (sans flag : refus, code 2) :
  - `npm run purge:expired-contacts -- --dry-run` : comptage seul, aucune écriture ;
  - `npm run purge:expired-contacts -- --apply` : purge réelle ;
  - option `--batch-size=N`. Sortie : cible (hôte/base, sans identifiants), seuil, compteurs.
    Codes de sortie : 0 succès, 1 lot en échec/erreur inattendue, 2 usage/config invalide.
- **Planification** : aucun scheduler dans l'application — Coolify Scheduled Task sur le
  conteneur DartsOpen (staging puis production), commande `npm run purge:expired-contacts -- --apply`,
  une fois par jour. L'image de production embarque `scripts/`, `lib/` (copié en entier pour
  ce script), `tsconfig.json` (alias `@/`) et `tsx` (via `node_modules` complet de l'étape deps).
- **Tests** : `lib/db/contactRetention.db.test.ts` (vrai PostgreSQL : frontière de date,
  organisateur jamais revenu, idempotence, dry-run sans écriture, données non concernées
  intactes, pagination), `lib/db/contactRetention.test.ts` (lot en échec, taille de lot
  invalide), `scripts/purge-expired-contacts.test.ts` (CLI réel : codes de sortie).

## Purge des tournois jamais terminés (DO-UNFINISHED-PURGE-001, décision Alan 30/09/2026)

- **Règle** : un tournoi dont le statut n'est pas `FINISHED` (seul statut terminal de
  `TournamentStatus` ; il n'existe pas de statut « annulé » — `PENDING_ENTITLEMENT`, `DRAFT`,
  `OPEN`, `IN_PROGRESS` sont donc tous concernés) et dont la `date` est passée :
  1. **J+1** (dès 00:00 UTC le lendemain de `date`, `@db.Date`) : rappel aux OWNER/ADMIN de
     l'organisation du tournoi (au créateur seul pour un tournoi sans organisation, L7) « clôturez le
     tournoi, sinon ses données seront supprimées sous 48 h » ; `Tournament.closeReminderSentAt`
     est posé **après** succès de l'envoi, sous `withTournamentLock`, seulement si le tournoi a
     encore besoin d'un rappel (conditionnel + idempotent : un seul envoi par tournoi) ;
  2. **48 h après ce rappel** (au plus tôt J+3 ; avec une tâche quotidienne, J+3 ou J+4 selon la
     seconde exacte de démarrage) : si toujours pas `FINISHED`, suppression du tournoi et de tout
     ce qui en dépend, via `deleteTournamentTreeTx` (même ordre que `dbDeleteTournament`, imposé
     par les FK RESTRICT `matches.player1_id`, `match_sets.round_id`, `match_set_throws.player_id`).
  La condition est revérifiée sous verrou dans la transaction de suppression (clôture concurrente
  → épargné). Jamais de suppression sans rappel envoyé (seule exception : règle 3) : échec d'email ⇒ pas d'horodatage ⇒ pas de
  suppression. Un rappel n'est valable que s'il est postérieur à J+1 de la date **courante** : un
  tournoi reporté après un rappel reçoit un nouveau rappel, jamais une suppression immédiate.
  3. **Seule exception — créateur introuvable** (complément décidé par Alan le 30/09/2026) : si
     SterPlatform répond 404 `USER_NOT_FOUND` (créateur supprimé ou membre d'aucune organisation
     où DARTSOPEN est actif), le rappel ne peut pas partir. Le premier constat est horodaté sous
     verrou (`Tournament.closeReminderRecipientNotFoundAt`, valable seulement s'il est postérieur à
     J+1 de la date courante — report ⇒ cycle neuf), le rappel est retenté à chaque passage, et au
     premier passage **à partir de J+1 00:00 UTC + 48 h** (tournoi du 14 → dès le 17 00:00 UTC,
     donc le passage de 04:00 du 17) le rappel est retenté une dernière fois : 404 `USER_NOT_FOUND`
     reconfirmé ⇒ suppression **sans email** (même revérification sous verrou, action
     `DELETE_IF_RECIPIENT_STILL_NOT_FOUND`) ; rappel parti ⇒ cycle normal de 48 h ; toute autre
     issue ⇒ rien. Aucun autre échec (5xx, réseau, 400, 401/403, template absent, variable
     manquante) ne pose cet horodatage ni n'autorise de suppression : on ne supprime jamais parce
     que SterPlatform était en panne ou mal configuré. Un 404 `USER_NOT_FOUND` implique un jeton
     accepté (sinon 401/403), donc le bon SterPlatform.
- **Code** : `lib/db/unfinishedTournamentPurge.ts` (`classifyUnfinishedTournament` = règle pure
  partagée par le balayage et les deux revérifications), `lib/tournament/closeReminderNotifier.ts`
  (port d'envoi), `scripts/purge-unfinished-tournaments.ts` (CLI). Script distinct de
  `purge:expired-contacts` : effets externes (emails), suppression de tournois entiers, et
  activable indépendamment dans Coolify (la purge RGPD ne doit jamais échouer à cause des rappels).
- **Commande** : `npm run purge:unfinished-tournaments -- --dry-run|--apply` (`--batch-size=N`).
  Journal par tournoi (id, date, statut, compteurs de lignes — jamais de nom ni de coordonnées),
  try/catch par tournoi. Le bilan distingue « supprimé(s) après rappel » et « supprimé(s) sans
  rappel (créateur introuvable) » (`deletedAfterReminder` / `deletedWithoutReminder`, total
  `deleted`) ; en dry-run, « suppression(s) sans rappel si le créateur est toujours introuvable »
  (aucun envoi en dry-run, le 404 n'y est donc pas reconfirmé).
  Codes de sortie : 0 succès (créateurs introuvables et suppressions sans rappel inclus), 1 au moins un
  rappel ou une suppression en échec, 2 usage invalide ou configuration manquante/rejetée. Planification
  recommandée : Coolify Scheduled Task quotidienne `0 4 * * *` (UTC),
  `npm run purge:unfinished-tournaments -- --apply`.
- **Destinataires (ADR-0021 D6, lot L7)** : tournoi rattaché à une vraie organisation
  (`effectiveOrganizationId`) ⇒ `POST {NEXT_PUBLIC_API_URL}/api/email/send-to-organization`
  (`sendEmailToOrganization()`, même client, même jeton de module, même contrat que BilletAsso)
  avec `organizationId` = `Tournament.organizationId` : SterPlatform écrit à tous ses OWNER/ADMIN
  actifs. Mêmes template et variables. Issues : 200 `{"sent":true}` → rappel horodaté ; 401/403 →
  erreur de configuration (code 2) ; **404 `ORGANIZATION_NOT_FOUND` (organisation disparue) et 422
  `NO_RECIPIENT` (aucun OWNER/ADMIN actif) → « destinataire introuvable »**, exactement comme le
  404 `USER_NOT_FOUND` d'un créateur : constat horodaté puis suppression sans rappel à l'échéance
  (décision d'Alan du 01/10/2026) ; 404 `TEMPLATE_NOT_FOUND` → erreur de configuration (code 2) ;
  404 sans code (SterPlatform antérieur, cause ambiguë) → échec (code 1), jamais une suppression ;
  400/5xx/réseau → échec. Tournoi sans organisation (ou organisation héritée partagée) ⇒ comportement ci-dessous
  inchangé (créateur via `send-to-user`, règle 3). Le dry-run indique la nature des destinataires.
- **Envoi du rappel au créateur (branché le 30/09/2026 ; depuis L7, tournois sans organisation
  seulement)** : `createCloseReminderNotifier()` appelle
  `POST {NEXT_PUBLIC_API_URL}/api/email/send-to-user` (SterPlatform, EMAIL-SCOPE-001) via
  `sendEmailToUser()` de `lib/api/sterplatformInternal.ts` — même client et même jeton de module
  (`X-App-Token: STER_API_TOKEN`, = `SERVER_AUTH_TOKEN_DARTSOPEN` côté SterPlatform ; le jeton
  legacy `APP_TOKEN` est refusé en 403 sur cet endpoint). Corps : template
  `dartsopen_tournament_close_reminder`, `userId` = `Tournament.userId` (= `id` UUID renvoyé par
  `/api/auth/me` à la création, jamais l'email : SterPlatform le résout et ne le renvoie pas),
  variables `tournamentName`, `tournamentDate` (« 30 septembre 2026 », date calendaire),
  `deletionDate` (envoi + 48 h, heure de Paris : « 3 octobre 2026 à 06:00 » — le template dit
  « Clôturez-le avant le … » : aucune suppression avant cet instant, éventuellement plus tard
  puisque la tâche passe une fois par jour), `tournamentUrl` = `{NEXT_PUBLIC_APP_URL}/tournaments/{id}`
  (page d'administration portant « Clôturer le tournoi »). Template FR uniquement (`User` n'a pas
  de langue préférée). Aucune nouvelle variable d'environnement ; la tâche a besoin au runtime de
  `DATABASE_URL`, `NEXT_PUBLIC_API_URL`, `STER_API_TOKEN` et `NEXT_PUBLIC_APP_URL` (sans repli
  `localhost` : variable absente ⇒ notifier indisponible, aucun rappel).
  **Sûreté** : `closeReminderSentAt` n'est posé QUE sur un 200 `{"sent":true}`. Toute autre issue
  laisse le tournoi sans rappel et il est retenté au passage suivant :
  - 404 `USER_NOT_FOUND` (créateur supprimé ou membre d'aucune organisation où DARTSOPEN est
    actif) → compté « créateur introuvable », constat horodaté (`closeReminderRecipientNotFoundAt`),
    journalisé par id de tournoi (jamais nom/email), **ne fait pas échouer** la tâche ; à partir de
    J+1 00:00 UTC + 48 h, s'il est reconfirmé, suppression sans rappel (règle 3 ci-dessus) ;
  - 5xx, réseau, 400, 200 sans `sent: true` → « rappel en échec », code de sortie 1 ;
  - 401/403, 404 sans `USER_NOT_FOUND` (template non seedé), variable manquante → **erreur de
    configuration** : plus aucun envoi tenté pendant ce passage (N refus identiques n'apportent
    rien et polluent les journaux de sécurité SterPlatform), mais les suppressions déjà dues
    continuent (elles reposent sur des rappels réellement envoyés avant) ; code de sortie **2**,
    visible dans Coolify.
- **Tâche Coolify à créer par Alan** (staging puis production, après déploiement de ce code et de
  SterPlatform avec le template seedé) : Scheduled Task sur le conteneur DartsOpen, commande
  `npm run purge:unfinished-tournaments -- --apply`, horaire proposé `0 4 * * *` (UTC, 05:00/06:00
  à Paris — après la purge RGPD de 03:00). Lancer d'abord `-- --dry-run` à la main pour relire la
  liste. Les inscriptions payées en ligne sont supprimées sans attendre de remboursement (décision
  Alan : le remboursement relève de l'association organisatrice).
- **CGU** (`app/(public)/cgu/page.tsx`, section « Annulation et remboursement », mise à jour du
  30/09/2026) : remboursement d'un tournoi annulé ou qui n'a pas lieu = association organisatrice,
  seule bénéficiaire des sommes encaissées ; tournoi non clôturé supprimé avec toutes ses données
  à partir de 48 h après le lendemain de sa date, après un rappel lorsque l'organisateur peut être
  joint. Toute évolution de cette règle doit mettre à jour ce texte (clés
  `legal.terms.cancellation.*` de `lib/i18n/catalogs.ts`, FR/EN/ES) et la date `updatedAt`.
- **Données hors base non supprimées** (DartsOpen ne peut pas les effacer) : consommation de crédit
  tournoi SterPlatform (référence = `tournament.id`, reste consommée) ; paiements SterPlatform/
  Stripe des inscriptions en ligne (`externalReference` = `registration.id`, `customerEmail` du
  joueur) — un webhook tardif (`payment.succeeded`/`payment.refunded`) sur une inscription
  supprimée devient un no-op `NOT_FOUND` : un paiement encaissé ou un remboursement
  `REFUND_PENDING` perd sa seule trace locale. Le journal affiche ces compteurs par tournoi
  (payées en ligne / remboursements en attente). Aucun fichier ni stockage objet n'est lié à un
  tournoi ; le topic Mercure n'a pas d'état persistant.
- **Tests** : `lib/db/unfinishedTournamentPurge.test.ts` (règle pure),
  `lib/db/unfinishedTournamentPurge.db.test.ts` (vrai PostgreSQL : J+1, rappel unique, 48 h,
  suppression complète vérifiée table par table, clôture entre-temps, revérification sous verrou,
  report de date, dry-run sans écriture, échec d'email sans horodatage ; créateur introuvable :
  constat conservé, rien avant J+1 00:00 UTC + 48 h, suppression sans rappel complète au premier
  passage ensuite, jamais sur 5xx/configuration, constat tardif, clôture/report entre-temps,
  dry-run),
  `scripts/purge-unfinished-tournaments.test.ts` (CLI : codes de sortie),
  `lib/tournament/closeReminderNotifier.test.ts` (contrat `send-to-organization` : 200, 200 ambigu,
  404, 422, 400, 401, 403, 500, réseau ; contrat `send-to-user` : 200, 200 ambigu, 404
  `USER_NOT_FOUND` / template, 400, 401, 403, 500, réseau, variables formatées). Les tests base se
  lancent sur une base jetable, jamais la base locale de travail :
  `DATABASE_URL=postgresql://…@localhost:5433/dartsopen_purge_test npx vitest run lib/db/unfinishedTournamentPurge`.

## Algorithme de classement (lib/db/ranking.ts)
- Participation : +1 pt
- Victoire en poule : +1 pt
- Victoire en bracket : +2 pts
- Champion du tournoi : +10 pts (attribué une seule fois par tournoi, jamais par match de bracket gagné)
- Champion détecté par `resolveChampions` : match `SINGLE` au round le plus élevé (mode standard — un seul match possible par construction de `doAdvanceToNextRound` ; mode rapide depuis DO-QUICK-POOL-001 — la dernière vague du bassin unique ne contient par construction que les deux derniers survivants). Pour un tournoi rapide joué avant DO-QUICK-POOL-001 (bracketType `GRAND_FINAL` encore en base), `resolveChampions` retombe sur le match `GRAND_FINAL` au round le plus élevé — jamais recalculé rétroactivement en `SINGLE`

## Variables d'environnement requises
- `DATABASE_URL` — PostgreSQL
- `NEXT_PUBLIC_API_URL` — URL SterPlatform
- `NEXT_PUBLIC_APP_URL` — URL publique de DartsOpen (utilisée pour construire `redirect_uri`
  côté SSO, jamais `request.url` — voir "Authentification (SSO central)")
- `STER_ORG_SLUG` / `NEXT_PUBLIC_STER_ORG_SLUG` — slug org dans SterPlatform (`dartsopen`)
- `STER_SSO_CLIENT_SECRET` — secret client SSO, voir "Authentification (SSO central)"
- `STER_API_TOKEN` — jeton serveur-à-serveur (`X-App-Token`) partagé avec SterPlatform :
  email transactionnel, statut Stripe Connect, création de paiement
- `STER_PAYMENTS_CALLBACK_SECRET` — signe les notifications de paiement entrantes depuis
  SterPlatform, voir "Inscriptions et paiement"
- `NEXT_PUBLIC_BSSITE_URL` — URL du portail BSsite (lien Stripe Connect page Paramètres)
- `NEXT_PUBLIC_MERCURE_PUBLIC_URL` — URL publique du hub (navigateur → hub)
- `MERCURE_PRIVATE_URL` — URL privée du hub (Next.js → hub, peut être identique)
- `MERCURE_JWT_SECRET` — secret HS256 partagé avec le hub (voir docker-compose.yml)

## Mercure (temps réel)

### Architecture
- Hub local via `docker-compose up -d` (port 9090, image `dunglas/mercure`)
- `lib/mercure.ts` — signe les JWT HS256 sans bibliothèque externe (`crypto` Node)
- Publisher : `publishMatchUpdate(tournamentId)` — fire-and-forget, appelé depuis `score.ts` (confirmWinner, markWinnerDirect) et `admin.ts` (arbitrateMatch)
- Abonné token : `GET /api/public/tournaments/[id]/mercure-token` → `{ token, topic }`
- Topic : `https://dartsopen.bapps-studio.com/tournaments/{id}/matches`

### Fallback
Si `MERCURE_JWT_SECRET` ou `NEXT_PUBLIC_MERCURE_PUBLIC_URL` ne sont pas définis :
- Publisher : no-op silencieux
- Composants : polling automatique (MatchBoard 3 s, BracketLive 5 s, TvBoard 5 s)

### Démarrage local
```bash
docker compose up -d   # lance PostgreSQL + Mercure hub
```
Ajouter dans `.env.local` :
```
NEXT_PUBLIC_MERCURE_PUBLIC_URL=http://localhost:9090/.well-known/mercure
MERCURE_PRIVATE_URL=http://localhost:9090/.well-known/mercure
MERCURE_JWT_SECRET=dartsopen-mercure-dev-secret
```

## Gestion des erreurs

### Routes publiques
- `.catch(() => null)` est interdit sans log — utiliser `.catch((err) => { console.warn(..., err); return null })`
- Cela garantit que les erreurs DB inattendues (connexion perdue, timeout) sont tracées

### Logs
- `console.error` pour les erreurs inattendues (DB)
- `console.warn` pour les best-effort (email, opérations non-bloquantes)
- Toujours passer l'objet `err` en dernier argument pour avoir la stack trace

## Mode tournoi rapide

### Concept
Élimination à vies pour bar/soirée, bassin unique. Chaque joueur a 2 vies.
Dès qu'une cible se libère ou qu'un joueur redevient disponible, TOUS les joueurs encore en vie
(1 ou 2) et non engagés dans un autre match forment un seul bassin, apparié sans tenir compte du
nombre de vies restant — jamais deux files séparées par nombre de vies. Une défaite retire une
vie (2 → 1 → 0 = éliminé). Le tournoi se termine quand il ne reste plus qu'un joueur en vie ; le
dernier match joué est donc naturellement la finale, sans type de match ni traitement dédié. Pas
de poules, pas de scoring électronique/traditionnel — le gagnant est désigné directement par
l'organisateur via le bouton d'arbitrage.

Avant DO-QUICK-POOL-001, le mode rapide était un double élimination classique avec deux files
d'appariement séparées (winners/losers) et une Grande Finale dédiée. Deux défauts signalés par
l'organisateur ont motivé le passage au bassin unique : (1) un joueur qui venait de perdre sa
première vie restait bloqué en attente tant qu'un SECOND joueur n'avait pas aussi perdu une vie,
même si des joueurs à 2 vies étaient disponibles au même instant ; (2) une nouvelle manche losers
pouvait démarrer et occuper une cible pendant que d'anciens matchs winners tournaient encore
ailleurs, donnant l'impression d'un ordre de passage faussé. Les tournois rapides joués avant
cette mission gardent leurs matchs historiques `WINNERS`/`LOSERS`/`GRAND_FINAL` en base (jamais
réécrits) — `resolveChampions` (`lib/db/ranking.ts`) sait encore lire les deux formats.

### Contraintes fixes (non modifiables)
- Inscriptions : **sur place uniquement** (`registration_mode = ONSITE`)
- Seul le **nom/pseudo** est requis — email et téléphone non demandés
- `nb_pools = 1`, `players_per_team = 1` verrouillés à la création
- Le mode de saisie des scores (électronique / traditionnel) est **ignoré**

### Champs Prisma
- `Tournament.quickMode` — active le mode rapide
- `Match.bracketType` — `SINGLE` pour tout nouveau match de mode rapide (comme le mode standard,
  un tournoi étant toujours exclusivement l'un ou l'autre) ; `WINNERS`/`LOSERS`/`GRAND_FINAL`
  restent valides pour l'historique des tournois joués avant DO-QUICK-POOL-001, mais plus jamais
  écrits
- `Registration.lives` — vies restantes (2 → 1 → 0 = éliminé)

### Fichiers clés
- `lib/utils/doubleElimination.ts` — fonctions pures (format, pairing, shuffle)
- `lib/actions/quickTournament.ts` — `generateQuickBracket` + `doAdvanceQuickTournament`
- `lib/actions/admin.ts` — `arbitrateMatch` : seul point d'entrée pour désigner un vainqueur en mode rapide (la page de saisie de score publique est désactivée dans ce mode)
- `lib/actions/player.ts` — `addPlayer` : email optionnel (vide `""` si absent), email de confirmation sauté si pas d'email
- `lib/db/tournament.ts` — `dbDecrementLives`, `dbGetQuickTournamentState`, `dbGetActiveQuickBracketMatches`, `dbPromoteUnassignedMatches`, `dbCreateQuickTournamentRounds`, `doAdvanceQuickTournamentTx` (le bassin unique)
- `components/tournament/AddPlayerForm.tsx` — prop `quickMode` : masque les champs email et téléphone
- `components/tournament/QuickBracketView.tsx` — grille unique de cartes de match (jamais de sections winners/losers/finale), bouton arbitrage, déjà utilisable en portrait mobile (pas de `LandscapeGuard`)
- `components/tournament/QuickBracketLive.tsx` — vue live (Mercure ou polling 5s)

### Format de jeu (automatique)
Fonction uniquement du nombre de joueurs encore en vie dans le tournoi, jamais d'un bracket :
- > 8 joueurs actifs : 501 fermeture double
- 5–8 joueurs actifs : Cricket
- ≤ 4 joueurs actifs : 701 finish double

### Flow admin
1. Créer le tournoi avec `quick_mode=true` → `nb_pools=1`, `players_per_team=1` verrouillés
2. Passer en statut **OPEN** puis inscrire les joueurs sur place (nom/pseudo uniquement)
3. Passer en statut **IN_PROGRESS** → aller sur **Phases finales**
4. Cliquer **Générer le bracket rapide** → `generateQuickBracket` crée les matchs de la manche 1 sur les cibles disponibles
5. Désigner le gagnant via le bouton **Arbitrer** sur chaque match → `arbitrateMatch` (`lib/actions/admin.ts`) → `doAdvanceQuickTournament` déclenché automatiquement
6. Les matchs suivants (bassin unique) se créent et s'affectent aux cibles libres automatiquement, jusqu'à ce qu'il ne reste plus qu'un joueur en vie

## Choix de langue masqué (03/10/2026)

Décision d'Alan : tant que EN/ES ne sont pas finalisés, `LANGUAGE_CHOICE_ENABLED = false` dans
`lib/i18n/config.ts`. Le sélecteur (`components/i18n/LanguageSwitcher.tsx`) ne rend rien et
`lib/i18n/server.ts` sert le français quel que soit le cookie (conservé). Une langue passée
explicitement à `getI18n(locale)` reste servie. Réactiver = passer à `true`. Les tests du mécanisme
multilingue réactivent le réglage par `vi.mock` ; `lib/i18n/languageChoice.test.ts` garde le blocage.

## Liens vers les autres applications BApps (03/10/2026)

Jamais d'adresse de production en dur : `bappsAppUrl("https://x.bapps-studio.com")`
(`lib/bappsApps.ts`) renvoie `https://x.dev.bapps-studio.com` quand `NEXT_PUBLIC_APP_URL` est une
adresse de test (même règle que BSsite `lib/catalog/products.ts`). Utilisé par le sélecteur
d'applications, le repli du portail et les liens croisés Connect ↔ MarketPlace.

## Garde-fou i18n

`npm run guardrail:i18n` (`scripts/check-i18n-visible-copy.mjs`, inclus dans `verify`) échoue sur tout **nouveau** texte visible codé en dur hors catalogue. La traduction du produit n'est pas terminée : les écarts historiques sont listés dans `scripts/i18n-visible-copy.baseline.json` (jamais à agrandir). Après avoir traduit des écrans, relancer avec `--update-baseline` pour réduire la baseline. Règles i18n : skill `bapps-i18n`.

## Conventions
- Port DB local : 5433 (évite le conflit avec SterPlatform sur 5432)
- Branche de travail : `develop` → merge sur `main` après validation
- Tests : `npm run test:run`
- Seed tournoi test : `npm run seed:players`
- Purge RGPD planifiée : `npm run purge:expired-contacts -- --dry-run|--apply` (voir « Conservation des données personnelles »)
- Purge des tournois jamais terminés : `npm run purge:unfinished-tournaments -- --dry-run|--apply` (voir la section dédiée ; rappel via SterPlatform `send-to-organization`, `send-to-user` pour un tournoi sans organisation)
- Réconciliation des remboursements : `npm run reconcile:refunds -- --dry-run|--apply` (voir « Issue d'un remboursement »)
