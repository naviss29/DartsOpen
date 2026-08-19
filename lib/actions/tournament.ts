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
  dbConfirmTournamentEntitlement,
  dbAddRound,
  dbDeleteRound,
} from "@/lib/db/tournament";
import { getOwnedTournament } from "@/lib/actions/access";
import { isOnlinePaymentAllowed, wantsOnlinePayment, ONLINE_PAYMENT_BLOCKED_MESSAGE } from "@/lib/payments/onlinePaymentGuard";
import {
  resolveTournamentSizeEntitlement,
  consumeTournamentSizeCredit,
  requiresEntitlementCheck,
  TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION,
  TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT,
} from "@/lib/entitlements/tournamentSizeGuard";
import { DEFAULT_MAX_PLAYERS, DEFAULT_NB_POOLS, DEFAULT_NB_BOARDS } from "@/lib/tournament/defaults";

// DARTSOPEN-MONETIZATION-003 (P5, contre-audit) — message renvoyé quand la réconciliation
// (voir retryTournamentEntitlementConfirmation() et createTournament() ci-dessous) ne peut
// toujours pas confirmer ou infirmer la consommation du crédit — jamais assimilé à un refus,
// jamais non plus à une confirmation.
const CREDIT_INDETERMINATE_MESSAGE =
  "Impossible de confirmer votre crédit tournoi pour le moment (SterPlatform indisponible) — réessayez dans quelques instants. Aucun crédit n'a été perdu.";

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

/**
 * DARTSOPEN-MONETIZATION-003 (P5, contre-audit) — `max_players`/`nb_pools`/`nb_boards`
 * retombent sur 16/1/2 côté serveur quand le champ est réellement absent du formulaire soumis
 * (`formData.get(...) === null`), jamais uniquement une valeur par défaut d'`<input>` côté UI
 * (TournamentForm.tsx) que n'importe quel appelant direct de cette Server Action pourrait
 * simplement omettre. Une valeur présente mais vide (l'utilisateur a effacé le champ) n'est PAS
 * défaultée ici — elle échoue normalement la validation Zod, avec le message d'erreur habituel.
 */
