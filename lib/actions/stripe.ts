"use server";

import { stripe, PLATFORM_FEE_CENTS } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function createStripeOnboardingLink(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: association } = await supabase
    .from("associations")
    .select("stripe_account_id, name, email")
    .eq("id", user.id)
    .single();

  if (!association) return { error: "Association introuvable." };

  let accountId = association.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: association.email,
      metadata: { association_id: user.id },
    });
    accountId = account.id;

    await supabase
      .from("associations")
      .update({ stripe_account_id: accountId })
      .eq("id", user.id);
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
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, entry_fee, players_per_team, status, max_players, association_id")
    .eq("id", tournamentId)
    .eq("status", "OPEN")
    .single();

  if (!tournament) return { error: "Ce tournoi n'accepte plus les inscriptions." };

  if (phone && !/^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$/.test(phone.trim())) {
    return { error: "Numéro de téléphone invalide (ex : 0612345678)." };
  }

  const { count } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "PAID");

  if ((count ?? 0) * tournament.players_per_team >= tournament.max_players) {
    return { error: "Ce tournoi est complet." };
  }

  const { data: association } = await supabase
    .from("associations")
    .select("stripe_account_id")
    .eq("id", tournament.association_id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Insère l'inscription en statut PENDING
  const { data: registration, error: insertError } = await supabase
    .from("registrations")
    .insert({
      tournament_id: tournamentId,
      player_name: teamName,
      player_email: contactEmail,
      player_phone: phone,
      player_names: playerNames,
      status: "PENDING",
    })
    .select("id, qr_code_token")
    .single();

  if (insertError || !registration) return { error: "Erreur lors de l'inscription." };

  // Si l'inscription est gratuite, passe directement à PAID (frais non collectés)
  if (tournament.entry_fee === 0) {
    await supabase
      .from("registrations")
      .update({
        status: "PAID",
        platform_fee_cents: PLATFORM_FEE_CENTS * tournament.players_per_team,
        fee_collected: false,
      })
      .eq("id", registration.id);

    redirect(`/t/${tournamentId}/register/success?name=${encodeURIComponent(teamName)}`);
  }

  const platformFeeCents = PLATFORM_FEE_CENTS * tournament.players_per_team;

  // Crée une session Stripe Checkout
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

  // Si l'association a un compte Stripe Connect, on l'utilise avec les frais plateforme
  if (association?.stripe_account_id) {
    sessionParams.payment_intent_data = {
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: association.stripe_account_id },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  // Stocke le session ID
  await supabase
    .from("registrations")
    .update({ stripe_payment_intent_id: session.id })
    .eq("id", registration.id);

  redirect(session.url!);
}
