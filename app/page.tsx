import { redirect } from "next/navigation";
import { getServerRefreshToken, getServerToken } from "@/lib/api/auth";
import { rootRedirectTarget } from "@/lib/rootRedirect";

/**
 * Filet de sécurité : la racine est normalement redirigée par proxy.ts (307). Si le proxy était
 * contourné, même règle ici — organisateur avec session → tableau de bord ; visiteur sans
 * session → présentation du produit sur la vitrine (lib/rootRedirect.ts).
 *
 * Pas de try/catch autour de cookies() : l'erreur « Dynamic server usage » qu'il lève au build
 * est le signal qui rend cette page dynamique ; l'avaler figerait au build une redirection vers
 * la vitrine pour tout le monde, y compris les organisateurs connectés.
 */
export default async function RootPage() {
  const hasSession = Boolean((await getServerToken()) || (await getServerRefreshToken()));
  redirect(rootRedirectTarget(hasSession));
}
