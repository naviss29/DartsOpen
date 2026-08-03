"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbAddRegistration, dbDeleteRegistration, dbGetTournament, dbSetSeeded } from "@/lib/db/tournament";
import { PLATFORM_FEE_CENTS } from "@/lib/platformFee";
import { sendEmail } from "@/lib/api/sterplatform";
import { getOwnedTournament } from "@/lib/actions/access";

// Email facultatif : les tournois rapides n'ont pas de champ email dans le formulaire.
// La chaîne vide "" est acceptée (valeur soumise par un <input type="hidden"> absent).
const PlayerSchema = z.object({
  tournament_id: z.string().uuid(),
  player_name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  player_email: z.union([z.string().trim().email("Email invalide."), z.literal("")]).optional(),
  player_phone: z
    .string()
    .trim()
    .refine(v => !v || /^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$/.test(v), "Numéro invalide.")
    .optional(),
});

export type PlayerState = {
  error?: string;
  errors?: Record<string, string[]>;
  fields?: Record<string, string>;
  ts?: number;
} | undefined;

export async function addPlayer(prevState: PlayerState, formData: FormData): Promise<PlayerState> {
  const playersPerTeam = Number(formData.get("players_per_team") ?? 1);

  const playerNames = Array.from({ length: playersPerTeam }, (_, i) =>
    (formData.get(`player_pseudo_${i}`) as string | null)?.trim() ?? ""
  ).filter(Boolean);

  const teamName = playersPerTeam > 1
    ? (formData.get("player_name") as string)
    : playerNames[0] ?? "";

  const rawFields: Record<string, string> = {
    player_name: teamName,
    player_email: (formData.get("player_email") as string) ?? "",
    player_phone: (formData.get("player_phone") as string) ?? "",
  };
  for (let i = 0; i < playersPerTeam; i++) {
    rawFields[`player_pseudo_${i}`] = (formData.get(`player_pseudo_${i}`) as string) ?? "";
  }

  const parsed = PlayerSchema.safeParse({
    tournament_id: formData.get("tournament_id"),
    player_name: teamName,
    // formData.get() renvoie null quand le champ est absent (quick mode sans champ email).
    // Zod .optional() accepte undefined mais pas null → on convertit.
    player_email: formData.get("player_email") ?? undefined,
    player_phone: formData.get("player_phone") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, fields: rawFields, ts: Date.now() };
  }

  const tournament = await dbGetTournament(parsed.data.tournament_id);
  if (!tournament) return { error: "Tournoi introuvable ou accès refusé." };
  if (!["DRAFT", "OPEN"].includes(tournament.status)) {
    return { error: "Les inscriptions sont fermées pour ce tournoi." };
  }

  // playerEmail vide ("") = inscription mode rapide sans adresse email
  const playerEmail = parsed.data.player_email || "";

  const reg = await dbAddRegistration(parsed.data.tournament_id, {
    playerName: parsed.data.player_name,
    playerEmail,
    playerPhone: parsed.data.player_phone ?? null,
    playerNames,
    platformFeeCents: PLATFORM_FEE_CENTS * playersPerTeam,
    status: "PAID",
  }).catch(() => null);

  if (!reg) return { error: "Erreur lors de l'inscription.", fields: rawFields, ts: Date.now() };

  // Confirmation email uniquement si une adresse a été fournie (pas en mode rapide)
  if (playerEmail) {
    const dateFormatted = new Date(tournament.date).toLocaleDateString("fr-FR");
    await sendEmail("dartsopen_inscription_confirmation", playerEmail, {
      nom_equipe: reg.player_name,
      tournoi: tournament.name,
      date: dateFormatted,
      lieu: tournament.location,
      joueurs: reg.player_names.join(", "),
    }).catch((err) => console.error("[addPlayer] Erreur envoi email confirmation:", err));
  }

  revalidatePath(`/tournaments/${parsed.data.tournament_id}/players`);
  return {};
}

export async function setSeedStatus(
  registrationId: string,
  tournamentId: string,
  seeded: boolean
): Promise<{ error?: string }> {
  await getOwnedTournament(tournamentId);

  const ok = await dbSetSeeded(registrationId, tournamentId, seeded).then(() => true).catch(() => null);
  if (!ok) return { error: "Erreur lors de la mise à jour." };
  revalidatePath(`/tournaments/${tournamentId}/players`);
  return {};
}

export async function removePlayer(registrationId: string, tournamentId: string): Promise<{ error?: string }> {
  const tournament = await getOwnedTournament(tournamentId);
  if (!["DRAFT", "OPEN"].includes(tournament.status)) {
    return { error: "Impossible de retirer un joueur une fois le tournoi démarré." };
  }

  const ok = await dbDeleteRegistration(registrationId, tournamentId).catch(() => null);
  if (ok === null) return { error: "Erreur lors de la suppression du joueur." };

  revalidatePath(`/tournaments/${tournamentId}/players`);
  return {};
}
