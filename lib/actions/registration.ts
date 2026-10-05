"use server";

import { z } from "zod";
import { PLATFORM_FEE_CENTS } from "@/lib/platformFee";
import {
  dbGetTournament,
  dbReserveRegistrationSlot,
  dbUpdateRegistrationPaymentId,
  type ReserveSlotResult,
} from "@/lib/db/tournament";
import { billingSourceForTournament, resolveBillingOrganizationSlug } from "@/lib/organizations/billingOrganization";
import { sendEmail } from "@/lib/api/sterplatform";
import { createPaymentCheckout, getStripeConnectStatus } from "@/lib/api/sterplatformInternal";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { immediatePaymentKind } from "@/lib/registration/successPayment";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { getI18n } from "@/lib/i18n/server";

/**
 * DARTSOPEN-MONETIZATION-002 (audit DO-AUD-009) — how long a PENDING online-payment reservation
 * holds its slot before dbReserveRegistrationSlot()/dbCountOccupiedSlots() stop counting it.
 * Deliberately generous relative to a typical Stripe Checkout session (a few minutes) — this is
 * a safety net against an abandoned/failed checkout permanently blocking a slot, not a tight
 * race with legitimate completion time.
 */
const RESERVATION_TTL_MINUTES = 30;

/**
 * F17 — borne haute du nombre de noms acceptés par le schéma, alignée sur la borne de
 * `players_per_team` à la création d'un tournoi (lib/actions/tournament.ts, max 10). Le nombre
 * EXACT attendu (playersPerTeam du tournoi) est vérifié sous le verrou du tournoi
 * (dbReserveRegistrationSlot) ; cette borne empêche seulement d'envoyer un tableau démesuré.
 */
const MAX_PLAYER_NAMES = 10;

/**
 * F18 (audit 04/10/2026) — limite propre à l'action d'inscription publique, en plus de la
 * limite générale du proxy sur /t/ (300 requêtes / 5 min / IP, qui laisse passer des centaines de
 * soumissions). Clé = IP + tournoi : un même club peut inscrire plusieurs équipes, mais un robot
 * ne peut pas remplir un tournoi (ni multiplier les sessions de paiement). Seuil ajustable.
 */
const REGISTRATION_RATE_LIMIT = { windowMs: 10 * 60_000, max: 10 };

// Sécurité pré-recette (S3) — createRegistration() est la seule Server Action véritablement
// publique et non authentifiée du produit (auto-inscription) : avant ce schéma, seul le
// téléphone était validé (regex), contactEmail n'était jamais vérifié comme une adresse email
// valide, teamName/playerNames n'avaient ni longueur maximale ni sanitation. Mêmes bornes que
// PlayerSchema (lib/actions/player.ts), l'équivalent organisateur.
const RegistrationSchema = z.object({
  teamName: z.string().trim().min(1, "Le nom est requis.").max(100, "Le nom est trop long (100 caractères max)."),
  contactEmail: z.string().trim().email("Email invalide."),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$/.test(v), "Numéro de téléphone invalide (ex : 0612345678).")
    .nullable(),
  playerNames: z
    .array(z.string().trim().min(1, "Le nom d'un joueur ne peut pas être vide.").max(100, "Nom de joueur trop long (100 caractères max)."))
    .min(1, "Au moins un joueur est requis.")
    .max(MAX_PLAYER_NAMES, `Trop de joueurs (${MAX_PLAYER_NAMES} max).`),
});

