import type { MessageKey } from "@/lib/i18n/catalogs";

/**
 * Mode de règlement transmis à la page de confirmation d'inscription (`?paiement=`).
 *
 * Pourquoi : la page affichait toujours « Votre paiement a bien été encaissé », y compris pour un
 * tournoi gratuit ou réglé sur place (recette staging du 01/10/2026, BUG-3) — un joueur pouvait
 * croire avoir déjà payé et se présenter sans régler ses droits.
 */
export type RegistrationPaymentKind = "en-ligne" | "sur-place" | "gratuit";

/** Mode de règlement d'une inscription confirmée sans checkout (gratuit ou payé sur place). */
export function immediatePaymentKind(entryFeeCents: number): RegistrationPaymentKind {
  return entryFeeCents > 0 ? "sur-place" : "gratuit";
}

/**
 * Message à afficher selon le paramètre reçu. Une valeur absente ou inconnue (ancien lien, URL
 * modifiée à la main) ne doit jamais affirmer qu'un paiement a été encaissé : message neutre.
 */
export function successPaymentMessageKey(kind: string | undefined): MessageKey {
  if (kind === "en-ligne") return "registerSuccess.paidOnline";
  if (kind === "sur-place") return "registerSuccess.payOnSite";
  return "registerSuccess.seeYou";
}
