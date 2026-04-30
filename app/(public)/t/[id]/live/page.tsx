import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { MatchBoard } from "@/components/tournament/MatchBoard";
import { ScoreBoard } from "@/components/tournament/ScoreBoard";
import { generateQRCodeDataURL } from "@/lib/utils/qrcode";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Vue Live — DartsOpen" };

export default async function LivePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, nb_boards, nb_pools")
    .eq("id", id)
    .single();

  if (!tournament || !["IN_PROGRESS", "FINISHED"].includes(tournament.status)) {
    notFound();
  }

  // Matchs en cours et à venir
  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id, board_number, status,
      player1:registrations!matches_player1_id_fkey(id, player_name),
      player2:registrations!matches_player2_id_fkey(id, player_name),
      match_sets(id, round_order, winner_id, validated_p1, validated_p2)
    `)
    .eq("tournament_id", id)
    .in("status", ["IN_PROGRESS", "PENDING"])
    .order("board_number")
    .order("created_at");

  // Poules et classements
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

  const { data: finishedMatches } = await supabase
    .from("matches")
    .select("player1_id, player2_id, winner_id, pool_id")
    .eq("tournament_id", id)
    .eq("status", "FINISHED");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const boardQRCodes = await Promise.all(
    Array.from({ length: tournament.nb_boards }, (_, i) => i + 1).map(async (board) => ({
      board,
      dataUrl: await generateQRCodeDataURL(`${baseUrl}/t/${id}/score?board=${board}`),
    }))
  );

  const spectatorQR = await generateQRCodeDataURL(`${baseUrl}/t/${id}/live`);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🎯 {tournament.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Tableau de bord en direct</p>
        </div>
        <span className="rounded-full bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 text-xs font-medium animate-pulse">
          ● EN DIRECT
        </span>
      </div>

      {/* MatchBoard temps réel */}
      <MatchBoard
        tournamentId={id}
        initialMatches={matches ?? []}
        nbBoards={tournament.nb_boards}
      />

      {/* ScoreBoard par poule */}
      <ScoreBoard
        tournamentId={id}
        pools={pools ?? []}
        finishedMatches={finishedMatches ?? []}
      />

      {/* QR Codes cibles */}
      {tournament.status === "IN_PROGRESS" && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">QR Codes — Saisie des scores</h2>
          <p className="text-gray-400 text-sm">
            Affichez ces QR codes sur chaque cible. Les joueurs les scannent pour saisir leur score.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {boardQRCodes.map(({ board, dataUrl }) => (
              <div
                key={board}
                className="bg-white rounded-xl p-3 flex flex-col items-center gap-2 shadow"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl} alt={`QR Cible ${board}`} width={120} height={120} />
                <p className="text-xs font-semibold text-gray-700">Cible {board}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* QR Code spectateurs */}
      <section className="flex items-center gap-6 rounded-xl border border-gray-700 p-5">
        <div className="bg-white rounded-lg p-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={spectatorQR} alt="QR Vue Spectateurs" width={100} height={100} />
        </div>
        <div>
          <p className="font-semibold text-white">Vue spectateurs</p>
          <p className="text-sm text-gray-400 mt-1">
            Partagez ce QR code en salle pour que les spectateurs suivent le tournoi en temps réel sur leur smartphone.
          </p>
          <p className="text-xs text-gray-500 mt-2 font-mono">{baseUrl}/t/{id}/live</p>
        </div>
      </section>
    </div>
  );
}
