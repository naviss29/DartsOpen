import { GeneratePoolsButton } from "@/components/tournament/GeneratePoolsButton";
import { generateQRCodeDataURL } from "@/lib/utils/qrcode";
import { PrintButton } from "@/components/tournament/PrintButton";
import { ArbitrateMatchButton } from "@/components/tournament/ArbitrateMatchModal";
import { RefereeAccessButton } from "@/components/tournament/RefereeAccessButton";
import { dbListPools, dbListRegistrations } from "@/lib/db/tournament";
import { getOwnedTournament } from "@/lib/actions/access";
import NavPills from "@/components/ui/NavPills";
import Button from "@/components/ui/Button";
import { Card, EmptyState } from "@naviss29/design-system";
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
  sets: { id: string; round_order: number; winner_id: string | null }[];
};

type Pool = {
  id: string;
  name: string;
  players: { id: string; player_name: string }[];
  matches: PoolMatch[];
};

export default async function PoolsPage({ params }: Props) {
  const { id } = await params;

  const tournament = await getOwnedTournament(id) as Tournament;

  const [pools, registrations] = await Promise.all([
    dbListPools(id).catch(() => []) as Promise<Pool[]>,
    dbListRegistrations(id, "PAID").catch(() => []) as Promise<{ id: string }[]>,
  ]);

  const hasPools = pools.length > 0;
  const hasFinishedMatch = pools.some((p) => p.matches.some((m) => m.status === "FINISHED"));
  const registrationCount = registrations.length;
  const totalPlayers = registrationCount * tournament.players_per_team;
  const effectivePools = Math.min(tournament.nb_pools, Math.floor(registrationCount / 2));
  const canGenerate = ["OPEN", "IN_PROGRESS"].includes(tournament.status) && registrationCount >= 2 && tournament.nb_pools > 1;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const showQRCodes = ["OPEN", "IN_PROGRESS", "FINISHED"].includes(tournament.status);
  const boardQRCodes = showQRCodes
    ? await Promise.all(
        Array.from({ length: tournament.nb_boards }, (_, i) => i + 1).map(async (board) => ({
          board,
          dataUrl: await generateQRCodeDataURL(`${baseUrl}/t/${id}/field?board=${board}`),
        }))
      )
    : [];
  const spectatorQR = showQRCodes
    ? await generateQRCodeDataURL(`${baseUrl}/t/${id}/live`)
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={`/tournaments/${id}`} className="text-sm text-brand-text-secondary hover:text-brand-dark">
          ← {tournament.name}
        </Link>
        <NavPills
          items={[
            { href: `/tournaments/${id}/players`, label: "👥 Joueurs" },
            { href: `/tournaments/${id}/pools`, label: "🏆 Poules & Matchs", current: true },
            {
              href: `/tournaments/${id}/bracket`,
              label: "🥇 Phases finales",
              disabled: !["IN_PROGRESS", "FINISHED"].includes(tournament.status),
              disabledReason: "Démarrez le tournoi pour accéder aux phases finales",
            },
            { href: `/tournaments/${id}/pilotage`, label: "🎛️ Pilotage" },
          ]}
        />
        {["IN_PROGRESS", "FINISHED"].includes(tournament.status) && (
          <Link
            href={`/t/${id}/live`}
            target="_blank"
            className="inline-block rounded-lg border border-brand-turquoise bg-brand-turquoise/10 px-4 py-2 text-sm font-medium text-brand-turquoise hover:bg-brand-turquoise/20 transition-colors"
          >
            🎯 Vue Live ↗
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Poules & Matchs</h1>
          <p className="text-sm text-brand-text-secondary mt-1">
            {tournament.nb_pools} poules · {tournament.nb_boards} cibles · {totalPlayers} joueurs
          </p>
        </div>

        {canGenerate && (
          <GeneratePoolsButton
            tournamentId={id}
            hasPools={hasPools}
            nbPoolsConfigured={tournament.nb_pools}
            effectivePools={effectivePools}
            hasFinishedMatch={hasFinishedMatch}
          />
        )}
      </div>

      {showQRCodes && (
        <section><Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-h2 text-brand-dark">QR Codes — Saisie des scores</h2>
              <p className="text-sm text-brand-text-secondary mt-0.5">
                Scannez-les ou imprimez-les pour les coller sur chaque fléchier avant le tournoi.
              </p>
            </div>
            <PrintButton />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {boardQRCodes.map(({ board, dataUrl }) => (
              <div
                key={board}
                className="flex flex-col items-center gap-2 rounded-xl border border-border-muted p-4 text-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl} alt={`QR Cible ${board}`} width={140} height={140} />
                <p className="font-semibold text-brand-dark">Cible {board}</p>
                <p className="text-xs text-brand-text-secondary font-mono break-all">
                  {baseUrl}/t/{id}/field?board={board}
                </p>
              </div>
            ))}

            {spectatorQR && (
              <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-brand-turquoise/30 bg-brand-turquoise/10 p-4 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={spectatorQR} alt="QR Spectateurs" width={140} height={140} />
                <p className="font-semibold text-brand-turquoise">Suivre le tournoi</p>
                <p className="text-xs text-brand-turquoise">Scannez pour voir les classements et matchs en direct</p>
              </div>
            )}
          </div>
        </Card></section>
      )}

      {showQRCodes && (
        <section><Card className="space-y-4">
          <div>
            <h2 className="text-h2 text-brand-dark">Accès arbitre (réservé à l&apos;organisateur)</h2>
            <p className="text-sm text-brand-text-secondary mt-0.5">
              À ne pas coller sur le fléchier ni diffuser aux joueurs. Générez un QR arbitre juste
              avant de le remettre à la personne concernée : il n&apos;est valable que 15 minutes,
              usage unique, et ne donne jamais accès au tableau de bord organisateur.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: tournament.nb_boards }, (_, i) => i + 1).map((board) => (
              <RefereeAccessButton key={board} tournamentId={id} board={board} />
            ))}
          </div>
        </Card></section>
      )}

      {tournament.nb_pools === 1 ? (
        ["IN_PROGRESS", "FINISHED"].includes(tournament.status) ? (
          <Card variant="info" className="space-y-3 py-10">
            <p className="font-semibold text-accent">Format élimination directe</p>
            <p className="text-sm text-accent">
              Tous les joueurs inscrits participent directement aux phases finales.
            </p>
            <Button href={`/tournaments/${id}/bracket`}>Voir les phases finales →</Button>
          </Card>
        ) : (
          <EmptyState title="Format élimination directe" description="Démarrez le tournoi pour accéder aux phases finales." />
        )
      ) : !hasPools ? (
        <EmptyState
          title="Aucune poule pour l'instant"
          description={
            canGenerate
              ? "Cliquez sur « Générer les poules » pour créer les poules et les matchs automatiquement."
              : tournament.status !== "OPEN"
                ? "Passez le tournoi en « Ouvert » pour générer les poules."
                : "Il faut au moins 2 équipes inscrites pour générer les poules."
          }
        />
      ) : (
        <div className="space-y-6">
          {pools.map((pool) => (
            <Card key={pool.id} className="overflow-hidden p-0">
              <div className="px-5 py-3 bg-surface-secondary border-b border-border-muted flex items-center justify-between">
                <h2 className="text-h2 text-brand-dark">{pool.name}</h2>
                <span className="text-xs text-brand-text-secondary">
                  {tournament.players_per_team > 1
                    ? `${pool.players.length} équipes (${pool.players.length * tournament.players_per_team} joueurs)`
                    : `${pool.players.length} joueurs`
                  } · {pool.matches.length} matchs
                </span>
              </div>

              <div className="p-5 grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-brand-text-secondary uppercase tracking-wider mb-2">Joueurs</p>
                  <ul className="space-y-1">
                    {pool.players.map((p) => (
                      <li key={p.id} className="text-sm text-brand-dark">{p.player_name}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium text-brand-text-secondary uppercase tracking-wider mb-2">Matchs</p>
                  <ul className="space-y-1">
                    {pool.matches.map((m) => (
                      <li key={m.id} className="text-sm flex items-center gap-2">
                        <span className="text-xs text-brand-text-secondary w-16">
                          {m.board_number > 0 ? `Cible ${m.board_number}` : "—"}
                        </span>
                        <span className="text-brand-dark flex-1">
                          {m.player1.player_name} vs {m.player2.player_name}
                        </span>
                        <StatusDot status={m.status} />
                        <ArbitrateMatchButton match={m} tournamentId={id} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-border-default",
    IN_PROGRESS: "bg-brand-turquoise animate-pulse",
    FINISHED: "bg-neutral-solid",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[status] ?? "bg-border-default"}`} />;
}
