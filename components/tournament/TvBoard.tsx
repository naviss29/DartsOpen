"use client";

import { useCallback, useEffect, useState } from "react";

const MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL ?? "";

interface Match {
  id: string;
  board_number: number;
  status: string;
  player1: { id: string; player_name: string };
  player2: { id: string; player_name: string };
  winner_id: string | null;
  sets: { winner_id: string | null }[];
}

interface Props {
  tournamentId: string;
  initialMatches: Match[];
  nbBoards: number;
}

export function TvBoard({ tournamentId, initialMatches, nbBoards }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/public/tournaments/${tournamentId}/matches`);
    if (res.ok) setMatches(await res.json());
  }, [tournamentId]);

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const doRefresh = async () => {
      if (!mounted) return;
      await refresh();
    };

    const startPolling = () => { poll = setInterval(doRefresh, 5000); };

    const connect = async () => {
      if (!MERCURE_URL) { startPolling(); return; }

      const tokenRes = await fetch(
        `/api/public/tournaments/${tournamentId}/mercure-token`
      ).catch(() => null);
      if (!tokenRes?.ok) { startPolling(); return; }

      const { token, topic } = await tokenRes.json() as { token: string; topic: string };
      const url = new URL(MERCURE_URL);
      url.searchParams.append("topic", topic);
      url.searchParams.append("authorization", token);

      es = new EventSource(url.toString());
      es.onmessage = doRefresh;
      es.onerror = () => { es?.close(); es = null; if (mounted && !poll) startPolling(); };
    };

    connect();
    return () => { mounted = false; es?.close(); if (poll) clearInterval(poll); };
  }, [tournamentId, refresh]);

  const boards = Array.from({ length: nbBoards }, (_, i) => {
    const n = i + 1;
    const active = matches.find((m) => m.board_number === n && m.status === "IN_PROGRESS") ?? null;
    const next   = matches.find((m) => m.board_number === n && m.status === "PENDING") ?? null;
    const last   = matches.filter((m) => m.board_number === n && m.status === "FINISHED").at(-1) ?? null;
    return { n, active, next, last };
  });

  const recentResults = matches
    .filter((m) => m.status === "FINISHED")
    .slice(-8)
    .reverse();

  // Colonnes adaptées au nombre de cibles
  const gridCols =
    nbBoards === 1 ? "grid-cols-1" :
    nbBoards === 2 ? "grid-cols-2" :
    nbBoards === 3 ? "grid-cols-3" :
    nbBoards === 4 ? "grid-cols-4" :
    nbBoards <= 6  ? "grid-cols-3" :
                     "grid-cols-4";

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      {/* Grille des cibles — occupe tout l'espace disponible */}
      <div className={`flex-1 min-h-0 grid ${gridCols} gap-4`}>
        {boards.map(({ n, active, next, last }) => (
          <BoardCard key={n} boardNum={n} active={active} next={next} last={last} />
        ))}
      </div>

      {/* Ticker résultats — hauteur fixe en bas */}
      {recentResults.length > 0 && (
        <div className="shrink-0 border-t border-border-default pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">
            Derniers résultats
          </p>
          <div className="flex flex-wrap gap-2">
            {recentResults.map((m) => {
              const p1Won = m.winner_id === m.player1.id;
              const p2Won = m.winner_id === m.player2.id;
              const p1s   = m.sets.filter((s) => s.winner_id === m.player1.id).length;
              const p2s   = m.sets.filter((s) => s.winner_id === m.player2.id).length;
              return (
                <div key={m.id} className="rounded-lg bg-surface-secondary/60 border border-border-default/60 px-3 py-1.5 text-sm flex items-center gap-2">
                  <span className="text-xs text-text-secondary font-mono">C{m.board_number}</span>
                  <span className={p1Won ? "text-text-primary font-semibold" : "text-text-secondary"}>{m.player1.player_name}</span>
                  <span className="text-text-secondary font-mono text-xs">{p1s}–{p2s}</span>
                  <span className={p2Won ? "text-text-primary font-semibold" : "text-text-secondary"}>{m.player2.player_name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BoardCard({
  boardNum,
  active,
  next,
  last,
}: {
  boardNum: number;
  active: Match | null;
  next: Match | null;
  last: Match | null;
}) {
  // Toutes les cartes prennent h-full pour remplir la cellule de grille
  if (active) {
    const p1s = active.sets.filter((s) => s.winner_id === active.player1.id).length;
    const p2s = active.sets.filter((s) => s.winner_id === active.player2.id).length;
    return (
      <div className="h-full rounded-2xl border border-success-solid/40 bg-success-solid/10 p-6 relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-success-solid rounded-t-2xl" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-widest text-success-solid">Cible {boardNum}</span>
          <span className="flex items-center gap-1.5 text-sm text-success-solid font-medium">
            <span className="w-2 h-2 rounded-full bg-success-solid animate-pulse" />
            En cours
          </span>
        </div>
        <div className="text-center flex flex-col items-center gap-3">
          <p className="text-4xl font-black text-text-primary leading-tight truncate w-full">{active.player1.player_name}</p>
          <p className="tabular-score text-6xl font-black text-success-solid tabular-nums tracking-widest">{p1s} — {p2s}</p>
          <p className="text-4xl font-black text-text-primary leading-tight truncate w-full">{active.player2.player_name}</p>
        </div>
        <div />
      </div>
    );
  }

  if (next) {
    return (
      <div className="h-full rounded-2xl border border-warning-solid/30 bg-warning-solid/10 p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-widest text-warning-solid">Cible {boardNum}</span>
          <span className="text-sm text-warning font-medium">Prochain</span>
        </div>
        <div className="text-center flex flex-col items-center gap-4">
          <p className="text-3xl font-bold text-text-primary truncate w-full">{next.player1.player_name}</p>
          <p className="text-text-secondary text-xl font-medium">vs</p>
          <p className="text-3xl font-bold text-text-primary truncate w-full">{next.player2.player_name}</p>
        </div>
        <div />
      </div>
    );
  }

  if (last) {
    const p1Won = last.winner_id === last.player1.id;
    const p2Won = last.winner_id === last.player2.id;
    const p1s   = last.sets.filter((s) => s.winner_id === last.player1.id).length;
    const p2s   = last.sets.filter((s) => s.winner_id === last.player2.id).length;
    return (
      <div className="h-full rounded-2xl border border-border-default/60 bg-surface-secondary/30 p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-widest text-text-secondary">Cible {boardNum}</span>
          <span className="text-sm text-text-secondary font-medium">Libre</span>
        </div>
        <div className="text-center flex flex-col items-center gap-3">
          <p className={`text-3xl font-bold truncate w-full ${p1Won ? "text-text-secondary" : "text-text-secondary/70"}`}>{last.player1.player_name}</p>
          <p className="tabular-score text-5xl font-black text-text-secondary tabular-nums tracking-widest">{p1s} — {p2s}</p>
          <p className={`text-3xl font-bold truncate w-full ${p2Won ? "text-text-secondary" : "text-text-secondary/70"}`}>{last.player2.player_name}</p>
        </div>
        <div />
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl border border-border-default bg-surface/50 p-6 flex flex-col justify-between">
      <span className="text-sm font-bold uppercase tracking-widest text-text-secondary">Cible {boardNum}</span>
      <p className="text-center text-text-secondary text-lg">En attente</p>
      <div />
    </div>
  );
}
