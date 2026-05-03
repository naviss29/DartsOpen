# Guide de projet SaaS — Next.js + Supabase + Stripe + Coolify

> Document de référence pour les projets futurs.
> Basé sur l'expérience du projet DartsOpen (2026).

---

## 1. Démarrage du projet

### Stack recommandée

| Couche | Technologie |
|---|---|
| Framework | Next.js (App Router + Server Actions) |
| UI | React + Tailwind CSS + shadcn/ui |
| Base de données | Supabase (PostgreSQL + Auth + Realtime) |
| Paiement | Stripe Connect |
| Tests | Vitest |
| Containerisation | Docker + Docker Compose |
| Déploiement | Coolify (VPS Hostinger) |
| CI/CD | GitHub Actions |

### Initialisation

```bash
npx create-next-app@latest mon-projet --typescript --tailwind --app
cd mon-projet
git init
git checkout -b develop
git add .
git commit -m "init: socle Next.js"
git remote add origin https://github.com/TON_COMPTE/mon-projet.git
git push -u origin develop
```

### Structure de branches

- **`develop`** — branche de travail quotidienne, staging/recette
- **`main`** — production uniquement, on ne merge que du code validé en recette

> Ne jamais travailler directement sur `main`. Merger `develop → main` uniquement après validation.

---

## 2. Variables d'environnement

### Fichier `.env.local` (jamais commité)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NEXT_PUBLIC_APP_URL=https://mon-domaine.com
```

### Fichier `.env.example` (commité, sans valeurs)

Copier `.env.local` en retirant les valeurs — sert de référence pour les nouveaux développeurs et pour configurer Coolify.

---

## 3. Supabase

### Où trouver les clés

Supabase Dashboard → **Settings** → **API** :
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` (ne jamais exposer côté client)

### Migrations

Versionner toutes les modifications de schéma dans `supabase/migrations/` :

```
supabase/migrations/
├── 001_initial_schema.sql
├── 002_nouvelle_table.sql
└── 003_ajout_colonne.sql
```

Exécuter dans Supabase → **SQL Editor** en production.
Toujours utiliser `IF NOT EXISTS` / `IF EXISTS` pour l'idempotence :

```sql
ALTER TABLE public.ma_table ADD COLUMN IF NOT EXISTS ma_colonne VARCHAR(20) NOT NULL DEFAULT 'valeur';
```

### Client Supabase

Deux clients distincts :
- `lib/supabase/server.ts` — Server Components et Server Actions (cookie-based)
- `lib/supabase/client.ts` — Client Components (Realtime, interactions UI)
- `lib/supabase/admin.ts` — Webhooks uniquement (service_role, jamais dans le navigateur)

---

## 4. Stripe

### Où trouver les clés

Stripe Dashboard → **Développeurs** → **Clés API** :
- **Clé publique** (`pk_live_...`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Clé secrète** (`sk_live_...`) → `STRIPE_SECRET_KEY` (3 points → Révéler)

> Utiliser les clés `test` (`sk_test_`, `pk_test_`) en développement local, les clés `live` en production.

### Webhook Stripe

1. Stripe → **Développeurs** → **Webhooks** → **+ Ajouter un endpoint**
2. URL : `https://ton-domaine.com/api/webhooks/stripe`
3. Événements à sélectionner (uniquement ceux utilisés) :
   - `checkout.session.completed`
   - `account.updated`
4. Copier le **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`

> Le `whsec_` du Stripe CLI local (`stripe listen`) ne fonctionne PAS en production. Il faut en créer un nouveau dans le dashboard pour chaque environnement.

> Quand tu changes de domaine, supprimer l'ancien endpoint et en créer un nouveau — le `whsec_` change.

### Version de l'API Stripe

La version de l'API (`apiVersion`) dans `lib/stripe/index.ts` doit correspondre à la version attendue par le SDK installé. Si le build échoue avec `Type '"2025-xx-xx"' is not assignable to type '"2026-xx-xx"'`, mettre à jour la version :

```typescript
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia", // mettre la version attendue par le SDK
});
```

---

## 5. CI/CD avec GitHub Actions

### Workflow CI (`.github/workflows/ci.yml`)

Se déclenche sur push et PR vers `develop` et `main`. Exécute lint + tests + build.

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test:run
      - run: npm run build
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      NEXT_PUBLIC_APP_URL: http://localhost:3000
```

### Workflow Deploy (`.github/workflows/deploy.yml`)

Se déclenche uniquement sur push vers `main`. Appelle le webhook Coolify.

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deployment
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

### Secrets GitHub à configurer

