# DartsOpen

> Plateforme SaaS de gestion de tournois de fléchettes — inscriptions en ligne, scores en temps réel, tableaux de bord sur smartphone.

![Status](https://img.shields.io/badge/status-Recette-orange)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Realtime-3ECF8E)
![Stripe](https://img.shields.io/badge/Stripe-Connect-635BFF)
![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen)
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
| Phases finales (bracket single-élimination, byes) | ✅ |
| Accès spectateur (QR code salle) | ✅ |
| Reversement automatique à l'association organisatrice | ✅ |
| Page contact + page dons | ✅ |
| Conformité RGPD | 🔲 |

---

## Architecture

```
┌────────────────────────────────────────────┐
│  Navigateur / Smartphone                   │
│  Next.js 16 — App Router (React 19)        │
└───────────────┬────────────────────────────┘
                │ HTTPS
┌───────────────▼────────────────────────────┐
│  API Routes (Server Actions)               │
│  Stripe Webhooks                           │
└───────┬─────────────────┬──────────────────┘
        │                 │
┌───────▼───────┐  ┌──────▼──────────────────┐
│  Supabase     │  │  Stripe Connect          │
│  PostgreSQL   │  │  Paiements + Reversements│
│  Auth (JWT)   │  └─────────────────────────┘
│  Realtime     │
└───────────────┘
```

### Structure du dépôt

```
DartsOpen/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Pages login / inscription
│   ├── (dashboard)/        # Dashboard association
│   ├── (tournament)/       # Vue tournoi (public + joueur)
│   └── api/                # API Routes + webhooks Stripe
├── components/             # Composants React réutilisables
│   ├── ui/                 # Composants shadcn/ui
│   ├── tournament/         # Composants métier tournoi
│   └── realtime/           # Composants temps réel
├── lib/                    # Utilitaires
│   ├── supabase/           # Client Supabase (server + client)
│   ├── stripe/             # Client Stripe
│   └── utils/              # Helpers (QR code, scores, brackets)
├── types/                  # Types TypeScript partagés
├── docs/                   # Documentation technique
├── Dockerfile              # Build production pour Coolify
├── docker-compose.yml      # PostgreSQL local
└── .env.example            # Variables d'environnement requises
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router + Server Actions) |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui |
| Base de données | PostgreSQL 15 (via Supabase) |
| Temps réel | Supabase Realtime (WebSockets) |
| Auth | Supabase Auth (JWT + OAuth) |
| Paiement | Stripe Connect |
| QR Code | `qrcode` npm |
| Tests | Vitest + Testing Library |
| Containerisation | Docker + Docker Compose |
| Déploiement | Coolify |
| CI/CD | GitHub Actions |

---

## Lancement

### Développement local (PostgreSQL via Docker)

**Prérequis :** Docker Desktop, Node.js 20+

```bash
# 1. Cloner le dépôt
git clone https://github.com/naviss29/DartsOpen.git
cd DartsOpen

# 2. Variables d'environnement
cp .env.example .env.local
# Remplir les valeurs dans .env.local

# 3. Démarrer PostgreSQL
docker compose up postgres -d

# 4. Démarrer le serveur Next.js
npm install
npm run dev
```

| Service | URL |
|---|---|
| Application | http://localhost:3000 |

### Avec Docker (image complète)

```bash
docker compose up
```

---

## Tests

```bash
npm test              # Vitest (watch mode)
npm run test:run      # Vitest (one-shot, CI)
npm run test:coverage # Couverture de code
```

---

## Documentation

- [Documentation complète](./docs/DartsOpen_Documentation.md) — contexte, modèle de données, RGPD, roadmap
- [Pense-bête / idées futures](./docs/pense-bete.md)

---

## Modèle économique

- **0,10 € par joueur** retenu par DartsOpen (frais de service)
- À la création du tournoi : l'association règle `max_joueurs × 0,10 €` via PayPal (montant libre possible)
- Inscriptions en ligne via Stripe : frais prélevés automatiquement via `application_fee_amount`
- Inscriptions sur place (mode ONSITE) : frais couverts par le paiement PayPal initial
- Le solde Stripe est reversé automatiquement à l'association organisatrice en fin de tournoi

---

## Roadmap

- [x] Phase 0 — Socle technique (Next.js, Supabase, Docker, git, CI)
- [x] Phase 1 — Auth + Gestion tournoi (Supabase Auth, CRUD tournois, manches, middleware)
- [x] Phase 2 — Scores temps réel (joueurs, poules round-robin, matchs, Supabase Realtime, ScoreForm mobile)
- [x] Phase 3 — Navigation dashboard + QR codes cibles et spectateurs
- [x] Phase 4 — Inscriptions en ligne par équipe + paiement Stripe Connect
- [x] Phase 5 — Phases finales (bracket single-élimination, byes, avancement automatique)
- [x] Phase 6 — CI GitHub Actions (lint + tests + build sur push/PR, déploiement auto sur main)
- [ ] Phase 6 (suite) — Lier le dépôt à Coolify (webhook + secrets GitHub)

---

## Auteur

**Alan** — Développeur Full Stack (Java / Spring Boot / Angular / Next.js)
Projet personnel — Portfolio recruteur

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Profil-blue)](https://linkedin.com)
[![GitHub](https://img.shields.io/badge/GitHub-naviss29-black)](https://github.com/naviss29)
