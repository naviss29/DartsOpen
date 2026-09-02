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
    <div className="flex-1 min-h-0 flex flex-col gap-[clamp(0.5rem,2vmin,1rem)]">
      {/* Grille des cibles — occupe tout l'espace disponible */}
      <div className={`flex-1 min-h-0 grid ${gridCols} gap-[clamp(0.5rem,2vmin,1rem)]`}>
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
  // Toutes les cartes prennent h-full pour remplir la cellule de grille. Tailles de texte en
  // `clamp(..., vmin, ...)` plutôt que des tailles Tailwind fixes (text-4xl/6xl) : un mode TV
  // s'affiche aussi bien sur une TV 1080p que sur un téléphone en paysage (hauteur de viewport
  // très réduite) — `vmin` (le plus petit des deux côtés) évite que le contenu déborde de la
  // carte et soit tronqué sur un écran court, tout en restant grand sur un vrai écran large.
  if (active) {
    const p1s = active.sets.filter((s) => s.winner_id === active.player1.id).length;
    const p2s = active.sets.filter((s) => s.winner_id === active.player2.id).length;
    return (
      <div className="h-full rounded-2xl border border-success-solid/40 bg-success-solid/10 p-[clamp(0.75rem,3vmin,1.5rem)] relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-success-solid rounded-t-2xl" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-widest text-success-solid">Cible {boardNum}</span>
          <span className="flex items-center gap-1.5 text-sm text-success-solid font-medium">
            <span className="w-2 h-2 rounded-full bg-success-solid animate-pulse" />
            En cours
          </span>
        </div>
        <div className="text-center flex flex-col items-center gap-[clamp(0.375rem,1.5vmin,0.75rem)] min-h-0">
          <p className="text-[clamp(1.1rem,4.5vmin,2.25rem)] font-black text-text-primary leading-tight truncate w-full">{active.player1.player_name}</p>
          <p className="tabular-score text-[clamp(1.75rem,8vmin,3.75rem)] font-black text-success-solid tabular-nums tracking-widest">{p1s} — {p2s}</p>
          <p className="text-[clamp(1.1rem,4.5vmin,2.25rem)] font-black text-text-primary leading-tight truncate w-full">{active.player2.player_name}</p>
        </div>
        <div />
      </div>
    );
  }

  if (next) {
    return (
      <div className="h-full rounded-2xl border border-warning-solid/30 bg-warning-solid/10 p-[clamp(0.75rem,3vmin,1.5rem)] flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-widest text-warning-solid">Cible {boardNum}</span>
          <span className="text-sm text-warning font-medium">Prochain</span>
        </div>
        <div className="text-center flex flex-col items-center gap-[clamp(0.5rem,2vmin,1rem)] min-h-0">
          <p className="text-[clamp(0.95rem,3.8vmin,1.875rem)] font-bold text-text-primary truncate w-full">{next.player1.player_name}</p>
          <p className="text-text-secondary text-[clamp(0.75rem,2vmin,1.25rem)] font-medium">vs</p>
          <p className="text-[clamp(0.95rem,3.8vmin,1.875rem)] font-bold text-text-primary truncate w-full">{next.player2.player_name}</p>
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
      <div className="h-full rounded-2xl border border-border-default/60 bg-surface-secondary/30 p-[clamp(0.75rem,3vmin,1.5rem)] flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-widest text-text-secondary">Cible {boardNum}</span>
          <span className="text-sm text-text-secondary font-medium">Libre</span>
        </div>
        <div className="text-center flex flex-col items-center gap-[clamp(0.375rem,1.5vmin,0.75rem)] min-h-0">
          <p className={`text-[clamp(0.95rem,3.8vmin,1.875rem)] font-bold truncate w-full ${p1Won ? "text-text-secondary" : "text-text-secondary/70"}`}>{last.player1.player_name}</p>
          <p className="tabular-score text-[clamp(1.5rem,6.5vmin,3rem)] font-black text-text-secondary tabular-nums tracking-widest">{p1s} — {p2s}</p>
          <p className={`text-[clamp(0.95rem,3.8vmin,1.875rem)] font-bold truncate w-full ${p2Won ? "text-text-secondary" : "text-text-secondary/70"}`}>{last.player2.player_name}</p>
        </div>
        <div />
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl border border-border-default bg-surface/50 p-[clamp(0.75rem,3vmin,1.5rem)] flex flex-col justify-between">
      <span className="text-sm font-bold uppercase tracking-widest text-text-secondary">Cible {boardNum}</span>
      <p className="text-center text-text-secondary text-[clamp(0.9rem,2.5vmin,1.125rem)]">En attente</p>
      <div />
    </div>
  );
}
