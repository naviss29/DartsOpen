"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TournamentStatus } from "@/types";
import { stripe } from "@/lib/stripe";

const TournamentSchema = z.object({
  name: z.string().min(3, "Le nom doit contenir au moins 3 caractères.").trim(),
  date: z.string().min(1, "La date est requise."),
  location: z.string().min(2, "Le lieu est requis.").trim(),
  max_players: z.coerce.number().int().min(2, "Minimum 2 joueurs.").max(512, "Maximum 512 joueurs."),
  entry_fee: z.coerce.number().min(0, "Le montant ne peut pas être négatif.").transform(v => Math.round(v * 100)),
  nb_pools: z.coerce.number().int().min(1, "Minimum 1 poule.").max(64, "Maximum 64 poules."),
  nb_boards: z.coerce.number().int().min(1, "Minimum 1 cible.").max(32, "Maximum 32 cibles."),
  advancement_per_pool: z.coerce.number().int().min(1, "Minimum 1 qualifié par poule.").max(8, "Maximum 8 qualifiés par poule."),
  players_per_team: z.coerce.number().int().min(1, "Minimum 1 joueur par équipe.").max(10, "Maximum 10 joueurs par équipe."),
  registration_mode: z.enum(["ONLINE", "ONSITE"]).default("ONLINE"),
  scoring_mode: z.enum(["ELECTRONIC", "TRADITIONAL"]).default("ELECTRONIC"),
});

const RoundSchema = z.object({
  tournament_id: z.string().uuid(),
  order: z.coerce.number().int().min(1),
  game_type: z.enum(["CRICKET", "501", "701", "901", "1001"]),
  entry_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE"]),
  finish_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "MASTER"]),
});

export type TournamentState = {
  error?: string;
  errors?: Record<string, string[]>;
} | undefined;

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createTournament(prevState: TournamentState, formData: FormData): Promise<TournamentState> {
  const parsed = TournamentSchema.safeParse({
    name: formData.get("name"),
    date: formData.get("date"),
    location: formData.get("location"),
    max_players: formData.get("max_players"),
    entry_fee: formData.get("entry_fee"),
    nb_pools: formData.get("nb_pools"),
    nb_boards: formData.get("nb_boards"),
    advancement_per_pool: formData.get("advancement_per_pool"),
    players_per_team: formData.get("players_per_team"),
    registration_mode: formData.get("registration_mode") ?? "ONLINE",
    scoring_mode: formData.get("scoring_mode") ?? "ELECTRONIC",
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("tournaments")
    .insert({ ...parsed.data, association_id: user.id })
    .select("id")
    .single();

  if (error) {
    return { error: "Erreur lors de la création du tournoi." };
  }

  revalidatePath("/tournaments");
  redirect(`/tournaments/${data.id}/activate`);
}

export async function updateTournamentStatus(
  tournamentId: string,
  status: TournamentStatus
): Promise<{ error?: string } | void> {
  const { supabase } = await getAuthenticatedUser();

  if (status === "IN_PROGRESS") {
    const { count } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("status", "PAID");

    if (!count || count < 2) {
      return { error: "Il faut au moins 2 joueurs inscrits pour démarrer le tournoi." };
    }
  }

  const { error } = await supabase
    .from("tournaments")
    .update({ status })
    .eq("id", tournamentId);

  if (error) return { error: "Impossible de mettre à jour le statut." };

  // À la clôture : prélever les frais plateforme non collectés (inscriptions manuelles / gratuites)
  if (status === "FINISHED") {
    const { data: unpaid } = await supabase
      .from("registrations")
      .select("platform_fee_cents")
      .eq("tournament_id", tournamentId)
      .eq("status", "PAID")
      .eq("fee_collected", false);

    const totalOwed = (unpaid ?? []).reduce((sum, r) => sum + (r.platform_fee_cents ?? 0), 0);

    if (totalOwed > 0) {
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("association_id")
        .eq("id", tournamentId)
        .single();

      const { data: association } = await supabase
        .from("associations")
        .select("stripe_account_id")
        .eq("id", tournament?.association_id)
        .single();

      if (association?.stripe_account_id) {
        try {
          await stripe.paymentIntents.create({
            amount: totalOwed,
            currency: "eur",
            payment_method_types: ["card"],
            transfer_data: { destination: association.stripe_account_id },
            description: `Frais plateforme DartsOpen — tournoi ${tournamentId}`,
            metadata: { tournament_id: tournamentId, type: "platform_fee" },
          });

          await supabase
            .from("registrations")
            .update({ fee_collected: true })
            .eq("tournament_id", tournamentId)
            .eq("fee_collected", false);
        } catch (e) {
          console.error("[clôture] Erreur prélèvement frais plateforme:", e);
        }
      }
    }
  }

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function updateTournament(prevState: TournamentState, formData: FormData): Promise<TournamentState> {
  const tournamentId = formData.get("tournament_id") as string;

  const parsed = TournamentSchema.safeParse({
    name: formData.get("name"),
    date: formData.get("date"),
    location: formData.get("location"),
    max_players: formData.get("max_players"),
    entry_fee: formData.get("entry_fee"),
    nb_pools: formData.get("nb_pools"),
    nb_boards: formData.get("nb_boards"),
    advancement_per_pool: formData.get("advancement_per_pool"),
    players_per_team: formData.get("players_per_team"),
    registration_mode: formData.get("registration_mode") ?? "ONLINE",
    scoring_mode: formData.get("scoring_mode") ?? "ELECTRONIC",
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { supabase } = await getAuthenticatedUser();

  const { error } = await supabase
    .from("tournaments")
    .update(parsed.data)
    .eq("id", tournamentId);

  if (error) return { error: "Erreur lors de la modification du tournoi." };

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteTournament(tournamentId: string) {
  const { supabase } = await getAuthenticatedUser();

  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) throw new Error("Impossible de supprimer le tournoi.");

  revalidatePath("/tournaments");
  redirect("/tournaments");
}

export async function addRound(prevState: TournamentState, formData: FormData): Promise<TournamentState> {
  const { supabase } = await getAuthenticatedUser();

  const tournamentId = formData.get("tournament_id") as string;

  // Calcule le prochain ordre
  const { count } = await supabase
    .from("rounds")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  const parsed = RoundSchema.safeParse({
    tournament_id: tournamentId,
    order: (count ?? 0) + 1,
    game_type: formData.get("game_type"),
    entry_type: formData.get("entry_type"),
    finish_type: formData.get("finish_type"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { error } = await supabase.from("rounds").insert(parsed.data);

  if (error) {
    return { error: "Erreur lors de l'ajout de la manche." };
  }

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteRound(roundId: string, tournamentId: string) {
  const { supabase } = await getAuthenticatedUser();

  const { error } = await supabase.from("rounds").delete().eq("id", roundId);

  if (error) throw new Error("Impossible de supprimer la manche.");

  revalidatePath(`/tournaments/${tournamentId}`);
}
