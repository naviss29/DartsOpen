import { getUser } from "@/lib/api/auth";
import { dbListTournaments, dbListAllTournaments } from "@/lib/db/tournament";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, PageHeader, Pill } from "@naviss29/design-system";
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
  is_mine: boolean;
};

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [myTournaments, allTournaments] = await Promise.all([
    dbListTournaments(user.id).catch(() => []),
    dbListAllTournaments(user.id).catch(() => []) as Promise<Tournament[]>,
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
    <div className="space-y-8">
      <PageHeader title="Tableau de bord" actions={<Button href="/tournaments/new">+ Nouveau tournoi</Button>} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="mt-1 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-brand-dark">Tous les opens</h2>

        {sorted.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">🎯</span>}
            title="Aucun tournoi pour l'instant"
            action={<Button href="/tournaments/new">Créer mon premier tournoi</Button>}
          />
        ) : (
          <div className="grid gap-3">
            {sorted.map((t) => {
              const href = t.is_mine
                ? `/tournaments/${t.id}`
                : t.status === "OPEN"
                ? `/t/${t.id}/register`
                : `/t/${t.id}/live`;

              const isClickable = t.is_mine || t.status !== "DRAFT";

              return isClickable ? (
                <Link key={t.id} href={href} className="block">
                  <Card className="transition-all hover:border-brand-turquoise/40 hover:shadow-sm">
                    <TournamentRow t={t} />
                  </Card>
                </Link>
              ) : (
                <Card key={t.id} className="opacity-60">
                  <TournamentRow t={t} />
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentRow({ t }: { t: Tournament }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-brand-dark">{t.name}</p>
          {t.is_mine && (
            <Pill tone="brand" className="shrink-0">Mon tournoi</Pill>
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
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StatusBadge status={t.status} />
        {!t.is_mine && t.status === "OPEN" && (
          <span className="text-xs font-semibold text-brand-turquoise">S&apos;inscrire →</span>
        )}
      </div>
    </div>
  );
}
