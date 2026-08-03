FROM node:22-alpine AS base

# Dépendances
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
# @naviss29/design-system vient d'un registre privé (npm.pkg.github.com) — authentifié via
# secret Docker Build (Coolify : interrupteur "Use Docker Build Secrets" sur la page
# Environment Variables), même mécanisme que BSsite. Jamais un ARG : BuildKit déconseille
# explicitement ARG/ENV pour des données sensibles (persistent dans le cache de build).
RUN --mount=type=secret,id=npm_auth_token \
    if [ -f /run/secrets/npm_auth_token ]; then \
      npm config set "//npm.pkg.github.com/:_authToken" "$(cat /run/secrets/npm_auth_token)"; \
    fi && \
    npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Image de production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# node_modules complets depuis deps : symlinks .bin/ intacts, toutes les dépendances Prisma CLI disponibles
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
# Build Next.js + assets statiques
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/public ./public
# Prisma : schema + migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib/generated ./lib/generated
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/next start"]
