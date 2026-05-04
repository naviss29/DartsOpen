# DartsOpen — Documentation technique

> Version : 0.5
> Auteur : Alan
> Date : Mai 2026
> Statut : **Phase 6 — CI/CD + recette**

---

## Historique des versions

| Version | Date | Modifications |
|---|---|---|
| 0.1 | Avril 2026 | Document initial — socle technique |
| 0.2 | Avril 2026 | Phase 1 — Auth Supabase, CRUD tournois + manches, middleware, SQL schema |
| 0.3 | Avril 2026 | Phase 2 — Joueurs, poules round-robin, matchs, scores temps réel, Supabase Realtime, NextMatchAlert |
| 0.4 | Mai 2026 | Phase 6 — CI GitHub Actions, scoring modes (ELECTRONIC/TRADITIONAL), QR codes pré-tournoi, génération de poules adaptive, correctifs lint (10 erreurs/warnings), 63 tests |
| 0.5 | Mai 2026 | Mise en production — Coolify sur Hetzner CX23 (Nuremberg), Traefik v3.6, diagnostic réseau Docker, URL production identifiée |

---

## 1. Présentation du projet

### Contexte

DartsOpen est né d'un besoin terrain constaté dans les tournois de fléchettes (open) : la gestion se fait encore sur papier, créant des embouteillages à la table de marque, un manque de visibilité pour les joueurs, et une charge mentale importante pour les organisateurs.

Ce projet est porté par un pratiquant de fléchettes qui est également développeur Full Stack. L'objectif est de proposer une plateforme SaaS simple, mobile-first, permettant à n'importe quelle association d'organiser son open de A à Z.

### Objectifs

- Permettre aux associations de créer et configurer un tournoi en quelques minutes
- Permettre aux joueurs de s'inscrire et payer en ligne
- Éliminer la table de marque papier : saisie des scores sur smartphone via QR code
- Afficher en temps réel les tableaux de matchs et de scores (salle + smartphone)
- Reverser automatiquement les inscriptions à l'association, déduction faite des frais plateforme

### Public cible

- Associations de fléchettes organisant des open (20 à 200 participants)
- Joueurs participants (saisie de scores, suivi du tournoi)
- Spectateurs (lecture seule des tableaux)

---

## 2. Stack technique

| Couche | Technologie | Justification |
|---|---|---|
| Framework | Next.js 16 (App Router + Server Actions) | SSR + API intégrée, idéal pour SaaS mobile-first |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui | Mobile-first, composants accessibles et personnalisables |
| Base de données | PostgreSQL 15 via Supabase | Robuste, RLS natif pour multi-tenant, gratuit au démarrage |
| Temps réel | Supabase Realtime | WebSockets sans infrastructure supplémentaire |
| Auth | Supabase Auth | JWT + OAuth, multi-rôles, magic link |
| Paiement | Stripe Connect | Versement direct aux associations, frais maîtrisés |
| QR Code | `qrcode` npm | Génération côté serveur simple |
| Tests | Vitest + @testing-library/react | Runner rapide, compatible Next.js |
| Containerisation | Docker + Docker Compose | Déploiement Coolify identique à FestManager |
| CI/CD | GitHub Actions | Tests auto sur PR + deploy staging/prod |
| Hébergement | Coolify v4 sur Hetzner CX23 (Nuremberg) — 2 vCPU, 4 GB RAM | Infrastructure partagée FestManager + DartsOpen |

---

## 3. Modèle de données (initial)

### Entités principales

