import { prisma } from "./client";
import type { MatchStatus, RegistrationStatus, TournamentStatus } from "../generated/prisma/client";

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapTournament(t: {
  id: string;
  userId: string;
  name: string;
  date: Date;
  location: string;
  status: TournamentStatus;
  maxPlayers: number;
  entryFee: number;
  nbPools: number;
  nbBoards: number;
  advancementPerPool: number;
  playersPerTeam: number;
  registrationMode: string;
  scoringMode: string;
  createdAt: Date;
  rounds?: ReturnType<typeof mapRound>[];
}) {
  return {
    id: t.id,
    association_id: t.userId,
    name: t.name,
    date: t.date.toISOString().split("T")[0],
    location: t.location,
    status: t.status,
    max_players: t.maxPlayers,
    entry_fee: t.entryFee,
    nb_pools: t.nbPools,
    nb_boards: t.nbBoards,
    advancement_per_pool: t.advancementPerPool,
    players_per_team: t.playersPerTeam,
    registration_mode: t.registrationMode,
    scoring_mode: t.scoringMode,
    created_at: t.createdAt.toISOString(),
    rounds: t.rounds ?? [],
  };
}

function mapRound(r: {
  id: string;
  tournamentId: string;
  roundOrder: number;
  gameType: string;
  entryType: string;
  finishType: string;
}) {
  return {
    id: r.id,
    tournament_id: r.tournamentId,
    order: r.roundOrder,
    game_type: r.gameType,
    entry_type: r.entryType,
    finish_type: r.finishType,
  };
}

function mapRegistration(r: {
  id: string;
  tournamentId: string;
  playerName: string;
  playerEmail: string;
  playerPhone: string | null;
  playerNames: unknown;
  status: RegistrationStatus;
  qrCodeToken: string;
  stripeSessionId: string | null;
  entryFeeCents: number;
  platformFeeCents: number;
  feeCollected: boolean;
  createdAt: Date;
}) {
  return {
    id: r.id,
    tournament_id: r.tournamentId,
    player_name: r.playerName,
    player_email: r.playerEmail,
    player_phone: r.playerPhone,
    player_names: r.playerNames as string[],
    status: r.status,
    qr_code_token: r.qrCodeToken,
    stripe_session_id: r.stripeSessionId,
    stripe_payment_intent_id: r.stripeSessionId,
    entry_fee_cents: r.entryFeeCents,
    platform_fee_cents: r.platformFeeCents,
    fee_collected: r.feeCollected,
    created_at: r.createdAt.toISOString(),
  };
}

function mapPool(p: {
  id: string;
  tournamentId: string;
  name: string;
  players: {
    registrationId: string;
    rank: number | null;
    registration: {
      id: string;
      playerName: string;
      playerEmail: string;
      playerPhone: string | null;
      playerNames: unknown;
      status: RegistrationStatus;
      qrCodeToken: string;
      stripeSessionId: string | null;
      entryFeeCents: number;
      platformFeeCents: number;
      feeCollected: boolean;
      createdAt: Date;
      tournamentId: string;
    };
  }[];
  matches?: {
    id: string;
    boardNumber: number;
    status: MatchStatus;
    player1: { id: string; playerName: string } | null;
    player2: { id: string; playerName: string } | null;
  }[];
}) {
  return {
    id: p.id,
    tournament_id: p.tournamentId,
    name: p.name,
    players: p.players.map((pp) => ({
      pool_id: p.id,
      registration_id: pp.registrationId,
      rank: pp.rank,
      id: pp.registration.id,
      player_name: pp.registration.playerName,
      registration: mapRegistration(pp.registration),
    })),
    matches: (p.matches ?? []).map((m) => ({
      id: m.id,
      board_number: m.boardNumber,
      status: m.status,
      player1: m.player1 ? { id: m.player1.id, player_name: m.player1.playerName } : null,
      player2: m.player2 ? { id: m.player2.id, player_name: m.player2.playerName } : null,
    })),
  };
}

