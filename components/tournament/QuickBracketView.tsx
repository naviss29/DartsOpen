import { ArbitrateMatchButton } from "./ArbitrateMatchModal";

interface QuickMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  board_number: number;
  status: string;
  winner_id: string | null;
  player1: { id: string; player_name: string; lives: number } | null;
  player2: { id: string; player_name: string; lives: number } | null;
  sets: { id: string; round_order: number; winner_id: string | null }[];
}

interface Props {
  matches: QuickMatch[];
  /** Si absent, le bouton d'arbitrage est masqué (vue publique) */
  tournamentId?: string;
}

/**
 * DO-QUICK-POOL-001 — bassin unique : plus de séparation Winners/Losers/Grande Finale (un joueur
 * à 2 vies et un joueur à 1 vie peuvent désormais s'affronter, voir doAdvanceQuickTournamentTx,
 * lib/db/tournament.ts), donc plus de sections par type de bracket ici — une seule grille de
 * matchs, triée par vague de création (bracket_round) puis position au sein de la vague. Le
 * nombre de vies restant reste affiché par joueur (Lives) : c'est une information sur le joueur,
 * jamais sur une structure de bracket qui n'existe plus.
 *
 * Utilise exclusivement les tokens sémantiques du design-system (bg-surface, text-text-*,
 * border-border-*, accent/success/warning) plutôt que des couleurs littérales — ce composant
 * est partagé entre le tableau de bord organisateur (thème clair) et la vue live publique
 * (thème sombre, exception mission §4) : il s'adapte automatiquement au `data-theme="dark"`
 * posé par l'ancêtre, sans prop ni variante à gérer ici.
 */
export function QuickBracketView({ matches, tournamentId }: Props) {
  const sorted = [...matches].sort(
    (a, b) => a.bracket_round - b.bracket_round || a.bracket_position - b.bracket_position
  );

  if (sorted.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map((match) => (
        <QuickMatchCard key={match.id} match={match} tournamentId={tournamentId} />
      ))}
    </div>
  );
}

// ── Carte d'un match ──────────────────────────────────────────────────────────

function QuickMatchCard({ match, tournamentId }: { match: QuickMatch; tournamentId?: string }) {
  const isInProgress = match.status === "IN_PROGRESS";
  const isPending    = match.status === "PENDING";

  const statusLabel = isInProgress
    ? `Cible ${match.board_number}`
    : isPending
    ? "En attente"
    : "Terminé";

  const statusColor = isInProgress
    ? "text-success bg-success-subtle"
    : isPending
    ? "text-text-secondary bg-surface-secondary"
    : "text-text-muted bg-surface-secondary";

  return (
    <div className={`rounded-xl border bg-surface shadow-sm overflow-hidden ${isInProgress ? "border-success-border" : "border-border-muted"}`}>
      {/* En-tête : statut */}
      <div className={`px-3 py-1.5 flex items-center justify-between text-xs font-medium border-b border-border-muted ${statusColor}`}>
        <span>{statusLabel}</span>
        {isInProgress && <span className="w-1.5 h-1.5 rounded-full bg-success-solid animate-pulse" />}
      </div>

      {/* Joueurs */}
      <div className="p-3 space-y-1">
        <PlayerRow player={match.player1} winnerId={match.winner_id} />
        <p className="text-center text-xs text-text-secondary py-0.5">vs</p>
        <PlayerRow player={match.player2} winnerId={match.winner_id} />
      </div>

      {/* Bouton arbitrage (admin uniquement — tournamentId absent sur la vue publique) */}
      {tournamentId && isInProgress && match.player1 && match.player2 && match.sets.length > 0 && (
        <div className="border-t border-border-muted px-3 py-2 flex justify-end">
          <ArbitrateMatchButton
            match={{
              id: match.id,
              status: match.status,
              player1: { id: match.player1.id, player_name: match.player1.player_name },
              player2: { id: match.player2.id, player_name: match.player2.player_name },
              sets: match.sets,
            }}
            tournamentId={tournamentId}
          />
        </div>
      )}
    </div>
  );
}

// ── Ligne joueur avec indicateur de vies ─────────────────────────────────────

function PlayerRow({
  player,
  winnerId,
}: {
  player: { id: string; player_name: string; lives: number } | null;
  winnerId: string | null;
}) {
  if (!player) {
    return (
      <div className="flex items-center justify-between rounded-lg px-2 py-1.5 bg-surface-secondary">
        <span className="text-sm text-text-secondary italic">?</span>
      </div>
    );
  }

  const isWinner = winnerId === player.id;
  const isLoser  = winnerId !== null && winnerId !== player.id;

  return (
    <div className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${isWinner ? "bg-success-subtle" : ""}`}>
      <span
        className={`text-sm truncate ${
          isWinner ? "text-success font-semibold" : isLoser ? "text-text-secondary" : "text-text-primary font-medium"
        }`}
      >
        {player.player_name}
        {isWinner && <span className="ml-1 text-success-solid text-xs">✓</span>}
      </span>
      <Lives count={player.lives} />
    </div>
  );
}

// ── Indicateur de vies ────────────────────────────────────────────────────────

function Lives({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 flex-shrink-0 ml-2" aria-label={`${count} vie${count > 1 ? "s" : ""}`}>
      {Array.from({ length: 2 }, (_, i) => (
        <span
          key={i}
          className={`text-base leading-none ${i < count ? "text-danger-solid" : "text-border-default"}`}
        >
          ♥
        </span>
      ))}
    </div>
  );
}
