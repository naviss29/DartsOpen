"use client";

import { useCallback, useEffect, useState } from "react";

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
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const boards = Array.from({ length: nbBoards }, (_, i) => {
    const n = i + 1;
    const active = matches.find((m) => m.board_number === n && m.status === "IN_PROGRESS") ?? null;
    const next = matches.find((m) => m.board_number === n && m.status === "PENDING") ?? null;
    const last = matches
      .filter((m) => m.board_number === n && m.status === "FINISHED")
      .at(-1) ?? null;
    return { n, active, next, last };
  });

  const recentResults = matches
    .filter((m) => m.status === "FINISHED")
    .slice(-8)
    .reverse();

  return (
    <div className="space-y-10">
      <div
        className={`grid gap-4 ${
          nbBoards <= 3
            ? "grid-cols-3"
            : nbBoards <= 4
            ? "grid-cols-4"
            : nbBoards <= 6
            ? "grid-cols-3 lg:grid-cols-6"
            : "grid-cols-4"
        }`}
      >
        {boards.map(({ n, active, next, last }) => (
          <BoardCard key={n} boardNum={n} active={active} next={next} last={last} />
        ))}
      </div>

      {recentResults.length > 0 && (
        <div className="border-t border-gray-800 pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
            Derniers résultats
          </h3>
          <div className="flex flex-wrap gap-2">
            {recentResults.map((m) => {
              const p1Won = m.winner_id === m.player1.id;
              const p2Won = m.winner_id === m.player2.id;
              const p1s = m.sets.filter((s) => s.winner_id === m.player1.id).length;
              const p2s = m.sets.filter((s) => s.winner_id === m.player2.id).length;
              return (
                <div
                  key={m.id}
                  className="rounded-lg bg-gray-800/60 border border-gray-700/40 px-4 py-2 text-sm flex items-center gap-2"
                >
                  <span className="text-xs text-gray-600 font-mono">C{m.board_number}</span>
                  <span className={p1Won ? "text-white font-semibold" : "text-gray-500"}>
                    {m.player1.player_name}
                  </span>
                  <span className="text-gray-600 font-mono text-xs">
                    {p1s}–{p2s}
                  </span>
                  <span className={p2Won ? "text-white font-semibold" : "text-gray-500"}>
                    {m.player2.player_name}
                  </span>
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
  if (active) {
    const p1s = active.sets.filter((s) => s.winner_id === active.player1.id).length;
    const p2s = active.sets.filter((s) => s.winner_id === active.player2.id).length;
    return (
      <div className="rounded-2xl border border-green-500/40 bg-green-950/30 px-5 py-6 relative overflow-hidden min-h-[200px] flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 rounded-t-2xl" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-green-400">
            Cible {boardNum}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            En cours
          </span>
        </div>
        <div className="text-center space-y-1 py-2">
          <p className="text-2xl font-bold text-white truncate">{active.player1.player_name}</p>
          <p className="text-4xl font-black text-green-400 tabular-nums tracking-widest">
            {p1s} — {p2s}
          </p>
          <p className="text-2xl font-bold text-white truncate">{active.player2.player_name}</p>
        </div>
      </div>
    );
  }

  if (next) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 px-5 py-6 min-h-[200px] flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-500">
            Cible {boardNum}
          </span>
          <span className="text-xs text-amber-600/70">Prochain</span>
        </div>
        <div className="text-center space-y-2 py-2">
          <p className="text-xl font-semibold text-amber-100 truncate">{next.player1.player_name}</p>
          <p className="text-gray-600 text-sm font-medium">vs</p>
          <p className="text-xl font-semibold text-amber-100 truncate">{next.player2.player_name}</p>
        </div>
      </div>
    );
  }

  if (last) {
    const p1Won = last.winner_id === last.player1.id;
    const p2Won = last.winner_id === last.player2.id;
    const p1s = last.sets.filter((s) => s.winner_id === last.player1.id).length;
    const p2s = last.sets.filter((s) => s.winner_id === last.player2.id).length;
    return (
      <div className="rounded-2xl border border-gray-700/40 bg-gray-800/20 px-5 py-6 min-h-[200px] flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
            Cible {boardNum}
          </span>
          <span className="text-xs text-gray-700">Libre</span>
        </div>
        <div className="text-center space-y-1 py-2">
          <p className={`text-xl font-semibold truncate ${p1Won ? "text-gray-400" : "text-gray-600"}`}>
            {last.player1.player_name}
          </p>
          <p className="text-3xl font-black text-gray-600 tabular-nums tracking-widest">
            {p1s} — {p2s}
          </p>
          <p className={`text-xl font-semibold truncate ${p2Won ? "text-gray-400" : "text-gray-600"}`}>
            {last.player2.player_name}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/30 px-5 py-6 min-h-[200px] flex flex-col justify-between">
      <span className="text-xs font-bold uppercase tracking-widest text-gray-700">
        Cible {boardNum}
      </span>
      <p className="text-center text-gray-700 text-sm pb-4">En attente</p>
    </div>
  );
}
