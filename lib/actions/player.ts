"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiAddRegistration, apiDeleteRegistration, apiGetTournament } from "@/lib/api/tournament";
import { PLATFORM_FEE_CENTS } from "@/lib/stripe";

const PlayerSchema = z.object({
  tournament_id: z.string().uuid(),
  player_name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  player_email: z.string().trim().email("Email invalide."),
  player_phone: z
    .string()
    .trim()
    .refine(v => !v || /^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$/.test(v), "Numéro invalide.")
    .optional(),
});

export type PlayerState = { error?: string; errors?: Record<string, string[]> } | undefined;

export async function addPlayer(prevState: PlayerState, formData: FormData): Promise<PlayerState> {
  const playersPerTeam = Number(formData.get("players_per_team") ?? 1);

  const playerNames = Array.from({ length: playersPerTeam }, (_, i) =>
    (formData.get(`player_pseudo_${i}`) as string | null)?.trim() ?? ""
  ).filter(Boolean);

  const teamName = playersPerTeam > 1
    ? (formData.get("player_name") as string)
    : playerNames[0] ?? "";

  const parsed = PlayerSchema.safeParse({
    tournament_id: formData.get("tournament_id"),
    player_name: teamName,
    player_email: formData.get("player_email"),
    player_phone: formData.get("player_phone") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const tournament = await apiGetTournament(parsed.data.tournament_id) as { status: string } | null;
  if (!tournament) return { error: "Tournoi introuvable ou accès refusé." };
  if (!["DRAFT", "OPEN"].includes(tournament.status)) {
    return { error: "Les inscriptions sont fermées pour ce tournoi." };
  }

  const res = await apiAddRegistration(parsed.data.tournament_id, {
    playerName: parsed.data.player_name,
    playerEmail: parsed.data.player_email,
    playerPhone: parsed.data.player_phone ?? null,
    playerNames,
    platformFeeCents: PLATFORM_FEE_CENTS * playersPerTeam,
  });

  if (!res.ok) return { error: "Erreur lors de l'inscription." };

  revalidatePath(`/tournaments/${parsed.data.tournament_id}/players`);
}

export async function removePlayer(registrationId: string, tournamentId: string) {
  const tournament = await apiGetTournament(tournamentId) as { status: string } | null;
  if (!tournament) throw new Error("Tournoi introuvable.");
  if (!["DRAFT", "OPEN"].includes(tournament.status)) {
    throw new Error("Impossible de retirer un joueur une fois le tournoi démarré.");
  }

  const res = await apiDeleteRegistration(tournamentId, registrationId);
  if (!res.ok) throw new Error("Impossible de retirer le joueur.");

  revalidatePath(`/tournaments/${tournamentId}/players`);
}
