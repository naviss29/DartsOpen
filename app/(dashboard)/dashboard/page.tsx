import { getUser } from "@/lib/api/auth";
import { getCurrentOrganization } from "@/lib/auth/organizationAccess";
import { getI18n } from "@/lib/i18n/server";
import { dbListTournaments, dbListAllTournaments } from "@/lib/db/tournament";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Alert, Card, EmptyState, PageHeader, Pill } from "@naviss29/design-system";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Tableau de bord — DartsOpen" };

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
  /** ADR-0021 / L6 — visible dans le tableau de bord (organisation courante ou tournoi hérité créé). */
  can_view: boolean;
  /** Ex-`is_mine` : gestion permise (OWNER/ADMIN de l'organisation, ou créateur d'un tournoi hérité). */
  can_manage: boolean;
};

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const { t: translate } = await getI18n();
  const readOnlyLabel = translate("orgAccess.readOnly");

  // ADR-0021 / L6 — périmètre = organisation courante (tout rôle) + tournois hérités créés.
  const current = await getCurrentOrganization();
  const organization = current.status === "OK" && current.current
    ? { id: current.current.id, role: current.current.role }
    : null;
  const scope = { userId: user.id, organization };

  const [myTournaments, allTournaments] = await Promise.all([
    dbListTournaments(scope).catch((err) => {
      console.error("[DashboardPage] tournois de l'organisation", err);
      return [];
    }),
    dbListAllTournaments(scope).catch((err) => {
      console.error("[DashboardPage] tous les opens", err);
      return [];
    }) as Promise<Tournament[]>,
  ]);

  // DO-BETA-UX-001 — mêmes classes de couleur que Pill (DS) par souci d'un seul vocabulaire
  // visuel de statut (UX-UI-Standards.md §3 "Badges/Status"), jamais une teinte inventée par
  // écran (ancien "emerald-100"/"slate-50" propres à cette page).
  const stats = [
    { label: "Total", value: myTournaments.length, color: "bg-surface-secondary text-text-strong" },
    { label: "Ouvertes", value: myTournaments.filter(t => t.status === "OPEN").length, color: "bg-accent/10 text-accent" },
    { label: "En cours", value: myTournaments.filter(t => t.status === "IN_PROGRESS").length, color: "bg-success-subtle-strong text-success" },
    { label: "Terminés", value: myTournaments.filter(t => t.status === "FINISHED").length, color: "bg-surface-secondary text-text-strong" },
  ];

  // Trier : OPEN en premier, puis IN_PROGRESS, puis FINISHED, puis DRAFT (les miens)
  const statusOrder: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, FINISHED: 2, DRAFT: 3 };
  const sorted = [...allTournaments].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <PageHeader title="Tableau de bord" actions={<Button href="/tournaments/new">+ Nouveau tournoi</Button>} />

      {current.status === "UNAVAILABLE" && <Alert tone="warning"><p>{translate("orgAccess.roleUnavailable")}</p></Alert>}
      {current.status === "OK" && current.needsSelection && (
        <Alert tone="info"><p>{translate("orgAccess.chooseOrganizationNotice")}</p></Alert>
      )}

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`min-w-0 rounded-xl p-3 sm:p-4 ${stat.color}`}>
            <p className="text-2xl font-bold sm:text-3xl">{stat.value}</p>
            <p className="mt-1 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-h2 text-brand-dark">Tous les opens</h2>

        {sorted.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">🎯</span>}
            title="Aucun tournoi pour l'instant"
            action={<Button href="/tournaments/new">Créer mon premier tournoi</Button>}
          />
        ) : (
          <div className="grid min-w-0 gap-3">
            {sorted.map((t) => {
              const href = t.can_view
                ? `/tournaments/${t.id}`
                : t.status === "OPEN"
                ? `/t/${t.id}/register`
                : `/t/${t.id}/live`;

              const isClickable = t.can_view || t.status !== "DRAFT";

              return isClickable ? (
                <Link key={t.id} href={href} className="block">
                  <Card className="min-w-0 overflow-hidden transition-all hover:border-brand-turquoise/40 hover:shadow-sm">
                    <TournamentRow t={t} readOnlyLabel={readOnlyLabel} />
                  </Card>
                </Link>
              ) : (
                <Card key={t.id} className="opacity-60">
                  <TournamentRow t={t} readOnlyLabel={readOnlyLabel} />
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentRow({ t, readOnlyLabel }: { t: Tournament; readOnlyLabel: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-brand-dark">{t.name}</p>
          {t.can_manage && (
            <Pill tone="brand" className="shrink-0">Mon tournoi</Pill>
          )}
          {t.can_view && !t.can_manage && (
            <Pill tone="neutral" className="shrink-0">{readOnlyLabel}</Pill>
          )}
        </div>
        <p className="mt-0.5 text-sm text-brand-text-secondary">
          📅 {new Date(t.date).toLocaleDateString("fr-FR")} &nbsp;·&nbsp; 📍 {t.location}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-brand-text-secondary">
          <span>👤 {t.players_paid * t.players_per_team}/{t.max_players} joueurs</span>
          <span>🔵 {t.nb_pools} poules</span>
          <span>🎯 {t.nb_boards} cibles</span>
          <span>💶 {(t.entry_fee / 100).toFixed(2)} €/j</span>
          <span>{t.registration_mode === "ONLINE" ? "🌐 En ligne" : "🏠 Sur place"}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:flex-col sm:items-end">
        <StatusBadge status={t.status} />
        {!t.can_view && t.status === "OPEN" && (
          <span className="text-xs font-semibold text-brand-turquoise">S&apos;inscrire →</span>
        )}
      </div>
    </div>
  );
}
