import { NextRequest, NextResponse } from "next/server";
import { generateVerifier, challengeFor, generateState } from "@/lib/sso/pkce";
import { storeTransaction } from "@/lib/sso/transaction";
import { sanitizeNextPath } from "@/lib/sso/redirect";

const SSO_CLIENT_ID = "DARTSOPEN";

/**
 * Point d'entrée unique d'une transaction SSO côté DartsOpen (migration écosystème SSO,
 * même contrat que BilletAsso/BSsite, AUTH-002 Partie 7). Remplace les anciens appels
 * directs `POST /api/auth/login|register` : ouvre ici une transaction locale (state +
 * PKCE), la stocke le temps du aller-retour SterPlatform/BSsite, puis redirige vers
 * SterPlatform /sso/authorize. Jamais appelé directement par un lien visible — toujours via
 * proxy.ts ou un redirect() serveur (voir app/(auth)/login/page.tsx).
 */
export async function GET(request: NextRequest) {
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  const state = generateState();
  const verifier = generateVerifier();
  const challenge = challengeFor(verifier);

  await storeTransaction({ state, verifier, next });

  // Construites depuis NEXT_PUBLIC_APP_URL, jamais request.url : derrière le proxy Coolify,
  // request.url peut refléter l'hôte interne du conteneur plutôt que le domaine public.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const sterUrl = process.env.NEXT_PUBLIC_API_URL!;
  const redirectUri = `${appUrl}/api/auth/sso/callback`;

  const authorizeUrl = new URL("/api/auth/sso/authorize", sterUrl);
  authorizeUrl.searchParams.set("client_id", SSO_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authorizeUrl);
}
