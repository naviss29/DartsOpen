"use server";

import { PLATFORM_FEE_CENTS } from "@/lib/platformFee";
import {
  dbGetTournament,
  dbReserveRegistrationSlot,
  dbUpdateRegistrationPaymentId,
  dbGetOrganization,
} from "@/lib/db/tournament";
import { sendEmail } from "@/lib/api/sterplatform";
import { createPaymentCheckout, getStripeConnectStatus } from "@/lib/api/sterplatformInternal";
import { redirect } from "next/navigation";

/**
 * DARTSOPEN-MONETIZATION-002 (audit DO-AUD-009) — how long a PENDING online-payment reservation
 * holds its slot before dbReserveRegistrationSlot()/dbCountOccupiedSlots() stop counting it.
 * Deliberately generous relative to a typical Stripe Checkout session (a few minutes) — this is
 * a safety net against an abandoned/failed checkout permanently blocking a slot, not a tight
 * race with legitimate completion time.
 */
const RESERVATION_TTL_MINUTES = 30;

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

  const platformFeeCents = PLATFORM_FEE_CENTS * tournament.players_per_team;

  // DARTSOPEN-MONETIZATION-001 : payment_mode est indépendant de registration_mode (mission
  // §5/§6) — un tournoi payant en payment_mode ONSITE (Stripe Connect absent, ou choix
  // explicite de l'organisateur) confirme l'inscription immédiatement, exactement comme un
  // tournoi gratuit : les droits sont réglés sur place, jamais via un checkout Stripe.
  const confirmsImmediately = tournament.entry_fee === 0 || tournament.payment_mode !== "ONLINE";

  if (confirmsImmediately) {
    // DARTSOPEN-MONETIZATION-002/004 (audit DO-AUD-003/DO-AUD-004, contre-audit P3/P4) : une
    // inscription gratuite ou payée sur place occupe réellement une place dès sa création
    // (status PAID, jamais PENDING) — capacité ET éligibilité du tournoi (statut OPEN) revérifiées
    // atomiquement sous le même verrou, jamais un count-then-insert séparé ni une lecture de
    // statut faite avant cet appel (la lecture ci-dessus n'est qu'un filtre rapide, pas la
    // décision finale).
    const result = await dbReserveRegistrationSlot(tournamentId, ["OPEN"], {
      playerName: teamName,
      playerEmail: contactEmail,
      playerPhone: phone,
      playerNames,
      platformFeeCents,
      status: "PAID",
    }).catch((err) => {
      console.error('[createRegistration] dbReserveRegistrationSlot (confirmsImmediately):', err);
      return null;
    });

    if (!result) return { error: "Erreur lors de l'inscription." };
    if (result.outcome === "FULL") return { error: "Ce tournoi est complet." };
    if (result.outcome === "NOT_OPEN" || result.outcome === "NOT_FOUND") {
      return { error: "Ce tournoi n'accepte plus les inscriptions." };
    }

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

  // Paiement en ligne — DARTSOPEN-MONETIZATION-002 (audit priorité 6) : Connect, puis droits,
  // puis capacité/réservation, dans cet ordre — jamais réserver une place pour un paiement qui
  // ne pourra de toute façon jamais être initié.

  // 1. Connect : nécessite que l'organisateur ait lié une organisation BApps Studio avec un
  // compte Stripe Connect opérationnel (mission DO-003 — DartsOpen ne dialogue plus jamais
  // directement avec Stripe, uniquement avec SterPlatform).
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
  const stripeStatus = await getStripeConnectStatus(org.sterOrganizationSlug).catch((err) => {
    console.error("[registration] Échec lecture statut Stripe Connect SterPlatform:", org.sterOrganizationSlug, err);
    return null;
  });
  if (!stripeStatus?.canReceivePayments) {
    return { error: "Les paiements en ligne ne sont pas disponibles pour ce tournoi actuellement. Contactez l'organisateur." };
  }

  // 2. Capacité/réservation — atomique, avec expiration (DO-AUD-009) : si le checkout Stripe
  // n'est jamais créé ou jamais complété (échec, abandon), cette réservation PENDING cesse
  // d'occuper sa place dès l'expiration, sans nécessiter de nettoyage explicite ni laisser une
  // inscription orpheline permanente.
  const reservationExpiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
  const result = await dbReserveRegistrationSlot(tournamentId, ["OPEN"], {
    playerName: teamName,
    playerEmail: contactEmail,
    playerPhone: phone,
    playerNames,
    platformFeeCents,
    status: "PENDING",
    reservationExpiresAt,
  }).catch((err) => {
    console.error('[createRegistration] dbReserveRegistrationSlot (online):', err);
    return null;
  });

  if (!result) return { error: "Erreur lors de l'inscription." };
  if (result.outcome === "FULL") return { error: "Ce tournoi est complet." };
  if (result.outcome === "NOT_OPEN" || result.outcome === "NOT_FOUND") {
    return { error: "Ce tournoi n'accepte plus les inscriptions." };
  }
  const registration = result.registration;

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
    // La réservation reste PENDING et expirera d'elle-même (RESERVATION_TTL_MINUTES) — jamais
    // une inscription orpheline permanente (DO-AUD-009), jamais besoin de la supprimer ici.
    return { error: "Le paiement n'a pas pu être initié. Réessayez dans quelques instants." };
  }

  await dbUpdateRegistrationPaymentId(registration.id, checkout.paymentId);

  redirect(checkout.checkoutUrl);
}
