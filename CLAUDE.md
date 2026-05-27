# DartsOpen — Notes développeur

## Stack
- **Next.js 16** (App Router, standalone output) + TypeScript
- **Prisma 7** + PostgreSQL (port 5433 en local)
- **SterPlatform** — auth organisateurs (JWT, cookies httpOnly)
- **Stripe** — inscriptions payantes
- **Tailwind CSS 4**
- **Vitest** — tests unitaires

## Démarrage local
```bash
# 1. Base de données
docker compose up -d

# 2. Variables d'env
cp .env.local.example .env.local
# Remplir DATABASE_URL, NEXT_PUBLIC_API_URL, clés Stripe

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
  stripe/   → helpers paiement
  actions/  → Server Actions Next.js

components/ → composants React (tournament/, ui/)
prisma/     → schema + migrations
scripts/    → seed de données de test
```

## Algorithme de classement (lib/db/ranking.ts)
- Participation : +1 pt
- Victoire en poule : +1 pt
- Victoire en bracket : +2 pts
- Champion du tournoi : +10 pts
- Champion détecté via `bracketRound` max + `bracketPosition = 1`

## Variables d'environnement requises
- `DATABASE_URL` — PostgreSQL
- `NEXT_PUBLIC_API_URL` — URL SterPlatform
- `STER_ORG_SLUG` — slug org dans SterPlatform (`dartsopen`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` — Stripe
- `STRIPE_WEBHOOK_SECRET` — webhook Stripe

## Conventions
- Port DB local : 5433 (évite le conflit avec SterPlatform sur 5432)
- Branche de travail : `develop` → merge sur `main` après validation
- Tests : `npm run test:run`
- Seed tournoi test : `npm run seed:players`
