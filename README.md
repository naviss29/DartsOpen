# DartsOpen

> Plateforme SaaS de gestion de tournois de fléchettes — inscriptions en ligne, scores en temps réel, tableaux de bord sur smartphone.

![Status](https://img.shields.io/badge/status-Recette-orange)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)
![Tests](https://img.shields.io/badge/tests-Vitest-brightgreen)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)

---

## Présentation

DartsOpen est né d'un besoin terrain : gérer les tournois de fléchettes (open) repose encore sur du papier et des tableaux manuels, créant des embouteillages à la table de marque et un manque de visibilité pour les joueurs.

L'application permet aux associations d'organiser leurs tournois de A à Z : configuration des poules, gestion des matchs, saisie des scores sur smartphone via QR code, tableaux de bord en temps réel en salle et sur mobile.

DartsOpen fait partie de l'écosystème [BApps Studio](https://github.com/naviss29/BApps-Studio) : même identité, même compte, que votre club utilise déjà [Connect](https://github.com/naviss29/Connect) pour sa vitrine publique ou [BilletAsso](https://github.com/naviss29/BilletAsso) pour d'autres événements.

---

## Fonctionnalités

| Fonctionnalité | Statut |
|---|---|
| Création de tournoi (poules, manches, type de jeu) | ✅ |
| Inscriptions par équipe (solo / doublette / triplette…) | ✅ |
| Inscription en ligne + paiement (SterPlatform / Stripe Connect) | ✅ |
| Mode inscriptions sur place uniquement | ✅ |
| Frais plateforme 0,10 € / joueur (paiements en ligne via SterPlatform) | ✅ |
| QR Code pré-tournoi par cible (à scotcher sur les machines avant l'événement) | ✅ |
| Mode scoring électronique (clic sur le vainqueur — double validation) | ✅ |
| Mode scoring traditionnel (saisie des scores par volée avec tableau de bord) | ✅ |
| Tableau matchs en cours / à venir (temps réel) — code couleur vert/bleu/vert clair, Derniers résultats par cible | ✅ |
| File d'attente globale — cible attribuée dynamiquement à la fin du match précédent | ✅ |
| Annonce "Dernière manche" avec cible qui se libère et prochain match en queue | ✅ |
| Tableau récapitulatif des scores par poule (V / D / MG / MP — départage manches) | ✅ |
| Phases finales (bracket single-élimination, byes, avancement auto) | ✅ |
| Accès spectateur (QR code salle) | ✅ |
| Reversement automatique à l'association organisatrice | ✅ |
| Emails transactionnels (inscription en ligne + ONSITE, via SterPlatform / Brevo) | ✅ |
| Têtes de série — dispatch équilibré dans les poules (serpentin) | ✅ |
| Arbitrage admin — modification des résultats par manche avec recalcul automatique | ✅ |
| Dashboard multi-utilisateur — voir tous les opens, s'inscrire en un clic | ✅ |
| Validation 501 (scores impossibles, bust double out, fermetures impossibles) | ✅ |
| Historique des volées en temps réel (saisie mobile) | ✅ |
| Conformité RGPD | 🔲 |

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│              Navigateur / Smartphone                   │
│              Next.js 16 — App Router (React 19)        │
└───────────────┬────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼────────────────────────────────────────┐
│           Server Actions + API Routes                  │
│           Webhook paiements SterPlatform                │
└───────┬─────────────────────┬──────────────────────────┘
        │                     │
┌───────▼──────────┐   ┌──────▼──────────────────────────┐
│  PostgreSQL      │   │  SterPlatform                    │
│  (Prisma 7)      │   │  Auth JWT · Mercure SSE           │
│  DB propre       │   │  Email transactionnel             │
└───────────────────┘   │  API interne paiements           │
                        │  → Stripe Connect (Stripe)       │
                        └──────────────────────────────────┘

DartsOpen ne dialogue jamais directement avec Stripe : Stripe Connect est géré
exclusivement par SterPlatform (mission DO-003).
```

### Structure du dépôt

```
DartsOpen/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Pages login / inscription
│   ├── (dashboard)/        # Dashboard association
│   ├── (tournament)/       # Vue tournoi (public + joueur)
│   └── api/                # API Routes publiques + webhook paiements SterPlatform
├── components/             # Composants React réutilisables
│   ├── ui/                 # Composants UI de base
│   └── tournament/         # Composants métier tournoi
├── lib/
│   ├── actions/            # Server Actions (tournament, player, pool, bracket, score, registration, organization)
│   ├── api/                # Clients HTTP (auth.ts, client.ts, sterplatform.ts, sterplatformInternal.ts, organizations.ts)
│   ├── db/                 # Couche Prisma (client.ts + tournament.ts)
│   ├── generated/prisma/   # Client Prisma généré (gitignored)
│   └── utils/              # Helpers (QR code, scores, brackets)
├── prisma/
│   ├── schema.prisma       # Schéma de données
│   └── migrations/         # Migrations Prisma
├── docs/                   # Documentation technique
├── Dockerfile              # Build production (Node 22 + prisma generate)
├── docker-compose.yml      # PostgreSQL local
└── .env.example            # Variables d'environnement requises
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router + Server Actions) |
| UI | React 19 + Tailwind CSS 4 |
| Base de données | PostgreSQL (Prisma 7 + adapter pg) |
| Auth | SterPlatform (JWT) |
| Temps réel | Mercure SSE (hub SterPlatform) |
| Email | SterPlatform (`POST /api/email/send` + `X-App-Token`) |
| Paiement | SterPlatform (Stripe Connect) |
| QR Code | `qrcode` npm |
| Tests | Vitest |
| Containerisation | Docker + Docker Compose |
| Déploiement | Coolify (Contabo GmbH, `dartsopen.bapps-studio.com` → 31.220.75.69) |
| CI/CD | GitHub Actions |

---

## Lancement

### Développement local

**Prérequis :** Docker Desktop, Node.js 22+

```bash
# 1. Cloner le dépôt
git clone https://github.com/naviss29/DartsOpen.git
cd DartsOpen

# 2. Variables d'environnement
cp .env.example .env.local
# Remplir les valeurs dans .env.local

# 3. Démarrer PostgreSQL
docker compose up db -d

# 4. Installer les dépendances et migrer
npm install
npx prisma migrate dev
npx prisma generate

# 5. Démarrer le serveur Next.js
npm run dev
```

| Service | URL |
|---|---|
| Application | http://localhost:3000 |
| PostgreSQL | localhost:5433 |

---

## Tests

```bash
npm test              # Vitest (watch mode)
npm run test:run      # Vitest (one-shot, CI)
npm run seed:players  # Remplir un tournoi avec des équipes fictives (interactif)
npm run audit:online-payment # Audit de cohérence des paiements en ligne (lecture seule)
```

La suite couvre notamment les utils (bracket, pools, scores 501, seeding), les actions,
la concurrence PostgreSQL, l'API interne SterPlatform et le webhook de paiements.

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | DSN PostgreSQL local |
| `NEXT_PUBLIC_API_URL` | URL SterPlatform (ex. `https://sterplatform.bapps-studio.com`) |
| `STER_ORG_SLUG` | Slug organisation SterPlatform (`dartsopen`) |
| `STER_API_TOKEN` | Token serveur-à-serveur partagé avec SterPlatform (`X-App-Token` — email, statut Stripe Connect, création de paiement) |
| `STER_PAYMENTS_CALLBACK_SECRET` | Secret de signature des notifications de paiement entrantes depuis SterPlatform (`/api/webhooks/sterplatform-payments`) |
| `NEXT_PUBLIC_BSSITE_URL` | URL du portail BSsite (lien "Gérer Stripe Connect" depuis la page Paramètres) |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'application |
| `STER_SSO_CLIENT_SECRET` | Secret du client SSO DartsOpen, identique à `SSO_CLIENT_SECRET_DARTSOPEN` côté SterPlatform |
| `NEXT_PUBLIC_MERCURE_PUBLIC_URL` | URL Mercure accessible par le navigateur |
| `MERCURE_PRIVATE_URL` | URL Mercure utilisée côté serveur |
| `MERCURE_JWT_SECRET` | Secret JWT Mercure, identique à celui configuré sur le hub |

DartsOpen ne dialogue plus jamais directement avec Stripe (mission DO-003) — les paiements
passent exclusivement par l'API interne de SterPlatform.

---

## Documentation

- [Documentation complète](./docs/DartsOpen_Documentation.md) — modèle de données, actions, roadmap
- [Pense-bête / idées futures](./docs/pense-bete.md)
- Architecture écosystème : dépôt `BApps-Studio`, dossier `04-Architecture/`

---

## Modèle économique

- **0,10 € par joueur** retenu par DartsOpen (frais de service)
- Inscriptions en ligne : le montant total et `platformFeeCents` sont transmis à l'API de
  paiement interne de SterPlatform, qui retient les frais via Stripe Connect
- Inscriptions sur place (mode ONSITE) : aucun frais de plateforme prélevé automatiquement
  (jamais transmis à Stripe)
- Au-delà de la limite gratuite : abonnement DartsOpen ou crédit tournoi, gérés et consommés
  exclusivement via SterPlatform (aucun palier de paiement intermédiaire dans DartsOpen)

---

## Roadmap

- [x] Phase 0 — Socle technique (Next.js, Docker, git, CI)
- [x] Phase 1 — Auth + Gestion tournoi (SterPlatform JWT, CRUD tournois, manches)
- [x] Phase 2 — Scores temps réel (joueurs, poules round-robin, matchs, Mercure SSE)
- [x] Phase 3 — Navigation dashboard + QR codes cibles et spectateurs
- [x] Phase 4 — Inscriptions en ligne par équipe + paiement Stripe Connect
- [x] Phase 5 — Phases finales (bracket single-élimination, byes, avancement automatique)
- [x] Phase 6 — CI GitHub Actions + Coolify (déploiement staging + prod)
- [x] Phase 7 — Emails transactionnels via SterPlatform (confirmation inscription gratuite + paiement)
- [x] Phase 8 — Recette staging : migrations auto Docker, file d'attente cibles, corrections UX formulaires
- [x] Phase 9 — Recette active : attribution dynamique des cibles, emails ONSITE, classement MG/MP, authentification proxy.ts
- [x] Phase 10 — Correction finalisation matchs (dbConfirmWinner), vue live enrichie (couleurs EN COURS/TERMINÉ/À VENIR, Derniers résultats par cible, pagination 20 matchs)
- [x] Phase 11 — Têtes de série (dispatch serpentin), arbitrage admin par manche, dashboard multi-utilisateur, fix Derniers résultats (updated_at), migration OVH VPS-2
- [x] Phase 12 — Validation 501 (scores impossibles, bust double out, fermetures impossibles), historique des volées

---

## Auteur

**Alan** — Développeur Full Stack (Java / Spring Boot / Angular / Next.js)  
Projet personnel — Portfolio recruteur

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Profil-blue)](https://linkedin.com)
[![GitHub](https://img.shields.io/badge/GitHub-naviss29-black)](https://github.com/naviss29)
