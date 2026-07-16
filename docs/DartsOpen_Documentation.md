# DartsOpen — Documentation technique

> Version : 1.4
> Auteur : Alan
> Date : Mai 2026
> Statut : **Phase 12 terminée — audit sécurité + performance appliqué**

---

## Historique des versions

| Version | Date | Modifications |
|---|---|---|
| 0.1 | Avril 2026 | Document initial — socle technique |
| 0.2 | Avril 2026 | Phase 1 — Auth Supabase, CRUD tournois + manches, middleware, SQL schema |
| 0.3 | Avril 2026 | Phase 2 — Joueurs, poules round-robin, matchs, scores temps réel, Supabase Realtime, NextMatchAlert |
| 0.4 | Mai 2026 | Phase 6 — CI GitHub Actions, scoring modes (ELECTRONIC/TRADITIONAL), QR codes pré-tournoi, génération de poules adaptive, correctifs lint (10 erreurs/warnings), 63 tests |
| 0.5 | Mai 2026 | Mise en production — Coolify sur Hetzner CX23 (Nuremberg), Traefik v3.6, diagnostic réseau Docker, URL production identifiée |
| 0.6 | Mai 2026 | Phases finales complètes — élimination directe 1-poule, auto-avancement depuis score.ts, BracketLive avec Realtime + polling, redesign visuel bracket (SVG), createServiceClient, 77 tests |
| 0.7 | Mai 2026 | Bracket refactorisé — affichage toutes colonnes dès le départ (placeholders ?), byes gérés côté serveur, doAdvanceToNextRound sans auth, auto-avancement depuis score.ts, BracketLive aligné, 83 tests |
| 0.8 | Mai 2026 | Dashboard branché sur les vraies données — compteurs réels, liste tournois récents, places prises/total via _count Prisma |
| 0.9 | Mai 2026 | Phase 8 recette staging — migrations auto Docker, file d'attente cibles, corrections UX formulaires, emails transactionnels, script seed interactif |
| 1.0 | Mai 2026 | Phase 9 recette active — attribution dynamique des cibles, email ONSITE, sender_name SterPlatform, refresh token proxy.ts, classement MG/MP, document Recette.md |
| 1.1 | Mai 2026 | Phase 10 — correction finalisation matchs (sets stale dans dbConfirmWinner), rétro-compatibilité tryFinalizeMatch, régénération poules IN_PROGRESS, vue live enrichie (couleurs, Derniers résultats, pagination À venir) |
| 1.2 | Mai 2026 | Phase 11 — têtes de série (dispatch serpentin), arbitrage admin par manche, dashboard multi-utilisateur, fix "Derniers résultats" (updated_at), migration OVH VPS-2, 103 tests |
| 1.3 | Mai 2026 | Phase 12 — validation 501 (scores impossibles, bust double out, positions de fermeture impossibles), historique des volées, 120 tests |
| 1.4 | Mai 2026 | Audit sécurité + performance — 12 index Prisma (Tournament, Round, Registration, Pool, PoolPlayer, Match, MatchSet), waterfalls → Promise.all (bracket + pool), take:100 dbListAllTournaments, vérification ownership sur toutes les Server Actions, next@16.2.6 (GHSA-36qx-fr4f-26g5 bypass middleware) |

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
├── seeded (boolean — tête de série, dispatch serpentin dans les poules)
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
├── updated_at (@updatedAt — timestamp de dernière modification, utilisé pour trier les "Derniers résultats")
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
- **`getOwnedTournament()`** (`lib/actions/access.ts`) : point d'entrée unique appelé par toutes les pages et Server Actions organisateur. Vérifie le JWT SterPlatform (`ster_token`), charge le tournoi et compare `tournament.association_id` au `user.id` — accès refusé (404) en cas de mismatch, sans révéler l'existence du tournoi
- Les pages et actions publiques (inscription, saisie de score) restent volontairement en dehors de ce contrôle

### Temps réel

