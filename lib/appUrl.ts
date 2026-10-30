/**
 * URL publique de DartsOpen pour un lien remis à quelqu'un d'autre (QR code de cible, QR
 * arbitre, retour de paiement Stripe).
 *
 * Pourquoi pas de repli : l'ancien `?? "http://localhost:3000"` produisait, si la variable
 * manquait au build, des QR codes imprimés et des retours de paiement pointant vers localhost —
 * un lien mort découvert seulement par le joueur, sur place. Une configuration incomplète doit
 * échouer tout de suite et lisiblement (journal serveur), jamais produire un lien faux.
 */
export class AppUrlMissingError extends Error {
  constructor(detail: string) {
    super(`NEXT_PUBLIC_APP_URL ${detail} : impossible de construire un lien public DartsOpen.`);
    this.name = "AppUrlMissingError";
  }
}

export function requireAppUrl(raw: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const value = (raw ?? "").trim();
  if (!value) throw new AppUrlMissingError("absente ou vide");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppUrlMissingError("invalide");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppUrlMissingError("invalide (http/https attendu)");
  }
  // Sans barre finale : les appelants concatènent `${base}/t/...`.
  return value.replace(/\/+$/, "");
}