function mapMatchSet(s: {
  id: string;
  matchId: string;
  roundId: string;
  scoreP1: number;
  scoreP2: number;
  winnerId: string | null;
  validatedP1: boolean;
  validatedP2: boolean;
}) {
  return {
    id: s.id,
    match_id: s.matchId,
    round_id: s.roundId,
    score_p1: s.scoreP1,
    score_p2: s.scoreP2,
    winner_id: s.winnerId,
    validated_p1: s.validatedP1,
    validated_p2: s.validatedP2,
  };
}

function mapMatch(m: {
  id: string;
  tournamentId: string;
  poolId: string | null;
  bracketRound: number | null;
  bracketPosition: number | null;
  boardNumber: number;
  status: MatchStatus;
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
  sets: Parameters<typeof mapMatchSet>[0][];
  player1?: Parameters<typeof mapRegistration>[0] | null;
  player2?: Parameters<typeof mapRegistration>[0] | null;
}) {
  return {
    id: m.id,
    tournament_id: m.tournamentId,
    pool_id: m.poolId,
    bracket_round: m.bracketRound,
    bracket_position: m.bracketPosition,
    board_number: m.boardNumber,
    status: m.status,
    player1_id: m.player1Id,
    player2_id: m.player2Id,
    winner_id: m.winnerId,
    sets: m.sets.map(mapMatchSet),
    player1: m.player1 ? mapRegistration(m.player1) : undefined,
    player2: m.player2 ? mapRegistration(m.player2) : undefined,
  };
}

// ── Tournaments ───────────────────────────────────────────────────────────────

const roundSelect = {
  id: true,
  tournamentId: true,
  roundOrder: true,
  gameType: true,
  entryType: true,
  finishType: true,
};

export async function dbListTournaments(userId: string) {
  const rows = await prisma.tournament.findMany({
    where: { userId },
    include: {
      rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } },
      _count: { select: { registrations: { where: { status: "PAID" } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((t) => ({
    ...mapTournament({ ...t, rounds: t.rounds.map(mapRound) }),
    players_paid: t._count.registrations,
  }));
}

export async function dbGetTournament(id: string) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: { rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } } },
  });
  if (!t) return null;
  return mapTournament({ ...t, rounds: t.rounds.map(mapRound) });
}

export async function dbGetTournamentPublic(id: string) {
  return dbGetTournament(id);
}

export async function dbCreateTournament(userId: string, data: {
  name: string;
  date: string;
  location: string;
  max_players: number;
  entry_fee: number;
  nb_pools: number;
  nb_boards: number;
  advancement_per_pool: number;
  players_per_team: number;
  registration_mode: string;
  scoring_mode: string;
}) {
  const t = await prisma.tournament.create({
    data: {
      userId,
      name: data.name,
      date: new Date(data.date),
      location: data.location,
      maxPlayers: data.max_players,
      entryFee: data.entry_fee,
      nbPools: data.nb_pools,
      nbBoards: data.nb_boards,
      advancementPerPool: data.advancement_per_pool,
      playersPerTeam: data.players_per_team,
      registrationMode: data.registration_mode as "ONLINE" | "ONSITE",
      scoringMode: data.scoring_mode as "ELECTRONIC" | "TRADITIONAL",
    },
    include: { rounds: { select: roundSelect } },
  });
  return mapTournament({ ...t, rounds: [] });
}

export async function dbUpdateTournament(id: string, data: {
  name?: string;
  date?: string;
  location?: string;
  max_players?: number;
  entry_fee?: number;
  nb_pools?: number;
  nb_boards?: number;
  advancement_per_pool?: number;
  players_per_team?: number;
  registration_mode?: string;
  scoring_mode?: string;
}) {
  const t = await prisma.tournament.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.max_players !== undefined && { maxPlayers: data.max_players }),
      ...(data.entry_fee !== undefined && { entryFee: data.entry_fee }),
      ...(data.nb_pools !== undefined && { nbPools: data.nb_pools }),
      ...(data.nb_boards !== undefined && { nbBoards: data.nb_boards }),
      ...(data.advancement_per_pool !== undefined && { advancementPerPool: data.advancement_per_pool }),
      ...(data.players_per_team !== undefined && { playersPerTeam: data.players_per_team }),
      ...(data.registration_mode !== undefined && { registrationMode: data.registration_mode as "ONLINE" | "ONSITE" }),
      ...(data.scoring_mode !== undefined && { scoringMode: data.scoring_mode as "ELECTRONIC" | "TRADITIONAL" }),
    },
    include: { rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } } },
  });
  return mapTournament({ ...t, rounds: t.rounds.map(mapRound) });
}