export async function createRegistration(
  tournamentId: string,
  teamName: string,
  contactEmail: string,
  phone: string | null,
  playerNames: string[]
): Promise<{ error?: string }> {
  // F18 — avant toute lecture ou écriture : chaque tentative compte, valide ou non. Le limiteur
  // est fail-open si sa table est indisponible (voir lib/rateLimit.ts), il ne bloque donc jamais
  // une inscription légitime à cause d'une panne.
  let ip = "unknown";
  try {
    ip = clientIp(await headers());
  } catch (err) {
    console.error("[createRegistration] En-têtes de requête illisibles, limite appliquée à la clé « unknown »:", err);
  }
  const limit = await checkRateLimit(`registration:${ip}:${tournamentId}`, REGISTRATION_RATE_LIMIT);
  if (!limit.allowed) {
    const { t } = await getI18n();
    return { error: t("registration.rateLimited", { minutes: Math.max(1, Math.ceil(limit.retryAfterSeconds / 60)) }) };
  }

  const parsed = RegistrationSchema.safeParse({ teamName, contactEmail, phone, playerNames });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données d'inscription invalides." };
  }
  ({ teamName, contactEmail, phone, playerNames } = parsed.data);

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament || tournament.status !== "OPEN") {
    return { error: "Ce tournoi n'accepte plus les inscriptions." };
  }
  // F17 — filtre rapide (message clair sans réserver) ; la décision finale est prise sous le
  // verrou du tournoi dans dbReserveRegistrationSlot (publicRegistration).
  if (tournament.registration_mode === "ONSITE") {
    const { t } = await getI18n();
    return { error: t("registration.onlineDisabled") };
  }

  const platformFeeCents = PLATFORM_FEE_CENTS * tournament.players_per_team;

  // DARTSOPEN-MONETIZATION-001 : payment_mode est indépendant de registration_mode (mission
  // §5/§6) — un tournoi payant en payment_mode ONSITE (Stripe Connect absent, ou choix
  // explicite de l'organisateur) confirme l'inscription immédiatement, exactement comme un
  // tournoi gratuit : les droits sont réglés sur place, jamais via un checkout Stripe.
  const confirmsImmediately = tournament.entry_fee === 0 || tournament.payment_mode !== "ONLINE";

  if (confirmsImmediately) {
    // DARTSOPEN-MONETIZATION-002/004 (audit DO-AUD-003/DO-AUD-004, contre-audit P3/P4) : une
    // inscription gratuite ou payée sur place occupe réellement une place dès sa création
    // (status PAID, jamais PENDING) — capacité ET éligibilité du tournoi (statut OPEN) revérifiées
    // atomiquement sous le même verrou, jamais un count-then-insert séparé ni une lecture de
    // statut faite avant cet appel (la lecture ci-dessus n'est qu'un filtre rapide, pas la
    // décision finale).
    const result = await dbReserveRegistrationSlot(tournamentId, ["OPEN"], {
      playerName: teamName,
      playerEmail: contactEmail,
      playerPhone: phone,
      playerNames,
      platformFeeCents,
      status: "PAID",
    }, { publicRegistration: true }).catch((err) => {
      console.error('[createRegistration] dbReserveRegistrationSlot (confirmsImmediately):', err);
      return null;
    });

    if (!result) return { error: "Erreur lors de l'inscription." };
    if (result.outcome !== "RESERVED") return { error: await reservationRefusal(result) };

    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const d = new Date(tournament.date);
    const dateFr = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

    await sendEmail('dartsopen_inscription_confirmation', contactEmail, {
      nom_equipe: teamName,
      tournoi: tournament.name,
      date: dateFr,
      lieu: tournament.location,
      joueurs: playerNames.join(', '),
    }).catch((err) => console.error('[email] Erreur envoi confirmation gratuite:', err));

    redirect(`/t/${tournamentId}/register/success?name=${encodeURIComponent(teamName)}&paiement=${immediatePaymentKind(tournament.entry_fee)}`);
  }

  // Paiement en ligne — DARTSOPEN-MONETIZATION-002 (audit priorité 6) : Connect, puis droits,
  // puis capacité/réservation, dans cet ordre — jamais réserver une place pour un paiement qui
  // ne pourra de toute façon jamais être initié.

  // 1. Connect : l'organisation qui encaisse doit avoir un compte Stripe Connect opérationnel
  // (mission DO-003 — DartsOpen ne dialogue plus jamais directement avec Stripe, uniquement avec
  // SterPlatform). ADR-0021 / L7 — c'est l'organisation du TOURNOI (celle dont l'organisateur a
  // vérifié le Stripe Connect en activant le paiement en ligne), plus la liaison locale du
  // créateur, qui ne sert que de repli pour un tournoi sans organisation. Parcours public sans
  // JWT : slug enregistré sur le tournoi (`authenticated: false`).
  let organizationSlug: string | null;
  try {
    organizationSlug = await resolveBillingOrganizationSlug(billingSourceForTournament(tournament), { authenticated: false });
  } catch (err) {
    console.error("[registration] Organisation du paiement en ligne introuvable (lecture impossible):", tournamentId, err);
    return { error: "Les paiements en ligne ne sont pas disponibles pour ce tournoi actuellement. Contactez l'organisateur." };
  }
  if (!organizationSlug) {
    return { error: "Les paiements en ligne ne sont pas encore configurés pour ce tournoi. Contactez l'organisateur." };
  }

  // DO-PAYMENT-GUARD-001 — défense en profondeur, indépendante de la configuration du
  // tournoi : même si un tournoi (historique ou incohérent) affiche un paiement en ligne,
  // aucun checkout n'est créé si Stripe Connect n'est plus opérationnel au moment précis de
  // l'inscription — une suspension Stripe après coup bloque donc immédiatement les nouveaux
  // paiements, sans dépendre d'une modification préalable du tournoi. Relit toujours l'état
  // courant depuis SterPlatform, jamais une valeur mise en cache.
  const stripeStatus = await getStripeConnectStatus(organizationSlug).catch((err) => {
    console.error("[registration] Échec lecture statut Stripe Connect SterPlatform:", organizationSlug, err);
    return null;
  });
  if (!stripeStatus?.canReceivePayments) {
    return { error: "Les paiements en ligne ne sont pas disponibles pour ce tournoi actuellement. Contactez l'organisateur." };
  }

  // 2. Capacité/réservation — atomique, avec expiration (DO-AUD-009) : si le checkout Stripe
  // n'est jamais créé ou jamais complété (échec, abandon), cette réservation PENDING cesse
  // d'occuper sa place dès l'expiration, sans nécessiter de nettoyage explicite ni laisser une
  // inscription orpheline permanente.
  const reservationExpiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
  const result = await dbReserveRegistrationSlot(tournamentId, ["OPEN"], {
    playerName: teamName,
    playerEmail: contactEmail,
    playerPhone: phone,
    playerNames,
    platformFeeCents,
    status: "PENDING",
    reservationExpiresAt,
  }, { publicRegistration: true }).catch((err) => {
    console.error('[createRegistration] dbReserveRegistrationSlot (online):', err);
    return null;
  });

  if (!result) return { error: "Erreur lors de l'inscription." };
  if (result.outcome !== "RESERVED") return { error: await reservationRefusal(result) };
  const registration = result.registration;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const amountCents = tournament.entry_fee * tournament.players_per_team;

  const { checkout, error } = await createPaymentCheckout({
    organizationSlug,
    externalReference: registration.id,
    amountCents,
    currency: "eur",
    platformFeeCents,
    successUrl: `${appUrl}/t/${tournamentId}/register/success?name=${encodeURIComponent(teamName)}&paiement=en-ligne`,
    cancelUrl: `${appUrl}/t/${tournamentId}/register?cancelled=1`,
    customerEmail: contactEmail,
    metadata: { registration_id: registration.id, tournament_id: tournamentId },
  });

  if (error || !checkout) {
    console.error("[registration] Échec création paiement SterPlatform:", error);
    // La réservation reste PENDING et expirera d'elle-même (RESERVATION_TTL_MINUTES) — jamais
    // une inscription orpheline permanente (DO-AUD-009), jamais besoin de la supprimer ici.
    return { error: "Le paiement n'a pas pu être initié. Réessayez dans quelques instants." };
  }

  await dbUpdateRegistrationPaymentId(registration.id, checkout.paymentId);

  redirect(checkout.checkoutUrl);
}

/** Message d'un refus de réservation (capacité, statut, et refus F17 sous verrou). */
async function reservationRefusal(result: Exclude<ReserveSlotResult, { outcome: "RESERVED" }>): Promise<string> {
  switch (result.outcome) {
    case "FULL":
      return "Ce tournoi est complet.";
    case "ONLINE_REGISTRATION_DISABLED":
      return (await getI18n()).t("registration.onlineDisabled");
    case "INVALID_TEAM_SIZE":
      return (await getI18n()).t("registration.teamSize", { count: result.expected });
    default:
      return "Ce tournoi n'accepte plus les inscriptions.";
  }
}
