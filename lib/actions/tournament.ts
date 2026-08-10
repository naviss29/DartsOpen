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
import { getOwnedTournament } from "@/lib/actions/access";
import { isOnlinePaymentAllowed, wantsOnlinePayment, ONLINE_PAYMENT_BLOCKED_MESSAGE } from "@/lib/payments/onlinePaymentGuard";

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
  quick_mode: z.preprocess((val) => val === "true", z.boolean()).default(false),
}).transform((data) => {
  // Mode rapide : poule unique et 1 joueur par équipe obligatoires
  if (data.quick_mode) {
    return { ...data, nb_pools: 1, players_per_team: 1 };
  }
  return data;
});

const RoundSchema = z.object({
  game_type: z.enum(["CRICKET", "501", "701", "901", "1001"]),
  entry_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE"]),
  finish_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "MASTER"]),
});

export type TournamentState = {
  error?: string;
  errors?: Record<string, string[]>;
  fields?: Record<string, string>;
  ts?: number;
} | undefined;

function extractTournamentRaw(formData: FormData): Record<string, string> {
  return {
    name: (formData.get("name") as string) ?? "",
    date: (formData.get("date") as string) ?? "",
    location: (formData.get("location") as string) ?? "",
    max_players: (formData.get("max_players") as string) ?? "",
    entry_fee: (formData.get("entry_fee") as string) ?? "",
    nb_pools: (formData.get("nb_pools") as string) ?? "",
    nb_boards: (formData.get("nb_boards") as string) ?? "",
    advancement_per_pool: (formData.get("advancement_per_pool") as string) ?? "",
    players_per_team: (formData.get("players_per_team") as string) ?? "",
    registration_mode: (formData.get("registration_mode") as string) ?? "ONLINE",
    scoring_mode: (formData.get("scoring_mode") as string) ?? "ELECTRONIC",
    quick_mode: (formData.get("quick_mode") as string) ?? "false",
  };
}

export async function createTournament(prevState: TournamentState, formData: FormData): Promise<TournamentState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const raw = extractTournamentRaw(formData);
  const parsed = TournamentSchema.safeParse(raw);

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, fields: raw, ts: Date.now() };
  }

  // DO-PAYMENT-GUARD-001 : le paiement en ligne n'est proposable que si l'organisation a un
  // Stripe Connect réellement opérationnel — vérifié ici, avant toute écriture, jamais après.
  if (wantsOnlinePayment(parsed.data)) {
    const authorization = await isOnlinePaymentAllowed(user.id);
    if (!authorization.allowed) {
      return { error: ONLINE_PAYMENT_BLOCKED_MESSAGE, fields: raw, ts: Date.now() };
    }
  }

  const tournament = await dbCreateTournament(user.id, parsed.data).catch((err) => {
    console.error('[createTournament]', err);
    return null;
  });
  if (!tournament) return { error: "Erreur lors de la création du tournoi.", fields: raw };

  revalidatePath("/tournaments");
  redirect(`/tournaments/${tournament.id}/activate`);
}

export async function updateTournament(prevState: TournamentState, formData: FormData): Promise<TournamentState> {
  const tournamentId = formData.get("tournament_id") as string;
  const tournament = await getOwnedTournament(tournamentId);

  const raw = extractTournamentRaw(formData);
  const parsed = TournamentSchema.safeParse(raw);

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, fields: raw, ts: Date.now() };
  }

  // DO-PAYMENT-GUARD-001 : même garde qu'à la création — s'applique aussi bien à une
  // modification qui active le paiement en ligne pour la première fois qu'à un tournoi qui
  // l'avait déjà (une organisation dont Stripe a été suspendu ne doit pas pouvoir
  // re-confirmer/étendre une configuration payante par une simple modification).
  if (wantsOnlinePayment(parsed.data)) {
    const authorization = await isOnlinePaymentAllowed(tournament.association_id);
    if (!authorization.allowed) {
      return { error: ONLINE_PAYMENT_BLOCKED_MESSAGE, fields: raw, ts: Date.now() };
    }
  }

  const ok = await dbUpdateTournament(tournamentId, parsed.data).catch(() => null);
  if (!ok) return { error: "Erreur lors de la modification du tournoi.", fields: raw, ts: Date.now() };

  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function updateTournamentStatus(
  tournamentId: string,
  status: string
): Promise<{ error?: string } | void> {
  await getOwnedTournament(tournamentId);

  const ok = await dbUpdateTournamentStatus(tournamentId, status).catch((err) => {
    console.error("[updateTournamentStatus]", err);
    return err instanceof Error ? err.message : null;
  });
  if (typeof ok === "string") return { error: ok };
  if (!ok) return { error: "Impossible de mettre à jour le statut." };
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteTournament(tournamentId: string): Promise<{ error?: string }> {
  await getOwnedTournament(tournamentId);

  const ok = await dbDeleteTournament(tournamentId).catch(() => null);
  if (ok === null) return { error: "Erreur lors de la suppression du tournoi." };
  revalidatePath("/tournaments");
  redirect("/tournaments");
}

export async function addRound(prevState: TournamentState, formData: FormData): Promise<TournamentState> {
  const tournamentId = formData.get("tournament_id") as string;
  await getOwnedTournament(tournamentId);

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

export async function deleteRound(roundId: string, tournamentId: string): Promise<{ error?: string }> {
  const tournament = await getOwnedTournament(tournamentId);
  if (tournament.status !== "DRAFT") {
    return { error: "Impossible de supprimer une manche une fois les inscriptions ouvertes." };
  }

  const ok = await dbDeleteRound(roundId, tournamentId).catch(() => null);
  if (ok === null) return { error: "Erreur lors de la suppression de la manche." };
  revalidatePath(`/tournaments/${tournamentId}`);
  return {};
}