GitHub → repo → **Settings** → **Secrets and variables** → **Actions** :

| Secret | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `COOLIFY_WEBHOOK_URL` | Coolify → application → Webhooks |
| `COOLIFY_TOKEN` | Coolify → Keys & Tokens → API Tokens |

---

## 6. Déploiement avec Coolify

### Ordre des opérations (première mise en ligne)

1. **Créer l'application dans Coolify**
   - Dashboard → Projects → ton projet → **+ New Resource**
   - **Public Repository** (repo public) ou **Private Repository with GitHub App** (repo privé)
   - Repo : `TON_COMPTE/mon-projet`, branche : `main`
   - Build pack : **Nixpacks** (détecte Next.js automatiquement)

2. **Configurer les variables d'environnement**
   - Application → **Environment Variables**
   - Ajouter toutes les variables du `.env.example` avec leurs valeurs de production

3. **Récupérer l'URL webhook Coolify**
   - Application → **Webhooks** → copier l'URL
   - Ajouter comme secret GitHub `COOLIFY_WEBHOOK_URL`

4. **Créer un token API Coolify**
   - Menu gauche → **Keys & Tokens** → onglet **API Tokens**
   - **+ Create** → nom : `github-actions`, permission : `deploy`
   - Copier le token → secret GitHub `COOLIFY_TOKEN`

5. **Exécuter les migrations Supabase** avant le premier deploy

6. **Lancer le premier déploiement**
   - Bouton **Deploy** dans Coolify → surveiller les **Logs**

### HTTPS avec sslip.io

Coolify génère automatiquement une URL `sslip.io`. Pour activer HTTPS :
- Application → **General** → champ **Domains**
- Remplacer `http://` par `https://`
- **Save** puis **Deploy** — Coolify génère un certificat Let's Encrypt

### Changer de domaine plus tard

1. Coolify → **Domains** → remplacer l'URL sslip.io par le vrai domaine
2. Mettre à jour `NEXT_PUBLIC_APP_URL` dans les variables Coolify
3. Mettre à jour l'endpoint Stripe (supprimer l'ancien, créer un nouveau)
4. Mettre à jour `STRIPE_WEBHOOK_SECRET` dans Coolify

---

## 7. ESLint — erreurs fréquentes à éviter

| Erreur | Cause | Solution |
|---|---|---|
| `react-hooks/set-state-in-effect` | `setState` appelé directement dans `useEffect` | Utiliser `useState(() => { ... })` (initialisation lazy) |
| `react/no-unescaped-entities` | Apostrophe `'` dans le texte JSX | Remplacer par `&apos;` |
| `@next/next/no-html-link-for-pages` | `<a href>` pour navigation interne | Utiliser `<Link href>` de `next/link` |
| `@next/next/no-img-element` | `<img>` pour les images/assets | Utiliser `<Image>` de `next/image` avec `width` et `height` |
| `@typescript-eslint/no-unused-vars` sur `_param` | Règle non configurée pour le préfixe `_` | Ajouter dans `eslint.config.mjs` : `argsIgnorePattern: "^_"` |

---

## 8. Tests

### Convention

- Un fichier de tests par module métier : `lib/utils/pools.test.ts`, `lib/actions/tournament.test.ts`
- Écrire les tests en même temps que le code, pas après
- Vitest + Testing Library pour Next.js

### Lancement

```bash
npm run test:run      # one-shot (CI)
npm test              # watch mode (développement)
```

---

## 9. Git — conventions

### Messages de commit

```
type: description courte en français

feat: ajout inscription par équipe
fix: correction calcul entry_fee en centimes
docs: mise à jour README phase 4
refactor: extraction logique bracket dans utils
test: ajout tests schema TournamentSchema
```

### Workflow quotidien

```bash
# Travailler sur develop
git checkout develop
# ... coder ...
git add fichier1 fichier2
git commit -m "feat: ma fonctionnalité"
git push origin develop

# Quand la recette est validée → merger en prod
git checkout main
git merge develop
git push origin main
# → déclenche le déploiement Coolify automatiquement
```

---

## 10. Documentation à tenir à jour

Dans `docs/` de chaque projet :

| Fichier | Contenu |
|---|---|
| `NomProjet_Documentation.md` | Stack, modèle de données, erreurs à ne pas reproduire, actions réalisées, roadmap |
| `Guide_Projet_SaaS.md` | Ce guide — générique, réutilisable |
| `pense-bete.md` | Idées futures, questions ouvertes, dette technique |

Mettre à jour la doc à chaque phase terminée, pas à la fin du projet.
