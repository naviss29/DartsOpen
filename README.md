# DartsOpen

> Plateforme SaaS de gestion de tournois de fléchettes — inscriptions en ligne, scores en temps réel, tableaux de bord sur smartphone.

![Status](https://img.shields.io/badge/status-Recette-orange)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)
![Stripe](https://img.shields.io/badge/Stripe-Connect-635BFF)
![Tests](https://img.shields.io/badge/tests-80%20passing-brightgreen)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)

---

## Présentation

DartsOpen est né d'un besoin terrain : gérer les tournois de fléchettes (open) repose encore sur du papier et des tableaux manuels, créant des embouteillages à la table de marque et un manque de visibilité pour les joueurs.

L'application permet aux associations d'organiser leurs tournois de A à Z : configuration des poules, gestion des matchs, saisie des scores sur smartphone via QR code, tableaux de bord en temps réel en salle et sur mobile.

---

## Fonctionnalités

| Fonctionnalité | Statut |
|---|---|
| Création de tournoi (poules, manches, type de jeu) | ✅ |
| Inscriptions par équipe (solo / doublette / triplette…) | ✅ |
| Inscription en ligne + paiement Stripe | ✅ |
| Mode inscriptions sur place uniquement | ✅ |
| Frais plateforme 0,10 € / joueur (PayPal upfront + Stripe) | ✅ |
| QR Code pré-tournoi par cible (à scotcher sur les machines avant l'événement) | ✅ |
| Mode scoring électronique (clic sur le vainqueur — double validation) | ✅ |
| Mode scoring traditionnel (saisie des scores par volée avec tableau de bord) | ✅ |
| Tableau matchs en cours / à venir (temps réel) | ✅ |
| Annonce visuelle du prochain match sur la cible | ✅ |
| Tableau récapitulatif des scores par poule | ✅ |
| Phases finales (bracket single-élimination, byes, avancement auto) | ✅ |
| Accès spectateur (QR code salle) | ✅ |
| Reversement automatique à l'association organisatrice | ✅ |
| Emails transactionnels (via SterPlatform) | ✅ |
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
│           Stripe Webhooks                              │
└───────┬─────────────────────┬──────────────────────────┘
        │                     │
┌───────▼──────────┐   ┌──────▼──────────────────────────┐
│  PostgreSQL      │   │  Stripe Connect                  │
│  (Prisma 7)      │   │  Paiements + Reversements        │
│  DB propre       │   └─────────────────────────────────┘
└───────┬──────────┘
        │
┌───────▼──────────────────────────────────────────────┐
│                  SterPlatform                        │
│  Auth JWT (login, register, refresh, logout)         │
│  Mercure SSE (temps réel)                            │
│  Email transactionnel (POST /api/email/send)         │
└──────────────────────────────────────────────────────┘
```

### Structure du dépôt

```
DartsOpen/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Pages login / inscription
│   ├── (dashboard)/        # Dashboard association
│   ├── (tournament)/       # Vue tournoi (public + joueur)
│   └── api/                # API Routes publiques + webhooks Stripe
├── components/             # Composants React réutilisables
│   ├── ui/                 # Composants UI de base
│   └── tournament/         # Composants métier tournoi
├── lib/
│   ├── actions/            # Server Actions (tournament, player, pool, bracket, score, stripe)
│   ├── api/                # Clients HTTP (auth.ts, client.ts, sterplatform.ts)
│   ├── db/                 # Couche Prisma (client.ts + tournament.ts)
│   ├── generated/prisma/   # Client Prisma généré (gitignored)
│   ├── stripe/             # Client Stripe
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
| Paiement | Stripe Connect |
| QR Code | `qrcode` npm |
| Tests | Vitest |
| Containerisation | Docker + Docker Compose |
| Déploiement | Coolify (Hetzner CX23) |
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

---

## Tests

```bash
npm test              # Vitest (watch mode)
npm run test:run      # Vitest (one-shot, CI)
npm run test:coverage # Couverture de code
```

**80 tests passants** — utils (bracket, pools, scores) + actions (tournament, score, bracket)

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | DSN PostgreSQL local |
| `NEXT_PUBLIC_API_URL` | URL SterPlatform (ex. `https://sterplatform.bichetapps.com`) |
| `STER_ORG_SLUG` | Slug organisation SterPlatform (`dartsopen`) |
| `STER_API_TOKEN` | Token partagé avec SterPlatform pour `POST /api/email/send` (`APP_TOKEN` côté SterPlatform) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (`sk_test_` en dev) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe (`pk_test_` en dev) |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe (`whsec_`) |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'application |

---

## Documentation

- [Documentation complète](./docs/DartsOpen_Documentation.md) — modèle de données, actions, roadmap
- [Pense-bête / idées futures](./docs/pense-bete.md)
- [Architecture écosystème](../docs/Architecture_Ecosysteme.md)

---

## Modèle économique

- **0,10 € par joueur** retenu par DartsOpen (frais de service)
- À la création : l'association règle `max_joueurs × 0,10 €` via PayPal
- Inscriptions en ligne via Stripe : frais prélevés via `application_fee_amount`
- Inscriptions sur place (mode ONSITE) : frais couverts par le paiement PayPal initial

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

---

## Auteur

**Alan** — Développeur Full Stack (Java / Spring Boot / Angular / Next.js)  
Projet personnel — Portfolio recruteur

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Profil-blue)](https://linkedin.com)
[![GitHub](https://img.shields.io/badge/GitHub-naviss29-black)](https://github.com/naviss29)
