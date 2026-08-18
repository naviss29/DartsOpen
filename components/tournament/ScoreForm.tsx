"use client";

import { useTransition, useState, useRef } from "react";
import { proposeWinner, confirmWinner, disputeResult, markWinnerDirect, recordThrow, cancelLastThrow } from "@/lib/actions/score";
import { computeRemaining, computeActivePlayer, x01StartScore, type X01ThrowLike, type CheckoutDart } from "@/lib/utils/x01";

const DART_SEGMENTS = Array.from({ length: 20 }, (_, i) => i + 1);
const BULL = 25;

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
  /** DO-SCORING-001 — historique persisté de la manche en cours (vide si aucune, ou si le mode
   * est ÉLECTRONIQUE). Seule source de vérité pour reconstruire le score restant/joueur actif —
   * voir SetScoreTracker ci-dessous. */
  currentSetThrows?: X01ThrowLike[];
}

const GAME_LABELS: Record<string, string> = {
  "501": "501", "701": "701", "901": "901", "1001": "1001", CRICKET: "Cricket",
};
const ENTRY_LABELS: Record<string, string> = { SINGLE: "Simple", DOUBLE: "Double", TRIPLE: "Triple" };
const FINISH_LABELS: Record<string, string> = { SINGLE: "Simple", DOUBLE: "Double", TRIPLE: "Triple", MASTER: "Master" };

