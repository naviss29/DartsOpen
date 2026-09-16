# DartsOpen — Roadmap

## Phase 0 — Fondations ✅
- Authentification organisateur (SterPlatform JWT)
- Gestion des tournois (CRUD, statuts)
- Inscriptions en ligne (paiement via SterPlatform / Stripe Connect) + mode sur place
- Génération automatique des poules (round-robin, Berger)
- Génération du bracket (simple élimination, seeding)
- Arbitrage admin (validation score, contestation)
- Classement inter-tournois (points)
- Suivi live public (mode TV, polling 5 s)
- Profils joueurs publics
- QR code d'inscription

## Phase 1 — Mode tournoi rapide ✅
**Élimination à vies, bassin unique, pour bar / soirée fléchettes**

> Mise à jour DO-QUICK-POOL-001 : le mode rapide était initialement un double élimination
> classique (deux files d'appariement séparées winners/losers + Grande Finale dédiée), décrit
> plus bas dans "Architecture historique (avant DO-QUICK-POOL-001)". Deux défauts terrain ont
> motivé le passage à un bassin unique : un joueur qui venait de perdre sa 1ère vie restait
> bloqué en attente tant qu'un second joueur n'avait pas aussi perdu une vie, et une manche
> losers pouvait démarrer/occuper une cible pendant que d'anciens matchs winners tournaient
> encore ailleurs. Voir `CLAUDE.md` (section "Mode tournoi rapide") pour le détail à jour.

### Fonctionnalités implémentées (état actuel)
- `quick_mode: true` sur un tournoi → verrouille `nb_pools = 1`, `players_per_team = 1`
- Chaque joueur démarre avec 2 vies. Dès qu'une cible se libère ou qu'un joueur redevient
  disponible, TOUS les joueurs encore en vie (1 ou 2) et non engagés forment un seul bassin,
  apparié sans distinction de nombre de vies — jamais deux files séparées par nombre de vies
- Une défaite retire une vie (2 → 1 → 0 = éliminé) ; le tournoi se termine quand il ne reste
  plus qu'un joueur en vie — le dernier match joué est donc naturellement la finale, sans type
  de match ni traitement dédié
- Matchs créés dynamiquement après chaque validation admin, affectation automatique des cibles libres

### Format de jeu (fonction du nombre de joueurs actifs, jamais d'un bracket)
| Joueurs actifs | Format      |
|-----------------|-------------|
| > 8             | 501 fermeture double |
| 5–8             | Cricket     |
| ≤ 4             | 701 finish double |

### Architecture
- `prisma/schema.prisma` : `Tournament.quickMode`, `Match.bracketType` (`SINGLE` pour tout
  nouveau match de mode rapide, comme le mode standard), `Registration.lives`
- `lib/actions/quickTournament.ts` : `generateQuickBracket` + `doAdvanceQuickTournament`
- `lib/db/tournament.ts` : `dbDecrementLives`, `dbGetQuickTournamentState`,
  `dbGetActiveQuickBracketMatches`, `dbPromoteUnassignedMatches`, `dbCreateQuickTournamentRounds`,
  `doAdvanceQuickTournamentTx` (le bassin unique)
- `lib/actions/admin.ts` : `arbitrateMatch` — seul point d'entrée pour désigner un vainqueur
  en mode rapide (la page de saisie de score publique est désactivée dans ce mode)
- `lib/actions/score.ts` : route vers `doAdvanceQuickTournament` si `quick_mode`

### Interface admin (frontend)
- Toggle « Mode rapide » sur le formulaire de création et d'édition de tournoi
- Badge ⚡ et info-box sur la page détail ; section Manches masquée
- Page bracket : bouton « Générer le bracket rapide », pas de bouton « Tour suivant »
- `QuickBracketView` : grille unique de cartes de match (jamais de sections winners/losers/
  finale) avec indicateur de vies (♥) et bouton arbitrage

### Architecture historique (avant DO-QUICK-POOL-001, obsolète — conservée pour mémoire)
Double élimination classique : bracket WB R1 tiré au sort, défaite en WB (vies=2) → passe en LB
(vies=1), défaite en LB (vies=1) → éliminé, Grande Finale automatique (dernier WB vs dernier LB),
formats WB/LB distincts. Les tournois rapides joués avant cette migration gardent leurs matchs
historiques `WINNERS`/`LOSERS`/`GRAND_FINAL` en base (jamais réécrits) — `BracketType` conserve
ces valeurs dans l'enum Prisma pour cette seule raison de compatibilité. Le fichier `lib/utils/
doubleElimination.ts` reste activement utilisé (`shufflePlayers`, `pairPlayers`,
`getQuickModeGameFormat`, importés par `lib/actions/quickTournament.ts` et `lib/db/tournament.ts`
pour le bassin unique) malgré son nom hérité de l'ancienne architecture WB/LB — seule la
séparation winners/losers/Grande Finale a disparu, pas ces fonctions pures de tirage/appariement/
format. Tests dans `lib/utils/doubleElimination.test.ts`.

## Phase 2 — En cours
### Notifications temps réel (Mercure) ✅
- Hub Mercure dans `docker-compose.yml` (port 9090, `dunglas/mercure`)
- `lib/mercure.ts` — JWT HS256 (sans dépendance externe), topic par tournoi, publisher fire-and-forget
- Route `/api/public/tournaments/[id]/mercure-token` — token abonné côté navigateur
- `MatchBoard` + `BracketLive` : URL token corrigée → endpoint DartsOpen local (plus SterPlatform)
- `TvBoard` : polling 5 s remplacé par SSE Mercure (fallback polling si hub absent)
- `score.ts` : publication automatique après chaque match finalisé

### Vue live publique (QR code) ✅
- `QuickBracketLive` — client Mercure/polling, grille unique de matchs (bassin unique) en temps réel
- `live/page.tsx` : détecte `quick_mode`, affiche `QuickBracketLive` à la place de `BracketLive`
- Bouton arbitrage absent sur la vue publique (`tournamentId` optionnel dans `QuickBracketView`)

### À venir
- Export PDF résultats du tournoi rapide (optionnel)
