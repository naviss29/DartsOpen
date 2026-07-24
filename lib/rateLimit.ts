/**
 * Rate limiting en mémoire, par IP + route.
 *
 * Portée volontairement limitée à un seul processus Node.js : DartsOpen est
 * déployé en conteneur unique (Coolify, pas de réplication horizontale), donc
 * une Map en mémoire du process suffit à couvrir l'ensemble du trafic réel.
 * Si le déploiement passe un jour en multi-instance, ce store devra être
 * remplacé par un backend partagé (Redis/Upstash).
 */

export interface RateLimitRule {
  /** Préfixe de chemin (comparé via pathname.startsWith) */
  prefix: string;
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Purge opportuniste pour éviter une croissance illimitée de la Map,
// sans dépendre de setInterval (non garanti en runtime edge).
const SWEEP_THRESHOLD = 5000;

function sweepExpired(now: number) {
  if (store.size < SWEEP_THRESHOLD) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, rule: Pick<RateLimitRule, "windowMs" | "max">): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= rule.max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Extrait l'IP cliente depuis les en-têtes posés par le reverse proxy (Traefik/Coolify). */
export function clientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}