function extractTournamentRaw(formData: FormData): Record<string, string> {
  const maxPlayers = formData.get("max_players");
  const nbPools = formData.get("nb_pools");
  const nbBoards = formData.get("nb_boards");
  return {
    name: (formData.get("name") as string) ?? "",
    date: (formData.get("date") as string) ?? "",
    location: (formData.get("location") as string) ?? "",
    max_players: maxPlayers !== null ? (maxPlayers as string) : String(DEFAULT_MAX_PLAYERS),
    entry_fee: (formData.get("entry_fee") as string) ?? "",
    nb_pools: nbPools !== null ? (nbPools as string) : String(DEFAULT_NB_POOLS),
    nb_boards: nbBoards !== null ? (nbBoards as string) : String(DEFAULT_NB_BOARDS),
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

  // DARTSOPEN-MONETIZATION-002 (audit DO-AUD-001/DO-AUD-002) — clé d'idempotence stable générée
  // une seule fois côté client (TournamentForm.tsx, à l'instanciation du formulaire, jamais
  // régénérée par requête) : un double-clic ou une relance réseau soumet la même clé, jamais une
  // nouvelle. Remplace l'ancien crypto.randomUUID() généré ici à chaque invocation, qui rendait
  // toute tentative de consommation de crédit non idempotente d'une requête à l'autre.
  const idempotencyKey = (formData.get("idempotency_key") as string | null)?.trim() ?? "";
  if (!idempotencyKey) {
    return { error: "Requête invalide — rechargez la page et réessayez.", fields: raw, ts: Date.now() };
  }

  // DARTSOPEN-MONETIZATION-001/002 : au-delà de 10 joueurs, un abonnement actif ou un crédit
  // tournoi est requis. resolveTournamentSizeEntitlement() est une lecture pure (jamais de
  // consommation) : elle s'exécute avant toute écriture, mais la consommation elle-même
  // (mutation irréversible côté SterPlatform) n'a lieu qu'après la création locale du tournoi
  // ci-dessous — "le crédit ne doit devenir définitivement consommé que lorsque le tournoi
  // existe réellement" (stratégie "création locale intermédiaire + confirmation", audit
  // DO-AUD-001 : aucune perte de crédit si la création locale échoue, puisqu'aucun crédit n'a
  // encore été touché à ce stade).
  let creditToConsume: { organizationSlug: string } | null = null;
  if (requiresEntitlementCheck(parsed.data.max_players, 0)) {
    const entitlement = await resolveTournamentSizeEntitlement(user.id);
    if (entitlement.mode === "NONE") {
      return { error: TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION, fields: raw, ts: Date.now() };
    }
    if (entitlement.mode === "CREDIT_ATTEMPT") {
      creditToConsume = { organizationSlug: entitlement.organizationSlug };
    }
    // mode === "SUBSCRIPTION" : l'abonnement suffit déjà, aucun crédit à consommer.
  }

  // DARTSOPEN-MONETIZATION-003 (P3, contre-audit) — un tournoi qui devra consommer un crédit
  // démarre en PENDING_ENTITLEMENT, jamais directement en DRAFT : ni publiable, ni ouvert aux
  // inscriptions, ni compté comme autorisé >10 tant que la consommation n'est pas confirmée
  // (voir lib/utils/tournamentStatus.ts, aucune transition définie hors de
  // dbConfirmTournamentEntitlement()). Idempotent sur (userId, idempotencyKey) — un double-clic/
  // une relance renvoie la tournée déjà créée par la première tentative au lieu d'en créer une
  // seconde (audit DO-AUD-002).
  const tournament = await dbCreateTournament(
    user.id,
    parsed.data,
    idempotencyKey,
    creditToConsume ? "PENDING_ENTITLEMENT" : "DRAFT",
  ).catch((err) => {
    console.error('[createTournament]', err);
    return null;
  });
  if (!tournament) return { error: "Erreur lors de la création du tournoi.", fields: raw };

  if (creditToConsume) {
    // DARTSOPEN-MONETIZATION-004 (P2, contre-audit) — référence de consommation dérivée de
    // `tournament.id` (identifiant serveur, jamais choisi par le client), pas de
    // `idempotencyKey` : SterPlatform scope son idempotence sur (organisation, produit,
    // référence), pas sur l'utilisateur DartsOpen qui appelle. Deux organisateurs de la MÊME
    // organisation pouvaient donc, en soumettant volontairement la même valeur de
    // idempotencyKey, faire correspondre deux tournois locaux distincts à une seule
    // consommation SterPlatform (un seul crédit dépensé pour deux tournois confirmés).
    // `tournament.id` est généré serveur (uuid), unique par tournoi, stable pour les retries de
    // CE tournoi (dbCreateTournament() est idempotent sur (userId, idempotencyKey) : une
    // relance retrouve la même ligne, donc le même id) — jamais choisi ni influençable par le
    // client, donc jamais sujet à collision volontaire entre deux tournois distincts.
    const outcome = await consumeTournamentSizeCredit(creditToConsume.organizationSlug, tournament.id);

    if (outcome === "CONFIRMED") {
      await dbConfirmTournamentEntitlement(tournament.id);
      revalidatePath("/tournaments");
      // DO-PAYPAL-REMOVAL-001 — le tournoi rejoint directement sa page de gestion normale,
      // plus jamais un palier PayPal intermédiaire (voir le second point de sortie plus bas
      // pour le même changement sur le chemin gratuit/abonnement).
      redirect(`/tournaments/${tournament.id}`);
    }

    if (outcome === "REJECTED") {
      // Refus métier certain (SterPlatform) : le tournoi PENDING_ENTITLEMENT qu'on vient de
      // créer n'a jamais été confirmé — on le retire plutôt que de laisser une ligne inutile.
      // Si cette suppression échoue elle-même, le tournoi reste PENDING_ENTITLEMENT (jamais
      // publiable/exploitable par construction, voir son docblock) — la cohérence commerciale
      // ne dépend donc jamais du succès de cette seule suppression compensatoire (P3).
      await dbDeleteTournament(tournament.id).catch((err) => {
        console.error('[createTournament] rollback (crédit refusé) échoué:', tournament.id, err);
      });
      return { error: TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT, fields: raw, ts: Date.now() };
    }

    // outcome === "INDETERMINATE" (P2) — ni confirmer, ni supprimer : le tournoi reste
    // PENDING_ENTITLEMENT, un état sûr et réconciliable (retryTournamentEntitlementConfirmation()
    // ci-dessous, ou une nouvelle soumission du même formulaire — même idempotencyKey).
    return { error: CREDIT_INDETERMINATE_MESSAGE, fields: raw, ts: Date.now() };
  }

  revalidatePath("/tournaments");
  // DO-PAYPAL-REMOVAL-001 — chemin gratuit ou déjà couvert par abonnement : plus de palier
  // PayPal intermédiaire, direction directe vers la page de gestion normale du tournoi.
  redirect(`/tournaments/${tournament.id}`);
}

/**
 * DARTSOPEN-MONETIZATION-003/004 (P2/P3, contre-audit) — seul moyen de faire sortir un tournoi
 * de PENDING_ENTITLEMENT une fois l'organisateur reparti de la page de création
 * (createTournament() lui-même gère déjà la ré-soumission du même formulaire). Réutilise
 * `tournamentId` (l'id réel du tournoi, stable) comme référence de consommation — jamais
 * `idempotency_key` (valeur client, voir DARTSOPEN-MONETIZATION-004 P2) — donc exactement la
 * même référence que celle déjà tentée par createTournament() pour ce tournoi.
 */
export async function retryTournamentEntitlementConfirmation(tournamentId: string): Promise<{ error?: string } | void> {
  const tournament = await getOwnedTournament(tournamentId) as { status: string; association_id: string };

  if (tournament.status !== "PENDING_ENTITLEMENT") {
    revalidatePath(`/tournaments/${tournamentId}`);
    return;
  }

  const entitlement = await resolveTournamentSizeEntitlement(tournament.association_id);
  if (entitlement.mode === "NONE") {
    return { error: TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION };
  }
  if (entitlement.mode === "SUBSCRIPTION") {
    await dbConfirmTournamentEntitlement(tournamentId);
    revalidatePath(`/tournaments/${tournamentId}`);
    return;
  }

  const outcome = await consumeTournamentSizeCredit(entitlement.organizationSlug, tournamentId);

  if (outcome === "CONFIRMED") {
    await dbConfirmTournamentEntitlement(tournamentId);
    revalidatePath(`/tournaments/${tournamentId}`);
    return;
  }

  if (outcome === "REJECTED") {
    await dbDeleteTournament(tournamentId).catch((err) => {
      console.error('[retryTournamentEntitlementConfirmation] rollback (crédit refusé) échoué:', tournamentId, err);
    });
    redirect("/tournaments");
  }

  return { error: CREDIT_INDETERMINATE_MESSAGE };
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

  // DARTSOPEN-MONETIZATION-001/002 : ne re-vérifie que si max_players augmente réellement
  // au-delà de 10 par rapport à la valeur déjà en base — jamais pour une valeur inchangée ou
  // réduite, pour ne jamais casser un tournoi >10 déjà créé avant cette règle (mission §12/§15).
  // Empêche aussi le contournement "créer à 10 puis modifier à 64" (mission §2/§11). La
  // tournée existe déjà durablement ici (contrairement à la création) : `tournamentId` (l'id
  // réel du tournoi, stable d'une relance à l'autre par construction) sert directement de
  // référence idempotente, sans clé séparée à générer.
  if (requiresEntitlementCheck(parsed.data.max_players, tournament.max_players)) {
    const entitlement = await resolveTournamentSizeEntitlement(tournament.association_id);
    if (entitlement.mode === "NONE") {
      return { error: TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION, fields: raw, ts: Date.now() };
    }
    if (entitlement.mode === "CREDIT_ATTEMPT") {
      const outcome = await consumeTournamentSizeCredit(entitlement.organizationSlug, tournamentId);
      if (outcome === "REJECTED") {
        return { error: TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT, fields: raw, ts: Date.now() };
      }
      if (outcome === "INDETERMINATE") {
        // DARTSOPEN-MONETIZATION-003 (P2) — dbUpdateTournament() n'a pas encore été appelé :
        // le tournoi reste inchangé en base, jamais un max_players > 10 confirmé sur un
        // résultat indéterminé. Un nouvel essai (même tournamentId = même référence idempotente)
        // suffira à confirmer dès que SterPlatform redevient joignable — aucun crédit perdu si
        // la consommation avait en réalité déjà eu lieu.
        return { error: CREDIT_INDETERMINATE_MESSAGE, fields: raw, ts: Date.now() };
      }
      // outcome === "CONFIRMED" : la mise à jour ci-dessous peut s'appliquer.
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
