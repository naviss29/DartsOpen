import { AddPlayerForm } from "@/components/tournament/AddPlayerForm";
import { RemovePlayerButton } from "@/components/tournament/RemovePlayerButton";
import { SeedToggleButton } from "@/components/tournament/SeedToggleButton";
import { EditPlayerButton } from "@/components/tournament/EditPlayerButton";
import { EraseRegistrationButton } from "@/components/tournament/EraseRegistrationButton";
import { dbListRegistrations } from "@/lib/db/tournament";
import { getOwnedTournament } from "@/lib/actions/access";
import Link from "next/link";
import type { Metadata } from "next";
import NavPills from "@/components/ui/NavPills";
import { Card, EmptyState, Pill } from "@naviss29/design-system";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Joueurs — DartsOpen" };

type Tournament = {
  id: string;
  name: string;
  status: string;
  max_players: number;
  nb_pools: number;
  players_per_team: number;
  quick_mode: boolean;
};

type Registration = {
  id: string;
  player_name: string;
  player_email: string;
  player_phone: string | null;
  player_names: string[] | null;
  seeded: boolean;
  created_at: string;
};

export default async function PlayersPage({ params }: Props) {
  const { id } = await params;

  const tournament = await getOwnedTournament(id) as Tournament;
  const registrations = await dbListRegistrations(id, "PAID").catch(() => []) as Registration[];

  const count = registrations.length;
  const playerCount = count * tournament.players_per_team;
  const canEdit = ["DRAFT", "OPEN"].includes(tournament.status);
  const canSeed = ["DRAFT", "OPEN", "IN_PROGRESS"].includes(tournament.status);
  const isFull = playerCount >= tournament.max_players;
  const isTeam = tournament.players_per_team > 1;
  const isQuick = tournament.quick_mode;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={`/tournaments/${id}`} className="text-sm text-brand-text-secondary hover:text-brand-dark">
          ← {tournament.name}
        </Link>
        <NavPills
          items={[
            { href: `/tournaments/${id}/players`, label: "👥 Joueurs", current: true },
            ...(!isQuick ? [{ href: `/tournaments/${id}/pools`, label: "🏆 Poules & Matchs" }] : []),
            { href: `/tournaments/${id}/bracket`, label: isQuick ? "⚡ Bracket rapide" : "🥇 Phases finales" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">
            {isTeam ? "Équipes inscrites" : "Joueurs inscrits"}
          </h1>
          <p className="mt-1 text-sm text-brand-text-secondary">
            {playerCount} / {tournament.max_players} joueurs
            {isTeam && ` (${count} équipe${count > 1 ? "s" : ""})`}
            {!isQuick && <>&nbsp;·&nbsp; {tournament.nb_pools} poule{tournament.nb_pools > 1 ? "s" : ""} prévue{tournament.nb_pools > 1 ? "s" : ""}</>}
          </p>
        </div>
        {isFull && <Pill tone="warning">Complet</Pill>}
      </div>

      {canEdit && !isFull && (
        <Card>
          <h2 className="mb-4 font-medium text-brand-dark">
            {isTeam ? "Ajouter une équipe" : "Ajouter un joueur"}
          </h2>
          <AddPlayerForm tournamentId={id} playersPerTeam={tournament.players_per_team} quickMode={isQuick} />
        </Card>
      )}

      {!registrations.length ? (
        <EmptyState
          icon={<span aria-hidden="true">👥</span>}
          title={`Aucun${isTeam ? "e équipe" : " joueur"} inscrit${isTeam ? "e" : ""} pour l'instant`}
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-brand-text-secondary">#</th>
                <th className="px-4 py-3 text-left font-medium text-brand-text-secondary">
                  {isTeam ? "Équipe" : "Nom"}
                </th>
                {isTeam && (
                  <th className="px-4 py-3 text-left font-medium text-brand-text-secondary">Joueurs</th>
                )}
                {!isQuick && <th className="px-4 py-3 text-left font-medium text-brand-text-secondary">Email</th>}
                {!isQuick && <th className="px-4 py-3 text-left font-medium text-brand-text-secondary">Téléphone</th>}
                {canSeed && <th className="px-4 py-3 text-left font-medium text-brand-text-secondary">Tête de série</th>}
                <th className="px-4 py-3 text-left font-medium text-brand-text-secondary">Données</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {registrations.map((reg, i) => (
                <tr key={reg.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 text-brand-text-secondary">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-brand-dark">{reg.player_name}</td>
                  {isTeam && (
                    <td className="px-4 py-3 text-brand-text-secondary">
                      {reg.player_names?.join(", ") ?? "—"}
                    </td>
                  )}
                  {!isQuick && <td className="px-4 py-3 text-brand-text-secondary">{reg.player_email}</td>}
                  {!isQuick && <td className="px-4 py-3 text-brand-text-secondary">{reg.player_phone ?? "—"}</td>}
                  {canSeed && (
                    <td className="px-4 py-3">
                      <SeedToggleButton registrationId={reg.id} tournamentId={id} seeded={reg.seeded} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <EditPlayerButton
                        registrationId={reg.id}
                        tournamentId={id}
                        playerName={reg.player_name}
                        playerEmail={reg.player_email}
                        playerPhone={reg.player_phone}
                        playerNames={reg.player_names}
                        isTeam={isTeam}
                      />
                      <EraseRegistrationButton registrationId={reg.id} tournamentId={id} />
                    </div>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <RemovePlayerButton registrationId={reg.id} tournamentId={id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