```
Joueur saisit un score
        ↓
Server Action Next.js (validation + écriture PostgreSQL)
        ↓
Mercure hub (JWT HS256) publie sur le topic tournaments/{id}/matches
        ↓
Clients abonnés (SSE) → re-render instantané
        ↓
Fallback : polling automatique si Mercure indisponible (MatchBoard 3s, BracketLive/TvBoard 5s)
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
| 17 | `revalidatePath` pendant le rendu d'un Server Component | Appeler `revalidatePath` dans une fonction Server Action invoquée depuis un Server Component au rendu déclenche l'erreur "revalidatePath during render is unsupported" | Supprimer les appels `revalidatePath` des actions appelées depuis le rendu (ex. `generateBracket`). Les routes dynamiques Next.js se re-rendent de toute façon à la prochaine navigation |
| 18 | Server Action retournant `Promise<{error?}>` dans un `<form action>` | TypeScript exige `() => Promise<void>` pour les form actions. Une server action qui retourne `Promise<{error?}>` provoque l'erreur `VoidOrUndefinedOnly` | Envelopper dans une inline server action locale : `async function doAction() { "use server"; await maServerAction(id); }` puis passer `doAction` à `action={}` |
| 19 | `next/image` — avertissement ratio hauteur/largeur | Utiliser `className="w-auto"` en combinaison avec un `width` prop explicite force `width: auto` via CSS → Next.js avertit que la hauteur est inconnue | Utiliser `className="w-20"` (valeur fixe) + `style={{ height: "auto" }}` pour laisser le navigateur calculer la hauteur proportionnellement |
| 20 | Labels de tour incorrects sur bracket en cours de création | Utiliser `maxRound` (nombre de tours créés en DB) pour calculer `totalRounds` donne des labels erronés : "Finale" s'affiche quand 2 matchs restent car un seul tour existe | Calculer `totalRounds` depuis le 1er tour : `Math.round(Math.log2(r1Count)) + 1`. Ce calcul est stable même quand les tours suivants n'existent pas encore en base |
| 21 | Callback auth — cookies session non propagés au redirect | `createClient()` de next/headers écrit les cookies dans un store interne. Le `NextResponse.redirect()` retourné en fin de route est une réponse séparée — les cookies ne s'y trouvent pas → session perdue immédiatement | Créer la `NextResponse.redirect()` en premier, puis instancier le Supabase client avec `setAll` qui écrit directement sur `response.cookies`. Voir `app/auth/callback/route.ts` |
| 22 | PKCE reset password — lien expiré si changement de navigateur | `resetPasswordForEmail` avec PKCE stocke le code verifier dans un cookie. Si l'utilisateur clique le lien depuis un autre navigateur/appareil, le cookie est absent → `exchangeCodeForSession` échoue silencieusement → redirect vers `/dashboard` → middleware → `/login` | Utiliser le flow token_hash : route `/auth/confirm` + `verifyOtp({ token_hash, type })`. Pas de cookie requis, fonctionne cross-browser. Template email : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| 23 | Supabase redirectTo avec query params — rejet si pas dans la liste exacte | La Redirect URL autorisée était `/auth/callback` (exacte). Notre `redirectTo` = `/auth/callback?next=/reset-password` → Supabase rejette (pas de correspondance exacte) → redirige vers Site URL avec `#error=otp_expired` | Ajouter l'URL avec wildcard dans Supabase : `/auth/callback*` et `/auth/confirm*`. Les wildcards matchent les query strings. |
| 24 | `advanceToNextRound` avec auth dans un contexte public | Appeler `advanceToNextRound` (qui fait `redirect("/login")` si pas d'user) depuis une server action de page publique provoque un redirect inattendu pour le joueur qui saisit un score | Extraire la logique métier dans `doAdvanceToNextRound` (sans auth). `advanceToNextRound` garde la vérification d'auth pour le bouton organisateur. `doAdvanceToNextRound` est appelée sans auth depuis `score.ts`. |
| 25 | `poolsPending` toujours false quand aucun match de poule n'existe | `[].some(m => m.status !== "FINISHED")` retourne `false` → le bouton "Générer phases finales" s'affiche même avant que les poules soient terminées | Condition correcte : `poolMatches.length === 0 \|\| poolMatches.some(m => m.status !== "FINISHED")` |
| 26 | Dockerfile Node 20 incompatible Prisma 7 | `@prisma/streams-local` requiert Node ≥ 22 → build Docker échoue avec un `EBADENGINE` puis une erreur module introuvable | Utiliser `node:22-alpine` dans le Dockerfile |
| 27 | Client Prisma généré absent du build Docker | `lib/generated/prisma/` est dans `.gitignore` → le client n'existe pas dans l'image → `Cannot find module` au build | Ajouter `RUN npx prisma generate` avant `RUN npm run build` dans le stage builder du Dockerfile |
| 28 | P2021 — table `public.tournaments` inexistante au premier démarrage | DB PostgreSQL fraîchement provisionnée dans Coolify, aucune migration n'a jamais tourné → `PrismaClientKnownRequestError P2021` | Ajouter `prisma migrate deploy` dans le CMD Docker avant `next start`. Nécessite de copier `prisma/`, `prisma.config.ts`, et les `node_modules` complets (Prisma 7 a trop de dépendances transitives pour les copier individuellement depuis le stage standalone) |
| 29 | `Failed to find Server Action` après redéploiement | Le navigateur a en cache des hashes de Server Actions de l'ancien build → `404 RSC` au premier appel après déploiement | Hard refresh (Ctrl+Shift+R) ou vider le cache navigateur |
| 30 | VPS Hetzner CX23 gelé — SSH inaccessible | Build Docker concurrent + tous services actifs → pression mémoire → kernel OOM killer → VPS complètement gelé | Power cycle depuis la console Hetzner (Power → Power cycle). Éviter les builds parallèles (SterPlatform + DartsOpen simultanément) sur un CX23 4 Go RAM |
| 31 | `assignBoards` par poule → tous les matchs sur Cible 1 IN_PROGRESS | `generatePools` appelait `assignBoards` pour chaque poule séparément → le compteur d'index repartait à 0 pour chaque poule → `(0 % nbBoards) + 1 = 1` et `0 < nbBoards = true` pour tous | Collecter tous les appariements de toutes les poules dans un tableau global, puis appeler `assignBoards` une seule fois sur ce tableau complet |
| 32 | Compteur joueurs erroné sur dashboard (16 affiché au lieu de 32) | `players_paid` compte les lignes de la table `registrations` (une par équipe). Pour une doublette (`players_per_team=2`) : 16 inscriptions = 32 joueurs réels. Afficher `players_paid/max_players` comparait des pommes et des oranges | Afficher `players_paid × players_per_team / max_players` joueurs |

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
| 26 | Mai 2026 | Élimination directe 1-poule | Quand `nb_pools === 1` : page /pools affiche un message "Format élimination directe" + lien vers /bracket. `generateBracket` saute la vérification des poules et prend tous les joueurs PAID directement. `poolsPending = nb_pools === 1 ? false : pendingCount > 0`. |
| 27 | Mai 2026 | Auto-avancement bracket depuis score.ts | `tryAdvanceBracket(tournamentId, bracketRound)` appelé à la fin de `confirmWinner` et `markWinnerDirect` pour les matchs de phases finales (`!pool_id && bracket_round != null`). Utilise `createServiceClient()` (bypass RLS) car la page score est publique. Crée le tour suivant si tous les matchs sont FINISHED, ou marque le tournoi FINISHED si c'était la finale. |
| 28 | Mai 2026 | createServiceClient — client Supabase service role | `createServiceClient()` ajouté dans `lib/supabase/server.ts` pour les opérations server-side qui doivent bypasser le RLS (actions depuis pages publiques). Utilise `SUPABASE_SERVICE_ROLE_KEY`. |
| 29 | Mai 2026 | BracketLive — temps réel + polling | `BracketLive` (dark theme) combine Supabase Realtime (`postgres_changes` sur `matches`) et un polling `setInterval` à 5 secondes. Le Realtime gère les mises à jour instantanées, le polling sert de filet de sécurité pour les nouveaux tours créés côté serveur qui ne déclenchent pas toujours un événement Realtime immédiat. |
| 30 | Mai 2026 | Redesign visuel bracket — SVG connectors | `BracketView` et `BracketLive` redessinés avec connecteurs SVG entre les colonnes de tours. Chaque paire de matchs est reliée par 4 lignes : horizontale depuis match 0, verticale, horizontale depuis match 1, horizontale vers le match du tour suivant. Constantes : `CARD_H=72, CARD_W=220, CONN_W=48, BASE_SLOT=104`. |
| 31 | Mai 2026 | roundLabel + computeTotalRounds extraits vers bracket.ts | Fonctions `roundLabel` et `computeTotalRounds` extraites dans `lib/utils/bracket.ts` (exportées et testées). Les composants `BracketView` et `BracketLive` les importent depuis ce module au lieu de dupliquer la logique. 77 tests passants. |
| 32 | Mai 2026 | Mot de passe oublié — forgot-password + reset-password | Pages `(auth)/forgot-password` + `(auth)/reset-password`. Actions `requestPasswordReset` (email Supabase) et `updatePassword` (supabase.auth.updateUser). Lien "Mot de passe oublié ?" ajouté dans LoginForm. |
| 33 | Mai 2026 | Route /auth/confirm — token_hash cross-browser | Route `app/auth/confirm/route.ts` qui utilise `verifyOtp({ token_hash, type })` au lieu de `exchangeCodeForSession`. Avantage : pas besoin du code verifier PKCE → fonctionne depuis n'importe quel navigateur ou appareil. Template email Supabase mis à jour pour utiliser `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`. |
| 34 | Mai 2026 | Fix callback auth — cookies sur la réponse redirect | `app/auth/callback/route.ts` réécrit : le Supabase client écrit les cookies directement sur l'objet `NextResponse.redirect()` retourné, au lieu de passer par `cookies()` de next/headers (les cookies ne se propageaient pas sur la réponse finale). |
| 35 | Mai 2026 | Bracket — correction gestion des byes | `generateBracket` saute les paires bye (player2_id=null) — seuls les vrais matchs R1 sont créés en DB. `BracketView` et `BracketLive` affichent toutes les colonnes dès le départ via `totalRounds = Math.round(Math.log2(r1Slots)) + 1`. Les positions vides en R2+ affichent une `PlaceholderCard` (carte "?"). `r1Slots` est dérivé de la position max du 1er tour trouvé en DB. |
| 36 | Mai 2026 | doAdvanceToNextRound — extraction sans auth | `advanceToNextRound` (avec auth) délègue à `doAdvanceToNextRound` (sans auth, exportée). Permet d'appeler l'avancement depuis une page publique (score entry) sans redirect /login. Logique bye-aware conservée : si `sortedMatches.length < maxPosition + 1`, recalcule le seeding pour apparier bye-joueurs avec vainqueurs R1. |
| 37 | Mai 2026 | Auto-avancement bracket depuis score.ts | `confirmWinner` et `markWinnerDirect` dans `score.ts` appellent `doAdvanceToNextRound(tournamentId, bracketRound)` après finalisation d'un match de phase finale (`bracketRound != null`). Si tous les matchs du tour sont FINISHED, le tour suivant est créé automatiquement. Erreur silencieusement ignorée si des matchs restent en cours (`.catch(() => null)`). `tryFinalizeMatch` retourne désormais `bracketRound` dans son résultat. |
| 38 | Mai 2026 | BracketLive — alignement avec BracketView | `BracketLive` aligné sur `BracketView` : helpers `deriveR1Slots`, `expectedCount`, `slotHasCard` ajoutés, colonnes pour `totalRounds` (au lieu de `maxRound`), `PlaceholderCard` en thème sombre pour les positions vides en R2+, connecteurs SVG recalculés via `slotHasCard`. Le polling/SSE remplace les "?" par les vrais matchs dès qu'ils sont créés. |
| 39 | Mai 2026 | Dashboard branché sur les vraies données | La page `/dashboard` affichait des compteurs codés en dur (0) et "Aucun tournoi". Branchée sur `dbListTournaments` : compteurs réels (total, ouvertes, en cours, terminés), liste des 5 tournois les plus récents avec lien "Voir tout" si plus de 5. |
| 40 | Mai 2026 | Affichage places prises sur les listes de tournois | `dbListTournaments` inclut désormais un `_count` Prisma filtré sur `registrations.status = PAID`. Dashboard et "Mes tournois" affichent `{players_paid}/{max_players} joueurs` au lieu du seul max. |
| 41 | Mai 2026 | Fix Dockerfile — Node 22 + prisma generate | `node:20-alpine` → `node:22-alpine` (Prisma 7 / `@prisma/streams-local` requiert Node ≥ 22). Ajout de `npx prisma generate` avant `npm run build` dans le stage builder (le client généré est gitignored, il doit être régénéré à chaque build Docker). |
| 42 | Mai 2026 | Dockerfile — prisma migrate deploy au démarrage | CMD modifié : `sh -c "node_modules/.bin/prisma migrate deploy && node_modules/.bin/next start"`. Stage runner copie les `node_modules` complets depuis `deps` (Prisma 7 CLI a trop de dépendances transitives pour cherry-pick), `prisma/`, `prisma.config.ts`, `scripts/`, `lib/generated/`, `tsconfig.json`. Abandonne le `output: standalone` au profit de `next start` avec node_modules complets. |
| 43 | Mai 2026 | Emails transactionnels DartsOpen via SterPlatform | `lib/api/sterplatform.ts` : client `sendEmail(template, to, variables)` vers `POST /api/email/send` avec header `X-App-Token`. Envoi confirmation inscription gratuite dans `stripe.ts` (avant redirect). Envoi confirmation paiement Stripe dans `app/api/webhooks/stripe/route.ts` (après `dbMarkRegistrationPaid`). Template slug : `dartsopen_inscription_confirmation`. |
| 44 | Mai 2026 | Préservation des champs de formulaire après erreur serveur | Tous les formulaires (`TournamentForm`, `EditTournamentForm`, `AddPlayerForm`, `LoginForm`, `RegisterForm`, `ForgotPasswordForm`) retournent `fields` + `ts` dans le state d'erreur. Suppression du `key={state?.ts}` sur `TournamentForm` (causait un remount React qui effaçait les inputs malgré `defaultValue`). `key` conservé sur les formulaires "reset after success" (auth, AddPlayer). |
| 45 | Mai 2026 | File d'attente cibles — 1 match actif par cible | `assignBoards` désormais global (bug corrigé). `tryFinalizeMatch` démarre automatiquement le prochain match PENDING sur la même cible (`boardNumber`) à la fin de chaque match. `MatchBoard` : bannière ambre "Dernière manche — Prochain : X vs Y" quand `setsPlayed === totalSets - 1`. Numéro de cible affiché dans les cartes "À venir". |
| 46 | Mai 2026 | Script seed interactif `npm run seed:players` | `scripts/seed-tournament.ts` reécrit en mode interactif (readline) : charge `.env.local` automatiquement (parsing manuel, sans modifier les env vars existantes), liste les tournois disponibles numérotés, demande le nombre d'équipes. Dépendances dev `tsx` + `dotenv` ajoutées. |
| 47 | Mai 2026 | Affichage dashboard — corrections | Prix affiché `€/j` (par joueur). Icône mode inscription : `🌐 En ligne` / `🏠 Sur place`. Compteur joueurs corrigé : `players_paid × players_per_team / max_players`. |
| 48 | Mai 2026 | Email confirmation inscription ONSITE | `addPlayer` envoie désormais un email de confirmation via `sendEmail` après création de l'inscription manuelle. Même template `dartsopen_inscription_confirmation`. La date est formatée `DD/MM/YYYY` (fr-FR). |
| 49 | Mai 2026 | SterPlatform — champ `sender_name` sur EmailTemplate | Nouveau champ `sender_name VARCHAR(100) NULL` sur `email_templates`. Si renseigné, `MailerService::sendFromTemplate` utilise `Address(fromEmail, senderName)` comme expéditeur. Permet d'afficher "DartsOpen" au lieu de l'adresse email brute. Migration `Version20260520100000`. Visible dans EasyAdmin (champ "Nom expéditeur"). |
| 50 | Mai 2026 | Fix auth — refresh token déplacé dans proxy.ts | `getUser()` ne tente plus de rafraîchir le token (appel `cookies().set()` interdit en rendu RSC → erreur 3414022698). Le refresh est désormais dans `proxy.ts` (Next.js 16 middleware) : si le access token est absent mais qu'un refresh token existe, appel `POST /api/auth/refresh` → nouveaux cookies posés sur la réponse avant rendu. |
| 51 | Mai 2026 | Attribution dynamique des cibles | Nouvelle logique file d'attente : les matchs sont générés avec `boardNumber = 0` (non assigné) sauf les premiers `nb_boards` qui démarrent immédiatement sur les cibles 1..N. Quand un match se termine sur Cible X, `tryFinalizeMatch` prend le premier `PENDING / boardNumber=0` dans la queue globale (ordre `id asc`), lui assigne la Cible X et le passe `IN_PROGRESS`. `MatchBoard` affiche la queue plate numérotée #1, #2… sans cible. La bannière "Dernière manche" annonce quelle cible va se libérer et quel match est #1 en queue. |
| 52 | Mai 2026 | Classement poules — colonnes MG / MP | `ScoreBoard` calcule désormais les vrais sets gagnés/perdus depuis les données de sets (`sets[].winner_id`) au lieu d'utiliser le nombre de victoires de match. Deux nouvelles colonnes **MG** (Manches Gagnées, bleu) et **MP** (Manches Perdues, gris) dans le tableau de classement. `computePoolStandings` utilisait déjà le différentiel MG-MP comme critère de départage. |
| 53 | Mai 2026 | Document de recette — Recette.md | `docs/Recette.md` créé : 13 campagnes, 39 cas de test style Squash TM (préconditions, étapes, résultat attendu, ligne de test rapide), classés P1/P2/P3. Matrice de régression minimale : 11 tests (~20 min) à exécuter avant chaque déploiement prod. |
| 54 | Mai 2026 | Brevo — DKIM + DMARC bichetapps.com | Enregistrements DNS ajoutés dans Cloudflare pour `bichetapps.com` : brevo-code (TXT), DKIM 1 + DKIM 2 (CNAME), DMARC (TXT). Domaine vérifié dans Brevo. Les emails transactionnels sont désormais authentifiés. |
| 55 | Mai 2026 | Fix critique — finalisation match (dbConfirmWinner) | `dbConfirmWinner` passait `set.match` (stale) à `tryFinalizeMatch` : la dernière validation du 2ème joueur n'était pas reflétée dans les sets en mémoire, donc `confirmedSets.length < totalSets` → match jamais finalisé. Fix : mise à jour de l'objet `sets` en mémoire avant l'appel (`updatedSets = set.match.sets.map(…)`). |
| 56 | Mai 2026 | Fix — tryFinalizeMatch rétro-compatible | Anciens tournois générés avec l'ancien code avaient des matchs `PENDING` avec `boardNumber > 0`. `tryFinalizeMatch` ne cherchait que `boardNumber: 0`, ne trouvait rien, aucun match ne démarrait. Fix : fallback sur n'importe quel match `PENDING` si aucun `boardNumber=0` trouvé. |
| 57 | Mai 2026 | Régénération des poules en IN_PROGRESS | `generatePools` et `canGenerate` (pools/page.tsx) n'autorisaient que `status = OPEN`. Autorisé pour `IN_PROGRESS` également pour permettre la correction d'erreur en cours de tournoi (reset complet des matchs et scores). |
| 58 | Mai 2026 | Vue live — code couleur matchs | `MatchBoard` : EN COURS (manches restantes) → fond vert, barre gauche verte, point pulsant. TERMINÉ → fond bleu. À VENIR prochains (`nb_boards` matchs) → vert clair (emerald). File d'attente → gris. Matchs IN_PROGRESS toutes manches jouées → déplacés côté client dans "Derniers résultats" (statut FINISHED forcé). |
| 59 | Mai 2026 | Vue live — section Derniers résultats | Nouveau bloc affiché au-dessus de "En cours" : 1 carte par cible physique (dernier match FINISHED par `board_number`), vainqueur en bleu clair, perdant grisé, score manches (ex. 2 — 1). Mis à jour à chaque polling/SSE. |
| 60 | Mai 2026 | Vue live — pagination À venir | Maximum 20 matchs affichés dans la grille À venir. Si plus de 20, rotation automatique toutes les 10s avec indicateur de page (points cliquables). Page courante dérivée au rendu (`safePendingPage`) pour éviter le setState synchrone dans un effet (conformité règle ESLint `react-hooks/set-state-in-effect`). |
| 61 | Mai 2026 | Fix crash ArbitrateMatchButton — `sets` absent | `dbListPools` n'incluait pas les sets dans la requête matchs → `match.sets` était `undefined` → crash au rendu de la page poules. Fix : ajout de `sets: { include: { round: … } }` dans `dbListPools`, guard défensif `!match.sets?.length` dans `ArbitrateMatchModal`. |
| 62 | Mai 2026 | Têtes de série — champ `seeded` + dispatch serpentin | Migration `add_seeded_to_registration` : champ `seeded BOOLEAN DEFAULT false` sur `registrations`. `SeedToggleButton` (Client Component) appelle la server action `setSeedStatus`. `distributeWithSeeding` (lib/utils/pools.ts) : seeds dispatchés en serpentin (S1→pool0, S2→pool1, …, SN→poolN, SN+1→poolN en retour), non-seeds en round-robin. `generatePools` utilise `distributeWithSeeding` à la place de `distributePlayersIntoPools`. Colonne "Tête de série" sur la page joueurs (uniquement si DRAFT/OPEN/IN_PROGRESS). |
| 63 | Mai 2026 | Arbitrage admin par manche | `dbArbitrateMatch` : server action admin qui reçoit un tableau `{ setId, winnerId }`, met à jour chaque set, recalcule le vainqueur global du match et son statut (majoritaire avant dernière manche ou toutes manches jouées). `ArbitrateMatchModal` : dialog de correction avec un sélecteur de gagnant par manche. Accessible depuis la page poules (admin uniquement). |
| 64 | Mai 2026 | Dashboard multi-utilisateur | `dbListAllTournaments(currentUserId)` : retourne tous les tournois OPEN/IN_PROGRESS/FINISHED + tous les DRAFT de l'utilisateur courant, avec flag `is_mine`. Dashboard page réécrite : stats (mes tournois) + liste globale triée par statut (OPEN → IN_PROGRESS → FINISHED → DRAFT). Routage intelligent : `is_mine` → admin, OPEN autre → inscription, IN_PROGRESS/FINISHED autre → live, DRAFT autre → non cliquable. Badge "Mon tournoi" sur les propres tournois. |
| 65 | Mai 2026 | Fix "Derniers résultats" — tri par updated_at | `m.id > existing.id` comparait des UUID v4 (aléatoires, aucune sémantique temporelle) → dernier résultat par cible figé au premier match aléatoirement. Fix : champ `updated_at @updatedAt` ajouté sur `Match` (migration `add_updated_at_to_match`). `MatchBoard` et vue live comparent désormais les ISO strings `updated_at` pour identifier le dernier match terminé par cible. |
| 66 | Mai 2026 | Migration OVH VPS-2 | Serveur Hetzner CX23 abandonné (SSH inaccessible, passphrase et mot de passe root perdus). Nouveau serveur : OVH VPS-2 (6 vCores, 12 Go RAM, 100 Go NVMe, Ubuntu 25.04, datacenter US). Clé SSH ED25519 créée sans passphrase (`C:\Users\yveno\.ssh\dartsopen_ovh`). Coolify à installer sur le nouveau serveur après réception de l'IP OVH. |
| 67 | Mai 2026 | Fix migration P3009 — DEFAULT NOW() obligatoire | La migration `add_updated_at_to_match` générée par Prisma contenait `ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL` sans DEFAULT → échoue sur une table non vide (PostgreSQL rejette l'ajout d'une colonne NOT NULL sans valeur par défaut). Fix : SQL modifié manuellement → `ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW()`. Règle : toute migration ajoutant une colonne NOT NULL sur une table en production doit inclure un DEFAULT. |
| 68 | Mai 2026 | Validation 501 + historique des volées | `ScoreForm.tsx` — `SetScoreTracker` enrichi : (1) **Scores impossibles** : 9 valeurs physiquement inaccessibles en une volée (163, 166, 169, 172, 173, 175, 176, 178, 179) sont rejetées avec message d'erreur. (2) **Bust double/master out** : si le restant tomberait à 1, la volée est annulée (impossible de finir depuis 1 en double out). (3) **Warning fermeture impossible** : si le restant après saisie est dans {159, 162, 163, 165, 166, 168, 169}, avertissement jaune non bloquant. (4) **Historique** : état `throws[]` (joueur, score, restant, bust) — les 10 dernières volées s'affichent sous les scores, busts en rouge. 17 nouveaux tests dans `lib/utils/score501.test.ts`. |

---

## 9. Commandes utiles — référence rapide

### Développement local

| Commande | Description |
|---|---|
| `docker compose up -d` | Démarre PostgreSQL local (port 5433) |
| `docker compose down` | Arrête PostgreSQL local |
| `npm run dev` | Lance Next.js en mode développement → http://localhost:3000 |
| `npm run build` | Build de production (vérifie TypeScript + compilation) |
| `npm start` | Lance le serveur Next.js en mode production (après build) |
| `npm run lint` | Vérifie le code avec ESLint |

### Tests

| Commande | Description |
|---|---|
| `npm test` | Vitest en mode watch (relance à chaque modification) |
| `npm run test:run` | Vitest one-shot — CI / vérification avant commit |
| `npm run test:coverage` | Rapport de couverture de code |

### Prisma / Base de données

| Commande | Description |
|---|---|
| `npx prisma migrate dev` | Crée et applique une migration en développement (interactif — demande un nom) |
| `npx prisma migrate dev --name <nom>` | Crée et applique une migration avec un nom précis |
| `npx prisma migrate deploy` | Applique les migrations en attente (production / staging, non-interactif) |
| `npx prisma migrate resolve --rolled-back <nom>` | Marque une migration échouée comme annulée (débloque P3009) |
| `npx prisma generate` | Régénère le client Prisma (après modification du schéma) |
| `npx prisma migrate reset --force` | Réinitialise complètement la base locale (⚠️ efface toutes les données) |
| `npx prisma studio` | Interface web pour parcourir et modifier les données en local |

### Données de test

| Commande | Description |
|---|---|
| `npm run seed:players` | Remplit un tournoi avec des équipes fictives (interactif : choisir le tournoi + nombre d'équipes). Génère des noms bretons aléatoires. Nécessite un tournoi existant en base. |

### Staging (via SSH ou terminal Coolify)

| Commande | Description |
|---|---|
| `docker exec <container-app> npx prisma migrate deploy` | Applique les migrations en attente sur la base staging |
| `docker exec <container-postgres> psql -U dartsopen -d dartsopen` | Ouvre un shell PostgreSQL dans le conteneur |
| `TRUNCATE TABLE tournaments CASCADE;` | Vide toutes les données du tournoi (⚠️ irréversible — en psql) |
| `docker system prune -af --volumes` | Libère l'espace Docker (images, conteneurs arrêtés, volumes inutilisés — ⚠️ à utiliser avec précaution) |

### Git — workflow habituel

| Commande | Description |
|---|---|
| `git checkout develop` | Se placer sur la branche de développement |
| `git add <fichiers>` | Stager les fichiers modifiés |
| `git commit -m "feat/fix/chore: description"` | Créer un commit (convention : feat / fix / chore / test / docs) |
| `git push origin develop` | Pousser sur staging (Coolify se redéploie automatiquement si configuré) |
| `git merge develop` | Merger develop → main pour la mise en production (depuis la branche main) |

---

## 10. Checklist mise en production

> À valider dans l'ordre avant chaque merge `develop` → `main`.

### SMTP (SterPlatform gère tous les emails — register, forgot-password)

| Env | Action | Où |
|---|---|---|
| **Staging** | Configurer `MAILER_DSN` avec un vrai SMTP (ou Mailpit si suffisant) | Coolify → SterPlatform staging → Environment Variables |
| **Prod** | Configurer `MAILER_DSN` avec un vrai SMTP | Coolify → SterPlatform prod → Environment Variables |

Fournisseurs recommandés (gratuits pour commencer) :
- **Brevo** (ex-Sendinblue) : 300 emails/jour gratuit → `smtp://login:api_key@smtp-relay.brevo.com:587`
- **Resend** : 100 emails/jour gratuit → utiliser le relais SMTP `smtp.resend.com:465`
- **Gmail** : `smtp://adresse@gmail.com:mot_de_passe_applicatif@smtp.gmail.com:587` (créer un mot de passe applicatif dans les paramètres de sécurité Google)

Ne pas oublier de mettre à jour `APP_FROM_EMAIL` dans Coolify (ex: `noreply@dartsopen.fr`).

### DartsOpen staging (develop → Coolify staging)

| Étape | Action |
|---|---|
| App Coolify | Créer une app depuis `naviss29/DartsOpen`, branche `develop` |
| Variables d'environnement | `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL` (SterPlatform staging), `STER_ORG_SLUG=dartsopen`, `NEXT_PUBLIC_STER_ORG_SLUG=dartsopen`, `STRIPE_SECRET_KEY` (clé test), `STRIPE_WEBHOOK_SECRET` (test), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test) |
| Base de données | Créer une DB PostgreSQL dans Coolify (ou réutiliser celle de prod avec un schéma séparé) et injecter `DATABASE_URL` |
| Migration Prisma | Après premier déploiement : `docker exec <container> npx prisma migrate deploy` |
| Webhook Stripe staging | Créer un webhook Stripe en mode test pointant sur `https://<staging-url>/api/webhooks/stripe` |
| Build args Coolify | Supprimer `SUPABASE_SERVICE_ROLE_KEY` des build args Coolify (vestige Supabase, génère des warnings Docker) |

### DartsOpen prod (main → Coolify prod)

| Étape | Action |
|---|---|
| Merge | Merger `develop` → `main` uniquement après validation complète en staging |
| Migration Prisma | `docker exec <container> npx prisma migrate deploy` après chaque deploy avec migration |
| Webhook Stripe prod | Vérifier que le webhook prod pointe sur `https://<prod-url>/api/webhooks/stripe` |

---

## 10. Roadmap

- [x] Phase 0 — Socle technique (Next.js, Supabase, Docker, git, CI)
- [x] Phase 1 — Auth + Gestion tournoi (CRUD, configuration, poules, matchs)
- [x] Phase 2 — Scores temps réel (QR code, saisie mobile, Supabase Realtime)
- [x] Phase 3 — Navigation dashboard + QR codes cibles et spectateurs
- [x] Phase 4 — Inscriptions en ligne par équipe + paiement Stripe Connect
- [x] Phase 5 — Phases finales (bracket single-élimination, byes, avancement automatique, BracketLive temps réel)
- [x] Phase 6 — Pipeline CI/CD (GitHub Actions lint+tests+build, Coolify production sur Hetzner) + recette validée
- [x] Phase 7 — Emails transactionnels via SterPlatform (confirmation inscription gratuite + paiement)
- [x] Phase 8 — Recette staging : migrations auto Docker, file d'attente cibles, corrections UX formulaires
- [x] Phase 9 — Recette active : attribution dynamique des cibles, emails ONSITE, classement MG/MP, authentification proxy.ts
- [x] Phase 10 — Correction finalisation matchs (dbConfirmWinner), vue live enrichie (couleurs, Derniers résultats, pagination)
- [x] Phase 11 — Têtes de série (dispatch serpentin), arbitrage admin par manche, dashboard multi-utilisateur, migration OVH VPS-2
- [x] Phase 12 — Validation 501 (scores impossibles, bust double out, fermetures impossibles), historique des volées
- [ ] Phase 13 — Déploiement OVH VPS-2 + recette terrain

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
