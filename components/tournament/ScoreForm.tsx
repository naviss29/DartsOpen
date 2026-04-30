"use client";

import { useTransition, useState } from "react";
import { proposeWinner, confirmWinner, disputeResult } from "@/lib/actions/score";

interface Player { id: string; player_name: string }
interface MatchSet {
  id: string;
  round_order: number;
  winner_id: string | null;
  validated_p1: boolean;
  validated_p2: boolean;
  winner: { player_name: string } | null;
}
interface Round { order: number; game_type: string; entry_type: string; finish_type: string }
interface Match {
  id: string;
  board_number: number;
  player1: Player;
  player2: Player;
  match_sets: MatchSet[];
}

interface Props {
  match: Match;
  rounds: Round[];
}

const GAME_LABELS: Record<string, string> = {
  "501": "501", "701": "701", "901": "901", "1001": "1001", CRICKET: "Cricket",
};
const ENTRY_LABELS: Record<string, string> = {
  SINGLE: "Simple", DOUBLE: "Double", TRIPLE: "Triple",
};
const FINISH_LABELS: Record<string, string> = {
  SINGLE: "Simple", DOUBLE: "Double", TRIPLE: "Triple", MASTER: "Master",
};

export function ScoreForm({ match, rounds }: Props) {
  const [isPending, startTransition] = useTransition();
  const [side, setSide] = useState<1 | 2 | null>(null);

  const sets = [...match.match_sets].sort((a, b) => a.round_order - b.round_order);

  if (side === null) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-1">Qui êtes-vous ?</h2>
          <p className="text-gray-400 text-sm">Sélectionnez votre nom pour entrer le score</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setSide(1)}
            className="w-full rounded-xl bg-gray-800 border-2 border-gray-700 hover:border-green-500 px-6 py-5 text-left transition-colors"
          >
            <p className="text-xs text-gray-500 mb-1">Joueur 1</p>
            <p className="text-xl font-bold text-white">{match.player1.player_name}</p>
          </button>
          <button
            onClick={() => setSide(2)}
            className="w-full rounded-xl bg-gray-800 border-2 border-gray-700 hover:border-green-500 px-6 py-5 text-left transition-colors"
          >
            <p className="text-xs text-gray-500 mb-1">Joueur 2</p>
            <p className="text-xl font-bold text-white">{match.player2.player_name}</p>
          </button>
        </div>
      </div>
    );
  }

  const me = side === 1 ? match.player1 : match.player2;
  const opponent = side === 1 ? match.player2 : match.player1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Vous jouez en tant que</p>
          <p className="font-bold text-white">{me.player_name}</p>
        </div>
        <button
          onClick={() => setSide(null)}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Changer
        </button>
      </div>

      <div className="space-y-3">
        {sets.map((set) => {
          const round = rounds.find((r) => r.order === set.round_order);
          const myValidated = side === 1 ? set.validated_p1 : set.validated_p2;
          const opponentValidated = side === 1 ? set.validated_p2 : set.validated_p1;
          const isComplete = set.validated_p1 && set.validated_p2;

          return (
            <div
              key={set.id}
              className={`rounded-xl border p-4 ${
                isComplete
                  ? "bg-green-900/20 border-green-700"
                  : "bg-gray-800 border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Manche {set.round_order}
                  {round && ` — ${GAME_LABELS[round.game_type]} ${ENTRY_LABELS[round.entry_type]} / ${FINISH_LABELS[round.finish_type]}`}
                </p>
                {isComplete && (
                  <span className="text-xs text-green-400 font-medium">✓ Validé</span>
                )}
              </div>

              {isComplete ? (
                <p className="text-white font-semibold">
                  🏆 {set.winner?.player_name ?? "Gagnant inconnu"}
                </p>
              ) : set.winner_id && myValidated ? (
                <div className="text-sm text-yellow-400">
                  En attente de confirmation de {opponent.player_name}…
                </div>
              ) : set.winner_id && !myValidated ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-white">{set.winner?.player_name ?? "?"}</span>
                    {" "}a été désigné·e gagnant·e. Confirmez-vous ?
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => confirmWinner(set.id, side))}
                      className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                    >
                      ✓ Confirmer
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => disputeResult(set.id))}
                      className="rounded-lg border border-red-700 text-red-400 px-4 py-2.5 text-sm font-semibold hover:bg-red-900/20 disabled:opacity-60 transition-colors"
                    >
                      Contester
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Qui a gagné cette manche ?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[match.player1, match.player2].map((player) => (
                      <button
                        key={player.id}
                        disabled={isPending}
                        onClick={() => startTransition(() => proposeWinner(set.id, player.id, side))}
                        className={`rounded-lg border py-3 px-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                          player.id === me.id
                            ? "border-green-600 text-green-400 hover:bg-green-900/20"
                            : "border-gray-600 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {player.player_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
