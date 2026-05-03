"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NextMatchAlert } from "./NextMatchAlert";

interface Player { id: string; player_name: string }
interface MatchSet { id: string; round_order: number; winner_id: string | null; validated_p1: boolean; validated_p2: boolean }
interface Match {
  id: string;
  board_number: number;
  status: string;
  player1: Player;
  player2: Player;
  match_sets: MatchSet[];
}

interface Props {
  tournamentId: string;
  initialMatches: Match[];
  nbBoards: number;
}

export function MatchBoard({ tournamentId, initialMatches }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [nextMatchAlert, setNextMatchAlert] = useState<{ boardNumber: number; match: Match } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`live-matches-${tournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournamentId}` },
        () => {
          // Re-fetch on any match change
          supabase
            .from("matches")
            .select(`
              id, board_number, status,
              player1:registrations!matches_player1_id_fkey(id, player_name),
              player2:registrations!matches_player2_id_fkey(id, player_name),
              match_sets(id, round_order, winner_id, validated_p1, validated_p2)
            `)
            .eq("tournament_id", tournamentId)
            .in("status", ["IN_PROGRESS", "PENDING"])
            .order("board_number")
            .order("created_at")
            .then(({ data }) => {
              if (data) {
                const normalized = data.map((m) => ({
                  ...m,
                  player1: Array.isArray(m.player1) ? m.player1[0] : m.player1,
                  player2: Array.isArray(m.player2) ? m.player2[0] : m.player2,
                })) as Match[];
                setMatches(normalized);
              }
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_sets" },
        (payload) => {
          // Détecter la dernière manche en cours → annoncer prochain match
          const updatedSet = payload.new as MatchSet & { match_id: string };
          setMatches((prev) => {
            const match = prev.find((m) => m.match_sets.some((s) => s.id === updatedSet.id));
            if (match && match.match_sets.length > 0) {
              const lastRound = Math.max(...match.match_sets.map((s) => s.round_order));
              const isLastSet = updatedSet.round_order === lastRound;
              const hasOneValidation = updatedSet.validated_p1 || updatedSet.validated_p2;

              if (isLastSet && hasOneValidation) {
                // Trouver le prochain PENDING sur la même cible
                const nextPending = prev.find(
                  (m) => m.status === "PENDING" && m.board_number === match.board_number
                );
                if (nextPending) {
                  setNextMatchAlert({ boardNumber: match.board_number, match: nextPending });
                  setTimeout(() => setNextMatchAlert(null), 12000);
                }
              }
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId]);

  const inProgress = matches.filter((m) => m.status === "IN_PROGRESS");
  const pending = matches.filter((m) => m.status === "PENDING");

  return (
    <div className="space-y-6">
      {nextMatchAlert && (
        <NextMatchAlert
          boardNumber={nextMatchAlert.boardNumber}
          match={nextMatchAlert.match}
        />
      )}

      {/* Matchs en cours */}
      {inProgress.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            En cours ({inProgress.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {inProgress.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      )}

      {/* Matchs à venir */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            À venir ({pending.length})
          </h2>
          <div className="grid gap-2 md:grid-cols-3">
            {pending.slice(0, 9).map((m) => (
              <MatchCard key={m.id} match={m} compact />
            ))}
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

function MatchCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  const setsPlayed = match.match_sets.filter((s) => s.winner_id).length;
  const totalSets = match.match_sets.length;

  return (
    <div className={`rounded-xl bg-gray-800 border border-gray-700 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-green-400">🎯 Cible {match.board_number}</span>
        {!compact && totalSets > 0 && (
          <span className="text-xs text-gray-500">Manche {setsPlayed}/{totalSets}</span>
        )}
      </div>
      <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
        <span className="text-white">{match.player1.player_name}</span>
        <span className="text-gray-500 mx-2">vs</span>
        <span className="text-white">{match.player2.player_name}</span>
      </div>
    </div>
  );
}