export function ScoreForm({ match, rounds, scoringMode, tournamentId, currentSetThrows = [] }: Props) {
  const sets = [...match.match_sets].sort((a, b) => a.round_order - b.round_order);

  if (rounds.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-4xl">⚠️</p>
        <p className="text-warning-solid font-semibold">Aucune manche configurée</p>
        <p className="text-text-secondary text-sm">L&apos;organisateur n&apos;a pas encore configuré les manches de ce tournoi.</p>
      </div>
    );
  }

  if (scoringMode === "TRADITIONAL") {
    return (
      <TraditionalScoreForm
        match={match}
        sets={sets}
        rounds={rounds}
        tournamentId={tournamentId}
        currentSetThrows={currentSetThrows}
      />
    );
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
          <h2 className="text-xl font-bold text-text-primary mb-1">Qui êtes-vous ?</h2>
          <p className="text-text-secondary text-sm">Sélectionnez votre nom pour entrer le score</p>
        </div>
        <div className="space-y-3">
          {[match.player1, match.player2].map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSide(i === 0 ? 1 : 2)}
              className="w-full rounded-xl bg-surface-secondary border-2 border-border-default hover:border-success-solid px-6 py-5 text-left transition-colors"
            >
              <p className="text-xs text-text-secondary mb-1">Joueur {i + 1}</p>
              <p className="text-xl font-bold text-text-primary">{p.player_name}</p>
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
          <p className="text-xs text-text-secondary">Vous jouez en tant que</p>
          <p className="font-bold text-text-primary">{me.player_name}</p>
        </div>
        <button onClick={() => setSide(null)} className="text-xs text-text-secondary hover:text-text-primary">
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
              className={`rounded-xl border p-4 ${isComplete ? "bg-success-solid/10 border-success-solid/40" : "bg-surface-secondary border-border-default"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Manche {set.round_order}
                  {round && ` — ${GAME_LABELS[round.game_type]} ${ENTRY_LABELS[round.entry_type]}/${FINISH_LABELS[round.finish_type]}`}
                </p>
                {isComplete && <span className="text-xs text-success-solid font-medium">✓ Validé</span>}
              </div>

              {isComplete ? (
                <p className="text-text-primary font-semibold">🏆 {set.winner?.player_name ?? "Gagnant inconnu"}</p>
              ) : set.winner_id && myValidated ? (
                <p className="text-sm text-warning-solid">En attente de confirmation de {opponent.player_name}…</p>
              ) : set.winner_id && !myValidated ? (
                <div className="space-y-3">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium text-text-primary">{set.winner?.player_name ?? "?"}</span> a été désigné·e gagnant·e. Confirmez-vous ?
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => void confirmWinner(set.id, side, tournamentId))}
                      className="flex-1 rounded-lg bg-success-solid py-2.5 text-sm font-semibold text-white hover:bg-success-solid/90 disabled:opacity-60 transition-colors"
                    >
                      ✓ Confirmer
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => startTransition(() => void disputeResult(set.id, tournamentId))}
                      className="rounded-lg border border-danger-solid/60 text-danger-solid px-4 py-2.5 text-sm font-semibold hover:bg-danger-solid/10 disabled:opacity-60 transition-colors"
                    >
                      Contester
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-text-secondary">Qui a gagné cette manche ?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[match.player1, match.player2].map((player) => (
                      <button
                        key={player.id}
                        disabled={isPending}
                        onClick={() => startTransition(() => void proposeWinner(set.id, player.id, side, tournamentId))}
                        className={`rounded-lg border py-3 px-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                          player.id === me.id
                            ? "border-success-solid text-success-solid hover:bg-success-solid/10"
                            : "border-border-default text-text-secondary hover:bg-surface-secondary"
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
function TraditionalScoreForm({
  match, sets, rounds, tournamentId, currentSetThrows,
}: { match: Match; sets: MatchSet[]; rounds: Round[]; tournamentId: string; currentSetThrows: X01ThrowLike[] }) {
  const completedSets = sets.filter((s) => s.validated_p1 && s.validated_p2);
  const currentSet = sets.find((s) => !(s.validated_p1 && s.validated_p2));

  const p1Wins = completedSets.filter((s) => s.winner_id === match.player1.id).length;
  const p2Wins = completedSets.filter((s) => s.winner_id === match.player2.id).length;

  return (
    <div className="space-y-4">
      {/* Tableau des sets */}
      <div className="flex items-center justify-center gap-6 rounded-xl bg-surface-secondary px-6 py-4">
        <div className="text-center">
          <p className="text-sm text-text-secondary truncate max-w-[120px]">{match.player1.player_name}</p>
          <p className="tabular-score text-4xl font-bold text-text-primary">{p1Wins}</p>
        </div>
        <p className="text-text-secondary text-lg font-medium">–</p>
        <div className="text-center">
          <p className="text-sm text-text-secondary truncate max-w-[120px]">{match.player2.player_name}</p>
          <p className="tabular-score text-4xl font-bold text-text-primary">{p2Wins}</p>
        </div>
      </div>

      {/* Manches terminées */}
      {completedSets.map((set) => {
        const round = rounds.find((r) => r.order === set.round_order);
        return (
          <div key={set.id} className="rounded-xl border border-success-solid/40 bg-success-solid/10 px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-text-secondary">
              Manche {set.round_order}{round && ` — ${GAME_LABELS[round.game_type]}`}
            </p>
            <p className="text-sm font-semibold text-success-solid">🏆 {set.winner?.player_name}</p>
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
          throws={currentSetThrows}
        />
      ) : (
        <div className="rounded-xl bg-surface-secondary border border-border-default p-8 text-center">
          <p className="text-3xl mb-3">🏆</p>
          <p className="font-bold text-text-primary text-lg">Match terminé !</p>
          <p className="text-text-secondary text-sm mt-1">
            {p1Wins > p2Wins ? match.player1.player_name : p2Wins > p1Wins ? match.player2.player_name : "Égalité"} remporte le match.
          </p>
        </div>
      )}
    </div>
  );
}

function SetScoreTracker({
  set, p1, p2, round, setNumber, totalSets, tournamentId, throws,
}: {
  set: MatchSet;
  p1: Player;
  p2: Player;
  round: Round | undefined;
  setNumber: number;
  totalSets: number;
  tournamentId: string;
  throws: X01ThrowLike[];
}) {
  const [isPending, startTransition] = useTransition();
  const isCricket = round?.game_type === "CRICKET";
  const startScore = isCricket ? 0 : x01StartScore(round?.game_type ?? "501");

  // DO-SCORING-001 (Étape 5) — état entièrement dérivé des props (l'historique persisté), plus
  // jamais un état local qui pourrait diverger de la base ou se perdre au refresh. Un
  // rafraîchissement de page, un changement d'appareil ou une reconnexion reçoivent exactement
  // les mêmes props reconstruites depuis PostgreSQL (voir app/(public)/t/[id]/score/page.tsx) —
  // jamais une réinitialisation à startScore/[] comme avant cette mission.
  const rp1 = computeRemaining(throws, p1.id, startScore);
  const rp2 = computeRemaining(throws, p2.id, startScore);
  const activePlayerId = computeActivePlayer(throws, p1.id, p2.id);
  const recentThrows = [...throws].reverse().slice(0, 10);
  const hasCancellable = throws.some((t) => !t.cancelled);

  // Ephémère uniquement : texte en cours de saisie, messages transitoires, confirmation
  // d'annulation. Rien ici ne représente l'état du match — perdre ces valeurs au refresh est
  // sans conséquence, contrairement à rp1/rp2/throws avant cette mission.
  const [inputP1, setInputP1] = useState("");
  const [inputP2, setInputP2] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "warning"; text: string } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // DO-SCORING-002 (Étape 5) — fléchette de fermeture : ne sert qu'à guider l'affichage (le
  // serveur seul décide si le checkout est valable, jamais ce pré-calcul client). Défaut
  // raisonnable selon le type de fermeture configuré, pour limiter la saisie au strict minimum.
  const isDoubleOrMasterOut = round?.finish_type === "DOUBLE" || round?.finish_type === "MASTER";
  const isTripleOut = round?.finish_type === "TRIPLE";
  const defaultMultiplier: 1 | 2 | 3 = isTripleOut ? 3 : isDoubleOrMasterOut ? 2 : 1;
  const [checkoutSegment, setCheckoutSegment] = useState("20");
  const [checkoutMultiplier, setCheckoutMultiplier] = useState<1 | 2 | 3>(defaultMultiplier);

  // Identité stable de commande par volée (Étape 4) : un même clic répété ou un retry réseau
  // avant qu'une réponse ne soit reçue réutilise le MÊME identifiant tant que la saisie n'a pas
  // changé — le serveur (dbRecordThrow) les traite alors comme une seule et même volée, jamais
  // deux. Un identifiant frais n'est généré qu'une fois la volée précédente confirmée.
  const requestIdP1 = useRef(crypto.randomUUID());
  const requestIdP2 = useRef(crypto.randomUUID());
  const cancelRequestId = useRef(crypto.randomUUID());

  const parsedP1 = parseInt(inputP1, 10);
  const parsedP2 = parseInt(inputP2, 10);
  // DO-SCORING-002 (Étape 5, UX) — n'affiche les champs de fléchette de fermeture que lorsque la
  // saisie en cours atteindrait exactement zéro : jamais pour une volée normale. Purement
  // indicatif côté client — le serveur revalide tout (dbRecordThrow).
  const isClosingAttemptP1 = !isCricket && activePlayerId === p1.id && !isNaN(parsedP1) && rp1 - parsedP1 === 0;
  const isClosingAttemptP2 = !isCricket && activePlayerId === p2.id && !isNaN(parsedP2) && rp2 - parsedP2 === 0;

  function handleVolee(player: "p1" | "p2") {
    if (isPending) return; // anti double-clic UX — la vraie idempotence reste côté serveur
    const raw = player === "p1" ? inputP1 : inputP2;
    const voleeScore = parseInt(raw, 10);
    if (isNaN(voleeScore) || voleeScore < 0 || voleeScore > 180) return;

    const playerNum = player === "p1" ? 1 : 2;
    const requestIdRef = player === "p1" ? requestIdP1 : requestIdP2;
    const remaining = player === "p1" ? rp1 : rp2;
    const isClosingAttempt = !isCricket && remaining - voleeScore === 0;
    const checkoutDart: CheckoutDart | null = isClosingAttempt
      ? { segment: parseInt(checkoutSegment, 10), multiplier: checkoutMultiplier }
      : null;

    setMessage(null);
    startTransition(async () => {
      const result = await recordThrow(set.id, tournamentId, playerNum, voleeScore, requestIdRef.current, checkoutDart);

      if (result.error) {
        // Ne jamais régénérer l'identifiant sur erreur : un nouveau clic sur OK avec la même
        // saisie doit rejouer EXACTEMENT la même commande (retry après réponse ambiguë/perdue).
        setMessage({ tone: "error", text: result.error });
        return;
      }

      // Volée confirmée par le serveur (bust ou non) — la prochaine sera une commande différente.
      requestIdRef.current = crypto.randomUUID();
      if (player === "p1") setInputP1(""); else setInputP2("");
      setCheckoutSegment("20");
      setCheckoutMultiplier(defaultMultiplier);

      if (result.bust) {
        setMessage({ tone: "error", text: result.reason ?? "Bust !" });
      } else if (result.impossibleCheckout) {
        setMessage({ tone: "warning", text: "Fermeture impossible en une volée avec ce restant." });
      }
    });
  }

  function forceWinner(winnerId: string) {
    if (isPending) return;
    startTransition(() => void markWinnerDirect(set.id, winnerId, tournamentId));
  }

  function handleCancelLastThrow() {
    if (isPending) return;
    startTransition(async () => {
      const result = await cancelLastThrow(set.id, tournamentId, cancelRequestId.current);
      setShowCancelConfirm(false);
      if (result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      cancelRequestId.current = crypto.randomUUID();
      setMessage(null);
    });
  }

  return (
    <div className="rounded-xl bg-surface-secondary border border-border-default p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary uppercase tracking-wider">
          Manche {setNumber}/{totalSets}
        </p>
        {round && (
          <p className="text-xs text-text-secondary">
            {GAME_LABELS[round.game_type]} · {ENTRY_LABELS[round.entry_type]} / {FINISH_LABELS[round.finish_type]}
          </p>
        )}
      </div>

      {isPending && (
        <p className="text-center text-xs text-text-secondary animate-pulse">Enregistrement…</p>
      )}

      {message && (
        <div
          className={`rounded-lg px-4 py-2 text-sm text-center border ${
            message.tone === "error"
              ? "bg-danger-solid/10 border-danger-solid/40 text-danger-solid"
              : "bg-warning-solid/10 border-warning-solid/40 text-warning-solid"
          }`}
        >
          {message.tone === "warning" && "⚠ "}{message.text}
        </div>
      )}

      {!isCricket && (
        <p className="text-center text-xs text-text-secondary">
          Au tour de <span className="font-semibold text-text-primary">{activePlayerId === p1.id ? p1.player_name : p2.player_name}</span>
        </p>
      )}

      {isCricket ? (
        /* Cricket : désignation directe */
        <div className="space-y-3">
          <p className="text-sm text-text-secondary text-center">Cricket — désignez le gagnant de la manche :</p>
          <div className="grid grid-cols-2 gap-3">
            {[p1, p2].map((p) => (
              <button
                key={p.id}
                disabled={isPending}
                onClick={() => forceWinner(p.id)}
                className="rounded-xl border border-border-default py-4 text-sm font-bold text-text-primary hover:border-success-solid hover:bg-success-solid/10 disabled:opacity-60 transition-colors"
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
              <p className="text-sm text-text-secondary truncate">{p1.player_name}</p>
              <p className={`tabular-score text-5xl font-bold ${rp1 === 0 ? "text-success-solid" : "text-text-primary"}`}>
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
                  className="w-full rounded-lg bg-surface border border-border-default px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-success-solid focus:outline-none text-center"
                />
                <button
                  disabled={isPending || !inputP1 || activePlayerId !== p1.id}
                  onClick={() => handleVolee("p1")}
                  className="rounded-lg bg-success-solid px-3 py-2 text-sm font-bold text-white hover:bg-success-solid/90 disabled:opacity-40 transition-colors"
                >
                  OK
                </button>
              </div>
              {isClosingAttemptP1 && (
                <CheckoutDartFields
                  segment={checkoutSegment}
                  multiplier={checkoutMultiplier}
                  onSegmentChange={setCheckoutSegment}
                  onMultiplierChange={setCheckoutMultiplier}
                  disabled={isPending}
                />
              )}
            </div>

            {/* P2 */}
            <div className="space-y-3 text-center">
              <p className="text-sm text-text-secondary truncate">{p2.player_name}</p>
              <p className={`tabular-score text-5xl font-bold ${rp2 === 0 ? "text-success-solid" : "text-text-primary"}`}>
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
                  className="w-full rounded-lg bg-surface border border-border-default px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-success-solid focus:outline-none text-center"
                />
                <button
                  disabled={isPending || !inputP2 || activePlayerId !== p2.id}
                  onClick={() => handleVolee("p2")}
                  className="rounded-lg bg-success-solid px-3 py-2 text-sm font-bold text-white hover:bg-success-solid/90 disabled:opacity-40 transition-colors"
                >
                  OK
                </button>
              </div>
              {isClosingAttemptP2 && (
                <CheckoutDartFields
                  segment={checkoutSegment}
                  multiplier={checkoutMultiplier}
                  onSegmentChange={setCheckoutSegment}
                  onMultiplierChange={setCheckoutMultiplier}
                  disabled={isPending}
                />
              )}
            </div>
          </div>

          {/* Historique des volées — DO-SCORING-001 : lu depuis PostgreSQL (props), plus jamais
              un état local perdu au refresh. Les volées annulées restent visibles, barrées, pour
              une traçabilité complète (jamais supprimées en base, voir MatchSetThrow). */}
          {recentThrows.length > 0 && (
            <div className="border-t border-border-default pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-text-secondary">Volées</p>
                {hasCancellable && !showCancelConfirm && (
                  <button
                    disabled={isPending}
                    onClick={() => { cancelRequestId.current = crypto.randomUUID(); setShowCancelConfirm(true); }}
                    className="text-xs text-danger-solid hover:underline disabled:opacity-50"
                  >
                    Annuler la dernière volée
                  </button>
                )}
              </div>

              {showCancelConfirm && (
                <div className="mb-2 rounded-lg border border-danger-solid/40 bg-danger-solid/10 px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-danger-solid">Confirmer l&apos;annulation de la dernière volée ?</p>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={isPending}
                      onClick={handleCancelLastThrow}
                      className="rounded-lg bg-danger-solid px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Confirmer
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => setShowCancelConfirm(false)}
                      className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1 max-h-40 overflow-y-auto">
                {recentThrows.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${
                      t.cancelled
                        ? "bg-surface/30 text-text-secondary line-through opacity-60"
                        : t.bust
                          ? "bg-danger-solid/10 text-danger-solid"
                          : "bg-surface/60 text-text-primary"
                    }`}
                  >
                    <span className="font-medium truncate max-w-[100px]">
                      {t.player_id === p1.id ? p1.player_name : p2.player_name}
                    </span>
                    <span className={`font-mono font-bold ${t.bust || t.cancelled ? "" : "text-white"}`}>
                      {t.bust ? `${t.score_entered} — Bust` : `+${t.score_entered}`}
                    </span>
                    <span className="font-mono text-text-secondary w-10 text-right">
                      {t.bust ? "" : t.remaining_after}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Override manuel */}
          <div className="border-t border-border-default pt-4">
            <p className="text-xs text-text-secondary text-center mb-3">Ou désigner manuellement le gagnant</p>
            <div className="grid grid-cols-2 gap-2">
              {[p1, p2].map((p) => (
                <button
                  key={p.id}
                  disabled={isPending}
                  onClick={() => forceWinner(p.id)}
                  className="rounded-lg border border-border-default py-2 text-xs font-semibold text-text-secondary hover:border-success-solid hover:text-success-solid disabled:opacity-60 transition-colors"
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

/**
 * DO-SCORING-002 (Étape 5) — saisie de la fléchette de fermeture, affichée uniquement quand la
 * volée en cours atteindrait exactement zéro (voir isClosingAttemptP1/P2 ci-dessus). Purement
 * indicatif : le serveur (dbRecordThrow) revalide tout, jamais le client qui ne fait que
 * proposer des valeurs structurellement plausibles.
 */
function CheckoutDartFields({
  segment, multiplier, onSegmentChange, onMultiplierChange, disabled,
}: {
  segment: string;
  multiplier: 1 | 2 | 3;
  onSegmentChange: (v: string) => void;
  onMultiplierChange: (v: 1 | 2 | 3) => void;
  disabled: boolean;
}) {
  const isBull = segment === String(BULL);
  return (
    <div className="rounded-lg border border-success-solid/40 bg-success-solid/10 p-2 space-y-1.5">
      <p className="text-[11px] text-success-solid font-medium">Fléchette de fermeture</p>
      <div className="flex gap-1.5">
        <select
          value={segment}
          disabled={disabled}
          onChange={(e) => onSegmentChange(e.target.value)}
          className="flex-1 rounded-md bg-surface border border-border-default px-1.5 py-1 text-xs text-text-primary focus:border-success-solid focus:outline-none"
        >
          {DART_SEGMENTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value={BULL}>Bull</option>
        </select>
        <select
          value={multiplier}
          disabled={disabled}
          onChange={(e) => onMultiplierChange(Number(e.target.value) as 1 | 2 | 3)}
          className="flex-1 rounded-md bg-surface border border-border-default px-1.5 py-1 text-xs text-text-primary focus:border-success-solid focus:outline-none"
        >
          <option value={1}>Simple</option>
          <option value={2}>Double</option>
          {!isBull && <option value={3}>Triple</option>}
        </select>
      </div>
    </div>
  );
}
