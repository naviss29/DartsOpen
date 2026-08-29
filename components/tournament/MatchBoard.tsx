"use client";

import { useEffect, useState } from "react";
import { NextMatchAlert } from "./NextMatchAlert";

const MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL ?? "";
const PAGE_SIZE = 20;

interface Player { id: string; player_name: string }
interface MatchSet { id: string; round_order: number; winner_id: string | null; validated_p1: boolean; validated_p2: boolean }
interface Match {
  id: string;
  board_number: number;
  status: string;
  player1: Player;
  player2: Player;
  winner_id?: string | null;
  updated_at?: string;
  sets: MatchSet[];
}

interface Props {
  tournamentId: string;
  initialMatches: Match[];
  initialFinishedMatches: Match[];
  nbBoards: number;
}

async function fetchMatches(tournamentId: string): Promise<{ active: Match[]; finished: Match[] }> {
  const res = await fetch(`/api/public/tournaments/${tournamentId}/matches`);
  if (!res.ok) return { active: [], finished: [] };
  const all = await res.json() as Match[];

  const active = all.filter((m) => ["IN_PROGRESS", "PENDING"].includes(m.status));

  const finishedByBoard = new Map<number, Match>();
  for (const m of all) {
    if (m.status === "FINISHED" && m.board_number > 0) {
      const existing = finishedByBoard.get(m.board_number);
      const mTime = m.updated_at ?? m.id;
      const eTime = existing?.updated_at ?? existing?.id ?? "";
      if (!existing || mTime > eTime) finishedByBoard.set(m.board_number, m);
    }
  }

  return { active, finished: Array.from(finishedByBoard.values()) };
}

