"use client";

import { useTransition, useState } from "react";
import { proposeWinner, confirmWinner, disputeResult, markWinnerDirect } from "@/lib/actions/score";

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
  scoringMode: "ELECTRONIC" | "TRADITIONAL";
  tournamentId: string;
}

const GAME_LABELS: Record<string, string> = {
  "501": "501", "701": "701", "901": "901", "1001": "1001", CRICKET: "Cricket",
};
const ENTRY_LABELS: Record<string, string> = { SINGLE: "Simple", DOUBLE: "Double", TRIPLE: "Triple" };
const FINISH_LABELS: Record<string, string> = { SINGLE: "Simple", DOUBLE: "Double", TRIPLE: "Triple", MASTER: "Master" };

export function ScoreForm({ match, rounds, scoringMode, tournamentId }: Props) {
  const sets = [...match.match_sets].sort((a, b) => a.round_order - b.round_order);

  if (rounds.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-4xl">⚠️</p>
        <p className="text-yellow-400 font-semibold">Aucune manche configurée</p>
        <p className="text-gray-400 text-sm">L&apos;organisateur n&apos;a pas encore configuré les manches de ce tournoi.</p>
      </div>
    );
  }

  if (scoringMode === "TRADITIONAL") {
    return <TraditionalScoreForm match={match} sets={sets} rounds={rounds} tournamentId={tournamentId} />;
  }

  return <ElectronicScoreForm match={match} sets={sets} rounds={rounds} tournamentId={tournamentId} />;
}

