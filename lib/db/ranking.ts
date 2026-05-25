import { prisma } from "./client";

export type RankingEntry = {
  player_name: string;
  points: number;
  tournaments: number;
  wins: number;
  championships: number;
};

export type PlayerProfile = {
  player_name: string;
  points: number;
  stats: {
    tournaments: number;
    wins: number;
    championships: number;
    pool_wins: number;
    bracket_wins: number;
  };
  history: {
    tournament_id: string;
    tournament_name: string;
    tournament_date: string;
    result: "champion" | "bracket" | "poules";
    wins: number;
  }[];
};

// Points: participation +1, victoire poule +1, victoire bracket +2, champion +10
export async function dbGetRanking(): Promise<RankingEntry[]> {
  const [matches, registrations] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "FINISHED",
        winnerId: { not: null },
        tournament: { status: "FINISHED" },
      },
      select: {
        winnerId: true,
        bracketRound: true,
        bracketPosition: true,
        poolId: true,
        tournamentId: true,
        winner: { select: { id: true, playerName: true } },
      },
    }),
    prisma.registration.findMany({
      where: { status: "PAID", tournament: { status: "FINISHED" } },
      select: { id: true, playerName: true, tournamentId: true },
    }),
  ]);

  const championByTournament = resolveChampions(matches);

  const points = new Map<
    string,
    { pts: number; tournaments: Set<string>; wins: number; championships: number }
  >();

  const entry = (name: string) => {
    const key = name.trim();
    if (!points.has(key))
      points.set(key, { pts: 0, tournaments: new Set(), wins: 0, championships: 0 });
    return points.get(key)!;
  };

  for (const reg of registrations) {
    const e = entry(reg.playerName);
    if (!e.tournaments.has(reg.tournamentId)) {
      e.tournaments.add(reg.tournamentId);
      e.pts += 1;
    }
  }

  for (const m of matches) {
    if (!m.winner) continue;
    const e = entry(m.winner.playerName);
    if (m.poolId !== null) {
      e.pts += 1;
      e.wins += 1;
    } else if (m.bracketRound !== null) {
      e.pts += 2;
      e.wins += 1;
      if (championByTournament.get(m.tournamentId) === m.winnerId) {
        e.pts += 10;
        e.championships += 1;
      }
    }
  }

  return Array.from(points.entries())
    .map(([name, d]) => ({
      player_name: name,
      points: d.pts,
      tournaments: d.tournaments.size,
      wins: d.wins,
      championships: d.championships,
    }))
    .sort((a, b) => b.points - a.points || b.tournaments - a.tournaments)
    .slice(0, 100);
}

export async function dbGetPlayerProfile(playerName: string): Promise<PlayerProfile | null> {
  const registrations = await prisma.registration.findMany({
    where: {
      playerName: { equals: playerName, mode: "insensitive" },
      tournament: { status: "FINISHED" },
    },
    include: { tournament: { select: { id: true, name: true, date: true } } },
  });

  if (registrations.length === 0) return null;

  const actualName = registrations[0].playerName;
  const regIds = registrations.map((r) => r.id);
  const tournamentIds = registrations.map((r) => r.tournamentId);

  const [myMatches, allBracketMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "FINISHED",
        OR: [{ player1Id: { in: regIds } }, { player2Id: { in: regIds } }],
      },
      select: {
        tournamentId: true,
        winnerId: true,
        bracketRound: true,
        bracketPosition: true,
        poolId: true,
        player1Id: true,
        player2Id: true,
      },
    }),
    prisma.match.findMany({
      where: {
        status: "FINISHED",
        tournamentId: { in: tournamentIds },
        bracketRound: { not: null },
      },
      select: {
        tournamentId: true,
        bracketRound: true,
        bracketPosition: true,
        winnerId: true,
      },
    }),
  ]);

  const championByTournament = resolveChampions(allBracketMatches);

  const historyMap = new Map<
    string,
    { wins: number; hasBracket: boolean; isChampion: boolean; tournament: (typeof registrations)[0]["tournament"] }
  >();
  let totalPoints = 0;
  let totalWins = 0;
  let totalChampionships = 0;
  let poolWins = 0;
  let bracketWins = 0;

  for (const reg of registrations) {
    historyMap.set(reg.tournamentId, {
      wins: 0,
      hasBracket: false,
      isChampion: false,
      tournament: reg.tournament,
    });
    totalPoints += 1;
  }

  for (const match of myMatches) {
    const myId = regIds.find((id) => id === match.player1Id || id === match.player2Id);
    if (!myId) continue;
    const hist = historyMap.get(match.tournamentId);
    if (!hist) continue;
    const won = match.winnerId === myId;

    if (match.poolId !== null) {
      if (won) {
        totalPoints += 1;
        totalWins += 1;
        poolWins += 1;
        hist.wins += 1;
      }
    } else if (match.bracketRound !== null) {
      hist.hasBracket = true;
      if (won) {
        totalPoints += 2;
        totalWins += 1;
        bracketWins += 1;
        hist.wins += 1;
        if (championByTournament.get(match.tournamentId) === myId) {
          totalPoints += 10;
          totalChampionships += 1;
          hist.isChampion = true;
        }
      }
    }
  }

  return {
    player_name: actualName,
    points: totalPoints,
    stats: {
      tournaments: registrations.length,
      wins: totalWins,
      championships: totalChampionships,
      pool_wins: poolWins,
      bracket_wins: bracketWins,
    },
    history: Array.from(historyMap.values())
      .map((d) => ({
        tournament_id: d.tournament.id,
        tournament_name: d.tournament.name,
        tournament_date: d.tournament.date.toISOString().split("T")[0],
        result: d.isChampion ? ("champion" as const) : d.hasBracket ? ("bracket" as const) : ("poules" as const),
        wins: d.wins,
      }))
      .sort((a, b) => b.tournament_date.localeCompare(a.tournament_date)),
  };
}

function resolveChampions(
  matches: { tournamentId: string; bracketRound: number | null; bracketPosition: number | null; winnerId: string | null }[]
): Map<string, string> {
  const byTournament = new Map<string, typeof matches>();
  for (const m of matches) {
    if (m.bracketRound === null) continue;
    const list = byTournament.get(m.tournamentId) ?? [];
    list.push(m);
    byTournament.set(m.tournamentId, list);
  }
  const champions = new Map<string, string>();
  for (const [tid, tMatches] of byTournament) {
    const maxRound = Math.max(...tMatches.map((m) => m.bracketRound!));
    const final = tMatches.find((m) => m.bracketRound === maxRound && m.bracketPosition === 1);
    if (final?.winnerId) champions.set(tid, final.winnerId);
  }
  return champions;
}