export function MatchBoard({ tournamentId, initialMatches, initialFinishedMatches, nbBoards }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [finishedMatches, setFinishedMatches] = useState<Match[]>(initialFinishedMatches);
  const [nextMatchAlert, setNextMatchAlert] = useState<{ boardNumber: number; match: Match } | null>(null);
  const [pendingPage, setPendingPage] = useState(0);

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const applyNext = (active: Match[], finished: Match[]) => {
      if (!mounted) return;
      setMatches((prev) => {
        for (const prevMatch of prev.filter((m) => m.status === "IN_PROGRESS")) {
          if (!active.find((m) => m.id === prevMatch.id)) {
            const nextPending = active.find(
              (m) => m.status === "PENDING" && m.board_number === prevMatch.board_number
            );
            if (nextPending) {
              setNextMatchAlert({ boardNumber: prevMatch.board_number, match: nextPending });
              setTimeout(() => setNextMatchAlert(null), 12000);
            }
          }
        }
        return active;
      });
      setFinishedMatches(finished);
    };

    const doFetch = async () => {
      const { active, finished } = await fetchMatches(tournamentId);
      applyNext(active, finished);
    };

    const startPolling = () => { poll = setInterval(doFetch, 3000); };

    const connect = async () => {
      if (!MERCURE_URL) { startPolling(); return; }
      const tokenRes = await fetch(
        `/api/public/tournaments/${tournamentId}/mercure-token`
      );
      if (!tokenRes.ok) { startPolling(); return; }
      const { token, topic } = await tokenRes.json() as { token: string; topic: string };
      const url = new URL(MERCURE_URL);
      url.searchParams.append("topic", topic);
      url.searchParams.append("authorization", token);
      es = new EventSource(url.toString());
      es.onmessage = doFetch;
      es.onerror = () => { es?.close(); es = null; if (mounted && !poll) startPolling(); };
    };

    connect();
    return () => { mounted = false; es?.close(); if (poll) clearInterval(poll); };
  }, [tournamentId]);

  // Matchs dont toutes les manches sont jouées → traités comme FINISHED côté client
  const effectivelyDone = matches.filter((m) => {
    if (m.status !== "IN_PROGRESS") return false;
    const total = m.sets.length;
    return total > 0 && m.sets.filter((s) => s.winner_id !== null).length >= total;
  });

  const inProgress = matches.filter((m) => {
    if (m.status !== "IN_PROGRESS") return false;
    const total = m.sets.length;
    return total === 0 || m.sets.filter((s) => s.winner_id !== null).length < total;
  });

  const pending = matches.filter((m) => m.status === "PENDING");
  const totalPendingPages = Math.ceil(pending.length / PAGE_SIZE);
  // Clamp au rendu plutôt que setState synchrone dans un effet
  const safePendingPage = pending.length <= PAGE_SIZE ? 0 : pendingPage % totalPendingPages;
  const displayedPending = pending.slice(safePendingPage * PAGE_SIZE, (safePendingPage + 1) * PAGE_SIZE);

  // Combine FINISHED DB + matchs effectivement terminés pour "Derniers résultats"
  const allFinished = [
    ...finishedMatches,
    ...effectivelyDone.map((m) => ({ ...m, status: "FINISHED" })),
  ];

  // Rotation automatique des pages À venir toutes les 10s
  useEffect(() => {
    if (pending.length <= PAGE_SIZE) return;
    const interval = setInterval(() => {
      setPendingPage((p) => (p + 1) % Math.ceil(pending.length / PAGE_SIZE));
    }, 10000);
    return () => clearInterval(interval);
  }, [pending.length]);

  // Alerte "dernière manche" pour les cibles qui vont se libérer
  const lastSetBoards = inProgress
    .filter((m) => {
      const total = m.sets.length;
      const played = m.sets.filter((s) => s.winner_id !== null).length;
      return total > 1 && played === total - 1;
    })
    .map((m) => m.board_number);
  const lastSetAlerts = lastSetBoards.map((board, i) => ({ board, next: pending[i] ?? null })).filter((a) => a.next);

  return (
    <div className="space-y-6">
      {nextMatchAlert && (
        <NextMatchAlert boardNumber={nextMatchAlert.boardNumber} match={nextMatchAlert.match} />
      )}

      {lastSetAlerts.map(({ board, next }) => (
        <div key={board} className="rounded-xl border border-warning-solid/40 bg-warning-solid/5 px-4 py-3 flex items-center gap-3">
          <span className="text-warning text-lg">⚡</span>
          <p className="text-sm text-warning">
            <span className="font-semibold">Cible {board} — Dernière manche en cours.</span>
            {" "}Prochain match :{" "}
            <span className="font-semibold text-text-primary">{next!.player1.player_name} vs {next!.player2.player_name}</span>
          </p>
        </div>
      ))}

      {allFinished.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
            Derniers résultats
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {[...allFinished].sort((a, b) => a.board_number - b.board_number).map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      )}

      {inProgress.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
            En cours ({inProgress.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {inProgress.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              À venir ({pending.length})
            </h2>
            {totalPendingPages > 1 && (
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPendingPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setPendingPage(i); }}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === safePendingPage ? "bg-text-secondary" : "bg-border-default"}`}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {displayedPending.map((m, i) => {
              const globalIndex = safePendingPage * PAGE_SIZE + i;
              return (
                <MatchCard
                  key={m.id}
                  match={m}
                  compact
                  position={globalIndex + 1}
                  nextUp={globalIndex < nbBoards}
                />
              );
            })}
          </div>
        </div>
      )}

      {inProgress.length === 0 && pending.length === 0 && (
        <div className="rounded-xl bg-surface-secondary/50 border border-border-default p-8 text-center text-text-secondary">
          Tous les matchs sont terminés.
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  compact = false,
  position,
  nextUp = false,
}: {
  match: Match;
  compact?: boolean;
  position?: number;
  nextUp?: boolean;
}) {
  const setsPlayed = match.sets.filter((s) => s.winner_id).length;
  const totalSets = match.sets.length;
  const p1SetsWon = match.sets.filter((s) => s.winner_id === match.player1.id).length;
  const p2SetsWon = match.sets.filter((s) => s.winner_id === match.player2.id).length;
  const p1Won = match.winner_id === match.player1.id;
  const p2Won = match.winner_id === match.player2.id;

  // ── TERMINÉ ──────────────────────────────────────────────────────────────────
  if (match.status === "FINISHED") {
    return (
      <div className="rounded-xl bg-surface-secondary/60 border border-border-default/60 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-secondary">✓ Cible {match.board_number}</span>
          <span className="text-xs font-mono text-text-secondary/70">{p1SetsWon} — {p2SetsWon}</span>
        </div>
        <div className="font-semibold text-base flex items-center gap-2">
          <span className={p1Won ? "text-text-primary" : "text-text-secondary"}>{match.player1.player_name}</span>
          <span className="text-text-secondary text-sm">vs</span>
          <span className={p2Won ? "text-text-primary" : "text-text-secondary"}>{match.player2.player_name}</span>
        </div>
      </div>
    );
  }

  // ── EN COURS ──────────────────────────────────────────────────────────────────
  if (match.status === "IN_PROGRESS") {
    return (
      <div className="rounded-xl bg-success-solid/10 border border-success-solid/50 px-5 py-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 bottom-0 w-1 rounded-l-xl bg-success-solid" />
        <div className="flex items-center justify-between mb-2 pl-2">
          <span className="text-xs font-medium text-success-solid flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success-solid animate-pulse inline-block" />
            Cible {match.board_number}
          </span>
          {totalSets > 0 && (
            <span className="text-xs text-text-secondary">Manche {setsPlayed}/{totalSets}</span>
          )}
        </div>
        <div className="font-semibold text-base pl-2">
          <span className="text-text-primary">{match.player1.player_name}</span>
          <span className="text-text-secondary mx-2">vs</span>
          <span className="text-text-primary">{match.player2.player_name}</span>
        </div>
      </div>
    );
  }

  // ── À VENIR — prochains sur cible (mis en avant) ───────────────────────────────
  if (nextUp) {
    return (
      <div className={`rounded-xl border border-warning-solid/40 bg-warning-solid/10 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-warning font-medium">{position ? `#${position}` : ""}</span>
          {totalSets > 0 && <span className="text-xs text-warning/70">Manche 0/{totalSets}</span>}
        </div>
        <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
          <span className="text-text-primary">{match.player1.player_name}</span>
          <span className="text-text-secondary mx-2">vs</span>
          <span className="text-text-primary">{match.player2.player_name}</span>
        </div>
      </div>
    );
  }

  // ── À VENIR — file d'attente ──────────────────────────────────────────────────
  return (
    <div className={`rounded-xl bg-surface-secondary border border-border-default ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-secondary">{position ? `#${position}` : ""}</span>
        {totalSets > 0 && <span className="text-xs text-text-secondary">Manche 0/{totalSets}</span>}
      </div>
      <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
        <span className="text-text-primary">{match.player1.player_name}</span>
        <span className="text-text-secondary mx-2">vs</span>
        <span className="text-text-primary">{match.player2.player_name}</span>
      </div>
    </div>
  );
}
