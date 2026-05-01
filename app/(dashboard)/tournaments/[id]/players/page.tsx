import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AddPlayerForm } from "@/components/tournament/AddPlayerForm";
import { RemovePlayerButton } from "@/components/tournament/RemovePlayerButton";
import Link from "next/link";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Joueurs — DartsOpen" };

export default async function PlayersPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, max_players, nb_pools, players_per_team")
    .eq("id", id)
    .eq("association_id", user!.id)
    .single();

  if (!tournament) notFound();

  const { data: registrations, count } = await supabase
    .from("registrations")
    .select("id, player_name, player_email, player_phone, player_names, created_at", { count: "exact" })
    .eq("tournament_id", id)
    .eq("status", "PAID")
    .order("created_at");

  const playerCount = (count ?? 0) * tournament.players_per_team;
  const canEdit = ["DRAFT", "OPEN"].includes(tournament.status);
  const isFull = playerCount >= tournament.max_players;
  const isTeam = tournament.players_per_team > 1;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + onglets */}
      <div className="space-y-3">
        <Link href={`/tournaments/${id}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {tournament.name}
        </Link>
        <nav className="flex items-center gap-2">
          <Link href={`/tournaments/${id}/players`} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">
            👥 Joueurs
          </Link>
          <Link href={`/tournaments/${id}/pools`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors">
            🏆 Poules & Matchs
          </Link>
          <Link href={`/tournaments/${id}/bracket`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors">
            🥇 Phases finales
          </Link>
        </nav>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isTeam ? "Équipes inscrites" : "Joueurs inscrits"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {playerCount} / {tournament.max_players} joueurs
            {isTeam && ` (${count ?? 0} équipe${(count ?? 0) > 1 ? "s" : ""})`}
            &nbsp;·&nbsp; {tournament.nb_pools} poules prévues
          </p>
        </div>
        {isFull && (
          <span className="rounded-full bg-orange-100 text-orange-700 px-3 py-1 text-xs font-medium">
            Complet
          </span>
        )}
      </div>

      {canEdit && !isFull && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-medium text-gray-900 mb-4">
            {isTeam ? "Ajouter une équipe" : "Ajouter un joueur"}
          </h2>
          <AddPlayerForm tournamentId={id} playersPerTeam={tournament.players_per_team} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!registrations?.length ? (
          <div className="p-12 text-center text-gray-500">
            Aucun{isTeam ? "e équipe" : " joueur"} inscrit{isTeam ? "e" : ""} pour l&apos;instant.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  {isTeam ? "Équipe" : "Nom"}
                </th>
                {isTeam && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Joueurs</th>
                )}
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Téléphone</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {registrations.map((reg, i) => (
                <tr key={reg.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{reg.player_name}</td>
                  {isTeam && (
                    <td className="px-4 py-3 text-gray-600">
                      {reg.player_names?.join(", ") ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-600">{reg.player_email}</td>
                  <td className="px-4 py-3 text-gray-500">{reg.player_phone ?? "—"}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <RemovePlayerButton registrationId={reg.id} tournamentId={id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
