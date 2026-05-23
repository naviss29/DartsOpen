"use client";

import { useEffect, useState } from "react";
import { NextMatchAlert } from "./NextMatchAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const ORG_SLUG = process.env.NEXT_PUBLIC_STER_ORG_SLUG ?? "dartsopen";
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
      if (!existing || m.id > existing.id) finishedByBoard.set(m.board_number, m);
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
        `${API_URL}/api/public/tournaments/${tournamentId}/mercure-token`,
        { headers: { "X-Organization-Slug": ORG_SLUG } }
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

  const inProgress = matches.filter((m) => m.status === "IN_PROGRESS");
  const pending = matches.filter((m) => m.status === "PENDING");
  const totalPendingPages = Math.ceil(pending.length / PAGE_SIZE);
  const displayedPending = pending.slice(pendingPage * PAGE_SIZE, (pendingPage + 1) * PAGE_SIZE);

  // Rotation automatique des pages À venir toutes les 10s
  useEffect(() => {
    if (pending.length <= PAGE_SIZE) { setPendingPage(0); return; }
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
        <div key={board} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
          <span className="text-amber-400 text-lg">⚡</span>
          <p className="text-sm text-amber-300">
            <span className="font-semibold">Cible {board} — Dernière manche en cours.</span>
            {" "}Prochain match :{" "}
            <span className="font-semibold text-white">{next!.player1.player_name} vs {next!.player2.player_name}</span>
          </p>
        </div>
      ))}

      {inProgress.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            En cours ({inProgress.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {inProgress.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>
      )}

      {finishedMatches.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Derniers résultats
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {[...finishedMatches].sort((a, b) => a.board_number - b.board_number).map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              À venir ({pending.length})
            </h2>
            {totalPendingPages > 1 && (
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPendingPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPendingPage(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === pendingPage ? "bg-gray-300" : "bg-gray-600"}`}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {displayedPending.map((m, i) => {
              const globalIndex = pendingPage * PAGE_SIZE + i;
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
        <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-8 text-center text-gray-400">
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
  // Match effectivement terminé (toutes les manches jouées) mais pas encore finalisé en base
  const effectivelyDone = match.status === "IN_PROGRESS" && totalSets > 0 && setsPlayed >= totalSets;

  // ── TERMINÉ ──────────────────────────────────────────────────────────────────
  if (match.status === "FINISHED") {
    return (
      <div className="rounded-xl bg-blue-950/30 border border-blue-700/40 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-blue-400">✓ Cible {match.board_number}</span>
          <span className="text-xs font-mono text-blue-300/70">{p1SetsWon} — {p2SetsWon}</span>
        </div>
        <div className="font-semibold text-base flex items-center gap-2">
          <span className={p1Won ? "text-blue-300" : "text-gray-500"}>{match.player1.player_name}</span>
          <span className="text-gray-600 text-sm">vs</span>
          <span className={p2Won ? "text-blue-300" : "text-gray-500"}>{match.player2.player_name}</span>
        </div>
      </div>
    );
  }

  // ── EN COURS — toutes manches jouées (en attente de finalisation) ─────────────
  if (effectivelyDone) {
    return (
      <div className="rounded-xl bg-blue-950/40 border border-blue-600/50 px-5 py-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 bottom-0 w-1 rounded-l-xl bg-blue-500" />
        <div className="flex items-center justify-between mb-2 pl-2">
          <span className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
            Cible {match.board_number}
          </span>
          {totalSets > 0 && (
            <span className="text-xs text-blue-400/70">Manche {setsPlayed}/{totalSets}</span>
          )}
        </div>
        <div className="font-semibold text-base pl-2">
          <span className="text-white">{match.player1.player_name}</span>
          <span className="text-gray-500 mx-2">vs</span>
          <span className="text-white">{match.player2.player_name}</span>
        </div>
      </div>
    );
  }

  // ── EN COURS — manches restantes ──────────────────────────────────────────────
  if (match.status === "IN_PROGRESS") {
    return (
      <div className="rounded-xl bg-green-950/40 border border-green-600/50 px-5 py-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 bottom-0 w-1 rounded-l-xl bg-green-500" />
        <div className="flex items-center justify-between mb-2 pl-2">
          <span className="text-xs font-medium text-green-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Cible {match.board_number}
          </span>
          {totalSets > 0 && (
            <span className="text-xs text-gray-400">Manche {setsPlayed}/{totalSets}</span>
          )}
        </div>
        <div className="font-semibold text-base pl-2">
          <span className="text-white">{match.player1.player_name}</span>
          <span className="text-gray-500 mx-2">vs</span>
          <span className="text-white">{match.player2.player_name}</span>
        </div>
      </div>
    );
  }

  // ── À VENIR — prochains sur cible (vert clair) ────────────────────────────────
  if (nextUp) {
    return (
      <div className={`rounded-xl bg-emerald-950/30 border border-emerald-700/40 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-emerald-500 font-medium">{position ? `#${position}` : ""}</span>
          {totalSets > 0 && <span className="text-xs text-emerald-600/70">Manche 0/{totalSets}</span>}
        </div>
        <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
          <span className="text-emerald-100">{match.player1.player_name}</span>
          <span className="text-emerald-800 mx-2">vs</span>
          <span className="text-emerald-100">{match.player2.player_name}</span>
        </div>
      </div>
    );
  }

  // ── À VENIR — file d'attente ──────────────────────────────────────────────────
  return (
    <div className={`rounded-xl bg-gray-800 border border-gray-700 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{position ? `#${position}` : ""}</span>
        {totalSets > 0 && <span className="text-xs text-gray-500">Manche 0/{totalSets}</span>}
      </div>
      <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
        <span className="text-white">{match.player1.player_name}</span>
        <span className="text-gray-500 mx-2">vs</span>
        <span className="text-white">{match.player2.player_name}</span>
      </div>
    </div>
  );
}
