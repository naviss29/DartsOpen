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
          color="blue"
          matches={wbMatches}
          tournamentId={tournamentId}
        />
      )}

      {/* Losers Bracket */}
      {lbMatches.length > 0 && (
        <BracketSection
          title="Losers Bracket"
          subtitle="1 vie restante"
          color="orange"
          matches={lbMatches}
          tournamentId={tournamentId}
        />
      )}

      {/* Grande Finale */}
      {gfMatches.length > 0 && (
        <BracketSection
          title="Grande Finale"
          subtitle="701 finish double"
          color="gold"
          matches={gfMatches}
          tournamentId={tournamentId}
        />
      )}
    </div>
  );
}

// ── Section par type de bracket ───────────────────────────────────────────────

type SectionColor = "blue" | "orange" | "gold";

const sectionStyles: Record<SectionColor, { header: string; dot: string }> = {
  blue:   { header: "text-blue-700 border-blue-200 bg-blue-50",   dot: "bg-blue-500" },
  orange: { header: "text-orange-700 border-orange-200 bg-orange-50", dot: "bg-orange-500" },
  gold:   { header: "text-yellow-700 border-yellow-200 bg-yellow-50", dot: "bg-yellow-500" },
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
    ? "text-green-700 bg-green-50"
    : isPending
    ? "text-gray-500 bg-gray-50"
    : "text-gray-400 bg-gray-50";

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${isInProgress ? "border-green-300" : "border-gray-200"}`}>
      {/* En-tête : statut */}
      <div className={`px-3 py-1.5 flex items-center justify-between text-xs font-medium border-b border-gray-100 ${statusColor}`}>
        <span>{statusLabel}</span>
        {isInProgress && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
      </div>

      {/* Joueurs */}
      <div className="p-3 space-y-1">
        <PlayerRow player={match.player1} winnerId={match.winner_id} />
        <p className="text-center text-xs text-gray-300 py-0.5">vs</p>
        <PlayerRow player={match.player2} winnerId={match.winner_id} />
      </div>

      {/* Bouton arbitrage (admin uniquement — tournamentId absent sur la vue publique) */}
      {tournamentId && isInProgress && match.player1 && match.player2 && match.sets.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-2 flex justify-end">
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
      <div className="flex items-center justify-between rounded-lg px-2 py-1.5 bg-gray-50">
        <span className="text-sm text-gray-400 italic">?</span>
      </div>
    );
  }

  const isWinner = winnerId === player.id;
  const isLoser  = winnerId !== null && winnerId !== player.id;

  return (
    <div className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${isWinner ? "bg-green-50" : ""}`}>
      <span
        className={`text-sm truncate ${
          isWinner ? "text-green-700 font-semibold" : isLoser ? "text-gray-400" : "text-gray-800 font-medium"
        }`}
      >
        {player.player_name}
        {isWinner && <span className="ml-1 text-green-500 text-xs">✓</span>}
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
          className={`text-base leading-none ${i < count ? "text-red-500" : "text-gray-200"}`}
        >
          ♥
        </span>
      ))}
    </div>
  );
}
