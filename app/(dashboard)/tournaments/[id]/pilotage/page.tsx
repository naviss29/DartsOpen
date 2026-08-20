import Link from "next/link";
import type { Metadata } from "next";
import { Alert, Card, EmptyState, Pill } from "@naviss29/design-system";
import { getOwnedTournament } from "@/lib/actions/access";
import { loadTournamentConsoleData } from "@/lib/ops/loadConsoleData";
import {
  buildConsoleSummary,
  buildReadinessChecklist,
  buildNextAction,
  buildBoardsView,
  buildMatchQueue,
  detectIncidents,
  buildParticipantsSummary,
  type ChecklistLevel,
  type BoardStatus,
} from "@/lib/ops/tournamentConsole";
import NavPills from "@/components/ui/NavPills";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import { TournamentStatusButton } from "@/components/tournament/TournamentStatusButton";
import { RefereeAccessButton } from "@/components/tournament/RefereeAccessButton";
import { ReassignBoardsButton } from "@/components/ops/ReassignBoardsButton";
import { ConsoleAutoRefresh } from "@/components/ops/ConsoleAutoRefresh";
import { FieldIncidentCard } from "@/components/ops/FieldIncidentCard";

interface Props {
  params: Promise<{ id: string }>;
}

type Tournament = {
  id: string;
  name: string;
  status: string;
  quick_mode: boolean;
  scoring_mode: string;
  nb_boards: number;
  nb_pools: number;
  max_players: number;
  players_per_team: number;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tournament = (await getOwnedTournament(id)) as Tournament;
  return { title: `Pilotage — ${tournament.name} — DartsOpen` };
}

const NEXT_STATUS: Record<string, string> = { DRAFT: "OPEN", OPEN: "IN_PROGRESS", IN_PROGRESS: "FINISHED" };
const NEXT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Ouvrir les inscriptions",
  OPEN: "Démarrer le tournoi",
  IN_PROGRESS: "Clôturer le tournoi",
};

const CHECKLIST_STYLES: Record<ChecklistLevel, { icon: string; text: string }> = {
  ok: { icon: "✅", text: "text-brand-text-secondary" },
  warning: { icon: "⚠️", text: "text-amber-700" },
  blocking: { icon: "⛔", text: "text-red-700" },
};

const BOARD_STYLES: Record<BoardStatus, string> = {
  free: "border-slate-200 bg-slate-50",
  active: "border-brand-turquoise/40 bg-brand-turquoise/5",
  anomaly: "border-red-300 bg-red-50",
};

