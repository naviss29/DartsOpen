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

/** Ce que la page de confirmation sait du tournoi (aucune donnée sensible). */
export interface RegistrationSuccessTournament {
  players_per_team: number;
  scoring_mode: string;
  quick_mode?: boolean;
}

/**
 * Phrase « inscrit » selon le nombre de joueurs (recette du 29/10/2026) : la page disait
 * « L'équipe X est bien inscrite » même pour un joueur seul. Tournoi illisible → formule neutre
 * (sans « équipe »), jamais une affirmation fausse.
 */
export function registeredMessageKey(tournament: RegistrationSuccessTournament | null): MessageKey {
  if (tournament && tournament.players_per_team > 1) return "registerSuccess.team";
  return "registerSuccess.player";
}

/**
 * Conseil du jour J selon le mode de saisie (recette du 29/10/2026) : « scannez le QR code »
 * n'a de sens qu'en saisie électronique. En saisie traditionnelle — et en mode rapide, où
 * l'organisateur désigne lui-même le gagnant — les joueurs n'ont rien à scanner. Tournoi
 * illisible → aucun conseil plutôt qu'un conseil faux.
 */
export function dayOfMessageKey(tournament: RegistrationSuccessTournament | null): MessageKey | null {
  if (!tournament) return null;
  if (tournament.quick_mode || tournament.scoring_mode !== "ELECTRONIC") return "registerSuccess.organizerScoringHint";
  return "registerSuccess.scanHint";
}

/**
 * État réel d'un paiement en ligne vu par la page de retour.
 *
 * Pourquoi (règle n° 2 de bapps-payments) : le retour navigateur depuis Stripe ne prouve jamais un
 * paiement. La page affichait « paiement encaissé » sur la seule foi de `?paiement=en-ligne` ;
 * seul le webhook SterPlatform Payments passe l'inscription en PAID. La page relit donc l'état en
 * base et n'annonce « Inscription confirmée » que pour `confirmed`.
 *
 * - `pending` : en attente du webhook (réservation encore valide) → la page se relit seule ;
 * - `expired` : réservation dépassée sans confirmation (abandon, échec, webhook jamais reçu) ;
 * - `failed` : inscription annulée ;
 * - `refunded` : paiement arrivé trop tard (tournoi complet ou fermé), remboursement décidé ;
 * - `unknown` : inscription introuvable (ancien lien sans identifiant, URL modifiée, base
 *   indisponible) → aucune affirmation, l'e-mail de confirmation fait foi.
 */
export type OnlinePaymentState = "confirmed" | "pending" | "expired" | "failed" | "refunded" | "unknown";

export interface RegistrationPaymentSnapshot {
  status: string;
  reservationExpiresAt: Date | null;
}

export function onlinePaymentState(reg: RegistrationPaymentSnapshot | null, now: Date): OnlinePaymentState {
  if (!reg) return "unknown";
  switch (reg.status) {
    case "PAID":
      return "confirmed";
    case "PENDING":
      // Sans échéance (cas anormal pour un paiement en ligne) : on attend, sans jamais conclure
      // à un échec qui n'est pas prouvé.
      if (reg.reservationExpiresAt === null || reg.reservationExpiresAt > now) return "pending";
      return "expired";
    case "CANCELLED":
      return "failed";
    case "REFUND_PENDING":
    case "REFUNDED":
      return "refunded";
    default:
      return "unknown";
  }
}

/** Titre et message de la page de retour d'un paiement en ligne, selon l'état réel. */
export function onlinePaymentMessages(state: OnlinePaymentState): { title: MessageKey; body: MessageKey | null } {
  switch (state) {
    case "confirmed":
      return { title: "registerSuccess.title", body: "registerSuccess.paidOnline" };
    case "pending":
      return { title: "registerSuccess.pendingTitle", body: "registerSuccess.pendingBody" };
    case "expired":
      return { title: "registerSuccess.failedTitle", body: "registerSuccess.expiredBody" };
    case "failed":
      return { title: "registerSuccess.failedTitle", body: "registerSuccess.failedBody" };
    case "refunded":
      return { title: "registerSuccess.refundedTitle", body: "registerSuccess.refundedBody" };
    default:
      return { title: "registerSuccess.pendingTitle", body: "registerSuccess.pendingByEmail" };
  }
}
