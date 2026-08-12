/**
 * SEC-005 — rate limiting distribué, partagé entre toutes les instances via PostgreSQL
 * (remplace l'ancienne Map en mémoire du process : ne survivait ni à un redémarrage, ni à une
 * réplication horizontale — chaque instance aurait eu son propre compteur, le débit réel
 * autorisé aurait été multiplié par le nombre d'instances actives).
 *
 * Exécuté depuis proxy.ts — le fichier de middleware Next.js 16, qui tourne toujours en
 * runtime Node.js (jamais Edge, contrairement à l'ancien middleware.ts) : le pilote
 * PostgreSQL réel (`pg`) y est donc disponible sans configuration supplémentaire.
 *
 * Atomicité : un unique UPSERT conditionnel (`INSERT ... ON CONFLICT DO UPDATE`), jamais un
 * SELECT suivi d'un calcul JS puis d'un UPDATE séparé — PostgreSQL sérialise les écritures
 * concurrentes sur la même ligne (verrou de ligne implicite de l'UPSERT), donc deux requêtes
 * simultanées sur la même clé ne peuvent jamais dépasser silencieusement le seuil.
 *
 * Fenêtre : fixe (comme l'implémentation en mémoire précédente — aucun changement de
 * comportement ici), recalculée par PostgreSQL (`now()`), jamais par une comparaison de
 * timestamps côté JS.
 */
import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";

export interface RateLimitRule {
  /** Préfixe de chemin (comparé via pathname.startsWith) */
  prefix: string;
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

// Nettoyage opportuniste (pas de scheduler dédié) : une fraction des appels purge les fenêtres
// expirées depuis longtemps, pour éviter une croissance illimitée de la table.
const CLEANUP_PROBABILITY = 0.01;
const CLEANUP_RETENTION_MS = 60 * 60 * 1000; // 1 heure

/** Sous-ensemble de PrismaClient utilisé ici — permet aux tests d'injecter un client distinct
 * (simulant une seconde instance applicative, avec sa propre connexion) sans jamais changer le
 * comportement de production (le paramètre par défaut reste le client partagé habituel). */
interface RateLimitStore {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

function hashKey(key: string): string {
  // Jamais l'IP en clair dans une table durable (contrairement à l'ancienne Map, volatile) —
  // seule l'égalité de clé est nécessaire, jamais la relecture de l'IP d'origine.
  return createHash("sha256").update(key).digest("hex");
}

export async function checkRateLimit(
  key: string,
  rule: Pick<RateLimitRule, "windowMs" | "max">,
  store: RateLimitStore = prisma,
): Promise<RateLimitResult> {
  if (Math.random() < CLEANUP_PROBABILITY) {
    void cleanupExpired(store).catch((err) => console.error("[rateLimit] Échec du nettoyage opportuniste:", err));
  }

  const hashedKey = hashKey(key);
  const resetAt = new Date(Date.now() + rule.windowMs);

  try {
    const rows = await store.$queryRaw<{ count: number; reset_at: Date }[]>`
      INSERT INTO rate_limit_buckets (key, count, reset_at)
      VALUES (${hashedKey}, 1, ${resetAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.reset_at <= now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
        reset_at = CASE WHEN rate_limit_buckets.reset_at <= now() THEN ${resetAt} ELSE rate_limit_buckets.reset_at END
      RETURNING count, reset_at
    `;
    const { count, reset_at: currentResetAt } = rows[0];

    if (count > rule.max) {
      const retryAfterSeconds = Math.max(0, Math.ceil((new Date(currentResetAt).getTime() - Date.now()) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    // Fail-open, assumé et journalisé : le rate limiting ici dissuade le spam/l'abus sur du
    // trafic public en lecture, ce n'est pas un contrôle de sécurité à lui seul (SEC-001, qui
    // protège réellement la saisie de score, est entièrement indépendant). Un repli silencieux
    // vers une Map locale donnerait une fausse impression de protection distribuée — jamais
    // fait. Si PostgreSQL est réellement indisponible, le reste de l'app (Prisma partout
    // ailleurs) échouera de toute façon peu après.
    console.error("[rateLimit] Store PostgreSQL indisponible, fail-open:", err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

async function cleanupExpired(store: RateLimitStore): Promise<void> {
  // Le seuil est calculé côté JS puis lié comme paramètre : un intervalle Postgres littéral
  // interpolé entre guillemets via un tagged template Prisma serait lié comme paramètre à
  // l'intérieur d'une chaîne SQL déjà quotée, ce que Postgres refuse (aucun placeholder n'est
  // reconnu entre guillemets simples).
  const cutoff = new Date(Date.now() - CLEANUP_RETENTION_MS);
  await store.$executeRaw`DELETE FROM rate_limit_buckets WHERE reset_at < ${cutoff}`;
}

/** Extrait l'IP cliente depuis les en-têtes posés par le reverse proxy (Traefik/Coolify). */
export function clientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}