export default async function TournamentPilotagePage({ params }: Props) {
  const { id } = await params;

  const tournament = (await getOwnedTournament(id)) as Tournament;

  // DO-OPS-002 (défaut 2) — la console agrège l'existant : mêmes fonctions db* que le reste du
  // dashboard (page.tsx, players/page.tsx, pools/page.tsx), jamais une seconde source de vérité.
  // Une panne sur l'une de ces trois lectures critiques n'est PLUS jamais rattrapée en `[]` ici :
  // loadTournamentConsoleData() journalise puis laisse l'erreur se propager jusqu'à error.tsx
  // (déjà en place) — un état d'erreur explicite, jamais une synthèse calculée sur un faux "zéro
  // élément" qui mentirait à l'organisateur sur l'état réel du tournoi.
  const { registrations, pools, matches, fieldIncidents } = await loadTournamentConsoleData(id);
  const openFieldIncidents = fieldIncidents.filter((fi) => fi.status === "OPEN");

  const summary = buildConsoleSummary(tournament, registrations, matches);
  const checklist = buildReadinessChecklist(tournament, registrations, pools);
  const incidents = detectIncidents(tournament, matches);
  const nextAction = buildNextAction(id, tournament, checklist, summary, pools, incidents);
  const boards = buildBoardsView(tournament, matches);
  const queue = buildMatchQueue(matches);
  const participants = buildParticipantsSummary(registrations, matches);

  const isPreStart = ["DRAFT", "OPEN", "PENDING_ENTITLEMENT"].includes(tournament.status);
  const isRunning = tournament.status === "IN_PROGRESS";
  const isFinished = tournament.status === "FINISHED";

  // DO-OPS-002 — défaut 1 : ne propose plus la clôture manuelle tant qu'il reste du jeu. La
  // vraie barrière reste serveur (dbUpdateTournamentStatus, lib/db/tournament.ts) — ceci n'est
  // qu'un confort d'affichage cohérent avec elle, jamais l'inverse.
  const closureBlocked = NEXT_STATUS[tournament.status] === "FINISHED" && (summary.matchesInProgress > 0 || summary.matchesPending > 0);

  return (
    <div className="space-y-6">
      <ConsoleAutoRefresh tournamentId={id} />

      <div className="space-y-3">
        <Link href={`/tournaments/${id}`} className="text-sm text-brand-text-secondary hover:text-brand-dark">
          ← {tournament.name}
        </Link>
        <NavPills
          items={[
            { href: `/tournaments/${id}/players`, label: "👥 Joueurs" },
            ...(tournament.quick_mode ? [] : [{ href: `/tournaments/${id}/pools`, label: "🏆 Poules & Matchs" }]),
            { href: `/tournaments/${id}/bracket`, label: tournament.quick_mode ? "⚡ Bracket rapide" : "🥇 Phases finales" },
            { href: `/tournaments/${id}/pilotage`, label: "🎛️ Pilotage", current: true },
          ]}
        />
      </div>

      {/* ── Vue synthétique (§3) ─────────────────────────────────────────── */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-brand-dark">{tournament.name}</h1>
            <StatusBadge status={tournament.status} />
            {tournament.quick_mode && <Pill tone="success">⚡ Rapide</Pill>}
          </div>
          {NEXT_STATUS[tournament.status] && !closureBlocked && (
            <TournamentStatusButton
              tournamentId={id}
              nextStatus={NEXT_STATUS[tournament.status]}
              label={NEXT_STATUS_LABEL[tournament.status]}
            />
          )}
          {closureBlocked && (
            <p className="text-xs text-brand-text-secondary text-right max-w-[200px]">
              Clôture indisponible : {summary.matchesInProgress} match(s) en cours, {summary.matchesPending} en attente.
            </p>
          )}
        </div>
        <p className="text-sm text-brand-text-secondary">{summary.formatLabel}</p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Joueurs confirmés" value={`${summary.confirmedPlayerCount}`} sub={`/ ${summary.capacity} max`} />
          <Stat label="Cibles" value={`${summary.boardsCount}`} />
          <Stat label="Terminés" value={`${summary.matchesFinished}`} />
          <Stat label="En cours" value={`${summary.matchesInProgress}`} />
          <Stat label="En attente" value={`${summary.matchesPending}`} />
          <Stat label="Progression" value={`${summary.progressPercent}%`} />
        </div>

        {summary.totalMatches > 0 && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-turquoise transition-all"
              style={{ width: `${summary.progressPercent}%` }}
            />
          </div>
        )}
      </Card>

      {/* ── Prochaine action (§5) ────────────────────────────────────────── */}
      <Card
        className={
          nextAction.tone === "warning"
            ? "border-amber-300 bg-amber-50"
            : nextAction.tone === "action"
              ? "border-brand-turquoise/40 bg-brand-turquoise/5"
              : ""
        }
      >
        <p className="text-xs font-medium uppercase tracking-wider text-brand-text-secondary">Que dois-je faire maintenant ?</p>
        <p className="mt-1 text-lg font-bold text-brand-dark">{nextAction.title}</p>
        <p className="mt-1 text-sm text-brand-text-secondary">{nextAction.description}</p>
        {nextAction.href && (
          <div className="mt-3">
            <Button href={nextAction.href} variant="primary">
              Ouvrir
            </Button>
          </div>
        )}
      </Card>

      {/* ── Interventions demandées (DO-FIELD-INCIDENT-001) ──────────────── */}
      {openFieldIncidents.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-brand-dark">Interventions demandées ({openFieldIncidents.length})</h2>
          <div className="space-y-2">
            {openFieldIncidents.map((fi) => (
              <FieldIncidentCard key={fi.id} tournamentId={id} incident={fi} />
            ))}
          </div>
        </section>
      )}

      {/* ── Incidents (§8) ───────────────────────────────────────────────── */}
      {incidents.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-brand-dark">Incidents détectés</h2>
          {incidents.map((incident) => (
            <Alert key={incident.id} tone={incident.severity === "critical" ? "error" : "warning"}>
              <p>{incident.message}</p>
              {incident.id === "free-board-with-queue" && (
                <div className="mt-2">
                  <ReassignBoardsButton tournamentId={id} />
                </div>
              )}
            </Alert>
          ))}
        </section>
      )}

      {/* ── Checklist de préparation (§4) — seulement avant démarrage ───── */}
      {isPreStart && (
        <section>
          <Card className="space-y-3">
            <h2 className="font-semibold text-brand-dark">Checklist de préparation</h2>
            <ul className="space-y-2">
              {checklist.map((item) => {
                const style = CHECKLIST_STYLES[item.level];
                return (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <span aria-hidden>{style.icon}</span>
                    <div>
                      <p className={`font-medium ${style.text}`}>{item.label}</p>
                      <p className="text-xs text-brand-text-secondary">{item.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {/* ── Cibles (§6) ──────────────────────────────────────────────────── */}
      {(isRunning || isFinished) && (
        <section className="space-y-2">
          <h2 className="font-semibold text-brand-dark">Cibles</h2>
          {boards.length === 0 ? (
            <EmptyState icon={<span aria-hidden>🎯</span>} title="Aucune cible configurée" />
          ) : boards.every((b) => b.status === "free") && !isFinished ? (
            <EmptyState icon={<span aria-hidden>🎯</span>} title="Aucune cible active" description="Aucun match n'est en cours pour le moment." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {boards.map((b) => (
                <div key={b.board} className={`rounded-xl border p-4 space-y-2 ${BOARD_STYLES[b.status]}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-brand-dark">Cible {b.board}</p>
                    <Pill tone={b.status === "active" ? "success" : b.status === "anomaly" ? "danger" : "neutral"}>
                      {b.status === "active" ? "En cours" : b.status === "anomaly" ? "Anomalie" : "Libre"}
                    </Pill>
                  </div>

                  {b.match ? (
                    <>
                      <p className="text-sm text-brand-dark">
                        {b.match.player1?.player_name ?? "?"} <span className="text-brand-text-secondary">vs</span> {b.match.player2?.player_name ?? "?"}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button href={`/t/${id}/score?board=${b.board}`} variant="secondary">
                          Scoring
                        </Button>
                        <RefereeAccessButton tournamentId={id} board={b.board} />
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-brand-text-secondary">Aucun match en cours.</p>
                      {b.nextMatchHint && (
                        <p className="text-xs text-brand-text-secondary">
                          Prochain probable : {b.nextMatchHint.player1?.player_name ?? "?"} vs {b.nextMatchHint.player2?.player_name ?? "?"}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Matchs en attente (§7) ───────────────────────────────────────── */}
      {isRunning && (
        <section className="space-y-2">
          <h2 className="font-semibold text-brand-dark">Matchs en attente ({queue.length})</h2>
          {queue.length === 0 ? (
            <EmptyState icon={<span aria-hidden>⏳</span>} title="Aucun match en attente" />
          ) : (
            <div className="space-y-2">
              {/* DO-OPS-002 (défaut 5) — jamais de numérotation ("#1", "#2"...) : le moteur réel
                  (dbPromoteUnassignedMatches) promeut par id de création, pas par cet ordre de
                  lecture — aucune promesse d'ordre de passage ici, voir buildMatchQueue(). */}
              {queue.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-brand-dark">
                      {m.player1?.player_name ?? "?"} <span className="text-brand-text-secondary">vs</span> {m.player2?.player_name ?? "?"}
                    </p>
                    <p className="text-xs text-brand-text-secondary">
                      {m.pool_id ? "Poule" : `Phase finale — tour ${m.bracket_round ?? "?"}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Participants (§9) ────────────────────────────────────────────── */}
      <section>
        <Card className="space-y-3">
          <h2 className="font-semibold text-brand-dark">Participants</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Inscrits" value={`${participants.totalRegistrations}`} />
            <Stat label="Payés" value={`${participants.paidRegistrations}`} />
            <Stat label="Engagés" value={`${participants.engagedCount}`} />
            <Stat label="Non engagés" value={`${participants.unusedPaidCount}`} />
          </div>
          {participants.unusedPaidCount > 0 && matches.length > 0 && (
            <p className="text-xs text-brand-text-secondary">
              {participants.unusedPaidCount} inscription(s) payée(s) n&apos;apparaissent dans aucun match — vérifiez les poules/le bracket.
            </p>
          )}
        </Card>
      </section>

      {/* ── Actions rapides (§10) ────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="font-semibold text-brand-dark">Actions rapides</h2>
        <div className="flex flex-wrap gap-2">
          <Button href={`/tournaments/${id}/players`} variant="secondary">👥 Participants</Button>
          {!tournament.quick_mode && <Button href={`/tournaments/${id}/pools`} variant="secondary">🏆 Poules & QR</Button>}
          <Button href={`/tournaments/${id}/bracket`} variant="secondary">🥇 Phases finales</Button>
          {(isRunning || isFinished) && (
            <>
              <Button href={`/t/${id}/live`} variant="secondary">🎯 Live ↗</Button>
              <Button href={`/t/${id}/tv`} variant="secondary">📺 TV ↗</Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
      <p className="text-lg font-bold text-brand-dark">
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-brand-text-secondary">{sub}</span>}
      </p>
      <p className="text-[11px] text-brand-text-secondary">{label}</p>
    </div>
  );
}
