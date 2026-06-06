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
- `NEXT_PUBLIC_MERCURE_PUBLIC_URL` — URL publique du hub (navigateur → hub)
- `MERCURE_PRIVATE_URL` — URL privée du hub (Next.js → hub, peut être identique)
- `MERCURE_JWT_SECRET` — secret HS256 partagé avec le hub (voir docker-compose.yml)

## Mercure (temps réel)

### Architecture
- Hub local via `docker-compose up -d` (port 9090, image `dunglas/mercure`)
- `lib/mercure.ts` — signe les JWT HS256 sans bibliothèque externe (`crypto` Node)
- Publisher : `publishMatchUpdate(tournamentId)` — fire-and-forget, appelé depuis `score.ts`
- Abonné token : `GET /api/public/tournaments/[id]/mercure-token` → `{ token, topic }`
- Topic : `https://dartsopen.fr/tournaments/{id}/matches`

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

### Webhook Stripe
- Les erreurs DB doivent **remonter** (ne pas swallower) : retourner `status: 500` pour que Stripe retente
- Pattern : `try { await dbMarkPaid(...) } catch (err) { console.error(...); return NextResponse.json(..., { status: 500 }) }`

### Routes publiques
- `.catch(() => null)` est interdit sans log — utiliser `.catch((err) => { console.warn(..., err); return null })`
- Cela garantit que les erreurs DB inattendues (connexion perdue, timeout) sont tracées

### Logs
- `console.error` pour les erreurs inattendues (DB, Stripe)
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
5. Désigner le gagnant via le bouton **Arbitrer** sur chaque match → `markWinnerDirect` → `doAdvanceQuickTournament` déclenché automatiquement
6. Les matchs suivants (WB/LB/Grande Finale) se créent et s'affectent aux cibles libres automatiquement

## Conventions
- Port DB local : 5433 (évite le conflit avec SterPlatform sur 5432)
- Branche de travail : `develop` → merge sur `main` après validation
- Tests : `npm run test:run`
- Seed tournoi test : `npm run seed:players`
