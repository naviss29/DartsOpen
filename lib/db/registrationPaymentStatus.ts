import { prisma } from "./client";
import type { RegistrationStatus } from "../generated/prisma/client";

/** Ce que la page de retour de paiement a le droit de savoir d'une inscription (aucune donnée personnelle). */
export interface RegistrationPaymentStatus {
  status: RegistrationStatus;
  reservationExpiresAt: Date | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * État réel du paiement d'une inscription, relu en base pour la page de retour de paiement.
 *
 * Pourquoi : le retour navigateur depuis Stripe ne prouve jamais un paiement (règle n° 2 de
 * bapps-payments) ; seul le webhook SterPlatform Payments passe l'inscription en PAID. La page
 * relit donc cet état au lieu de croire `?paiement=en-ligne`.
 *
 * L'identifiant vient de l'URL (modifiable à la main) : on exige aussi le tournoi de la page, pour
 * qu'une inscription d'un autre tournoi ne soit jamais lue, et on ne renvoie que le statut — ni nom,
 * ni e-mail. Un identifiant mal formé ne déclenche aucune requête.
 */
export async function dbGetRegistrationPaymentStatus(
  registrationId: string,
  tournamentId: string,
): Promise<RegistrationPaymentStatus | null> {
  if (!UUID_PATTERN.test(registrationId)) return null;
  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, tournamentId },
    select: { status: true, reservationExpiresAt: true },
  });
  return reg ?? null;
}
