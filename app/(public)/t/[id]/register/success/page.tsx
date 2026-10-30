import Link from "next/link";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import {
  dayOfMessageKey,
  onlinePaymentMessages,
  onlinePaymentState,
  registeredMessageKey,
  successPaymentMessageKey,
  type OnlinePaymentState,
  type RegistrationPaymentSnapshot,
  type RegistrationSuccessTournament,
} from "@/lib/registration/successPayment";
import { dbGetTournamentPublic } from "@/lib/db/tournament";
import { dbGetRegistrationPaymentStatus } from "@/lib/db/registrationPaymentStatus";
import { PaymentConfirmationRefresh } from "@/components/tournament/PaymentConfirmationRefresh";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string; paiement?: string; inscription?: string }>;
}

// Titre d'onglet neutre : la page sert aussi pendant l'attente du paiement, jamais « confirmée » d'office.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("registerSuccess.metadata") };
}

/**
 * Mode de saisie et taille des équipes du tournoi. Une base indisponible ne doit pas casser la
 * confirmation d'une inscription déjà enregistrée : messages neutres à la place (journalisé).
 */
async function loadTournament(id: string): Promise<RegistrationSuccessTournament | null> {
  try {
    return await dbGetTournamentPublic(id);
  } catch (err) {
    console.error("[inscription] Tournoi illisible sur la page de confirmation, messages neutres :", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * État réel du paiement en ligne (le retour navigateur ne prouve rien). Lien sans identifiant
 * d'inscription ou base indisponible → `null` : la page reste neutre, jamais « confirmée ».
 */
async function loadPaymentStatus(registrationId: string | undefined, tournamentId: string): Promise<RegistrationPaymentSnapshot | null> {
  if (!registrationId) return null;
  try {
    return await dbGetRegistrationPaymentStatus(registrationId, tournamentId);
  } catch (err) {
    console.error("[inscription] État du paiement illisible sur la page de retour, message neutre :", err instanceof Error ? err.message : err);
    return null;
  }
}

const ICONS: Record<OnlinePaymentState, string> = {
  confirmed: "🎯",
  pending: "⏳",
  unknown: "⏳",
  expired: "⚠️",
  failed: "⚠️",
  refunded: "⚠️",
};

export default async function RegisterSuccessPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { name, paiement, inscription } = await searchParams;
  const { t } = await getI18n();

  // Gratuit ou réglé sur place : l'inscription est déjà PAID en base avant la redirection, rien à
  // attendre. Paiement en ligne : l'état est relu en base, le webhook seul confirme.
  const online = paiement === "en-ligne";
  const [tournament, paymentStatus] = await Promise.all([
    loadTournament(id),
    online ? loadPaymentStatus(inscription, id) : Promise.resolve(null),
  ]);
  const state: OnlinePaymentState = online ? onlinePaymentState(paymentStatus, new Date()) : "confirmed";
  const confirmed = state === "confirmed";
  const messages = online ? onlinePaymentMessages(state) : { title: "registerSuccess.title" as const, body: successPaymentMessageKey(paiement) };
  const dayOfKey = confirmed ? dayOfMessageKey(tournament) : null;
  const canRetry = state === "expired" || state === "failed";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-6xl" aria-hidden="true">{ICONS[state]}</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-brand-dark">{t(messages.title)}</h1>
          {/* « Inscrit » seulement une fois l'inscription réellement confirmée. */}
          {name && confirmed && (
            <p className="text-brand-dark">{t(registeredMessageKey(tournament), { name: decodeURIComponent(name) })}</p>
          )}
          {messages.body && <p className="text-brand-text-secondary text-sm">{t(messages.body)}</p>}
          {state === "pending" && <PaymentConfirmationRefresh slowMessage={t("registerSuccess.pendingSlow")} />}
        </div>

        {/* Conseil du jour J adapté au mode de saisie : pas de QR code en saisie traditionnelle. */}
        {dayOfKey && (
          <div className="rounded-xl bg-surface border border-border-muted p-4 text-sm text-brand-dark space-y-1">
            <p>{t(dayOfKey)}</p>
          </div>
        )}

        {canRetry ? (
          <Link
            href={`/t/${id}/register`}
            className="inline-block rounded-lg bg-brand-turquoise px-4 py-2 text-sm font-semibold text-white hover:bg-brand-turquoise/90 transition-colors"
          >
            {t("registerSuccess.retry")}
          </Link>
        ) : (
          <Link
            href={`/t/${id}/live`}
            className="inline-block rounded-lg border border-border-muted px-4 py-2 text-sm font-medium text-brand-dark hover:bg-surface transition-colors"
          >
            {t("registerSuccess.followLive")}
          </Link>
        )}
      </div>
    </div>
  );
}
