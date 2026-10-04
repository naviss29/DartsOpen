import { dbListTournaments } from "@/lib/db/tournament";
import { getUser } from "@/lib/api/auth";
import { getCurrentOrganization } from "@/lib/auth/organizationAccess";
import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import type { Metadata } from "next";
import { Alert, Card, EmptyState, PageHeader, Pill } from "@naviss29/design-system";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Mes tournois — DartsOpen" };

type Tournament = {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
  max_players: number;
  players_per_team: number;
  entry_fee: number;
  registration_mode: string;
  nb_pools: number;
  nb_boards: number;
  players_paid: number;
  can_manage: boolean;
};

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const user = await getUser();
  const { t: translate } = await getI18n();
  const readOnlyLabel = translate("orgAccess.readOnly");
  const { access } = await searchParams;

  // ADR-0021 / L6 — organisation courante (tout rôle : un MEMBER voit, en lecture) + tournois
  // hérités créés par l'utilisateur. SterPlatform injoignable ⇒ seuls les tournois hérités, avec
  // le message D10 (aucune appartenance ne peut être prouvée).
  const current = user ? await getCurrentOrganization() : null;
  const organization = current?.status === "OK" && current.current
    ? { id: current.current.id, role: current.current.role }
    : null;
  const roleUnavailable = access === "unavailable" || current?.status === "UNAVAILABLE";
  const needsSelection = current?.status === "OK" && current.needsSelection;
  const tournaments = user
    ? await dbListTournaments({ userId: user.id, organization }).catch((err) => {
        console.error("[TournamentsPage] liste des tournois", err);
        return [];
      }) as Tournament[]
    : [];

  // La purge des coordonnées expirées (BAPPS-LEGAL-005 §9) n'est volontairement plus
  // déclenchée ici (RGPD-001) : elle ne s'appliquait qu'aux organisateurs qui revenaient sur
  // cette page. Elle tourne désormais en tâche planifiée globale — scripts/purge-expired-contacts.ts.

  return (
    <div className="space-y-6">
      <PageHeader title="Mes tournois" actions={<Button href="/tournaments/new">+ Nouveau tournoi</Button>} />

      {roleUnavailable && <Alert tone="warning"><p>{translate("orgAccess.roleUnavailable")}</p></Alert>}
      {needsSelection && <Alert tone="info"><p>{translate("orgAccess.chooseOrganizationNotice")}</p></Alert>}

      {!tournaments?.length ? (
        <EmptyState
          icon={<span aria-hidden="true">🏆</span>}
          title="Aucun tournoi créé"
          action={<Button href="/tournaments/new">Créer mon premier tournoi</Button>}
        />
      ) : (
        <div className="grid gap-4">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`} className="block">
              <Card className="transition-all hover:border-brand-turquoise/40 hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-h2 text-brand-dark">{t.name}</h2>
                    <p className="mt-1 text-sm text-brand-text-secondary">
                      📅 {new Date(t.date).toLocaleDateString("fr-FR")} &nbsp;·&nbsp;
                      📍 {t.location}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-brand-text-secondary">
                      <span>👤 {t.players_paid * t.players_per_team}/{t.max_players} joueurs</span>
                      <span>🔵 {t.nb_pools} poules</span>
                      <span>🎯 {t.nb_boards} cibles</span>
                      <span>💶 {(t.entry_fee / 100).toFixed(2)} €/j</span>
                      <span>{t.registration_mode === "ONLINE" ? "🌐 En ligne" : "🏠 Sur place"}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge status={t.status} />
                    {!t.can_manage && <Pill tone="neutral">{readOnlyLabel}</Pill>}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
