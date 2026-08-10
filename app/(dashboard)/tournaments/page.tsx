import { dbListTournaments, dbAnonymizeExpiredContacts } from "@/lib/db/tournament";
import { getUser } from "@/lib/api/auth";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState } from "@naviss29/design-system";
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
};

export default async function TournamentsPage() {
  const user = await getUser();
  const tournaments = user ? await dbListTournaments(user.id).catch(() => []) as Tournament[] : [];

  // Purge automatique et opportuniste des coordonnées de contact expirées (BAPPS-LEGAL-005
  // §9) — jamais bloquante pour l'affichage du tableau de bord, un échec reste silencieux.
  if (user) dbAnonymizeExpiredContacts(user.id).catch((err) => console.warn("[tournaments] Purge coordonnées expirées:", err));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">Mes tournois</h1>
        <Button href="/tournaments/new">+ Nouveau tournoi</Button>
      </div>

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
              <Card className="p-5 transition-all hover:border-brand-turquoise/40 hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-brand-dark">{t.name}</h2>
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
                  <StatusBadge status={t.status} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