```
Platform (implicite — une seule instance)

Association
├── id (uuid)
├── name
├── email
├── stripe_account_id (Stripe Connect)
└── created_at

Tournament
├── id (uuid)
├── association_id → Association
├── name
├── date
├── location
├── status (DRAFT | OPEN | IN_PROGRESS | FINISHED)
├── max_players
├── entry_fee (centimes)
├── nb_pools
├── nb_boards (cibles disponibles)
└── rounds: Round[]

Round (manche)
├── id
├── tournament_id → Tournament
├── order (1, 2, 3...)
├── game_type (CRICKET | 501 | 701 | 901 | ...)
├── entry_type (SINGLE | DOUBLE | TRIPLE)
└── finish_type (SINGLE | DOUBLE | TRIPLE)

Registration (inscription joueur)
├── id
├── tournament_id → Tournament
├── player_name
├── player_email
├── player_phone
├── stripe_payment_intent_id
├── status (PENDING | PAID | CANCELLED)
└── qr_code_token (accès mobile joueur)

Pool (poule)
├── id
├── tournament_id → Tournament
├── name (Poule A, Poule B...)
└── players: PoolPlayer[]

PoolPlayer
├── pool_id → Pool
├── registration_id → Registration
└── rank (classement final dans la poule)

Match
├── id
├── pool_id → Pool (null si phase finale)
├── bracket_round (null si poule)
├── board_number (numéro de cible)
├── status (PENDING | IN_PROGRESS | FINISHED)
├── player1_id → Registration
├── player2_id → Registration
└── sets: MatchSet[]

MatchSet (score par manche)
├── id
├── match_id → Match
├── round_id → Round
├── score_p1
├── score_p2
├── winner_id → Registration
├── validated_p1 (boolean — confirmation joueur 1)
└── validated_p2 (boolean — confirmation joueur 2)
```

### Règles métier validées

- Un match ne peut passer en FINISHED que si les deux joueurs ont confirmé le score de chaque set
- La détection "dernière manche" déclenche l'annonce du prochain match sur la cible
- Le classement de poule est calculé : victoires > sets gagnés > legs gagnés (à préciser selon règles FFD)
- Le reversement Stripe n'est déclenché qu'une fois le tournoi en statut FINISHED

---

## 4. Architecture technique

### Multi-tenant

Chaque association est un tenant isolé. L'isolation des données est assurée par :
- **Supabase RLS (Row Level Security)** : les policies PostgreSQL filtrent automatiquement par `association_id`
- **JWT Supabase** : le token contient le `association_id`, vérifié côté serveur

### Temps réel

```
Joueur saisit un score
        ↓
Server Action Next.js (validation + écriture PostgreSQL)
        ↓
Supabase Realtime broadcast (channel: tournament:{id})
        ↓
Tous les clients abonnés (salle + smartphones) → re-render instantané
```

### Flux paiement Stripe Connect

```
Joueur paye 20€
        ↓
Stripe reçoit le paiement (compte plateforme DartsOpen)
        ↓
Tournoi terminé → Stripe Transfer déclenché par webhook
        ↓
Association reçoit : 20€ - frais Stripe - 0,10€ plateforme
```

### QR Codes

- **QR "joueur"** : généré à l'inscription, envoyé par email → URL `/tournament/{id}/score?token={qr_code_token}`
- **QR "salle"** : affiché sur chaque cible → URL `/tournament/{id}/live` (lecture seule)
- **QR "match"** : généré par match → URL directe vers la saisie du score du match

---

## 5. Structure du projet

