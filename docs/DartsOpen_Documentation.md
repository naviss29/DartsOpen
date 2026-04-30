# DartsOpen — Documentation technique

> Version : 0.1
> Auteur : Alan
> Date : Avril 2026
> Statut : **Phase 0 — Socle technique**

---

## Historique des versions

| Version | Date | Modifications |
|---|---|---|
| 0.1 | Avril 2026 | Document initial — socle technique |

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
| Hébergement | Coolify (VPS Hostinger) | Infrastructure existante |

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
| — | — | — | — |

---

## 8. Actions techniques réalisées

> Cette section trace les décisions et actions techniques importantes.

| # | Date | Action | Détail |
|---|---|---|---|
| 1 | Avril 2026 | Initialisation projet | Next.js 16.2.4, React 19, TypeScript, Tailwind CSS 4 |
| 2 | Avril 2026 | Structure répertoires | app/, components/, lib/, types/, docs/ |
| 3 | Avril 2026 | Git init | Branches main + develop |

---

## 9. Roadmap

- [ ] Phase 0 — Socle technique (Next.js, Supabase, Docker, git, CI)
- [ ] Phase 1 — Auth + Gestion tournoi (CRUD, configuration, poules, matchs)
- [ ] Phase 2 — Scores temps réel (QR code, saisie mobile, Supabase Realtime)
- [ ] Phase 3 — Tableaux de bord (matchs en cours/à venir, scores, annonce prochain match)
- [ ] Phase 4 — Inscriptions + paiement Stripe Connect
- [ ] Phase 5 — Phases finales (bracket)
- [ ] Phase 6 — Pipeline de recette (staging Coolify, CI GitHub Actions)
