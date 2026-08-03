import { ArbitrateMatchButton } from "./ArbitrateMatchModal";

interface QuickMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  bracket_type: string;
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
 * Utilise exclusivement les tokens sémantiques du design-system (bg-surface, text-text-*,
 * border-border-*, accent/success/warning) plutôt que des couleurs littérales — ce composant
 * est partagé entre le tableau de bord organisateur (thème clair) et la vue live publique
 * (thème sombre, exception mission §4) : il s'adapte automatiquement au `data-theme="dark"`
 * posé par l'ancêtre, sans prop ni variante à gérer ici.
 */
export function QuickBracketView({ matches, tournamentId }: Props) {
  const wbMatches = matches
    .filter((m) => m.bracket_type === "WINNERS")
    .sort((a, b) => a.bracket_round - b.bracket_round || a.bracket_position - b.bracket_position);

  const lbMatches = matches
    .filter((m) => m.bracket_type === "LOSERS")
    .sort((a, b) => a.bracket_round - b.bracket_round || a.bracket_position - b.bracket_position);

  const gfMatches = matches
    .filter((m) => m.bracket_type === "GRAND_FINAL")
    .sort((a, b) => a.bracket_round - b.bracket_round);

  return (
    <div className="space-y-8">
      {/* Winners Bracket */}
      {wbMatches.length > 0 && (
        <BracketSection
          title="Winners Bracket"
          subtitle="2 vies"
          color="accent"
          matches={wbMatches}
          tournamentId={tournamentId}
        />
      )}

      {/* Losers Bracket */}
      {lbMatches.length > 0 && (
        <BracketSection
          title="Losers Bracket"
          subtitle="1 vie restante"
          color="warning"
          matches={lbMatches}
          tournamentId={tournamentId}
        />
      )}

      {/* Grande Finale */}
      {gfMatches.length > 0 && (
        <BracketSection
          title="Grande Finale"
          subtitle="701 finish double"
          color="success"
          matches={gfMatches}
          tournamentId={tournamentId}
        />
      )}
    </div>
  );
}

// ── Section par type de bracket ───────────────────────────────────────────────

type SectionColor = "accent" | "warning" | "success";

const sectionStyles: Record<SectionColor, { header: string; dot: string }> = {
  accent: { header: "text-accent border-border-default bg-surface-secondary", dot: "bg-accent" },
  warning: { header: "text-warning border-warning-border bg-warning-subtle", dot: "bg-warning-solid" },
  success: { header: "text-success border-success-border bg-success-subtle", dot: "bg-success-solid" },
};

function BracketSection({
  title,
  subtitle,
  color,
  matches,
  tournamentId,
}: {
  title: string;
  subtitle: string;
  color: SectionColor;
  matches: QuickMatch[];
  tournamentId?: string;
}) {
  const styles = sectionStyles[color];

  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 rounded-lg border px-4 py-2 ${styles.header}`}>
        <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs opacity-70">— {subtitle}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matches.map((match) => (
          <QuickMatchCard key={match.id} match={match} tournamentId={tournamentId} />
        ))}
      </div>
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
