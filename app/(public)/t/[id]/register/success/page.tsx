import Link from "next/link";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { dayOfMessageKey, registeredMessageKey, successPaymentMessageKey, type RegistrationSuccessTournament } from "@/lib/registration/successPayment";
import { dbGetTournamentPublic } from "@/lib/db/tournament";

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ name?: string; paiement?: string }> }

export const metadata: Metadata = { title: "Inscription confirmée" };

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

export default async function RegisterSuccessPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { name, paiement } = await searchParams;
  const { t } = await getI18n();
  const tournament = await loadTournament(id);
  const dayOfKey = dayOfMessageKey(tournament);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-6xl">🎯</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-brand-dark">{t("registerSuccess.title")}</h1>
          {name && (
            <p className="text-brand-dark">{t(registeredMessageKey(tournament), { name: decodeURIComponent(name) })}</p>
          )}
          {/* Le message dépend du mode de règlement : n'affirmer un encaissement que s'il a eu lieu. */}
          <p className="text-brand-text-secondary text-sm">{t(successPaymentMessageKey(paiement))}</p>
        </div>

        {/* Conseil du jour J adapté au mode de saisie : pas de QR code en saisie traditionnelle. */}
        {dayOfKey && (
          <div className="rounded-xl bg-surface border border-border-muted p-4 text-sm text-brand-dark space-y-1">
            <p>{t(dayOfKey)}</p>
          </div>
        )}

        <Link
          href={`/t/${id}/live`}
          className="inline-block rounded-lg border border-border-muted px-4 py-2 text-sm font-medium text-brand-dark hover:bg-surface transition-colors"
        >
          {t("registerSuccess.followLive")}
        </Link>
      </div>
    </div>
  );
}
