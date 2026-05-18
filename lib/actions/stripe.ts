"use server";

import { stripe, PLATFORM_FEE_CENTS } from "@/lib/stripe";
import { getUser } from "@/lib/api/auth";
import { redirect } from "next/navigation";
import {
  dbGetTournament,
  dbCountRegistrations,
  dbAddRegistration,
  dbUpdateRegistrationStripeSession,
  dbGetOrganization,
  dbUpsertOrganizationStripeAccount,
} from "@/lib/db/tournament";
import { sendEmail } from "@/lib/api/sterplatform";

export async function createStripeOnboardingLink(): Promise<{ url?: string; error?: string }> {
  const user = await getUser();
  if (!user) redirect("/login");

  const org = await dbGetOrganization(user.id);
  let accountId = org?.stripeAccountId ?? null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      metadata: { user_id: user.id },
    });
    accountId = account.id;
    await dbUpsertOrganizationStripeAccount(user.id, accountId);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/settings`,
    return_url: `${appUrl}/settings?stripe=connected`,
    type: "account_onboarding",
  });

  return { url: link.url };
}

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

  const org = await dbGetOrganization(tournament.association_id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "payment",
    customer_email: contactEmail,
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: tournament.entry_fee,
          product_data: {
            name: `Inscription — ${tournament.name}`,
            description: `Équipe : ${teamName} (${tournament.players_per_team} joueur${tournament.players_per_team > 1 ? "s" : ""})`,
          },
        },
        quantity: tournament.players_per_team,
      },
    ],
    metadata: { registration_id: registration.id, tournament_id: tournamentId },
    success_url: `${appUrl}/t/${tournamentId}/register/success?name=${encodeURIComponent(teamName)}`,
    cancel_url: `${appUrl}/t/${tournamentId}/register?cancelled=1`,
  };

  if (org?.stripeAccountId) {
    sessionParams.payment_intent_data = {
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: org.stripeAccountId },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  await dbUpdateRegistrationStripeSession(registration.id, session.id);

  redirect(session.url!);
}
