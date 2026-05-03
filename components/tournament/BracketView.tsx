interface BracketMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  status: string;
  player1: { id: string; player_name: string };
  player2: { id: string; player_name: string };
  winner_id: string | null;
}

interface Props {
  matches: BracketMatch[];
  maxRound: number;
}


function roundLabel(round: number, maxRound: number): string {
  // Adapter le label selon le nombre total de tours
  const fromEnd = maxRound - round;
  if (fromEnd === 0) return "Finale";
  if (fromEnd === 1) return "Demi-finales";
  if (fromEnd === 2) return "Quarts de finale";
  if (fromEnd === 3) return "Huitièmes";
  return `Tour ${round}`;
}

export function BracketView({ matches, maxRound }: Props) {
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-6 min-w-max pb-4">
        {rounds.map((round) => {
          const roundMatches = matches
            .filter((m) => m.bracket_round === round)
            .sort((a, b) => a.bracket_position - b.bracket_position);

          return (
            <div key={round} className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center px-2">
                {roundLabel(round, maxRound)}
              </p>
              <div
                className="flex flex-col gap-3"
                style={{ justifyContent: roundMatches.length === 1 ? "center" : "space-around", minHeight: "100%" }}
              >
                {roundMatches.map((match) => (
                  <BracketMatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatchCard({ match }: { match: BracketMatch }) {
  const isBye = match.player1.id === match.player2.id;

  if (isBye) {
    return (
      <div className="w-52 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-400 text-center">BYE</p>
        <p className="text-sm font-medium text-gray-700 text-center mt-1">
          {match.player1.player_name}
        </p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    PENDING: "border-gray-200 bg-white",
    IN_PROGRESS: "border-green-300 bg-green-50",
    FINISHED: "border-gray-200 bg-white",
  };

  return (
    <div className={`w-52 rounded-lg border p-3 space-y-2 ${statusColors[match.status] ?? "border-gray-200 bg-white"}`}>
      <PlayerRow
        name={match.player1.player_name}
        isWinner={match.winner_id === match.player1.id}
        isFinished={match.status === "FINISHED"}
      />
      <div className="border-t border-gray-100" />
      <PlayerRow
        name={match.player2.player_name}
        isWinner={match.winner_id === match.player2.id}
        isFinished={match.status === "FINISHED"}
      />
      {match.status === "IN_PROGRESS" && (
        <p className="text-center text-xs text-green-600 font-medium animate-pulse">EN COURS</p>
      )}
    </div>
  );
}

function PlayerRow({ name, isWinner, isFinished }: { name: string; isWinner: boolean; isFinished: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${isWinner ? "text-green-700 font-semibold" : isFinished ? "text-gray-400" : "text-gray-700"}`}>
      {isWinner && <span className="text-green-500 text-xs">✓</span>}
      <span className="text-sm truncate">{name}</span>
    </div>
  );
}
