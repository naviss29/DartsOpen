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
    .select("id, name, status, max_players, nb_pools")
    .eq("id", id)
    .eq("association_id", user!.id)
    .single();

  if (!tournament) notFound();

  const { data: players, count } = await supabase
    .from("registrations")
    .select("id, player_name, player_email, player_phone, created_at", { count: "exact" })
    .eq("tournament_id", id)
    .eq("status", "PAID")
    .order("created_at");

  const canEdit = ["DRAFT", "OPEN"].includes(tournament.status);
  const isFull = (count ?? 0) >= tournament.max_players;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <Link href={`/tournaments/${id}`} className="hover:text-gray-900">
          ← {tournament.name}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Joueurs inscrits</h1>
          <p className="text-sm text-gray-500 mt-1">
            {count ?? 0} / {tournament.max_players} joueurs
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
          <h2 className="font-medium text-gray-900 mb-4">Ajouter un joueur</h2>
          <AddPlayerForm tournamentId={id} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!players?.length ? (
          <div className="p-12 text-center text-gray-500">
            Aucun joueur inscrit pour l&apos;instant.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nom</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Téléphone</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {players.map((player, i) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{player.player_name}</td>
                  <td className="px-4 py-3 text-gray-600">{player.player_email}</td>
                  <td className="px-4 py-3 text-gray-500">{player.player_phone ?? "—"}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <RemovePlayerButton registrationId={player.id} tournamentId={id} />
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
