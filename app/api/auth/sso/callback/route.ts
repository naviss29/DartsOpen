import { NextRequest, NextResponse } from "next/server";
import { consumeTransaction } from "@/lib/sso/transaction";
import { setAuthCookies } from "@/lib/api/auth";

const SSO_CLIENT_ID = "DARTSOPEN";

/**
 * Callback serveur du protocole SSO (migration écosystème SSO) — remplace les anciens
 * appels directs `POST /api/auth/login|register` (mot de passe transmis en clair à
 * SterPlatform depuis lib/actions/auth.ts, désormais supprimé). L'URL ne contient jamais
 * qu'un `code` opaque à usage unique et un `state` : le jeton n'apparaît que dans la réponse
 * JSON d'un échange serveur-à-serveur authentifié par secret client, jamais dans une URL ni
 * un log d'accès.
 *
 * Contrairement à BilletAsso, DartsOpen n'a pas de notion d'Organization SterPlatform
 * (`association_id` compare directement au `user.id`, voir CLAUDE.md) — aucune création
 * d'organisation à déclencher ici.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  // Toujours consommée, même si code/state sont absents — un rechargement de cette page ne
  // doit jamais retrouver une transaction encore valide à rejouer.
  const tx = await consumeTransaction();

  if (!code || !state || !tx || tx.state !== state) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SSO_CLIENT_ID,
        client_secret: process.env.STER_SSO_CLIENT_SECRET,
        code,
        redirect_uri: `${appUrl}/api/auth/sso/callback`,
        code_verifier: tx.verifier,
      }),
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL("/login", appUrl));
    }

    const data = await res.json();
    await setAuthCookies(data.token, data.refresh_token);

    return NextResponse.redirect(new URL(tx.next, appUrl));
  } catch (err) {
    console.error("[sso/callback] Échec de l'échange SSO:", err);
    return NextResponse.redirect(new URL("/login", appUrl));
  }
}
