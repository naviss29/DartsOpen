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
import {
  authorizeTournamentSize,
  requiresEntitlementCheck,
  TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION,
  TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT,
} from "@/lib/entitlements/tournamentSizeGuard";

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
  // DARTSOPEN-MONETIZATION-001 : indépendant de registration_mode (mission §5/§6) — un tournoi
  // peut être ouvert aux inscriptions en ligne tout en faisant payer sur place. La valeur
  // soumise n'est jamais faite confiance telle quelle : wantsOnlinePayment()/
  // isOnlinePaymentAllowed() (ci-dessous) revérifient que Stripe Connect est réellement
  // opérationnel avant d'accepter payment_mode = "ONLINE".
  payment_mode: z.enum(["ONLINE", "ONSITE"]).default("ONSITE"),
  scoring_mode: z.enum(["ELECTRONIC", "TRADITIONAL"]).default("ELECTRONIC"),
  quick_mode: z.preprocess((val) => val === "true", z.boolean()).default(false),
}).transform((data) => {
  let result = data;
  // Mode rapide : poule unique et 1 joueur par équipe obligatoires
  if (result.quick_mode) {
    result = { ...result, nb_pools: 1, players_per_team: 1 };
  }
  // Un tournoi gratuit n'a pas de mode de paiement — jamais "ONLINE" pour un entry_fee à 0.
  if (result.entry_fee === 0) {
    result = { ...result, payment_mode: "ONSITE" };
  }
  return result;
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
    payment_mode: (formData.get("payment_mode") as string) ?? "ONSITE",
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

  // DARTSOPEN-MONETIZATION-001 : au-delà de 10 joueurs, un abonnement actif ou un crédit
  // tournoi est requis — vérifié/consommé ici, avant toute écriture, jamais après. L'id du
  // tournoi est généré ici (plutôt que laissé à Prisma) pour servir de référence stable et
  // idempotente à la consommation du crédit, identique à celle réutilisée par updateTournament.
  const tournamentId = crypto.randomUUID();
  if (requiresEntitlementCheck(parsed.data.max_players, 0)) {
    const authorization = await authorizeTournamentSize(user.id, tournamentId);
    if (!authorization.allowed) {
      const message = authorization.reason === "NO_ORGANIZATION"
        ? TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION
        : TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT;
      return { error: message, fields: raw, ts: Date.now() };
    }
  }

  const tournament = await dbCreateTournament(user.id, parsed.data, tournamentId).catch((err) => {
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

  // DARTSOPEN-MONETIZATION-001 : ne re-vérifie que si max_players augmente réellement au-delà
  // de 10 par rapport à la valeur déjà en base — jamais pour une valeur inchangée ou réduite,
  // pour ne jamais casser un tournoi >10 déjà créé avant cette règle (mission §12/§15). Empêche
  // aussi le contournement "créer à 10 puis modifier à 32" (mission §2/§11).
  if (requiresEntitlementCheck(parsed.data.max_players, tournament.max_players)) {
    const authorization = await authorizeTournamentSize(tournament.association_id, tournamentId);
    if (!authorization.allowed) {
      const message = authorization.reason === "NO_ORGANIZATION"
        ? TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION
        : TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT;
      return { error: message, fields: raw, ts: Date.now() };
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
