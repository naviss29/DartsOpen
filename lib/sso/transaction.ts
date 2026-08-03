import { cookies } from "next/headers";

const TX_COOKIE = "do_sso_tx";

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  // Restreint à /api/auth/sso, jamais envoyé ailleurs — même logique que
  // OAuthController::REDIRECT_COOKIE_PATH côté SterPlatform.
  path: "/api/auth/sso",
  maxAge: 600,
};

export type PendingSsoTransaction = {
  state: string;
  verifier: string;
  next: string;
};

/** Une seule transaction locale à la fois — un nouvel appel à /sso/start en écrase toujours une précédente non consommée. */
export async function storeTransaction(tx: PendingSsoTransaction): Promise<void> {
  const store = await cookies();
  store.set(TX_COOKIE, JSON.stringify(tx), COOKIE_BASE);
}

/**
 * Toujours à usage unique : le cookie est supprimé qu'il ait pu être lu/parsé ou non, pour
 * qu'un rechargement de la page de callback ne puisse jamais rejouer la même transaction
 * locale (même contrat que BilletAsso/BSsite, AUTH-002 Partie 7).
 */
export async function consumeTransaction(): Promise<PendingSsoTransaction | null> {
  const store = await cookies();
  const raw = store.get(TX_COOKIE)?.value;
  store.delete({ name: TX_COOKIE, path: COOKIE_BASE.path });

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.state === "string" &&
      typeof parsed.verifier === "string" &&
      typeof parsed.next === "string"
    ) {
      return parsed as PendingSsoTransaction;
    }
  } catch {
    // Cookie malformé/altéré — traité comme absent.
  }

  return null;
}
