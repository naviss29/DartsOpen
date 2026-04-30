import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { generatePools } from "@/lib/actions/pool";
import Link from "next/link";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Poules — DartsOpen" };

export default async function PoolsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, nb_pools, nb_boards")
    .eq("id", id)
    .eq("association_id", user!.id)
    .single();

  if (!tournament) notFound();

  const { data: pools } = await supabase
    .from("pools")
    .select(`
      id, name,
      pool_players(
        registration_id,
        registrations(player_name)
      )
    `)
    .eq("tournament_id", id)
    .order("name");

  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id, board_number, status,
      player1:registrations!matches_player1_id_fkey(player_name),
      player2:registrations!matches_player2_id_fkey(player_name),
      pool_id
    `)
    .eq("tournament_id", id)
    .order("board_number")
    .order("created_at");

  const { count: playerCount } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", id)
    .eq("status", "PAID");

  const hasPools = (pools?.length ?? 0) > 0;
  const canGenerate = tournament.status === "OPEN" && (playerCount ?? 0) >= 2;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + onglets */}
      <div className="space-y-3">
        <Link href={`/tournaments/${id}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {tournament.name}
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href={`/tournaments/${id}/players`}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
          >
            👥 Joueurs
          </Link>
          <Link
            href={`/tournaments/${id}/pools`}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
          >
            🏆 Poules & Matchs
          </Link>
          {["IN_PROGRESS", "FINISHED"].includes(tournament.status) && (
            <Link
              href={`/t/${id}/live`}
              target="_blank"
              className="rounded-lg border border-green-500 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
            >
              🎯 Vue Live ↗
            </Link>
          )}
        </nav>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Poules & Matchs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tournament.nb_pools} poules · {tournament.nb_boards} cibles · {playerCount ?? 0} joueurs
          </p>
        </div>

        {canGenerate && (
          <form action={generatePools.bind(null, id)}>
            <button
              type="submit"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
            >
              {hasPools ? "Regénérer les poules" : "Générer les poules"}
            </button>
          </form>
        )}
      </div>

      {!hasPools ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">
            {canGenerate
              ? "Cliquez sur « Générer les poules » pour créer les poules et les matchs automatiquement."
              : "Inscrivez des joueurs et passez le tournoi en « Ouvert » pour générer les poules."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pools?.map((pool) => {
            const poolMatches = matches?.filter((m) => m.pool_id === pool.id) ?? [];
            return (
              <div key={pool.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">{pool.name}</h2>
                  <span className="text-xs text-gray-500">
                    {pool.pool_players.length} joueurs · {poolMatches.length} matchs
                  </span>
                </div>

                <div className="p-5 grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Joueurs</p>
                    <ul className="space-y-1">
                      {pool.pool_players.map((pp) => (
                        <li key={pp.registration_id} className="text-sm text-gray-700">
                          {pp.registrations.player_name}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Matchs</p>
                    <ul className="space-y-1">
                      {poolMatches.map((m) => (
                        <li key={m.id} className="text-sm flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-16">Cible {m.board_number}</span>
                          <span className="text-gray-700">
                            {m.player1.player_name} vs {m.player2.player_name}
                          </span>
                          <StatusDot status={m.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-gray-300",
    IN_PROGRESS: "bg-green-400 animate-pulse",
    FINISHED: "bg-blue-400",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[status] ?? "bg-gray-300"}`} />;
}
