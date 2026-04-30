"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const PlayerSchema = z.object({
  tournament_id: z.string().uuid(),
  player_name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  player_email: z.string().trim().email("Email invalide."),
  player_phone: z.string().trim().optional(),
});

export type PlayerState = { error?: string; errors?: Record<string, string[]> } | undefined;

async function getAuthenticatedAssociation(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, association_id, status")
    .eq("id", tournamentId)
    .eq("association_id", user.id)
    .single();

  if (!tournament) throw new Error("Tournoi introuvable ou accès refusé.");
  return { supabase, tournament };
}

export async function addPlayer(prevState: PlayerState, formData: FormData): Promise<PlayerState> {
  const parsed = PlayerSchema.safeParse({
    tournament_id: formData.get("tournament_id"),
    player_name: formData.get("player_name"),
    player_email: formData.get("player_email"),
    player_phone: formData.get("player_phone") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { supabase, tournament } = await getAuthenticatedAssociation(parsed.data.tournament_id);

  if (!["DRAFT", "OPEN"].includes(tournament.status)) {
    return { error: "Les inscriptions sont fermées pour ce tournoi." };
  }

  const { error } = await supabase.from("registrations").insert({
    tournament_id: parsed.data.tournament_id,
    player_name: parsed.data.player_name,
    player_email: parsed.data.player_email,
    player_phone: parsed.data.player_phone ?? null,
    status: "PAID",
  });

  if (error) {
    return { error: "Erreur lors de l'inscription du joueur." };
  }

  revalidatePath(`/tournaments/${parsed.data.tournament_id}/players`);
}

export async function removePlayer(registrationId: string, tournamentId: string) {
  const { supabase, tournament } = await getAuthenticatedAssociation(tournamentId);

  if (!["DRAFT", "OPEN"].includes(tournament.status)) {
    throw new Error("Impossible de retirer un joueur une fois le tournoi démarré.");
  }

  const { error } = await supabase
    .from("registrations")
    .delete()
    .eq("id", registrationId);

  if (error) throw new Error("Impossible de retirer le joueur.");

  revalidatePath(`/tournaments/${tournamentId}/players`);
}
