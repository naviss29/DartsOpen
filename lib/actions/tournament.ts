"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/api/auth";
import {
  dbCreateTournament,
  dbUpdateTournament,
  dbUpdateTournamentStatus,
  dbDeleteTournament,
  dbAddRound,
  dbDeleteRound,
} from "@/lib/db/tournament";

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
  const user = await getUser();
  if (!user) redirect("/login");

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

  const tournament = await dbCreateTournament(user.id, parsed.data).catch(() => null);
  if (!tournament) return { error: "Erreur lors de la création du tournoi." };

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

  const ok = await dbUpdateTournament(tournamentId, parsed.data).catch(() => null);
  if (!ok) return { error: "Erreur lors de la modification du tournoi." };

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function updateTournamentStatus(
  tournamentId: string,
  status: string
): Promise<{ error?: string } | void> {
  const ok = await dbUpdateTournamentStatus(tournamentId, status).catch(() => null);
  if (!ok) return { error: "Impossible de mettre à jour le statut." };
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteTournament(tournamentId: string) {
  await dbDeleteTournament(tournamentId);
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

  const ok = await dbAddRound(tournamentId, parsed.data).catch(() => null);
  if (!ok) return { error: "Erreur lors de l'ajout de la manche." };

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteRound(roundId: string, tournamentId: string) {
  await dbDeleteRound(roundId);
  revalidatePath(`/tournaments/${tournamentId}`);
}
