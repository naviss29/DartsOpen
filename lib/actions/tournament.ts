"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  apiCreateTournament,
  apiUpdateTournament,
  apiUpdateTournamentStatus,
  apiDeleteTournament,
  apiAddRound,
  apiDeleteRound,
} from "@/lib/api/tournament";

const TournamentSchema = z.object({
  name: z.string().trim().min(3, "Le nom doit contenir au moins 3 caractères."),
  date: z.string().min(1, "La date est requise."),
  location: z.string().trim().min(2, "Le lieu est requis."),
  max_players: z.coerce.number().int().min(2).max(512),
  entry_fee: z.coerce.number().min(0).transform(v => Math.round(v * 100)),
  nb_pools: z.coerce.number().int().min(1).max(64),
  nb_boards: z.coerce.number().int().min(1).max(32),
  advancement_per_pool: z.coerce.number().int().min(1).max(8),
  players_per_team: z.coerce.number().int().min(1).max(10),
  registration_mode: z.enum(["ONLINE", "ONSITE"]).default("ONLINE"),
  scoring_mode: z.enum(["ELECTRONIC", "TRADITIONAL"]).default("ELECTRONIC"),
});

const RoundSchema = z.object({
  game_type: z.enum(["CRICKET", "501", "701", "901", "1001"]),
  entry_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE"]),
  finish_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "MASTER"]),
});

export type TournamentState = { error?: string; errors?: Record<string, string[]> } | undefined;

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

  const res = await apiCreateTournament(parsed.data);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Erreur lors de la création du tournoi." };
  }

  const tournament = await res.json() as { id: string };
  revalidatePath("/tournaments");
  redirect(`/tournaments/${tournament.id}/activate`);
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

  const res = await apiUpdateTournament(tournamentId, parsed.data);
  if (!res.ok) return { error: "Erreur lors de la modification du tournoi." };

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function updateTournamentStatus(
  tournamentId: string,
  status: string
): Promise<{ error?: string } | void> {
  const res = await apiUpdateTournamentStatus(tournamentId, status);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Impossible de mettre à jour le statut." };
  }

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteTournament(tournamentId: string) {
  const res = await apiDeleteTournament(tournamentId);
  if (!res.ok) throw new Error("Impossible de supprimer le tournoi.");

  revalidatePath("/tournaments");
  redirect("/tournaments");
}

export async function addRound(prevState: TournamentState, formData: FormData): Promise<TournamentState> {
  const tournamentId = formData.get("tournament_id") as string;

  const parsed = RoundSchema.safeParse({
    game_type: formData.get("game_type"),
    entry_type: formData.get("entry_type"),
    finish_type: formData.get("finish_type"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const res = await apiAddRound(tournamentId, parsed.data);
  if (!res.ok) return { error: "Erreur lors de l'ajout de la manche." };

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteRound(roundId: string, tournamentId: string) {
  const res = await apiDeleteRound(tournamentId, roundId);
  if (!res.ok) throw new Error("Impossible de supprimer la manche.");

  revalidatePath(`/tournaments/${tournamentId}`);
}