```
DartsOpen/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Layout association connectée
│   │   ├── dashboard/page.tsx
│   │   └── tournaments/
│   │       ├── page.tsx           # Liste tournois
│   │       ├── new/page.tsx       # Création tournoi
│   │       └── [id]/
│   │           ├── page.tsx       # Détail tournoi
│   │           ├── pools/page.tsx # Gestion poules
│   │           └── live/page.tsx  # Vue salle temps réel
│   ├── (tournament)/
│   │   └── tournament/[id]/
│   │       ├── live/page.tsx      # Vue publique (spectateur)
│   │       └── score/page.tsx     # Saisie score (joueur via QR)
│   └── api/
│       ├── webhooks/stripe/route.ts
│       └── qr/[token]/route.ts
├── components/
│   ├── ui/                        # shadcn/ui (Button, Card, Dialog...)
│   ├── tournament/
│   │   ├── MatchBoard.tsx         # Tableau matchs en cours/à venir
│   │   ├── ScoreBoard.tsx         # Tableau des scores par poule
│   │   ├── NextMatchAlert.tsx     # Annonce visuelle prochain match
│   │   └── ScoreForm.tsx          # Formulaire saisie score mobile
│   └── realtime/
│       └── RealtimeProvider.tsx   # Provider Supabase Realtime
├── lib/
│   ├── supabase/
│   │   ├── server.ts              # Client Supabase côté serveur
│   │   └── client.ts             # Client Supabase côté navigateur
│   ├── stripe/
│   │   └── index.ts              # Client Stripe
│   └── utils/
│       ├── qrcode.ts             # Génération QR codes
│       ├── bracket.ts            # Algorithme phases finales
│       └── pools.ts              # Génération poules + classement
├── types/
│   └── index.ts                  # Types TypeScript partagés
├── docs/
│   ├── DartsOpen_Documentation.md
│   └── pense-bete.md
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 6. RGPD

Données personnelles collectées :
- Nom, prénom, email, téléphone (inscription joueur)
- Données Stripe (traitées par Stripe, non stockées par DartsOpen)

Mesures :
- Consentement explicite à l'inscription
- Droit de suppression : endpoint API dédié
- Données de tournoi anonymisées X mois après la fin de l'événement (à définir)
- Aucune transmission à des tiers sans consentement

---

## 7. Erreurs à ne pas reproduire

> Cette section documente les erreurs techniques rencontrées pendant le développement, pour ne pas les reproduire.

| # | Contexte | Erreur | Solution |
|---|---|---|---|
| 1 | Zod 4 + validation email | `.string().email().trim()` valide l'email AVEC les espaces (email invalide), puis coupe — résultat : espaces autour de l'email font échouer la validation | Inverser l'ordre : **`.string().trim().email()`** — trim d'abord, puis validate. Idem pour `.trim().min(N)` |
| 2 | Next.js 16 — middleware | `middleware.ts` / export `middleware()` génère un warning de dépréciation | Renommer en `proxy.ts` et exporter `proxy()` — Next.js 16 a renommé le concept |
| 3 | entry_fee en centimes | Le formulaire affichait `defaultValue="10"` (centimes) au lieu de euros, Stripe recevait 10 cts | Zod `.transform(v => Math.round(v * 100))` sur entry_fee, `defaultValue={tournament.entry_fee / 100}` dans EditTournamentForm |
| 4 | npm run start sans build | `Error: Could not find a production build in the '.next' directory` | Utiliser `npm run dev` pour les tests locaux, `npm run build && npm run start` pour la prod |
| 5 | `useEffect` + `setState` synchrone | ESLint `react-hooks/set-state-in-effect` — appeler `setState` directement dans le corps d'un effet déclenche des renders en cascade | Initialiser l'état via une **fonction lazy** : `useState(() => { if (typeof window === 'undefined') return false; return !localStorage.getItem('key'); })` — pas besoin d'effet |
| 6 | Apostrophes dans JSX | ESLint `react/no-unescaped-entities` — les `'` dans le texte JSX provoquent une erreur de build CI | Remplacer par `&apos;` ou `{'\''}`  dans les nœuds texte JSX |
| 7 | `<a href>` navigation interne | ESLint `@next/next/no-html-link-for-pages` — utiliser `<a>` pour naviguer entre pages Next.js contourne le routeur (pas de prefetch, rechargement complet) | Toujours utiliser `<Link href>` de `next/link` pour la navigation interne |
| 8 | `<img>` pour les assets locaux | ESLint `@next/next/no-img-element` — `<img>` brut ne bénéficie pas de l'optimisation automatique (LCP dégradé, bande passante) | Utiliser `<Image>` de `next/image` avec `width` et `height` explicites |
| 9 | Params `_prevState`/`_formData` non reconnus | ESLint `@typescript-eslint/no-unused-vars` signale les params même préfixés `_` si la règle n'est pas configurée | Ajouter dans `eslint.config.mjs` : `"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]` |
| 10 | `main` vs `develop` — confusion staging/prod | Appeler `main` "staging" est incorrect | `develop` = staging/recette, `main` = production. On ne merge sur `main` que du code validé en recette |
| 11 | Supabase joins FK → tableaux en prod | En local TypeScript infère `player1` comme objet, en build prod strict il est inféré comme `{ id: any; player_name: any; }[]` (tableau) — `.id` échoue au type check | Normaliser après la requête : `player1: Array.isArray(m.player1) ? m.player1[0] : m.player1`. Faire cette normalisation une seule fois sur un tableau `normalizedMatches` et l'utiliser partout dans la page. Affecter **tous** les fichiers qui consomment des joins FK : pages, composants ET server actions |
| 12 | `startTransition` avec server action → `VoidOrUndefinedOnly` | React attend `() => void` dans `startTransition` mais les server actions retournent `Promise<{ error? }>` — erreur TypeScript en prod | Wrapper avec `void` : `startTransition(() => { void maServerAction(...) })` |
| 13 | `npm run build` non lancé avant merge main | Des erreurs TypeScript bloquent le build Coolify alors que le lint et les tests passent | Toujours lancer `npm run build` en local avant de merger sur `main` — le build strict TypeScript détecte des erreurs que le dev server ignore |
| 14 | Confusion `i` / `l` dans l'URL Coolify sslip.io | L'URL générée contient un `i` (ex. `jjbi4wsvrzdf…`) mais la police du navigateur le fait ressembler à un `l` → "no available server" car aucun routeur Traefik ne correspond | Copier-coller l'URL depuis Coolify (General → Domains), ne jamais la retaper. En cas de "no available server" inexpliqué, vérifier l'URL exacte via `curl http://localhost:8080/api/http/routers` sur le serveur |
| 15 | Conflit routeurs Traefik lors de redéploiements successifs | Plusieurs containers du même service tournent simultanément (Coolify crée le nouveau avant de supprimer l'ancien) → Traefik voit 2 containers avec le même nom de routeur → "Router defined multiple times" → routeur désactivé → "no available server" | Attendre que Coolify nettoie les anciens containers. Si le problème persiste, redémarrer `coolify-proxy` : `docker restart coolify-proxy`. Diagnostiquer via `docker logs coolify-proxy --since 5m` et l'API Traefik |
| 16 | `output: standalone` incompatible avec `next start` | Coolify (Nixpacks) lance `next start` par défaut, mais `output: standalone` requiert `node .next/standalone/server.js` → crash au démarrage | Supprimer `output: "standalone"` de `next.config.ts` si Nixpacks est utilisé avec `next start` |

---

## 8. Actions techniques réalisées

> Cette section trace les décisions et actions techniques importantes.

| # | Date | Action | Détail |
|---|---|---|---|
| 1 | Avril 2026 | Initialisation projet | Next.js 16.2.4, React 19, TypeScript, Tailwind CSS 4 |
| 2 | Avril 2026 | Structure répertoires | app/, components/, lib/, types/, docs/ |
| 3 | Avril 2026 | Git init | Branches main + develop |
| 4 | Avril 2026 | SQL schema Supabase | associations, tournaments, rounds avec RLS policies + trigger auto-création profil |
| 5 | Avril 2026 | Auth Supabase SSR | Middleware route guard, login/register avec useActionState, callback OAuth |
| 6 | Avril 2026 | CRUD Tournoi | Création, détail, gestion statut (DRAFT→OPEN→IN_PROGRESS→FINISHED), manches |
| 7 | Avril 2026 | Tests Phase 1 | 26 tests passants (auth schemas + tournament schemas + pools) |
| 8 | Avril 2026 | SQL migration 002 | registrations, pools, pool_players, matches, match_sets avec RLS |
| 9 | Avril 2026 | Algorithme round-robin | Rotation de Berger, assignation des cibles, calcul du gagnant |
| 10 | Avril 2026 | Supabase Realtime | MatchBoard + ScoreBoard abonnés aux tables matches + match_sets |
| 11 | Avril 2026 | NextMatchAlert | Détection dernière manche + overlay plein écran animé |
| 12 | Avril 2026 | ScoreForm mobile | Saisie par side (joueur 1/2), proposition + confirmation + contestation |
| 13 | Avril 2026 | Tests Phase 2 | 44 tests passants (+18 : bracket, score flow, détection dernière manche) |
| 14 | Avril 2026 | Navigation Phase 3 | Onglets Joueurs / Poules & Matchs / Vue Live sur la page détail tournoi et les sous-pages |
| 15 | Avril 2026 | QR codes vue live | Génération serveur (qrcode npm) : un QR par cible → `/t/[id]/score?board=N`, plus QR spectateurs → `/t/[id]/live` |
| 16 | Avril 2026 | Correctifs UX | Couleur texte/placeholder inputs, blocage démarrage sans joueurs, édition tournoi en brouillon, masquage tournois passés non clôturés |
| 17 | Avril 2026 | Phase 4 — Inscriptions + Stripe Connect | Page publique `/t/[id]/register`, Stripe Checkout, webhook `checkout.session.completed` → PAID, onboarding Stripe Connect association, client admin Supabase pour webhooks |
| 18 | Avril 2026 | Phase 5 — Bracket phases finales | Migration 003 (advancement_per_pool, bracket_position), seedBracket (puissance de 2, byes pour têtes de série), generateBracket, advanceToNextRound, BracketView, page /bracket, navigation mise à jour, 53 tests |
| 19 | Avril 2026 | Recette & correctifs | Fix NaN création tournoi (advancement_per_pool absent du formData), popup Stripe (frais, reversement, lien settings), page /contact (formulaire mailto par sujet), page /dons (PayPal SEProduct), logo Stêr Eo Production en sidebar |
| 20 | Mai 2026 | Recette Phase 6 — correctifs | proxy.ts (Next.js 16), entry_fee en euros→centimes (Zod transform), players_per_team, registration_mode ONLINE/ONSITE, player_names[], platform_fee_cents, fee_collected, page /activate (PayPal upfront), formulaire manche pré-rempli par type de jeu, section édition rétractable |
| 21 | Mai 2026 | CI GitHub Actions | Workflows ci.yml (lint+tests+build sur push/PR develop+main) et deploy.yml (webhook Coolify sur push main). 4 erreurs lint corrigées (setState dans effect, apostrophes JSX, `<a>` → `<Link>`, `<img>` → `<Image>`). Règle eslint argsIgnorePattern ajoutée. 63 tests passants. |
| 22 | Mai 2026 | Mise en ligne Coolify | Application créée dans Coolify v4 (Nixpacks, branche main, URL sslip.io HTTPS). 7 variables d'environnement configurées (Supabase + Stripe live + APP_URL). Webhook Stripe production créé (checkout.session.completed + account.updated). Token API Coolify `github-actions` (permission deploy). Secrets GitHub Actions ajoutés : COOLIFY_TOKEN + COOLIFY_WEBHOOK_URL. Migration 008_scoring_mode.sql à exécuter dans Supabase avant premier deploy. |
| 23 | Mai 2026 | Correctifs build prod | Fix 1 : apiVersion Stripe `2025-03-31.basil` → `2026-04-22.dahlia`. Fix 2 : normalisation Supabase FK joins (player1/player2/registrations) dans live, score, pools, bracket + server actions. Fix 3 : void-wrap startTransition (React VoidOrUndefinedOnly). Fix 4 : ci.yml actions v5 + Node.js 22. |
| 24 | Mai 2026 | Diagnostic Traefik "no available server" | Serveur = Hetzner CX23 (IP 167.235.134.247), pas Hostinger. Aucun firewall appliqué. Conflit de routeurs causé par 2 containers simultanés lors des redéploiements successifs → router désactivé. API Traefik activée temporairement (`--api.insecure=true`) pour diagnostic. Services UP sur `10.0.1.10:3000`. Cause finale : URL visitée avec `l` au lieu de `i` (confusion police). URL correcte : `https://jjbi4wsvrzdf084d64m07se2.167.235.134.247.sslip.io`. |
| 25 | Mai 2026 | Config Traefik durcie | Ajout `--providers.docker.network=coolify` et `--api.insecure=false` restauré dans `/data/coolify/proxy/docker-compose.yml`. |

---

## 9. Roadmap

- [x] Phase 0 — Socle technique (Next.js, Supabase, Docker, git, CI)
- [x] Phase 1 — Auth + Gestion tournoi (CRUD, configuration, poules, matchs)
- [x] Phase 2 — Scores temps réel (QR code, saisie mobile, Supabase Realtime)
- [x] Phase 3 — Navigation dashboard + QR codes cibles et spectateurs
- [x] Phase 4 — Inscriptions en ligne par équipe + paiement Stripe Connect
- [x] Phase 5 — Phases finales (bracket single-élimination, byes, avancement)
- [x] Phase 6 — Pipeline CI/CD (GitHub Actions lint+tests+build, Coolify production sur Hetzner)
- [ ] Phase 7 — Recette avec associations (tests terrain, domaine personnalisé)

---

## 10. Développements futurs (backlog)

> Idées validées à implémenter dans les prochaines phases. Pas d'ordre de priorité établi.

### Découverte & recherche
- **Annuaire des tournois publics** : page de recherche accessible sans compte
  - Filtres : sport, département (code INSEE), date, niveau (débutant / confirmé / open)
  - Référencement SEO par ville/département pour attirer les joueurs locaux
  - Ex : "Tournois de fléchettes dans le Finistère (29)"

### Multi-sport
- **Abstraction du type de sport** : permettre de gérer des tournois de pétanque, de pal, ou tout autre sport à format poules + phases finales
- La configuration des manches (501, Cricket…) devient optionnelle si le sport ne l'utilise pas

### Communication joueurs
- **Notifications / SMS** : prévenir le capitaine d'équipe lorsque son match approche (match précédent sur la même cible terminé)
- Canal : email (Resend), SMS (Twilio), ou notification push PWA

### Internationalisation (i18n)
- Support multilingue : français, anglais, breton (🙂)
- `next-intl` ou solution équivalente

### UX & fonctionnel
- **Score traditionnel avancé** : suivi Cricket case par case (15–20, bull) en mode traditionnel
- **Bracket double-élimination** : perdants repartent dans un tableau secondaire
- **Export PDF** : résultats complets du tournoi imprimables (poules + bracket + podium)
- **Tableau des scores en salle** : affichage grand écran (TV/vidéoprojecteur) de la vue Live en plein écran sans navigation

### Qualité & tests
- **Tests d'intégration server actions** : couvrir `proposeWinner`, `confirmWinner`, `markWinnerDirect`, `generatePools` avec une vraie base de données (Supabase local via `supabase start` ou PostgreSQL Docker)
  - Scénarios prioritaires : flux complet d'un match (propose → confirm → match FINISHED → activation match suivant), génération de poules avec différentes configurations
- **Tests d'intégration actions tournoi** : `updateTournamentStatus` (passage OPEN → IN_PROGRESS, clôture avec frais plateforme), `addPlayer`, `removePlayer`
- **Seuil de couverture CI** : ajouter `@vitest/coverage-v8` et imposer un minimum (ex. 80 %) dans le workflow GitHub Actions pour bloquer les PR en cas de régression
