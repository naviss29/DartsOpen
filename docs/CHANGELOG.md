# Changelog DartsOpen

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [DO-003] — 2026-08-03

Migration complète des paiements vers l'architecture BApps Studio (SterPlatform gère
Stripe Connect pour le compte de l'organisation, DartsOpen ne dialogue plus jamais
directement avec Stripe — mêmes principes que BilletAsso/FestManager).

**Correction documentaire** : `CLAUDE.md` faisait référence à une entrée « DO-002 » dans ce
changelog affirmant que Stripe avait déjà été retiré — cette entrée n'a jamais existé, ni le
retrait qu'elle décrivait (l'intégration Stripe locale était toujours active et fonctionnelle
au moment de l'audit qui a précédé cette mission). `CLAUDE.md` a été corrigé pour refléter
l'état réel du code.

### Ajouté
- Liaison organisateur → organisation BApps Studio (`Organization.sterOrganizationSlug`,
  `lib/actions/organization.ts`, page Paramètres).
- Client API interne SterPlatform (`lib/api/sterplatformInternal.ts`) : statut Stripe Connect
  (`GET /api/internal/organizations/{slug}/connect/account-id`) et création de paiement
  (`POST /api/internal/organizations/{slug}/payments/checkout`).
- Webhook entrant `app/api/webhooks/sterplatform-payments/route.ts` (notifications de
  paiement signées par SterPlatform), remplace l'ancien webhook Stripe local.

### Supprimé
- `lib/stripe/index.ts` (client Stripe SDK direct), `lib/actions/stripe.ts`,
  `app/api/webhooks/stripe/route.ts`, dépendance npm `stripe`, variables d'environnement
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## [v1.0.0-beta] — 2026-07-24

Sprint RELEASE-001 — préparation de la bêta privée.

### Ajouté

- **Rate limiting** (`lib/rateLimit.ts`) — limiteur en mémoire par IP + route, appliqué dans
  `proxy.ts` :
  - `/login` : 10 requêtes / 5 min
  - `/register`, `/forgot-password`, `/reset-password` : 5 requêtes / 15 min
  - `/api/public/*` : 120 requêtes / min
  - `/t/*` (inscription et saisie de score publiques) : 300 requêtes / 5 min — plafond volontairement
    large car plusieurs joueurs d'un même lieu de tournoi peuvent partager une IP (NAT)
  - Les webhooks Stripe (`/api/webhooks/*`) sont explicitement exclus : la signature Stripe fait
    déjà autorité sur la légitimité de la requête, et un blocage par IP risquerait d'empêcher des
    retries légitimes depuis les IP sortantes partagées de Stripe.
  - Portée : un seul processus Node.js (store en mémoire). Cohérent avec le déploiement actuel
    (conteneur unique, sans réplication). À remplacer par un backend partagé (Redis/Upstash) en
    cas de passage en multi-instance.
- **Pages légales minimales**, liées depuis les layouts `(public)` et `(auth)` :
  - `/mentions-legales`
  - `/confidentialite` (politique de confidentialité RGPD)
  - `/cgu` (conditions générales d'utilisation et de vente)
  - Éditeur identifié comme **Stêr Eo Production** (nom déjà publié sur `/dons`). La forme
    juridique, le SIRET, l'adresse du siège et le contact DPO restent en placeholder
    `[À COMPLÉTER]` — ces informations ne sont documentées nulle part dans le dépôt et n'ont pas
    été inventées.
- 7 tests unitaires pour `lib/rateLimit.ts` (`lib/rateLimit.test.ts`).

### Vérifié

- Recette manuelle exécutée sur `https://dartsopen.bapps-studio.com` (version alors déployée,
  avant ce sprint) : pages `/login`, `/register`, `/forgot-password`, `/contact`, `/dons`,
  `/classement` chargées sans erreur console ; redirection `/dashboard` → `/login` sans session
  conforme (T-004) ; 404 propre sur un identifiant de tournoi inexistant (T-124) ; aucun
  débordement horizontal en viewport mobile (390×844) sur `/login`.
- Aucune anomalie constatée sur la version en production au moment de l'audit.
- Parcours non couverts par cette vérification (nécessitent un moyen de paiement réel ou une
  boîte mail de test accessible) : voir « Points restants » ci-dessous.
- `npm run lint`, `npx tsc --noEmit`, `npm run test:run` (187/187) et `npm run build` : tous
  passants après les changements de ce sprint.

### Points restants avant ouverture de la bêta

1. Compléter l'identité légale de l'éditeur (forme juridique, SIRET, adresse, DPO) dans les 3
   pages légales avant toute ouverture publique réelle.
2. Exécuter les parcours de paiement réels (T-030, T-100, T-101, T-102 de `docs/Recette.md`)
   n'a pas pu être fait dans le cadre de cet audit pour éviter toute transaction réelle sur
   l'environnement de production — à valider manuellement par Alan, idéalement dans un mode
   Stripe test si l'environnement le permet.
3. Le parcours de création de compte + vérification email (T-003) n'a pas pu être vérifié de bout
   en bout faute de boîte mail de test accessible depuis cet environnement.
4. Déployer ce sprint (push vers `main`/`develop` puis CI/CD Coolify) — non fait dans le cadre de
   cet audit, en attente de validation explicite avant mise en production.
5. Rejouer la matrice de régression minimale de `docs/Recette.md` une fois ce sprint déployé.
