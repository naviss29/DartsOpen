"use client";

import { useTransition, useState } from "react";

const IMPOSSIBLE_VOLEE = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);
const IMPOSSIBLE_CHECKOUT = new Set([159, 162, 163, 165, 166, 168, 169]);

type ThrowEntry = { player: "p1" | "p2"; score: number; remaining: number; bust: boolean };
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
        <p className="text-darts-gold font-semibold">Aucune manche configurée</p>
        <p className="text-darts-text-secondary text-sm">L&apos;organisateur n&apos;a pas encore configuré les manches de ce tournoi.</p>
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
          <h2 className="text-xl font-bold text-darts-text mb-1">Qui êtes-vous ?</h2>
          <p className="text-darts-text-secondary text-sm">Sélectionnez votre nom pour entrer le score</p>
        </div>
        <div className="space-y-3">
          {[match.player1, match.player2].map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSide(i === 0 ? 1 : 2)}
              className="w-full rounded-xl bg-darts-surface border-2 border-darts-border hover:border-darts-green px-6 py-5 text-left transition-colors"
            >
              <p className="text-xs text-darts-text-secondary mb-1">Joueur {i + 1}</p>
              <p className="text-xl font-bold text-darts-text">{p.player_name}</p>
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
          <p className="text-xs text-darts-text-secondary">Vous jouez en tant que</p>
          <p className="font-bold text-darts-text">{me.player_name}</p>
        </div>
        <button onClick={() => setSide(null)} className="text-xs text-darts-text-secondary hover:text-darts-text">
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
              className={`rounded-xl border p-4 ${isComplete ? "bg-darts-green/10 border-darts-green/40" : "bg-darts-surface border-darts-border"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-darts-text-secondary uppercase tracking-wider">
                  Manche {set.round_order}
                  {round && ` — ${GAME_LABELS[round.game_type]} ${ENTRY_LABELS[round.entry_type]}/${FINISH_LABELS[round.finish_type]}`}
                </p>
                {isComplete && <span className="text-xs text-darts-green font-medium">✓ Validé</span>}
              </div>

              {isComplete ? (
                <p className="text-darts-text font-semibold">🏆 {set.winner?.player_name ?? "Gagnant inconnu"}</p>
              ) : set.winner_id && myValidated ? (
                <p className="text-sm text-darts-gold">En attente de confirmation de {opponent.player_name}…</p>
              ) : set.winner_id && !myValidated ? (
                <div className="space-y-3">
                  <p className="text-sm text-darts-text">
                    <span className="font-medium text-darts-text">{set.winner?.player_name ?? "?"}</span> a été désigné·e gagnant·e. Confirmez-vous ?
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => void confirmWinner(set.id, side, tournamentId))}
                      className="flex-1 rounded-lg bg-darts-green py-2.5 text-sm font-semibold text-white hover:bg-darts-green/90 disabled:opacity-60 transition-colors"
                    >
                      ✓ Confirmer
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => void disputeResult(set.id, tournamentId))}
                      className="rounded-lg border border-darts-red/60 text-darts-red px-4 py-2.5 text-sm font-semibold hover:bg-darts-red/10 disabled:opacity-60 transition-colors"
                    >
                      Contester
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-darts-text-secondary">Qui a gagné cette manche ?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[match.player1, match.player2].map((player) => (
                      <button
                        key={player.id}
                        disabled={isPending}
                        onClick={() => startTransition(() => void proposeWinner(set.id, player.id, side, tournamentId))}
                        className={`rounded-lg border py-3 px-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                          player.id === me.id
                            ? "border-darts-green text-darts-green hover:bg-darts-green/10"
                            : "border-darts-border text-darts-text-secondary hover:bg-darts-surface-raised"
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
      <div className="flex items-center justify-center gap-6 rounded-xl bg-darts-surface px-6 py-4">
        <div className="text-center">
          <p className="text-sm text-darts-text-secondary truncate max-w-[120px]">{match.player1.player_name}</p>
          <p className="font-score text-4xl font-bold text-darts-text">{p1Wins}</p>
        </div>
        <p className="text-darts-text-secondary text-lg font-medium">–</p>
        <div className="text-center">
          <p className="text-sm text-darts-text-secondary truncate max-w-[120px]">{match.player2.player_name}</p>
          <p className="font-score text-4xl font-bold text-darts-text">{p2Wins}</p>
        </div>
      </div>

      {/* Manches terminées */}
      {completedSets.map((set) => {
        const round = rounds.find((r) => r.order === set.round_order);
        return (
          <div key={set.id} className="rounded-xl border border-darts-green/40 bg-darts-green/10 px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-darts-text-secondary">
              Manche {set.round_order}{round && ` — ${GAME_LABELS[round.game_type]}`}
            </p>
            <p className="text-sm font-semibold text-darts-green">🏆 {set.winner?.player_name}</p>
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
        <div className="rounded-xl bg-darts-surface border border-darts-border p-8 text-center">
          <p className="text-3xl mb-3">🏆</p>
          <p className="font-bold text-darts-text text-lg">Match terminé !</p>
          <p className="text-darts-text-secondary text-sm mt-1">
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
  const isDoubleOrMasterOut = round?.finish_type === "DOUBLE" || round?.finish_type === "MASTER";

  const [rp1, setRp1] = useState(startScore);
  const [rp2, setRp2] = useState(startScore);
  const [inputP1, setInputP1] = useState("");
  const [inputP2, setInputP2] = useState("");
  const [bustMsg, setBustMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [throws, setThrows] = useState<ThrowEntry[]>([]);

  function handleVolee(player: "p1" | "p2") {
    const raw = player === "p1" ? inputP1 : inputP2;
    const voleeScore = parseInt(raw);
    if (isNaN(voleeScore) || voleeScore < 0 || voleeScore > 180) return;

    setWarnMsg(null);

    if (IMPOSSIBLE_VOLEE.has(voleeScore)) {
      setBustMsg(`${voleeScore} est impossible à réaliser en une volée.`);
      if (player === "p1") setInputP1(""); else setInputP2("");
      setTimeout(() => setBustMsg(null), 3000);
      return;
    }

    const remaining = player === "p1" ? rp1 : rp2;
    const newRemaining = remaining - voleeScore;

    if (newRemaining < 0) {
      setBustMsg(`Bust ! ${player === "p1" ? p1.player_name : p2.player_name} reste à ${remaining}.`);
      if (player === "p1") setInputP1(""); else setInputP2("");
      setThrows(prev => [...prev, { player, score: voleeScore, remaining, bust: true }]);
      setTimeout(() => setBustMsg(null), 2500);
      return;
    }

    if (isDoubleOrMasterOut && newRemaining === 1) {
      setBustMsg(`Bust ! Impossible de laisser 1 en ${round?.finish_type === "MASTER" ? "master" : "double"} out.`);
      if (player === "p1") setInputP1(""); else setInputP2("");
      setThrows(prev => [...prev, { player, score: voleeScore, remaining, bust: true }]);
      setTimeout(() => setBustMsg(null), 2500);
      return;
    }

    if (player === "p1") { setRp1(newRemaining); setInputP1(""); }
    else { setRp2(newRemaining); setInputP2(""); }

    setThrows(prev => [...prev, { player, score: voleeScore, remaining: newRemaining, bust: false }]);

    if (newRemaining > 0 && IMPOSSIBLE_CHECKOUT.has(newRemaining)) {
      setWarnMsg(`${newRemaining} : fermeture impossible en une volée.`);
    }

    if (newRemaining === 0) {
      const winnerId = player === "p1" ? p1.id : p2.id;
      startTransition(() => void markWinnerDirect(set.id, winnerId, tournamentId));
    }
  }

  function forceWinner(winnerId: string) {
    startTransition(() => void markWinnerDirect(set.id, winnerId, tournamentId));
  }

  const recentThrows = throws.slice(-10).reverse();

  return (
    <div className="rounded-xl bg-darts-surface border border-darts-border p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-darts-text-secondary uppercase tracking-wider">
          Manche {setNumber}/{totalSets}
        </p>
        {round && (
          <p className="text-xs text-darts-text-secondary">
            {GAME_LABELS[round.game_type]} · {ENTRY_LABELS[round.entry_type]} / {FINISH_LABELS[round.finish_type]}
          </p>
        )}
      </div>

      {bustMsg && (
        <div className="rounded-lg bg-darts-red/10 border border-darts-red/40 px-4 py-2 text-sm text-darts-red text-center">
          {bustMsg}
        </div>
      )}

      {warnMsg && !bustMsg && (
        <div className="rounded-lg bg-darts-gold/10 border border-darts-gold/40 px-4 py-2 text-sm text-darts-gold text-center">
          ⚠ {warnMsg}
        </div>
      )}

      {isCricket ? (
        /* Cricket : désignation directe */
        <div className="space-y-3">
          <p className="text-sm text-darts-text-secondary text-center">Cricket — désignez le gagnant de la manche :</p>
          <div className="grid grid-cols-2 gap-3">
            {[p1, p2].map((p) => (
              <button
                key={p.id}
                disabled={isPending}
                onClick={() => forceWinner(p.id)}
                className="rounded-xl border border-darts-border py-4 text-sm font-bold text-darts-text hover:border-darts-green hover:bg-darts-green/10 disabled:opacity-60 transition-colors"
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
              <p className="text-sm text-darts-text-secondary truncate">{p1.player_name}</p>
              <p className={`font-score text-5xl font-bold ${rp1 === 0 ? "text-darts-green" : "text-darts-text"}`}>
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
                  className="w-full rounded-lg bg-darts-bg border border-darts-border px-3 py-2 text-sm text-darts-text placeholder:text-darts-text-secondary focus:border-darts-green focus:outline-none text-center"
                />
                <button
                  disabled={isPending || !inputP1}
                  onClick={() => handleVolee("p1")}
                  className="rounded-lg bg-darts-green px-3 py-2 text-sm font-bold text-white hover:bg-darts-green/90 disabled:opacity-40 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>

            {/* P2 */}
            <div className="space-y-3 text-center">
              <p className="text-sm text-darts-text-secondary truncate">{p2.player_name}</p>
              <p className={`font-score text-5xl font-bold ${rp2 === 0 ? "text-darts-green" : "text-darts-text"}`}>
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
                  className="w-full rounded-lg bg-darts-bg border border-darts-border px-3 py-2 text-sm text-darts-text placeholder:text-darts-text-secondary focus:border-darts-green focus:outline-none text-center"
                />
                <button
                  disabled={isPending || !inputP2}
                  onClick={() => handleVolee("p2")}
                  className="rounded-lg bg-darts-green px-3 py-2 text-sm font-bold text-white hover:bg-darts-green/90 disabled:opacity-40 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>

          {/* Historique des volées */}
          {recentThrows.length > 0 && (
            <div className="border-t border-darts-border pt-3">
              <p className="text-xs text-darts-text-secondary mb-2">Volées</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {recentThrows.map((t, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${
                      t.bust ? "bg-darts-red/10 text-darts-red" : "bg-darts-bg/60 text-darts-text"
                    }`}
                  >
                    <span className="font-medium truncate max-w-[100px]">
                      {t.player === "p1" ? p1.player_name : p2.player_name}
                    </span>
                    <span className={`font-mono font-bold ${t.bust ? "" : "text-white"}`}>
                      {t.bust ? `${t.score} — Bust` : `+${t.score}`}
                    </span>
                    <span className="font-mono text-darts-text-secondary w-10 text-right">
                      {t.bust ? "" : t.remaining}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Override manuel */}
          <div className="border-t border-darts-border pt-4">
            <p className="text-xs text-darts-text-secondary text-center mb-3">Ou désigner manuellement le gagnant</p>
            <div className="grid grid-cols-2 gap-2">
              {[p1, p2].map((p) => (
                <button
                  key={p.id}
                  disabled={isPending}
                  onClick={() => forceWinner(p.id)}
                  className="rounded-lg border border-darts-border py-2 text-xs font-semibold text-darts-text-secondary hover:border-darts-green hover:text-darts-green disabled:opacity-60 transition-colors"
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
