import { createHmac } from "crypto";

const PRIVATE_URL = process.env.MERCURE_PRIVATE_URL ?? "";
const JWT_SECRET  = process.env.MERCURE_JWT_SECRET ?? "";

// ── JWT HS256 minimal (pas de dépendance externe) ─────────────────────────────

function b64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function signJwt(payload: object): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = b64url(JSON.stringify(payload));
  const sig    = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

// ── Topic ─────────────────────────────────────────────────────────────────────

export function mercureTopic(tournamentId: string): string {
  return `https://dartsopen.bapps-studio.com/tournaments/${tournamentId}/matches`;
}

// ── Tokens ────────────────────────────────────────────────────────────────────

/** Token JWT abonné — signé côté serveur, renvoyé au navigateur via /api/…/mercure-token */
export function generateSubscriberToken(tournamentId: string): string {
  return signJwt({ mercure: { subscribe: [mercureTopic(tournamentId)] } });
}

/** Token JWT publisher — usage interne (Next.js → hub Mercure) */
function generatePublisherToken(): string {
  return signJwt({ mercure: { publish: ["*"] } });
}

// ── Publication ───────────────────────────────────────────────────────────────

/**
 * Envoie un événement au hub Mercure après la finalisation d'un match.
 *
 * Fire-and-forget : ne rejette jamais (les erreurs sont loguées en warn).
 * Si MERCURE_PRIVATE_URL ou MERCURE_JWT_SECRET ne sont pas configurés,
 * la fonction retourne immédiatement sans rien faire.
 */
export async function publishMatchUpdate(tournamentId: string): Promise<void> {
  if (!PRIVATE_URL || !JWT_SECRET) return;

  const topic = mercureTopic(tournamentId);
  const token = generatePublisherToken();

  const body = new URLSearchParams();
  body.append("topic", topic);
  body.append("data", JSON.stringify({ tournamentId, ts: Date.now() }));

  await fetch(PRIVATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }).catch((err) => {
    console.warn("[mercure] publishMatchUpdate failed:", err);
  });
}
