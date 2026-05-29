# DartsOpen — Roadmap

## Phase 0 — Fondations ✅
- Authentification organisateur (SterPlatform JWT)
- Gestion des tournois (CRUD, statuts)
- Inscriptions en ligne (Stripe) + mode sur place
- Génération automatique des poules (round-robin, Berger)
- Génération du bracket (simple élimination, seeding)
- Arbitrage admin (validation score, contestation)
- Classement inter-tournois (points)
- Suivi live public (mode TV, polling 5 s)
- Profils joueurs publics
- QR code d'inscription

## Phase 1 — Mode tournoi rapide ✅
**Double élimination pour bar / soirée fléchettes**

### Fonctionnalités implémentées
- `quick_mode: true` sur un tournoi → verrouille `nb_pools = 1`, `players_per_team = 1`
- Tirage au sort + génération automatique du bracket WB R1
- Double élimination : chaque joueur démarre avec 2 vies
  - Défaite en WB (vies = 2) → passe en LB (vies = 1)
  - Défaite en LB (vies = 1) → éliminé (vies = 0)
- Matchs créés dynamiquement après chaque validation admin
- Affectation automatique des machines libres
- Grande Finale automatique (dernier WB vs dernier LB)

### Format de jeu par phase
| Joueurs actifs | Bracket | Format      |
|----------------|---------|-------------|
| > 8            | WB      | 501 fermeture double |
| > 8            | LB      | Cricket     |
| 5–8            | WB + LB | Cricket     |
| ≤ 4            | WB + LB | 701 finish double |
| Grande Finale  | —       | 701 finish double |

### Architecture
- `prisma/schema.prisma` : `BracketType` (SINGLE/WINNERS/LOSERS/GRAND_FINAL), `Tournament.quickMode`, `Match.bracketType`, `Registration.lives`
- `lib/utils/doubleElimination.ts` : fonctions pures (format, pairing, shuffle)
- `lib/actions/quickTournament.ts` : `generateQuickBracket` + `doAdvanceQuickTournament`
- `lib/db/tournament.ts` : fonctions DB quickMode (`dbDecrementLives`, `dbGetQuickTournamentState`, `dbPromoteUnassignedMatches`, …)
- `lib/actions/score.ts` : route vers `doAdvanceQuickTournament` si `quick_mode`

### Tests
- `__tests__/lib/utils/doubleElimination.test.ts` — 22 tests unitaires

### Interface admin (frontend)
- Toggle « Mode rapide » sur le formulaire de création et d'édition de tournoi
- Badge ⚡ et info-box sur la page détail ; section Manches masquée
- Page bracket : bouton « Générer le bracket rapide », pas de bouton « Tour suivant »
- `QuickBracketView` : sections WB / LB / Grande Finale avec indicateur de vies (♥) et bouton arbitrage

## Phase 2 — En cours
### Notifications temps réel (Mercure) ✅
- Hub Mercure dans `docker-compose.yml` (port 9090, `dunglas/mercure`)
- `lib/mercure.ts` — JWT HS256 (sans dépendance externe), topic par tournoi, publisher fire-and-forget
- Route `/api/public/tournaments/[id]/mercure-token` — token abonné côté navigateur
- `MatchBoard` + `BracketLive` : URL token corrigée → endpoint DartsOpen local (plus SterPlatform)
- `TvBoard` : polling 5 s remplacé par SSE Mercure (fallback polling si hub absent)
- `score.ts` : publication automatique après chaque match finalisé

### À venir
- Export PDF résultats du tournoi rapide
- Statistiques par joueur (taux de victoire WB vs LB)