/* ─────────────────────────────────────────────
   Mode ÉLECTRONIQUE
───────────────────────────────────────────── */
function ElectronicScoreForm({ match, sets, rounds, tournamentId }: { match: Match; sets: MatchSet[]; rounds: Round[]; tournamentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [side, setSide] = useState<1 | 2 | null>(null);

  if (side === null) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-1">Qui êtes-vous ?</h2>
          <p className="text-gray-400 text-sm">Sélectionnez votre nom pour entrer le score</p>
        </div>
        <div className="space-y-3">
          {[match.player1, match.player2].map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSide(i === 0 ? 1 : 2)}
              className="w-full rounded-xl bg-gray-800 border-2 border-gray-700 hover:border-green-500 px-6 py-5 text-left transition-colors"
            >
              <p className="text-xs text-gray-500 mb-1">Joueur {i + 1}</p>
              <p className="text-xl font-bold text-white">{p.player_name}</p>
            </button>
          ))}
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
        <button onClick={() => setSide(null)} className="text-xs text-gray-500 hover:text-gray-300">
          Changer
        </button>
      </div>

      <div className="space-y-3">
        {sets.map((set) => {
          const round = rounds.find((r) => r.order === set.round_order);
          const myValidated = side === 1 ? set.validated_p1 : set.validated_p2;
          const isComplete = set.validated_p1 && set.validated_p2;

          return (
            <div
              key={set.id}
              className={`rounded-xl border p-4 ${isComplete ? "bg-green-900/20 border-green-700" : "bg-gray-800 border-gray-700"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Manche {set.round_order}
                  {round && ` — ${GAME_LABELS[round.game_type]} ${ENTRY_LABELS[round.entry_type]}/${FINISH_LABELS[round.finish_type]}`}
                </p>
                {isComplete && <span className="text-xs text-green-400 font-medium">✓ Validé</span>}
              </div>

              {isComplete ? (
                <p className="text-white font-semibold">🏆 {set.winner?.player_name ?? "Gagnant inconnu"}</p>
              ) : set.winner_id && myValidated ? (
                <p className="text-sm text-yellow-400">En attente de confirmation de {opponent.player_name}…</p>
              ) : set.winner_id && !myValidated ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-white">{set.winner?.player_name ?? "?"}</span> a été désigné·e gagnant·e. Confirmez-vous ?
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => void confirmWinner(set.id, side, tournamentId))}
                      className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                    >
                      ✓ Confirmer
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => void disputeResult(set.id, tournamentId))}
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
                        onClick={() => startTransition(() => void proposeWinner(set.id, player.id, side))}
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

/* ─────────────────────────────────────────────
   Mode TRADITIONNEL
───────────────────────────────────────────── */
function TraditionalScoreForm({ match, sets, rounds, tournamentId }: { match: Match; sets: MatchSet[]; rounds: Round[]; tournamentId: string }) {
  const completedSets = sets.filter((s) => s.validated_p1 && s.validated_p2);
  const currentSet = sets.find((s) => !(s.validated_p1 && s.validated_p2));

  const p1Wins = completedSets.filter((s) => s.winner_id === match.player1.id).length;
  const p2Wins = completedSets.filter((s) => s.winner_id === match.player2.id).length;

  return (
    <div className="space-y-4">
      {/* Tableau des sets */}
      <div className="flex items-center justify-center gap-6 rounded-xl bg-gray-800 px-6 py-4">
        <div className="text-center">
          <p className="text-sm text-gray-400 truncate max-w-[120px]">{match.player1.player_name}</p>
          <p className="text-4xl font-bold text-white">{p1Wins}</p>
        </div>
        <p className="text-gray-500 text-lg font-medium">–</p>
        <div className="text-center">
          <p className="text-sm text-gray-400 truncate max-w-[120px]">{match.player2.player_name}</p>
          <p className="text-4xl font-bold text-white">{p2Wins}</p>
        </div>
      </div>

      {/* Manches terminées */}
      {completedSets.map((set) => {
        const round = rounds.find((r) => r.order === set.round_order);
        return (
          <div key={set.id} className="rounded-xl border border-green-800 bg-green-900/20 px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Manche {set.round_order}{round && ` — ${GAME_LABELS[round.game_type]}`}
            </p>
            <p className="text-sm font-semibold text-green-400">🏆 {set.winner?.player_name}</p>
          </div>
        );
      })}

      {/* Set en cours */}
      {currentSet ? (
        <SetScoreTracker
          key={currentSet.id}
          set={currentSet}
          p1={match.player1}
          p2={match.player2}
          round={rounds.find((r) => r.order === currentSet.round_order)}
          setNumber={currentSet.round_order}
          totalSets={sets.length}
          tournamentId={tournamentId}
        />
      ) : (
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-8 text-center">
          <p className="text-3xl mb-3">🏆</p>
          <p className="font-bold text-white text-lg">Match terminé !</p>
          <p className="text-gray-400 text-sm mt-1">
            {p1Wins > p2Wins ? match.player1.player_name : p2Wins > p1Wins ? match.player2.player_name : "Égalité"} remporte le match.
          </p>
        </div>
      )}
    </div>
  );
}

function SetScoreTracker({
  set, p1, p2, round, setNumber, totalSets, tournamentId,
}: {
  set: MatchSet;
  p1: Player;
  p2: Player;
  round: Round | undefined;
  setNumber: number;
  totalSets: number;
  tournamentId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const isCricket = round?.game_type === "CRICKET";
  const startScore = isCricket ? 0 : parseInt(round?.game_type ?? "501");

  const [rp1, setRp1] = useState(startScore);
  const [rp2, setRp2] = useState(startScore);
  const [inputP1, setInputP1] = useState("");
  const [inputP2, setInputP2] = useState("");
  const [bustMsg, setBustMsg] = useState<string | null>(null);

  function handleVolee(player: "p1" | "p2") {
    const raw = player === "p1" ? inputP1 : inputP2;
    const voleeScore = parseInt(raw);
    if (isNaN(voleeScore) || voleeScore < 0 || voleeScore > 180) return;

    const remaining = player === "p1" ? rp1 : rp2;
    const newRemaining = remaining - voleeScore;

    if (newRemaining < 0) {
      setBustMsg(`Bust ! Score de ${player === "p1" ? p1.player_name : p2.player_name} inchangé.`);
      if (player === "p1") setInputP1(""); else setInputP2("");
      setTimeout(() => setBustMsg(null), 2500);
      return;
    }

    if (player === "p1") { setRp1(newRemaining); setInputP1(""); }
    else { setRp2(newRemaining); setInputP2(""); }

    if (newRemaining === 0) {
      const winnerId = player === "p1" ? p1.id : p2.id;
      startTransition(() => void markWinnerDirect(set.id, winnerId, tournamentId));
    }
  }

  function forceWinner(winnerId: string) {
    startTransition(() => void markWinnerDirect(set.id, winnerId, tournamentId));
  }

  return (
    <div className="rounded-xl bg-gray-800 border border-gray-700 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 uppercase tracking-wider">
          Manche {setNumber}/{totalSets}
        </p>
        {round && (
          <p className="text-xs text-gray-500">
            {GAME_LABELS[round.game_type]} · {ENTRY_LABELS[round.entry_type]} / {FINISH_LABELS[round.finish_type]}
          </p>
        )}
      </div>

      {bustMsg && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-400 text-center">
          {bustMsg}
        </div>
      )}

      {isCricket ? (
        /* Cricket : désignation directe */
        <div className="space-y-3">
          <p className="text-sm text-gray-400 text-center">Cricket — désignez le gagnant de la manche :</p>
          <div className="grid grid-cols-2 gap-3">
            {[p1, p2].map((p) => (
              <button
                key={p.id}
                disabled={isPending}
                onClick={() => forceWinner(p.id)}
                className="rounded-xl border border-gray-600 py-4 text-sm font-bold text-white hover:border-green-500 hover:bg-green-900/20 disabled:opacity-60 transition-colors"
              >
                🏆 {p.player_name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* X01 : saisie des volées */
        <>
          <div className="grid grid-cols-2 gap-4">
            {/* P1 */}
            <div className="space-y-3 text-center">
              <p className="text-sm text-gray-400 truncate">{p1.player_name}</p>
              <p className={`text-5xl font-mono font-bold ${rp1 === 0 ? "text-green-400" : "text-white"}`}>
                {rp1}
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max="180"
                  placeholder="Volée"
                  value={inputP1}
                  onChange={(e) => setInputP1(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVolee("p1")}
                  className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-green-500 focus:outline-none text-center"
                />
                <button
                  disabled={isPending || !inputP1}
                  onClick={() => handleVolee("p1")}
                  className="rounded-lg bg-green-700 px-3 py-2 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-40 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>

            {/* P2 */}
            <div className="space-y-3 text-center">
              <p className="text-sm text-gray-400 truncate">{p2.player_name}</p>
              <p className={`text-5xl font-mono font-bold ${rp2 === 0 ? "text-green-400" : "text-white"}`}>
                {rp2}
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max="180"
                  placeholder="Volée"
                  value={inputP2}
                  onChange={(e) => setInputP2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVolee("p2")}
                  className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-green-500 focus:outline-none text-center"
                />
                <button
                  disabled={isPending || !inputP2}
                  onClick={() => handleVolee("p2")}
                  className="rounded-lg bg-green-700 px-3 py-2 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-40 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>

          {/* Override manuel */}
          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-500 text-center mb-3">Ou désigner manuellement le gagnant</p>
            <div className="grid grid-cols-2 gap-2">
              {[p1, p2].map((p) => (
                <button
                  key={p.id}
                  disabled={isPending}
                  onClick={() => forceWinner(p.id)}
                  className="rounded-lg border border-gray-600 py-2 text-xs font-semibold text-gray-300 hover:border-green-600 hover:text-green-400 disabled:opacity-60 transition-colors"
                >
                  🏆 {p.player_name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
