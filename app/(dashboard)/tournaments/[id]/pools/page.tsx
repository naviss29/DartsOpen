import { notFound } from "next/navigation";
import { GeneratePoolsButton } from "@/components/tournament/GeneratePoolsButton";
import { generateQRCodeDataURL } from "@/lib/utils/qrcode";
import { PrintButton } from "@/components/tournament/PrintButton";
import { apiGetTournament, apiListPools, apiListRegistrations } from "@/lib/api/tournament";
import Link from "next/link";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Poules — DartsOpen" };

type Tournament = {
  id: string;
  name: string;
  status: string;
  nb_pools: number;
  nb_boards: number;
  players_per_team: number;
};

type PoolMatch = {
  id: string;
  board_number: number;
  status: string;
  player1: { id: string; player_name: string };
  player2: { id: string; player_name: string };
};

type Pool = {
  id: string;
  name: string;
  players: { id: string; player_name: string }[];
  matches: PoolMatch[];
};

export default async function PoolsPage({ params }: Props) {
  const { id } = await params;

  const [tournament, pools, registrations] = await Promise.all([
    apiGetTournament(id) as Promise<Tournament | null>,
    apiListPools(id) as Promise<Pool[]>,
    apiListRegistrations(id, "PAID") as Promise<{ id: string }[]>,
  ]);

  if (!tournament) notFound();

  const hasPools = pools.length > 0;
  const registrationCount = registrations.length;
  const totalPlayers = registrationCount * tournament.players_per_team;
  const effectivePools = Math.min(tournament.nb_pools, Math.floor(registrationCount / 2));
  const canGenerate = tournament.status === "OPEN" && registrationCount >= 2 && tournament.nb_pools > 1;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const showQRCodes = ["OPEN", "IN_PROGRESS", "FINISHED"].includes(tournament.status);
  const boardQRCodes = showQRCodes
    ? await Promise.all(
        Array.from({ length: tournament.nb_boards }, (_, i) => i + 1).map(async (board) => ({
          board,
          dataUrl: await generateQRCodeDataURL(`${baseUrl}/t/${id}/score?board=${board}`),
        }))
      )
    : [];
  const spectatorQR = showQRCodes
    ? await generateQRCodeDataURL(`${baseUrl}/t/${id}/live`)
    : null;

  return (
    <div className="space-y-6">
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
          {["IN_PROGRESS", "FINISHED"].includes(tournament.status) ? (
            <Link
              href={`/tournaments/${id}/bracket`}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
            >
              🥇 Phases finales
            </Link>
          ) : (
            <span className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed" title="Démarrez le tournoi pour accéder aux phases finales">
              🥇 Phases finales
            </span>
          )}
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
            {tournament.nb_pools} poules · {tournament.nb_boards} cibles · {totalPlayers} joueurs
          </p>
        </div>

        {canGenerate && (
          <GeneratePoolsButton
            tournamentId={id}
            hasPools={hasPools}
            nbPoolsConfigured={tournament.nb_pools}
            effectivePools={effectivePools}
          />
        )}
      </div>

      {showQRCodes && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">QR Codes — Saisie des scores</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Scannez-les ou imprimez-les pour les coller sur chaque fléchier avant le tournoi.
              </p>
            </div>
            <PrintButton />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {boardQRCodes.map(({ board, dataUrl }) => (
              <div
                key={board}
                className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 text-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl} alt={`QR Cible ${board}`} width={140} height={140} />
                <p className="font-semibold text-gray-900">Cible {board}</p>
                <p className="text-xs text-gray-400 font-mono break-all">
                  {baseUrl}/t/{id}/score?board={board}
                </p>
              </div>
            ))}

            {spectatorQR && (
              <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 p-4 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={spectatorQR} alt="QR Spectateurs" width={140} height={140} />
                <p className="font-semibold text-green-800">Suivre le tournoi</p>
                <p className="text-xs text-green-600">Scannez pour voir les classements et matchs en direct</p>
              </div>
            )}
          </div>
        </section>
      )}

      {tournament.nb_pools === 1 ? (
        ["IN_PROGRESS", "FINISHED"].includes(tournament.status) ? (
          <div className="rounded-xl bg-green-50 border border-green-200 p-10 text-center space-y-3">
            <p className="text-green-800 font-semibold">Format élimination directe</p>
            <p className="text-green-700 text-sm">
              Tous les joueurs inscrits participent directement aux phases finales.
            </p>
            <Link
              href={`/tournaments/${id}/bracket`}
              className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Voir les phases finales →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500">
              Format élimination directe — démarrez le tournoi pour accéder aux phases finales.
            </p>
          </div>
        )
      ) : !hasPools ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">
            {canGenerate
              ? "Cliquez sur « Générer les poules » pour créer les poules et les matchs automatiquement."
              : tournament.status !== "OPEN"
                ? "Passez le tournoi en « Ouvert » pour générer les poules."
                : "Il faut au moins 2 équipes inscrites pour générer les poules."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pools.map((pool) => (
            <div key={pool.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{pool.name}</h2>
                <span className="text-xs text-gray-500">
                  {tournament.players_per_team > 1
                    ? `${pool.players.length} équipes (${pool.players.length * tournament.players_per_team} joueurs)`
                    : `${pool.players.length} joueurs`
                  } · {pool.matches.length} matchs
                </span>
              </div>

              <div className="p-5 grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Joueurs</p>
                  <ul className="space-y-1">
                    {pool.players.map((p) => (
                      <li key={p.id} className="text-sm text-gray-700">{p.player_name}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Matchs</p>
                  <ul className="space-y-1">
                    {pool.matches.map((m) => (
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
          ))}
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