export async function dbDeleteTournament(id: string) {
  await prisma.tournament.delete({ where: { id } });
}

export async function dbUpdateTournamentStatus(id: string, status: string) {
  const t = await prisma.tournament.update({
    where: { id },
    data: { status: status as TournamentStatus },
    include: { rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } } },
  });
  return mapTournament({ ...t, rounds: t.rounds.map(mapRound) });
}

// ── Rounds ────────────────────────────────────────────────────────────────────

export async function dbAddRound(tournamentId: string, data: {
  game_type: string;
  entry_type: string;
  finish_type: string;
}) {
  const count = await prisma.round.count({ where: { tournamentId } });
  const r = await prisma.round.create({
    data: {
      tournamentId,
      roundOrder: count + 1,
      gameType: data.game_type,
      entryType: data.entry_type,
      finishType: data.finish_type,
    },
    select: roundSelect,
  });
  return mapRound(r);
}

export async function dbDeleteRound(roundId: string) {
  await prisma.round.delete({ where: { id: roundId } });
}

// ── Registrations ─────────────────────────────────────────────────────────────

export async function dbListRegistrations(tournamentId: string, status?: string) {
  const rows = await prisma.registration.findMany({
    where: {
      tournamentId,
      ...(status ? { status: status as RegistrationStatus } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapRegistration);
}

export async function dbAddRegistration(tournamentId: string, data: {
  playerName: string;
  playerEmail: string;
  playerPhone?: string | null;
  playerNames: string[];
  platformFeeCents: number;
  status?: RegistrationStatus;
}) {
  const r = await prisma.registration.create({
    data: {
      tournamentId,
      playerName: data.playerName,
      playerEmail: data.playerEmail,
      playerPhone: data.playerPhone ?? null,
      playerNames: data.playerNames,
      platformFeeCents: data.platformFeeCents,
      ...(data.status ? { status: data.status } : {}),
    },
  });
  return mapRegistration(r);
}

export async function dbDeleteRegistration(registrationId: string) {
  await prisma.registration.delete({ where: { id: registrationId } });
}

export async function dbCountRegistrations(tournamentId: string, status?: string) {
  return prisma.registration.count({
    where: {
      tournamentId,
      ...(status ? { status: status as RegistrationStatus } : {}),
    },
  });
}

export async function dbGetRegistrationByToken(token: string) {
  const r = await prisma.registration.findUnique({
    where: { qrCodeToken: token },
    include: {
      tournament: {
        include: { rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } } },
      },
    },
  });
  if (!r) return null;
  return {
    ...mapRegistration(r),
    tournament: mapTournament({ ...r.tournament, rounds: r.tournament.rounds.map(mapRound) }),
  };
}

// ── Pools ─────────────────────────────────────────────────────────────────────

export async function dbListPools(tournamentId: string) {
  const rows = await prisma.pool.findMany({
    where: { tournamentId },
    include: {
      players: {
        include: { registration: true },
        orderBy: { rank: { sort: "asc", nulls: "last" } },
      },
      matches: {
        include: {
          player1: { select: { id: true, playerName: true } },
          player2: { select: { id: true, playerName: true } },
        },
        orderBy: { boardNumber: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map(mapPool);
}

export async function dbGeneratePools(
  tournamentId: string,
  pools: { name: string; playerIds: string[] }[],
  matches: {
    poolIndex: number;
    player1Id: string;
    player2Id: string;
    boardNumber: number;
    status: string;
  }[]
) {
  const rounds = await prisma.round.findMany({
    where: { tournamentId },
    select: roundSelect,
    orderBy: { roundOrder: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    await tx.pool.deleteMany({ where: { tournamentId } });
    await tx.match.deleteMany({ where: { tournamentId, poolId: { not: null } } });

    const createdPools = await Promise.all(
      pools.map((p) =>
        tx.pool.create({
          data: { tournamentId, name: p.name },
          select: { id: true },
        })
      )
    );

    await tx.poolPlayer.createMany({
      data: pools.flatMap((p, i) =>
        p.playerIds.map((registrationId) => ({
          poolId: createdPools[i].id,
          registrationId,
        }))
      ),
    });

    for (const m of matches) {
      const pool = createdPools[m.poolIndex];
      const match = await tx.match.create({
        data: {
          tournamentId,
          poolId: pool.id,
          boardNumber: m.boardNumber,
          status: m.status as MatchStatus,
          player1Id: m.player1Id,
          player2Id: m.player2Id,
        },
        select: { id: true },
      });

      if (rounds.length > 0) {
        await tx.matchSet.createMany({
          data: rounds.map((r) => ({ matchId: match.id, roundId: r.id })),
        });
      }
    }
  });
}

// ── Matches ───────────────────────────────────────────────────────────────────

export async function dbListMatches(
  tournamentId: string,
  params?: { pool_id?: string; bracket_round?: string }
) {
  const rows = await prisma.match.findMany({
    where: {
      tournamentId,
      ...(params?.pool_id ? { poolId: params.pool_id } : {}),
      ...(params?.bracket_round ? { bracketRound: Number(params.bracket_round) } : {}),
    },
    include: {
      sets: true,
      player1: true,
      player2: true,
    },
    orderBy: [{ bracketRound: "asc" }, { bracketPosition: "asc" }, { boardNumber: "asc" }],
  });
  return rows.map(mapMatch);
}

export async function dbBulkCreateMatches(
  tournamentId: string,
  matches: {
    player1Id: string;
    player2Id: string | null;
    bracketRound: number;
    bracketPosition: number;
    boardNumber: number;
    status: string;
    winnerId?: string | null;
    roundIds: string[];
  }[]
) {
  await prisma.$transaction(async (tx) => {
    for (const m of matches) {
      const match = await tx.match.create({
        data: {
          tournamentId,
          bracketRound: m.bracketRound,
          bracketPosition: m.bracketPosition,
          boardNumber: m.boardNumber,
          status: m.status as MatchStatus,
          player1Id: m.player1Id,
          player2Id: m.player2Id ?? null,
          winnerId: m.winnerId ?? null,
        },
        select: { id: true },
      });

      if (m.roundIds.length > 0) {
        await tx.matchSet.createMany({
          data: m.roundIds.map((roundId) => ({ matchId: match.id, roundId })),
        });
      }
    }
  });
}

export async function dbDeleteBracketMatches(tournamentId: string) {
  await prisma.match.deleteMany({ where: { tournamentId, poolId: null } });
}

// ── Match sets — scoring business logic ───────────────────────────────────────

export async function dbGetMatchSet(matchSetId: string) {
  const s = await prisma.matchSet.findUnique({
    where: { id: matchSetId },
    include: {
      match: {
        include: { sets: true },
      },
    },
  });
  return s;
}

export async function dbProposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2
): Promise<{ error?: string; set: ReturnType<typeof mapMatchSet> }> {
  const existing = await prisma.matchSet.findUnique({ where: { id: matchSetId } });
  if (!existing) return { error: "Set introuvable.", set: null as never };
  if (existing.winnerId !== null) return { error: "Ce set a déjà un vainqueur.", set: null as never };

  const updated = await prisma.matchSet.update({
    where: { id: matchSetId },
    data: {
      winnerId,
      ...(playerSide === 1 ? { validatedP1: true } : { validatedP2: true }),
    },
  });

  return { set: mapMatchSet(updated) };
}

export async function dbConfirmWinner(
  matchSetId: string,
  playerSide: 1 | 2
): Promise<{ error?: string; disputed?: boolean; matchFinished?: boolean; match?: { id: string; tournamentId: string; bracketRound: number | null } }> {
  const set = await prisma.matchSet.findUnique({
    where: { id: matchSetId },
    include: {
      match: {
        include: {
          sets: true,
          tournament: { select: { id: true } },
        },
      },
    },
  });

  if (!set) return { error: "Set introuvable." };
  if (!set.winnerId) return { error: "Aucun vainqueur proposé." };

  const alreadyValidated = playerSide === 1 ? set.validatedP1 : set.validatedP2;
  const otherValidated = playerSide === 1 ? set.validatedP2 : set.validatedP1;

  if (alreadyValidated) return { error: "Vous avez déjà proposé ce résultat." };

  if (!otherValidated) {
    await prisma.matchSet.update({
      where: { id: matchSetId },
      data: playerSide === 1 ? { validatedP1: true } : { validatedP2: true },
    });
    return {};
  }

  // Both sides validated — confirm the set winner
  await prisma.matchSet.update({
    where: { id: matchSetId },
    data: playerSide === 1 ? { validatedP1: true } : { validatedP2: true },
  });

  return await tryFinalizeMatch(set.match);
}

export async function dbDisputeResult(matchSetId: string): Promise<{ error?: string }> {
  const set = await prisma.matchSet.findUnique({ where: { id: matchSetId } });
  if (!set) return { error: "Set introuvable." };
  if (set.winnerId === null) return { error: "Aucun résultat à contester." };

  await prisma.matchSet.update({
    where: { id: matchSetId },
    data: { winnerId: null, validatedP1: false, validatedP2: false },
  });

  return {};
}

export async function dbMarkWinnerDirect(
  matchSetId: string,
  winnerId: string
): Promise<{ error?: string; matchFinished?: boolean; match?: { id: string; tournamentId: string; bracketRound: number | null } }> {
  const set = await prisma.matchSet.findUnique({
    where: { id: matchSetId },
    include: {
      match: {
        include: {
          sets: true,
          tournament: { select: { id: true } },
        },
      },
    },
  });

  if (!set) return { error: "Set introuvable." };

  await prisma.matchSet.update({
    where: { id: matchSetId },
    data: { winnerId, validatedP1: true, validatedP2: true },
  });

  const updatedSets = set.match.sets.map((s) =>
    s.id === matchSetId ? { ...s, winnerId, validatedP1: true, validatedP2: true } : s
  );

  return await tryFinalizeMatch({ ...set.match, sets: updatedSets });
}

async function tryFinalizeMatch(match: {
  id: string;
  player1Id: string;
  player2Id: string | null;
  bracketRound: number | null;
  boardNumber: number;
  status: MatchStatus;
  sets: { winnerId: string | null; validatedP1: boolean; validatedP2: boolean }[];
  tournament: { id: string };
}): Promise<{ matchFinished?: boolean; match?: { id: string; tournamentId: string; bracketRound: number | null } }> {
  const confirmedSets = match.sets.filter((s) => s.validatedP1 && s.validatedP2 && s.winnerId !== null);
  const totalSets = match.sets.length;

  if (totalSets === 0 || confirmedSets.length < totalSets) return {};

  const p1Wins = confirmedSets.filter((s) => s.winnerId === match.player1Id).length;
  const p2Wins = confirmedSets.filter((s) => s.winnerId === match.player2Id).length;

  const winnerId = p1Wins >= p2Wins ? match.player1Id : match.player2Id;
  if (!winnerId) return {};

  await prisma.match.update({
    where: { id: match.id },
    data: { status: "FINISHED", winnerId },
  });

  // Démarrer le prochain match PENDING sur la même cible
  if (match.boardNumber > 0) {
    const next = await prisma.match.findFirst({
      where: { tournamentId: match.tournament.id, boardNumber: match.boardNumber, status: "PENDING" },
      orderBy: { id: "asc" },
    });
    if (next) {
      await prisma.match.update({ where: { id: next.id }, data: { status: "IN_PROGRESS" } });
    }
  }

  return {
    matchFinished: true,
    match: { id: match.id, tournamentId: match.tournament.id, bracketRound: match.bracketRound },
  };
}

// ── Bracket advancement ───────────────────────────────────────────────────────

export async function dbAdvanceBracket(
  tournamentId: string,
  currentBracketRound: number
): Promise<{ error?: string; finished?: boolean }> {
  const currentMatches = await prisma.match.findMany({
    where: { tournamentId, bracketRound: currentBracketRound },
    include: { sets: true },
    orderBy: { bracketPosition: "asc" },
  });

  if (!currentMatches.length) return { error: "Aucun match trouvé pour ce tour." };

  const allFinished = currentMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return { error: "Tous les matchs du tour en cours doivent être terminés." };

  if (currentMatches.length === 1) return { finished: true };

  const rounds = await prisma.round.findMany({
    where: { tournamentId },
    select: { id: true },
    orderBy: { roundOrder: "asc" },
  });

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { nbBoards: true },
  });

  if (!tournament) return { error: "Tournoi introuvable." };

  const nextRound = currentBracketRound + 1;
  const winners = currentMatches
    .sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0))
    .map((m) => m.winnerId!)
    .filter(Boolean);

  const pairs: { p1: string; p2: string | null; position: number }[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    pairs.push({
      p1: winners[i],
      p2: winners[i + 1] ?? null,
      position: Math.floor(i / 2) + 1,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const boardNumber = (i % tournament.nbBoards) + 1;

      if (pair.p2 === null) {
        const match = await tx.match.create({
          data: {
            tournamentId,
            bracketRound: nextRound,
            bracketPosition: pair.position,
            boardNumber: 0,
            status: "FINISHED",
            player1Id: pair.p1,
            winnerId: pair.p1,
          },
          select: { id: true },
        });
        if (rounds.length > 0) {
          await tx.matchSet.createMany({
            data: rounds.map((r) => ({
              matchId: match.id,
              roundId: r.id,
              winnerId: pair.p1,
              validatedP1: true,
              validatedP2: true,
            })),
          });
        }
      } else {
        const match = await tx.match.create({
          data: {
            tournamentId,
            bracketRound: nextRound,
            bracketPosition: pair.position,
            boardNumber,
            status: i < tournament.nbBoards ? "IN_PROGRESS" : "PENDING",
            player1Id: pair.p1,
            player2Id: pair.p2,
          },
          select: { id: true },
        });
        if (rounds.length > 0) {
          await tx.matchSet.createMany({
            data: rounds.map((r) => ({ matchId: match.id, roundId: r.id })),
          });
        }
      }
    }
  });

  return {};
}

// ── Organization (Stripe Connect) ─────────────────────────────────────────────

export async function dbGetOrganization(userId: string) {
  return prisma.organization.findUnique({ where: { userId } });
}

export async function dbUpsertOrganizationStripeAccount(userId: string, stripeAccountId: string) {
  return prisma.organization.upsert({
    where: { userId },
    create: { userId, stripeAccountId },
    update: { stripeAccountId },
  });
}

export async function dbUpdateRegistrationStripeSession(registrationId: string, stripeSessionId: string) {
  await prisma.registration.update({
    where: { id: registrationId },
    data: { stripeSessionId },
  });
}

export async function dbMarkRegistrationPaid(registrationId: string) {
  await prisma.registration.updateMany({
    where: { id: registrationId, status: "PENDING" },
    data: { status: "PAID", feeCollected: true },
  });
}

export async function dbGetRegistrationWithTournament(registrationId: string) {
  const r = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!r) return null;

  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = r.tournament.date;
  const dateFr = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  return {
    player_name: r.playerName,
    player_email: r.playerEmail,
    player_names: r.playerNames as string[],
    tournament_name: r.tournament.name,
    tournament_date: dateFr,
    tournament_location: r.tournament.location,
  };
}
