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
