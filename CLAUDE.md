# DartsOpen — Notes développeur

## Stack
- **Next.js 16** (App Router, standalone output) + TypeScript
- **Prisma 7** + PostgreSQL (port 5433 en local)
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
scripts/    → seed de données de test
```

## Authentification (SSO central — migration écosystème SSO)

BSsite (le Portail BApps Studio) est l'unique portail de connexion visible de
l'écosystème ; DartsOpen n'a plus aucun écran de login/register/forgot-password/
reset-password local (retirés par cette migration, pas seulement masqués). SterPlatform
reste l'unique fournisseur d'identité. Protocole : Authorization Code + PKCE (S256),
échange de code serveur-à-serveur — jamais de JWT/refresh token dans une URL. Même
architecture que BilletAsso (pilote AUTH-002) et BSsite (AUTH-005), voir leurs CLAUDE.md
respectifs pour le détail du protocole côté SterPlatform.

**Remplace l'ancien flux (obsolète, supprimé par cette migration)** : `lib/actions/auth.ts`
(server actions `register`/`login`/`requestPasswordReset`/`updatePassword`) appelait
directement les endpoints classiques SterPlatform (`/api/auth/register`, `/login`,
`/forgot-password`, `/reset-password`) avec le mot de passe transmis en clair depuis un
formulaire local. Ce fichier, `components/auth/{Login,Register,ForgotPassword,ResetPassword}
Form.tsx` et les pages `app/(auth)/{register,forgot-password,reset-password}/page.tsx` ont
été supprimés. Les vestiges Supabase (`app/auth/{callback,confirm}/route.ts`,
`app/auth/verified/page.tsx`, déjà désactivés avant cette migration) ont également été
retirés.

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
  ici — DartsOpen n'a pas de notion d'Organization SterPlatform, `tournament.association_id`
  compare directement au `user.id` (voir "Contrôle d'accès organisateur" ci-dessous).
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

## Contrôle d'accès organisateur

- `getOwnedTournament(tournamentId)` (`lib/actions/access.ts`) est le point d'entrée unique : vérifie le JWT SterPlatform, charge le tournoi et compare `tournament.association_id` au `user.id` → `notFound()` sinon (404 indistinguable d'un tournoi inexistant)
- Utilisé en première instruction par les 5 pages `(dashboard)/tournaments/[id]/**` et par toutes les Server Actions organisateur (création/édition/suppression de tournoi et manches, génération poules/bracket/bracket rapide, avancement de tour, arbitrage, gestion des joueurs)
- **Ne jamais wrapper l'appel dans `.catch()`** : `notFound()`/`redirect()` sont des throws spéciaux Next.js qui doivent se propager
- Volontairement laissé hors contrôle : `addPlayer`/`createRegistration` (inscription publique), `doAdvanceToNextRound`/`doAdvanceQuickTournament` (helpers internes partagés avec le flux public, protégés indirectement via leurs appelants organisateur)
- **Saisie de score publique** (`proposeWinner`/`confirmWinner`/`disputeResult`, `lib/actions/score.ts`) — un joueur n'a pas de compte SterPlatform dédié (inscription par nom/e-mail uniquement, aucun `Registration.userId`). L'autorisation (`lib/actions/scoreAuthorization.ts::loadMatchSetChain`/`resolveAuthorizedSide`, SEC-001) recharge le set → match → tournoi réel côté serveur, rejette tout `matchSetId` dont le tournoi réel ne correspond pas au `tournamentId` transmis, puis fait correspondre l'e-mail de l'utilisateur authentifié à `Registration.playerEmail` (côté 1 ou 2) — jamais au `playerSide` déclaré par le client. `markWinnerDirect` (mode traditionnel, déjà protégé par `getOwnedTournament`) réutilise `loadMatchSetChain` pour la même cohérence d'identifiants, sans changement de son modèle d'autorisation (organisateur uniquement).
- Les sous-ressources (`round`, `registration`, `match`) sont scopées par `tournamentId` côté DB (`deleteMany`/`updateMany` avec `where` composé) pour empêcher la substitution d'un identifiant appartenant à un autre tournoi
- Transitions de statut validées côté serveur par `lib/utils/tournamentStatus.ts` (`DRAFT → OPEN → IN_PROGRESS → FINISHED`, séquentiel, `FINISHED` terminal), appliqué dans `dbUpdateTournamentStatus`
- Clôture automatique en fin de tournoi (mode standard et mode rapide) : voir « Garde-fous »

## Garde-fous contre les états cassés et les pertes de données

- **Clôture automatique** : en mode standard, `doAdvanceToNextRound` (`lib/actions/bracket.ts`) passe le tournoi en `FINISHED` dès que le dernier match du bracket est joué (`bracketMatches.length === 1`), sans action manuelle de l'organisateur — miroir exact du comportement déjà en place en mode rapide (`doAdvanceQuickTournament`). Le classement (`lib/db/ranking.ts`, filtré sur `status: "FINISHED"`) est donc alimenté automatiquement. La transition manuelle *"Clôturer le tournoi"* (`TournamentStatusButton`) reste disponible en secours et exige désormais une confirmation explicite (case à cocher) car elle coupe immédiatement la saisie des scores en cours.

- **Manche obligatoire avant ouverture** : `dbUpdateTournamentStatus` refuse la transition vers `OPEN` si le tournoi n'est pas en mode rapide et n'a aucune manche (`rounds.length === 0`) — sans manche, aucun `MatchSet` n'est créé et un match ne peut jamais passer en `FINISHED`. Le mode rapide est exempté : ses manches (501/Cricket/701) sont générées automatiquement par `generateQuickBracket`. En complément, `deleteRound` refuse toute suppression de manche hors statut `DRAFT`, pour garantir qu'un tournoi qui a passé la porte `OPEN` ne peut plus revenir à 0 manche.
- **Arbitrage destructeur** : en mode standard, corriger un match de bracket dont le vainqueur change supprime les matchs des tours suivants déjà générés (`dbArbitrateMatch`). `ArbitrateMatchModal` calcule ce risque côté client (`laterMatchesCount`, transmis par `BracketView`) et bloque le bouton de validation tant qu'une case à cocher explicite n'a pas été confirmée. Les matchs de poule (`bracket_round` null) et le mode rapide (jamais destructeur) ne sont pas concernés.
- **Régénération des poules** : `generatePools` refuse la régénération dès qu'au moins un match de poule est `FINISHED` (contrôle serveur, dans l'action). Tant qu'aucun match n'est terminé, `GeneratePoolsButton` affiche un avertissement et exige une case à cocher avant de permettre la régénération (poules + matchs existants supprimés, joueurs redistribués aléatoirement).

## Inscriptions et paiement (mission DO-003)

- `lib/actions/registration.ts` (`createRegistration`) — inscription publique. Tournoi
  gratuit (`entry_fee === 0`) : confirmée immédiatement (`status: "PAID"`), email envoyé,
  aucun paiement. Tournoi payant : DartsOpen ne dialogue **jamais** directement avec Stripe —
  la session de paiement est créée côté SterPlatform via
  `lib/api/sterplatformInternal.ts::createPaymentCheckout`
  (`POST /api/internal/organizations/{slug}/payments/checkout`), qui encaisse pour le compte
  du Stripe Connect de l'organisation BApps Studio liée à l'organisateur.
- **Liaison organisation** (`lib/actions/organization.ts`, `Organization.sterOrganizationSlug`
  en base) — un organisateur doit lier son compte à l'une de ses organisations BApps Studio
  (rôle OWNER/ADMIN requis) avant de pouvoir accepter des paiements en ligne ; le slug soumis
  est toujours revérifié côté serveur contre `GET /api/me/organizations` (jamais fait
  confiance tel quel). Page Paramètres (`app/(dashboard)/settings/page.tsx`) : liaison si
  absente, sinon statut Stripe Connect réel via
  `lib/api/sterplatformInternal.ts::getStripeConnectStatus`
  (`GET /api/internal/organizations/{slug}/connect/account-id`) avec lien vers la page Stripe
  Connect de l'organisation dans BSsite (`NEXT_PUBLIC_BSSITE_URL`).
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
- **Webhook entrant** (`app/api/webhooks/sterplatform-payments/route.ts`) — remplace l'ancien
  webhook Stripe local : reçoit les notifications de paiement signées par SterPlatform
  (`X-SterPlatform-Signature`, HMAC-SHA256 avec `STER_PAYMENTS_CALLBACK_SECRET`). Sur
  `payment.succeeded`, appelle `dbConfirmPendingPayment()` (jamais un `UPDATE` aveugle — voir
  "Capacité, paiement tardif et remboursement" ci-dessous) : `CONFIRMED` → email de
  confirmation ; `ALREADY_CONFIRMED`/`NOT_FOUND`/`ALREADY_REFUNDED` → no-op silencieux
  (redélivraison ou état déjà terminal) ; `REFUND_NEEDED`/`REFUND_IN_PROGRESS` → tentative de
  remboursement via `refundPayment()` (`lib/api/sterplatformInternal.ts`,
  `POST /api/internal/payments/{id}/refund`, ciblé par le `paymentId` du webhook lui-même —
  jamais uniquement la copie locale `ster_payment_id`), un échec renvoyant un statut non-2xx
  pour permettre une redélivraison ultérieure. Sur `payment.refunded` (confirmation Stripe
  asynchrone), confirme le remboursement via `dbMarkRefundConfirmed()`.
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

## Algorithme de classement (lib/db/ranking.ts)
- Participation : +1 pt
- Victoire en poule : +1 pt
- Victoire en bracket : +2 pts
- Champion du tournoi : +10 pts (attribué une seule fois par tournoi, jamais par match de bracket gagné)
- Champion détecté par `resolveChampions` via `bracketType` : match `GRAND_FINAL` au round le plus élevé si le tournoi en a (mode rapide — WB/LB/Grande Finale ont chacun leur propre compteur de round indépendant), sinon match `SINGLE` au round le plus élevé (mode standard, un seul match possible par construction de `doAdvanceToNextRound`)

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
Double élimination pour bar/soirée. Chaque joueur a 2 vies. Pas de poules, pas de scoring électronique/traditionnel — le gagnant est désigné directement par l'organisateur via le bouton d'arbitrage.

### Contraintes fixes (non modifiables)
- Inscriptions : **sur place uniquement** (`registration_mode = ONSITE`)
- Seul le **nom/pseudo** est requis — email et téléphone non demandés
- `nb_pools = 1`, `players_per_team = 1` verrouillés à la création
- Le mode de saisie des scores (électronique / traditionnel) est **ignoré**

### Champs Prisma
- `Tournament.quickMode` — active le mode rapide
- `Match.bracketType` — `SINGLE | WINNERS | LOSERS | GRAND_FINAL`
- `Registration.lives` — vies restantes (2 → 1 → 0 = éliminé)

### Fichiers clés
- `lib/utils/doubleElimination.ts` — fonctions pures (format, pairing, shuffle)
- `lib/actions/quickTournament.ts` — `generateQuickBracket` + `doAdvanceQuickTournament`
- `lib/actions/admin.ts` — `arbitrateMatch` : seul point d'entrée pour désigner un vainqueur en mode rapide (la page de saisie de score publique est désactivée dans ce mode)
- `lib/actions/player.ts` — `addPlayer` : email optionnel (vide `""` si absent), email de confirmation sauté si pas d'email
- `lib/db/tournament.ts` — `dbDecrementLives`, `dbGetQuickTournamentState`, `dbGetActiveQuickBracketMatches`, `dbPromoteUnassignedMatches`, `dbCreateQuickTournamentRounds`
- `components/tournament/AddPlayerForm.tsx` — prop `quickMode` : masque les champs email et téléphone
- `components/tournament/QuickBracketView.tsx` — vue statique WB / LB / Grande Finale avec bouton arbitrage
- `components/tournament/QuickBracketLive.tsx` — vue live (Mercure ou polling 5s)

### Format de jeu (automatique)
- > 8 joueurs actifs : 501 fermeture double (WB) / Cricket (LB)
- 5–8 joueurs : Cricket
- ≤ 4 joueurs + Grande Finale : 701 finish double

### Flow admin
1. Créer le tournoi avec `quick_mode=true` → `nb_pools=1`, `players_per_team=1` verrouillés
2. Passer en statut **OPEN** puis inscrire les joueurs sur place (nom/pseudo uniquement)
3. Passer en statut **IN_PROGRESS** → aller sur **Phases finales**
4. Cliquer **Générer le bracket rapide** → `generateQuickBracket` crée les matchs WB R1 sur les cibles
5. Désigner le gagnant via le bouton **Arbitrer** sur chaque match → `arbitrateMatch` (`lib/actions/admin.ts`) → `doAdvanceQuickTournament` déclenché automatiquement
6. Les matchs suivants (WB/LB/Grande Finale) se créent et s'affectent aux cibles libres automatiquement

## Conventions
- Port DB local : 5433 (évite le conflit avec SterPlatform sur 5432)
- Branche de travail : `develop` → merge sur `main` après validation
- Tests : `npm run test:run`
- Seed tournoi test : `npm run seed:players`
