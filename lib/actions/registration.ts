"use server";

import { PLATFORM_FEE_CENTS } from "@/lib/platformFee";
import {
  dbGetTournament,
  dbCountRegistrations,
  dbAddRegistration,
  dbUpdateRegistrationPaymentId,
  dbGetOrganization,
} from "@/lib/db/tournament";
import { sendEmail } from "@/lib/api/sterplatform";
import { createPaymentCheckout, getStripeConnectStatus } from "@/lib/api/sterplatformInternal";
import { redirect } from "next/navigation";

export async function createRegistration(
  tournamentId: string,
  teamName: string,
  contactEmail: string,
  phone: string | null,
  playerNames: string[]
): Promise<{ error?: string }> {
  const tournament = await dbGetTournament(tournamentId);
  if (!tournament || tournament.status !== "OPEN") {
    return { error: "Ce tournoi n'accepte plus les inscriptions." };
  }

  if (phone && !/^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$/.test(phone.trim())) {
    return { error: "Numéro de téléphone invalide (ex : 0612345678)." };
  }

  const paidCount = await dbCountRegistrations(tournamentId, "PAID");
  if (paidCount * tournament.players_per_team >= tournament.max_players) {
    return { error: "Ce tournoi est complet." };
  }

  const platformFeeCents = PLATFORM_FEE_CENTS * tournament.players_per_team;

  const registration = await dbAddRegistration(tournamentId, {
    playerName: teamName,
    playerEmail: contactEmail,
    playerPhone: phone,
    playerNames,
    platformFeeCents,
  }).catch(() => null);

  if (!registration) return { error: "Erreur lors de l'inscription." };

  if (tournament.entry_fee === 0) {
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const d = new Date(tournament.date);
    const dateFr = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

    await sendEmail('dartsopen_inscription_confirmation', contactEmail, {
      nom_equipe: teamName,
      tournoi: tournament.name,
      date: dateFr,
      lieu: tournament.location,
      joueurs: playerNames.join(', '),
    }).catch((err) => console.error('[email] Erreur envoi confirmation gratuite:', err));

    redirect(`/t/${tournamentId}/register/success?name=${encodeURIComponent(teamName)}`);
  }

  // Paiement en ligne : nécessite que l'organisateur ait lié une organisation BApps Studio
  // avec un compte Stripe Connect opérationnel (mission DO-003 — DartsOpen ne dialogue plus
  // jamais directement avec Stripe, uniquement avec SterPlatform).
  const org = await dbGetOrganization(tournament.association_id);
  if (!org?.sterOrganizationSlug) {
    return { error: "Les paiements en ligne ne sont pas encore configurés pour ce tournoi. Contactez l'organisateur." };
  }

  // DO-PAYMENT-GUARD-001 — défense en profondeur, indépendante de la configuration du
  // tournoi : même si un tournoi (historique ou incohérent) affiche un paiement en ligne,
  // aucun checkout n'est créé si Stripe Connect n'est plus opérationnel au moment précis de
  // l'inscription — une suspension Stripe après coup bloque donc immédiatement les nouveaux
  // paiements, sans dépendre d'une modification préalable du tournoi. Relit toujours l'état
  // courant depuis SterPlatform, jamais une valeur mise en cache.
  const stripeStatus = await getStripeConnectStatus(org.sterOrganizationSlug).catch(() => null);
  if (!stripeStatus?.canReceivePayments) {
    return { error: "Les paiements en ligne ne sont pas disponibles pour ce tournoi actuellement. Contactez l'organisateur." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const amountCents = tournament.entry_fee * tournament.players_per_team;

  const { checkout, error } = await createPaymentCheckout({
    organizationSlug: org.sterOrganizationSlug,
    externalReference: registration.id,
    amountCents,
    currency: "eur",
    platformFeeCents,
    successUrl: `${appUrl}/t/${tournamentId}/register/success?name=${encodeURIComponent(teamName)}`,
    cancelUrl: `${appUrl}/t/${tournamentId}/register?cancelled=1`,
    customerEmail: contactEmail,
    metadata: { registration_id: registration.id, tournament_id: tournamentId },
  });

  if (error || !checkout) {
    console.error("[registration] Échec création paiement SterPlatform:", error);
    return { error: "Le paiement n'a pas pu être initié. Réessayez dans quelques instants." };
  }

  await dbUpdateRegistrationPaymentId(registration.id, checkout.paymentId);

  redirect(checkout.checkoutUrl);
}
