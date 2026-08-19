import { prisma } from "./client";
import { Prisma } from "../generated/prisma/client";
import type { BracketType, MatchStatus, RegistrationStatus, TournamentStatus } from "../generated/prisma/client";
import { assertValidTransition } from "../utils/tournamentStatus";
import {
  validateVolee,
  x01StartScore,
  isValidDartShape,
  checkoutDartValue,
  satisfiesFinishType,
  finishRuleLabel,
  isPrefixAchievable,
  type FinishType,
  type CheckoutDart,
} from "../utils/x01";
import { seedBracket } from "../utils/bracket";
import { computePoolStandings } from "../utils/pools";
import { pairPlayers, getQuickModeGameFormat } from "../utils/doubleElimination";

/**
 * DARTSOPEN-MONETIZATION-002 (audit DO-AUD-001/DO-AUD-002) — vérifie qu'une erreur P2002
 * porte bien sur `idempotency_key`, quelle que soit la forme de `meta` renvoyée. Avec
 * `@prisma/adapter-pg` (Prisma 7, driver adapters), `meta.target` n'existe pas : le champ en
 * conflit est niché sous `meta.driverAdapterError.cause.constraint.fields` — une forme
 * différente du classique `meta.target` du query engine intégré. Un test PostgreSQL
 * concurrent réel (lib/db/tournament.concurrency.test.ts) a montré que ne vérifier que
 * `meta.target` laisse passer un vrai P2002 concurrent tel quel (throw non géré) au lieu de
 * retourner le tournoi du gagnant de la course.
 */
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const meta = err.meta as
    | { target?: string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } }
    | undefined;
  if (meta?.target?.includes("idempotency_key")) return true;
  if (meta?.driverAdapterError?.cause?.constraint?.fields?.includes("idempotency_key")) return true;
  return false;
}

/**
 * DO-SPORT-001 — vérifie qu'une erreur P2002 provient bien de l'une des deux contraintes
 * partielles ajoutées sur `matches` (voir la migration dédiée) : au plus un match IN_PROGRESS
 * par cible réelle, ou au plus un match par slot de bracket (tournoi, type, round, position).
 * Même discipline que `isIdempotencyKeyConflict` — l'index Postgres réellement en conflit peut
 * être signalé sous des formes différentes selon le moteur de requête.
 */
export function isSportEngineUniqueConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const meta = err.meta as { target?: string; driverAdapterError?: { cause?: { constraint?: { name?: string } } } } | undefined;
  const constraintName = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.name ?? "";
  return constraintName.includes("matches_one_active_per_board") || constraintName.includes("matches_unique_bracket_slot");
}

/**
 * DO-SPORT-001 (Étape 2) — frontière transactionnelle commune à toute opération qui modifie
 * l'état sportif d'un tournoi (finalisation de match, affectation de cible, progression de
 * tour, avancement du tournoi rapide, transition de statut). `SELECT ... FOR UPDATE` sur la
 * ligne du tournoi sérialise, au niveau PostgreSQL, toute paire d'opérations concurrentes
 * portant sur LE MÊME tournoi (jamais un verrou distribué applicatif — Postgres suffit, voir
 * la mission) : deux matchs terminés simultanément sur deux cibles, deux libérations de cible
 * concurrentes, une tentative de création du même tour, etc. se retrouvent naturellement
 * exécutées l'une après l'autre, chacune relisant l'état réel laissé par la précédente avant de
 * décider quoi que ce soit — jamais une décision basée sur une lecture faite avant l'obtention
 * du verrou. Des tournois différents ne se bloquent jamais entre eux (verrou scopé à une seule
 * ligne).
 */
export async function withTournamentLock<T>(
  tournamentId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
    return fn(tx);
  });
}

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
  paymentMode: string;
  scoringMode: string;
  quickMode: boolean;
  idempotencyKey: string;
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
    payment_mode: t.paymentMode,
    scoring_mode: t.scoringMode,
    quick_mode: t.quickMode,
    // DARTSOPEN-MONETIZATION-003 (P3) — exposé pour permettre une reconciliation manuelle
    // (retryTournamentEntitlementConfirmation()) d'un tournoi resté PENDING_ENTITLEMENT : la
    // même référence que celle utilisée lors de la tentative de consommation initiale, stable,
    // jamais un secret (déjà transmis tel quel à SterPlatform).
    idempotency_key: t.idempotencyKey,
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
  sterPaymentId: string | null;
  entryFeeCents: number;
  platformFeeCents: number;
  feeCollected: boolean;
  seeded: boolean;
  lives: number;
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
    ster_payment_id: r.sterPaymentId,
    entry_fee_cents: r.entryFeeCents,
    platform_fee_cents: r.platformFeeCents,
    fee_collected: r.feeCollected,
    seeded: r.seeded,
    lives: r.lives,
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
    };
  }[];
  matches?: {
    id: string;
    boardNumber: number;
    status: MatchStatus;
    player1: { id: string; playerName: string } | null;
    player2: { id: string; playerName: string } | null;
    sets?: { id: string; roundId: string; winnerId: string | null; round?: { roundOrder: number } | null }[];
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
    })),
    matches: (p.matches ?? []).map((m) => ({
      id: m.id,
      board_number: m.boardNumber,
      status: m.status,
      player1: m.player1 ? { id: m.player1.id, player_name: m.player1.playerName } : null,
      player2: m.player2 ? { id: m.player2.id, player_name: m.player2.playerName } : null,
      sets: (m.sets ?? []).map((s) => ({
        id: s.id,
        round_order: s.round?.roundOrder ?? 0,
        winner_id: s.winnerId,
      })),
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
  round?: { roundOrder: number } | null;
}) {
  return {
    id: s.id,
    match_id: s.matchId,
    round_id: s.roundId,
    round_order: s.round?.roundOrder ?? 0,
    score_p1: s.scoreP1,
    score_p2: s.scoreP2,
    winner_id: s.winnerId,
    validated_p1: s.validatedP1,
    validated_p2: s.validatedP2,
  };
}

/**
 * Projection minimale d'un participant pour tout affichage de match (public ou
 * organisateur) — jamais les champs personnels (email, téléphone) ni techniques
 * (qrCodeToken, identifiant de paiement) : aucun consommateur réel de `mapMatch`/
 * `mapPool` n'en a besoin (vérifié sur l'ensemble du code), et ces deux mappers
 * alimentent notamment les routes publiques `/api/public/tournaments/[id]/matches`
 * et `/pools`, ainsi que les pages live/tv/score dont les props initiales sont
 * sérialisées dans le HTML envoyé au navigateur (BAPPS-LEGAL-005 §2/§4).
 */
function mapPlayerRef(r: { id: string; playerName: string; lives: number }) {
  return { id: r.id, player_name: r.playerName, lives: r.lives };
}

function mapMatch(m: {
  id: string;
  tournamentId: string;
  poolId: string | null;
  bracketRound: number | null;
  bracketPosition: number | null;
  boardNumber: number;
  bracketType: BracketType;
  status: MatchStatus;
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
  updatedAt: Date;
  sets: Parameters<typeof mapMatchSet>[0][];
  player1?: Parameters<typeof mapPlayerRef>[0] | null;
  player2?: Parameters<typeof mapPlayerRef>[0] | null;
}) {
  return {
    id: m.id,
    tournament_id: m.tournamentId,
    pool_id: m.poolId,
    bracket_round: m.bracketRound,
    bracket_position: m.bracketPosition,
    board_number: m.boardNumber,
    bracket_type: m.bracketType,
    status: m.status,
    player1_id: m.player1Id,
    player2_id: m.player2Id,
    winner_id: m.winnerId,
    updated_at: m.updatedAt.toISOString(),
    sets: m.sets.map(mapMatchSet),
    player1: m.player1 ? mapPlayerRef(m.player1) : undefined,
    player2: m.player2 ? mapPlayerRef(m.player2) : undefined,
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

export async function dbListAllTournaments(currentUserId: string) {
  const rows = await prisma.tournament.findMany({
    where: {
      OR: [
        { userId: currentUserId },
        { status: { in: ["OPEN", "IN_PROGRESS", "FINISHED"] } },
      ],
    },
    include: {
      _count: { select: { registrations: { where: { status: "PAID" } } } },
    },
    orderBy: [{ status: "asc" }, { date: "asc" }],
    take: 100,
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    date: t.date.toISOString().split("T")[0],
    location: t.location,
    status: t.status as string,
    max_players: t.maxPlayers,
    players_per_team: t.playersPerTeam,
    entry_fee: t.entryFee,
    registration_mode: t.registrationMode as string,
    nb_pools: t.nbPools,
    nb_boards: t.nbBoards,
    players_paid: t._count.registrations,
    is_mine: t.userId === currentUserId,
  }));
}

/**
 * DO-SPORT-001 — `client` optionnel (défaut : `prisma` global) : les appelants qui tournent
 * sous withTournamentLock() peuvent passer leur `tx` pour lire un état garanti à jour sous le
 * verrou déjà tenu, sans ouvrir une connexion/transaction séparée non couverte par ce verrou.
 */
export async function dbGetTournament(id: string, client: Prisma.TransactionClient = prisma) {
  const t = await client.tournament.findUnique({
    where: { id },
    include: { rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } } },
  });
  if (!t) return null;
  return mapTournament({ ...t, rounds: t.rounds.map(mapRound) });
}

export async function dbGetTournamentPublic(id: string) {
  return dbGetTournament(id);
}

/**
 * DARTSOPEN-MONETIZATION-002 (audit DO-AUD-001/DO-AUD-002) — `idempotencyKey` is required and
 * must be stable across retries of the same user gesture (generated once client-side, not
 * regenerated per request — see components/tournament/TournamentForm.tsx). A double-click or
 * network retry that resubmits the identical key must never create a second tournament: the
 * unique constraint on `idempotency_key` is the actual guarantee (this function's `create()`
 * losing the race to a concurrent identical submission is caught explicitly below and returns
 * the winner's row instead of throwing), the upfront `findUnique` is just the fast, common-case
 * path that avoids hitting the constraint at all for a sequential retry.
 */
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
  payment_mode: string;
  scoring_mode: string;
  quick_mode?: boolean;
}, idempotencyKey: string, initialStatus: "DRAFT" | "PENDING_ENTITLEMENT" = "DRAFT") {
  // DARTSOPEN-MONETIZATION-003 (P4) — scoped to (userId, idempotencyKey), never a bare
  // idempotencyKey lookup: a key submitted by a different user must never resolve to this
  // user's tournament (see Tournament.idempotencyKey's docblock in schema.prisma).
  const key = { userId_idempotencyKey: { userId, idempotencyKey } };
  const existing = await prisma.tournament.findUnique({
    where: key,
    include: { rounds: { select: roundSelect } },
  });
  if (existing) {
    return mapTournament({ ...existing, rounds: [] });
  }

  try {
    const t = await prisma.tournament.create({
      data: {
        userId,
        idempotencyKey,
        status: initialStatus,
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
        paymentMode: data.payment_mode as "ONLINE" | "ONSITE",
        scoringMode: data.scoring_mode as "ELECTRONIC" | "TRADITIONAL",
        quickMode: data.quick_mode ?? false,
      },
      include: { rounds: { select: roundSelect } },
    });
    return mapTournament({ ...t, rounds: [] });
  } catch (err) {
    if (isIdempotencyKeyConflict(err)) {
      // Lost a race against a concurrent identical submission (double-click) — the winner
      // already created this exact tournament between our findUnique above and this insert.
      const winner = await prisma.tournament.findUniqueOrThrow({
        where: key,
        include: { rounds: { select: roundSelect } },
      });
      return mapTournament({ ...winner, rounds: [] });
    }
    throw err;
  }
}

/**
 * DARTSOPEN-MONETIZATION-003 (P3) — the only way a tournament ever leaves PENDING_ENTITLEMENT:
 * called once the credit consumption (or reconciliation) has genuinely confirmed the
 * entitlement. A no-op (never throws) if the tournament isn't in PENDING_ENTITLEMENT — retrying
 * the confirmation after it already succeeded is safe.
 */
export async function dbConfirmTournamentEntitlement(tournamentId: string): Promise<void> {
  await prisma.tournament.updateMany({
    where: { id: tournamentId, status: "PENDING_ENTITLEMENT" },
    data: { status: "DRAFT" },
  });
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
  payment_mode?: string;
  scoring_mode?: string;
  quick_mode?: boolean;
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
      ...(data.payment_mode !== undefined && { paymentMode: data.payment_mode as "ONLINE" | "ONSITE" }),
      ...(data.scoring_mode !== undefined && { scoringMode: data.scoring_mode as "ELECTRONIC" | "TRADITIONAL" }),
      ...(data.quick_mode !== undefined && { quickMode: data.quick_mode }),
    },
    include: { rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } } },
  });
  return mapTournament({ ...t, rounds: t.rounds.map(mapRound) });
}

/**
 * DO-SCORING-001 (Étape 11, découvert en vérifiant la compatibilité de la nouvelle table
 * `match_set_throws`) — un `prisma.tournament.delete()` nu laisse PostgreSQL choisir l'ordre de
 * ses cascades automatiques, qui ne respecte pas les contraintes RESTRICT du schéma (jamais
 * CASCADE, volontairement — voir docblock de `Match`) : `matches.player1_id/player2_id/
 * winner_id`, `match_sets.round_id/winner_id` et désormais `match_set_throws.player_id`
 * pointent tous vers `registrations`/`rounds` sans suppression en cascade. Un tournoi ayant
 * déjà des manches jouées (rounds + matchs + matchSets, donc n'importe quel tournoi ayant
 * dépassé la génération des poules/du bracket) faisait déjà échouer ce DELETE avant cette
 * mission — confirmé empiriquement (`update or delete on table "rounds" violates RESTRICT...`).
 * Corrigé une fois pour toutes en supprimant explicitement dans l'ordre des dépendances, dans
 * une seule transaction (jamais un DELETE partiel si une étape échoue).
 */
export async function dbDeleteTournament(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.matchSetThrow.deleteMany({ where: { matchSet: { match: { tournamentId: id } } } });
    await tx.matchSet.deleteMany({ where: { match: { tournamentId: id } } });
    await tx.match.deleteMany({ where: { tournamentId: id } });
    await tx.round.deleteMany({ where: { tournamentId: id } });
    await tx.poolPlayer.deleteMany({ where: { pool: { tournamentId: id } } });
    await tx.pool.deleteMany({ where: { tournamentId: id } });
    await tx.registration.deleteMany({ where: { tournamentId: id } });
    await tx.tournament.delete({ where: { id } });
  });
}

/**
 * DO-SPORT-001 (Étape 6) — verrouillée sur le tournoi (`withTournamentLock`) : lecture du
 * statut courant, validation et écriture forment une seule opération atomique. Deux appels
 * concurrents (clôture manuelle organisateur vs clôture automatique du dernier match, ou tout
 * autre doublon) se sérialisent — le second relit un statut qui inclut déjà l'effet du
 * premier. La chaîne d'états étant strictement linéaire (DRAFT→OPEN→IN_PROGRESS→FINISHED,
 * jamais de branchement), un second appel visant la même transition que celle déjà appliquée
 * constate `current.status === status` et échoue avec un message explicite ("le statut a déjà
 * changé"), plutôt que l'erreur générique de transition invalide que produirait
 * `assertValidTransition` sur ce même cas (FINISHED → FINISHED) — jamais une incohérence entre
 * deux cibles différentes, seulement une écriture redondante à distinguer clairement d'une
 * vraie transition invalide (ex. DRAFT → FINISHED, demandée par erreur par l'appelant).
 */
/**
 * DO-SCORING-002 (Étape 4) — cœur tx-scopé, extrait de dbUpdateTournamentStatus() pour être
 * appelable depuis une transaction déjà ouverte (withTournamentLock) sans en ouvrir une
 * seconde. Utilisé par doAdvanceToNextRoundTx()/doAdvanceQuickTournamentTx() pour que la
 * clôture du tournoi (issue d'un checkout X01 ou d'un arbitrage) fasse partie de la MÊME
 * frontière transactionnelle que la volée/l'arbitrage qui la déclenche.
 */
async function dbUpdateTournamentStatusTx(tx: Prisma.TransactionClient, id: string, status: string) {
  const current = await tx.tournament.findUniqueOrThrow({
    where: { id },
    select: { status: true, quickMode: true, _count: { select: { rounds: true } } },
  });

  if (current.status === status) {
    throw new Error("Le statut du tournoi a changé entre-temps — réessayez.");
  }
  assertValidTransition(current.status, status);

  // Un tournoi standard sans manche configurée ne peut jamais terminer un match
  // (aucun MatchSet n'est créé) : bloquer l'ouverture des inscriptions à la source.
  // Le mode rapide est exempté : ses manches (501/Cricket/701) sont générées
  // automatiquement par generateQuickBracket, après l'ouverture.
  if (status === "OPEN" && !current.quickMode && current._count.rounds === 0) {
    throw new Error("Impossible d'ouvrir les inscriptions : aucune manche n'est configurée.");
  }

  const result = await tx.tournament.updateMany({
    where: { id, status: current.status },
    data: { status: status as TournamentStatus },
  });
  if (result.count === 0) {
    throw new Error("Le statut du tournoi a changé entre-temps — réessayez.");
  }

  const t = await tx.tournament.findUniqueOrThrow({
    where: { id },
    include: { rounds: { select: roundSelect, orderBy: { roundOrder: "asc" } } },
  });
  return mapTournament({ ...t, rounds: t.rounds.map(mapRound) });
}

/**
 * DO-OPS-002 — la clôture MANUELLE (bouton organisateur, `updateTournamentStatus` dans
 * lib/actions/tournament.ts, seul appelant de cette fonction publique) ne doit jamais couper une
 * compétition encore en cours : refuse IN_PROGRESS → FINISHED tant qu'il reste au moins un match
 * IN_PROGRESS ou PENDING. Vérifié sous le même verrou/transaction que l'écriture elle-même
 * (withTournamentLock) — jamais une vérification séparée qu'une course pourrait contourner.
 *
 * Ne touche jamais dbUpdateTournamentStatusTx() : la clôture AUTOMATIQUE du moteur sportif
 * (doAdvanceToNextRoundTx/doAdvanceQuickTournamentTx, lignes ~1625/~2400) l'appelle directement,
 * sans passer par cette fonction publique — cette garde ne s'applique donc jamais à elle. C'est
 * d'ailleurs cohérent : la clôture automatique ne se déclenche déjà que lorsque le dernier match
 * vient de passer FINISHED, donc précisément quand cette même condition serait de toute façon
 * remplie.
 */
export async function dbUpdateTournamentStatus(id: string, status: string) {
  return withTournamentLock(id, async (tx) => {
    if (status === "FINISHED") {
      const unfinishedCount = await tx.match.count({
        where: { tournamentId: id, status: { in: ["IN_PROGRESS", "PENDING"] } },
      });
      if (unfinishedCount > 0) {
        throw new Error(
          `Impossible de clôturer : ${unfinishedCount} match(s) encore en cours ou en attente.`
        );
      }
    }
    return dbUpdateTournamentStatusTx(tx, id, status);
  });
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

export async function dbDeleteRound(roundId: string, tournamentId: string) {
  await prisma.round.deleteMany({ where: { id: roundId, tournamentId } });
}

// ── Registrations ─────────────────────────────────────────────────────────────

/**
 * DO-SPORT-002 — `client` optionnel (défaut : `prisma` global), même discipline que
 * dbGetTournament()/dbListMatches() : permet une lecture sous le verrou tournoi déjà tenu
 * (withTournamentLock) quand cette lecture participe à une décision sportive (voir
 * getAdvancingPlayerIds() dans lib/actions/bracket.ts, chemin byes de doAdvanceToNextRound()).
 */
export async function dbListRegistrations(
  tournamentId: string,
  status?: string,
  client: Prisma.TransactionClient = prisma,
) {
  const rows = await client.registration.findMany({
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

export type ReserveSlotResult =
  | { outcome: "RESERVED"; registration: ReturnType<typeof mapRegistration> }
  | { outcome: "FULL" }
  | { outcome: "NOT_OPEN" }
  | { outcome: "NOT_FOUND" };

/**
 * DARTSOPEN-MONETIZATION-002/004 (audit DO-AUD-003/DO-AUD-004/DO-AUD-009, contre-audit P3/P4) —
 * atomically checks capacity and tournament eligibility, then inserts a registration, replacing
 * the previous count-then-insert pattern (two separate queries, never atomic — two concurrent
 * requests for the last slot could both pass the check).
 *
 * `SELECT ... FOR UPDATE` locks the tournament row for the transaction's duration, serializing
 * concurrent reservation attempts *for this tournament* (never a global lock — unrelated
 * tournaments never contend with each other). `maxPlayers`/`playersPerTeam`/`status` are all
 * re-read from the DB *inside* this lock — never trusted from a value the caller read earlier
 * (contre-audit P4: `createRegistration()` reads the tournament, then makes a network call to
 * SterPlatform for Stripe Connect status, then reaches this function — the tournament's real
 * state could easily have changed in that window, e.g. the organizer just started the
 * tournament).
 *
 * `allowedStatuses` lets each caller specify which tournament statuses may still accept this
 * kind of registration (public registration: `["OPEN"]` only; organizer manual add: `["DRAFT",
 * "OPEN"]`) — the check itself always happens fresh, under the lock, regardless of caller.
 *
 * A slot is occupied by a PAID registration (free or confirmed onsite/online — permanent, never
 * expires) or by a PENDING registration whose `reservationExpiresAt` hasn't passed yet (online
 * payment in progress — see registration.ts). An expired PENDING reservation stops occupying its
 * slot the instant its expiry passes, with no separate cleanup job required (DO-AUD-009: never a
 * permanent orphan, and this lazy-expiry check is what makes it "explicitly expiring").
 *
 * Capacity rule (contre-audit P3) — accepts only if the slot's own *full* team fits:
 * `(occupied + 1) * playersPerTeam <= maxPlayers`, never merely `occupied * playersPerTeam <
 * maxPlayers` (the old formula only checked capacity *before* adding this registration, so with
 * e.g. maxPlayers=10/playersPerTeam=3, three teams already in — 9 players — a fourth team was
 * wrongly accepted, reaching 12).
 */
export async function dbReserveRegistrationSlot(
  tournamentId: string,
  allowedStatuses: TournamentStatus[],
  data: {
    playerName: string;
    playerEmail: string;
    playerPhone?: string | null;
    playerNames: string[];
    platformFeeCents: number;
    status: "PAID" | "PENDING";
    reservationExpiresAt?: Date | null;
  },
): Promise<ReserveSlotResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;

    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return { outcome: "NOT_FOUND" };
    if (!allowedStatuses.includes(tournament.status)) return { outcome: "NOT_OPEN" };

    const now = new Date();
    const occupied = await tx.registration.count({
      where: {
        tournamentId,
        OR: [
          { status: "PAID" },
          { status: "PENDING", reservationExpiresAt: { gt: now } },
        ],
      },
    });

    if ((occupied + 1) * tournament.playersPerTeam > tournament.maxPlayers) {
      return { outcome: "FULL" };
    }

    const r = await tx.registration.create({
      data: {
        tournamentId,
        playerName: data.playerName,
        playerEmail: data.playerEmail,
        playerPhone: data.playerPhone ?? null,
        playerNames: data.playerNames,
        platformFeeCents: data.platformFeeCents,
        status: data.status,
        reservationExpiresAt: data.reservationExpiresAt ?? null,
      },
    });
    return { outcome: "RESERVED", registration: mapRegistration(r) };
  });
}

export type ConfirmPendingPaymentResult =
  | "CONFIRMED"
  | "ALREADY_CONFIRMED"
  | "REFUND_NEEDED"
  | "REFUND_IN_PROGRESS"
  | "ALREADY_REFUNDED"
  | "NOT_FOUND";

/**
 * DARTSOPEN-MONETIZATION-003/004 (P1, contre-audit) — the only way a webhook `payment.succeeded`
 * may ever turn a registration PAID. Replaces the previous blind `UPDATE ... WHERE status =
 * 'PENDING'` (dbMarkRegistrationPaid, removed), which ignored `reservationExpiresAt` entirely: a
 * late webhook for A's payment could flip A to PAID even after A's reservation had already
 * expired and B had legitimately taken the last slot — pushing the tournament to maxPlayers + 1.
 *
 * Same lock discipline as dbReserveRegistrationSlot(): `SELECT ... FOR UPDATE` on the tournament
 * row serializes this confirmation against every concurrent reservation/confirmation attempt for
 * the same tournament, and the registration + tournament are both re-read *after* acquiring that
 * lock (never trusting a value read before it) so a concurrent expiry/reclaim/status change can
 * never be missed.
 *
 * A late payment is confirmed (PAID) only if ALL of the following hold, checked under the lock:
 * - the reservation is still valid, OR capacity is re-verified and available for it
 *   (contre-audit P3: same `(occupied + 1) * playersPerTeam <= maxPlayers` rule as
 *   dbReserveRegistrationSlot(), never the old off-by-one-team formula);
 * - the tournament is still `OPEN` (contre-audit P4: a still-valid, never-expired reservation
 *   whose payment arrives *after* the organizer started the tournament — `IN_PROGRESS` — must
 *   never be silently honored either; the registration was never actually part of the running
 *   tournament).
 *
 * If either condition fails, this is never silently dropped nor immediately marked REFUNDED:
 * it transitions to `REFUND_PENDING` (contre-audit P1) — REFUNDED is reserved for a *financially
 * confirmed* refund (see dbMarkRefundConfirmed()). This function never talks to SterPlatform
 * itself (no network I/O inside a DB transaction holding a row lock) — the caller (the webhook
 * route) is responsible for actually attempting the refund after this transaction commits.
 */
export async function dbConfirmPendingPayment(registrationId: string): Promise<ConfirmPendingPaymentResult> {
  const initial = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { tournamentId: true },
  });
  if (!initial) return "NOT_FOUND";

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM tournaments WHERE id = ${initial.tournamentId} FOR UPDATE`;

    const [reg, tournament] = await Promise.all([
      tx.registration.findUnique({ where: { id: registrationId } }),
      tx.tournament.findUnique({ where: { id: initial.tournamentId } }),
    ]);
    if (!reg || !tournament) return "NOT_FOUND";
    if (reg.status === "PAID") return "ALREADY_CONFIRMED";
    if (reg.status === "REFUNDED") return "ALREADY_REFUNDED";
    if (reg.status === "REFUND_PENDING") return "REFUND_IN_PROGRESS";
    if (reg.status !== "PENDING") return "NOT_FOUND"; // CANCELLED — a late webhook must never resurrect it

    const now = new Date();
    const reservationStillValid = reg.reservationExpiresAt !== null && reg.reservationExpiresAt > now;
    const tournamentStillOpen = tournament.status === "OPEN";

    let capacityAvailable = true;
    if (!reservationStillValid || !tournamentStillOpen) {
      const occupied = await tx.registration.count({
        where: {
          tournamentId: reg.tournamentId,
          id: { not: registrationId },
          OR: [
            { status: "PAID" },
            { status: "PENDING", reservationExpiresAt: { gt: now } },
          ],
        },
      });
      capacityAvailable = (occupied + 1) * tournament.playersPerTeam <= tournament.maxPlayers;
    }

    if (!tournamentStillOpen || !capacityAvailable) {
      // The slot this registration used to reserve has genuinely been reclaimed by someone else,
      // or the tournament is no longer accepting registrations at all — confirming would push
      // the tournament past maxPlayers or honor an illegitimate late registration. A refund is
      // needed, but not yet financially confirmed — see this function's own docblock.
      await tx.registration.update({
        where: { id: registrationId },
        data: { status: "REFUND_PENDING", reservationExpiresAt: null },
      });
      return "REFUND_NEEDED";
    }

    await tx.registration.update({
      where: { id: registrationId },
      data: { status: "PAID", feeCollected: true, reservationExpiresAt: null },
    });
    return "CONFIRMED";
  });
}

/**
 * DARTSOPEN-MONETIZATION-004 (P1, contre-audit) — the only way a registration ever reaches
 * REFUNDED: called once SterPlatform has *actually confirmed* the refund (an immediate
 * synchronous confirmation from refundPayment(), or the later `payment.refunded` webhook event
 * for an initially-asynchronous Stripe refund). Idempotent — a no-op (never throws) if the
 * registration isn't currently REFUND_PENDING, so a webhook redelivery or a concurrent retry
 * can call this safely any number of times.
 */
export async function dbMarkRefundConfirmed(registrationId: string): Promise<void> {
  await prisma.registration.updateMany({
    where: { id: registrationId, status: "REFUND_PENDING" },
    data: { status: "REFUNDED" },
  });
}

export async function dbDeleteRegistration(registrationId: string, tournamentId: string) {
  await prisma.registration.deleteMany({ where: { id: registrationId, tournamentId } });
}

export async function dbSetSeeded(registrationId: string, tournamentId: string, seeded: boolean) {
  await prisma.registration.updateMany({ where: { id: registrationId, tournamentId }, data: { seeded } });
}

/**
 * Rectification (BAPPS-LEGAL-005 §7) — corrige les champs personnels déclaratifs
 * d'une inscription (nom/pseudo, email, téléphone, noms des coéquipiers). Ne
 * touche jamais un résultat sportif (aucun champ de `Match`/`MatchSet` n'est
 * accessible via cette fonction) : la distinction donnée déclarative / résultat
 * produit par le tournoi est structurelle, pas seulement une convention d'appel.
 */
export async function dbUpdateRegistration(
  registrationId: string,
  tournamentId: string,
  data: { playerName: string; playerEmail: string; playerPhone: string | null; playerNames: string[] }
) {
  await prisma.registration.updateMany({
    where: { id: registrationId, tournamentId },
    data: {
      playerName: data.playerName,
      playerEmail: data.playerEmail,
      playerPhone: data.playerPhone,
      playerNames: data.playerNames,
    },
  });
}

/**
 * Effacement (BAPPS-LEGAL-005 §8) — un DELETE naïf casserait l'intégrité sportive
 * dès qu'un `Match`/`PoolPlayer` référence cette inscription (poules générées,
 * bracket en cours ou terminé) : `Match.player1Id`/`player2Id`/`winnerId` et
 * `PoolPlayer.registrationId` n'ont pas de suppression en cascade depuis
 * `Registration` (contrairement à `Tournament → Registration`), précisément pour
 * qu'une suppression ne puisse jamais silencieusement vider un match déjà joué.
 *
 * - Aucune référence (tournoi à venir, inscription jamais affectée à une poule/un
 *   match) : suppression réelle, aucune trace ne subsiste.
 * - Au moins une référence (tournoi en cours ou terminé) : anonymisation — le nom
 *   devient un identifiant neutre **unique** (jamais une valeur fixe partagée par
 *   plusieurs inscriptions anonymisées, qui fusionnerait à tort leurs statistiques
 *   dans le classement, calculé par regroupement sur `playerName`), email/téléphone/
 *   noms de coéquipiers sont vidés. Les champs de paiement (`sterPaymentId`,
 *   `entryFeeCents`, `platformFeeCents`, `feeCollected`) et l'identifiant technique
 *   `qrCodeToken` ne sont volontairement pas touchés : relèvent d'une éventuelle
 *   obligation de conservation comptable distincte, hors périmètre d'une demande
 *   d'effacement de données personnelles.
 */
export async function dbEraseRegistration(
  registrationId: string,
  tournamentId: string
): Promise<{ anonymized: boolean }> {
  const [hasMatch, hasPoolPlayer] = await Promise.all([
    prisma.match.findFirst({
      where: {
        tournamentId,
        OR: [{ player1Id: registrationId }, { player2Id: registrationId }, { winnerId: registrationId }],
      },
      select: { id: true },
    }),
    prisma.poolPlayer.findFirst({ where: { registrationId }, select: { registrationId: true } }),
  ]);

  if (!hasMatch && !hasPoolPlayer) {
    await prisma.registration.deleteMany({ where: { id: registrationId, tournamentId } });
    return { anonymized: false };
  }

  await prisma.registration.updateMany({
    where: { id: registrationId, tournamentId },
    data: {
      playerName: `Joueur anonymisé #${registrationId}`,
      playerEmail: "",
      playerPhone: null,
      playerNames: [],
    },
  });
  return { anonymized: true };
}

/** Décision Product Owner (BAPPS-LEGAL-005 §9) : durée de conservation des coordonnées de contact (email/téléphone) après la fin d'un tournoi. Le nom/pseudo et les résultats sportifs, eux, sont conservés indéfiniment — c'est le classement inter-tournois, cœur du produit. */
export const CONTACT_RETENTION_MONTHS = 12;

/**
 * Purge automatique et opportuniste des coordonnées de contact (BAPPS-LEGAL-005
 * §9) — jamais du nom/pseudo (identité sportive, conservée indéfiniment) ni des
 * résultats. Scopée aux tournois d'un seul organisateur (`userId`) : déclenchée
 * à chaque visite de son tableau de bord (`app/(dashboard)/tournaments/page.tsx`),
 * jamais un balayage global déclenché par la visite d'un organisateur différent.
 * Idempotente (une inscription déjà purgée ne correspond plus à `playerEmail !=
 * "" OR playerPhone != null`) ; ne touche jamais un tournoi non `FINISHED`.
 */
export async function dbAnonymizeExpiredContacts(userId: string, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - CONTACT_RETENTION_MONTHS);

  const result = await prisma.registration.updateMany({
    where: {
      tournament: { userId, status: "FINISHED", date: { lt: cutoff } },
      OR: [{ playerEmail: { not: "" } }, { playerPhone: { not: null } }],
    },
    data: { playerEmail: "", playerPhone: null },
  });
  return result.count;
}

export async function dbCountRegistrations(tournamentId: string, status?: string) {
  return prisma.registration.count({
    where: {
      tournamentId,
      ...(status ? { status: status as RegistrationStatus } : {}),
    },
  });
}

/**
 * DARTSOPEN-MONETIZATION-002 — read-only count of registrations currently occupying a slot
 * (same definition as dbReserveRegistrationSlot()'s atomic check: PAID, or PENDING with a
 * still-future reservationExpiresAt), for display purposes (register page). Never itself the
 * capacity gate — a plain count-then-compare here is never atomic and isn't meant to be; the
 * authoritative, concurrency-safe check only happens inside dbReserveRegistrationSlot()'s own
 * transaction.
 */
export async function dbCountOccupiedSlots(tournamentId: string): Promise<number> {
  return prisma.registration.count({
    where: {
      tournamentId,
      OR: [
        { status: "PAID" },
        { status: "PENDING", reservationExpiresAt: { gt: new Date() } },
      ],
    },
  });
}

// ── Pools ─────────────────────────────────────────────────────────────────────

/**
 * DO-SPORT-002 — `client` optionnel (défaut : `prisma` global), même discipline que
 * dbListRegistrations() ci-dessus.
 */
export async function dbListPools(tournamentId: string, client: Prisma.TransactionClient = prisma) {
  const rows = await client.pool.findMany({
    where: { tournamentId },
    include: {
      players: {
        include: { registration: { select: { id: true, playerName: true } } },
        orderBy: { rank: { sort: "asc", nulls: "last" } },
      },
      matches: {
        include: {
          player1: { select: { id: true, playerName: true } },
          player2: { select: { id: true, playerName: true } },
          sets: { include: { round: { select: { roundOrder: true } } } },
        },
        orderBy: { boardNumber: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map(mapPool);
}

/**
 * DO-SPORT-001 (Étape 5) — verrouillée sur le tournoi : deux régénérations concurrentes
 * (double-clic organisateur) se sérialisent au lieu de s'entrelacer sur le delete+recreate.
 * Revérifie sous ce même verrou qu'aucun match de poule n'est déjà FINISHED — filet de
 * sécurité derrière la vérification déjà faite côté action (pool.ts), qui reste la source du
 * message d'erreur affiché en premier lieu dans le cas non concurrent.
 */
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
  await withTournamentLock(tournamentId, async (tx) => {
    const [rounds, hasFinishedPoolMatch] = await Promise.all([
      tx.round.findMany({ where: { tournamentId }, select: roundSelect, orderBy: { roundOrder: "asc" } }),
      tx.match.count({ where: { tournamentId, poolId: { not: null }, status: "FINISHED" } }).then((c) => c > 0),
    ]);
    if (hasFinishedPoolMatch) {
      throw new Error("Impossible de régénérer les poules : au moins un match de poule est déjà terminé.");
    }

    // Delete all pool matches (bracketRound = null identifies pool matches vs bracket matches).
    // Using poolId filter alone is unreliable: a previous failed regen may have left orphaned
    // matches with poolId = null (set by ON DELETE SET NULL) that would be missed.
    await tx.match.deleteMany({ where: { tournamentId, bracketRound: null } });
    await tx.pool.deleteMany({ where: { tournamentId } });

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

/**
 * DO-SPORT-001 — `client` optionnel (défaut : `prisma` global), même discipline que
 * dbGetTournament() ci-dessus : permet une lecture sous le verrou tournoi déjà tenu
 * (withTournamentLock) quand la fraîcheur/cohérence de cette lecture est décisionnelle (ex.
 * doAdvanceToNextRound() vérifiant que tous les matchs du tour courant sont bien FINISHED).
 */
export async function dbListMatches(
  tournamentId: string,
  params?: { pool_id?: string; bracket_round?: string },
  client: Prisma.TransactionClient = prisma,
) {
  const rows = await client.match.findMany({
    where: {
      tournamentId,
      ...(params?.pool_id ? { poolId: params.pool_id } : {}),
      ...(params?.bracket_round ? { bracketRound: Number(params.bracket_round) } : {}),
    },
    include: {
      sets: { include: { round: { select: { roundOrder: true } } } },
      player1: { select: { id: true, playerName: true, lives: true } },
      player2: { select: { id: true, playerName: true, lives: true } },
    },
    orderBy: [{ bracketRound: "asc" }, { bracketPosition: "asc" }, { boardNumber: "asc" }],
  });
  return rows.map(mapMatch);
}

type BulkMatchInput = {
  player1Id: string;
  player2Id: string | null;
  bracketRound: number;
  bracketPosition: number;
  boardNumber: number;
  status: string;
  winnerId?: string | null;
  roundIds: string[];
  bracketType?: BracketType;
};

/**
 * DO-SPORT-001 — cœur de dbBulkCreateMatches(), paramétré par un client transactionnel déjà
 * ouvert. Utilisé directement par le code qui tourne sous withTournamentLock() (progression de
 * tour standard, avancement du tournoi rapide) : appeler dbBulkCreateMatches() lui-même depuis
 * là ouvrirait une SECONDE transaction indépendante, non couverte par le verrou déjà tenu.
 */
export async function bulkCreateMatchesTx(tx: Prisma.TransactionClient, tournamentId: string, matches: BulkMatchInput[]) {
  for (const m of matches) {
    const match = await tx.match.create({
      data: {
        tournamentId,
        bracketRound: m.bracketRound,
        bracketPosition: m.bracketPosition,
        boardNumber: m.boardNumber,
        bracketType: m.bracketType ?? "SINGLE",
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
}

export async function dbBulkCreateMatches(tournamentId: string, matches: BulkMatchInput[]) {
  await prisma.$transaction((tx) => bulkCreateMatchesTx(tx, tournamentId, matches));
}

export async function dbDeleteBracketMatches(tournamentId: string, client: Prisma.TransactionClient = prisma) {
  await client.match.deleteMany({ where: { tournamentId, poolId: null } });
}

/**
 * Corrige manuellement les sets d'un match et recalcule son vainqueur.
 *
 * Mode standard : si le vainqueur change, supprime tous les matchs de bracket
 * avec un round supérieur afin que l'organisateur régénère manuellement la suite.
 *
 * Mode rapide : ne supprime rien — le bracket est dynamique (WB et LB ont leurs
 * propres compteurs de round indépendants). L'avancement est délégué à
 * doAdvanceQuickTournament depuis la couche action.
 *
 * DO-SPORT-001 (Étape 2/3) — tout le calcul + l'écriture se fait désormais sous le verrou
 * tournoi (withTournamentLock) : une arbitrage ne peut jamais s'entrelacer avec une
 * confirmation/finalisation concurrente du même tournoi. `matchFinished` n'est vrai que si
 * cet appel fait réellement passer le match dans un état FINISHED nouveau (transition depuis
 * un autre état, OU un changement de vainqueur) — jamais sur un simple rejeu identique d'une
 * correction déjà appliquée (double-clic/retry), qui redéclencherait sinon une seconde perte de
 * vie/création de matchs en mode rapide pour un résultat pourtant inchangé.
 *
 * DO-SPORT-002 — règle minimale sûre pour le mode rapide : une fois qu'un match a été propagé
 * par doAdvanceQuickTournament (`quickAdvanceProcessedAt != null` — perte de vie déjà appliquée,
 * matchs suivants WB/LB/Grande Finale déjà créés à partir de CE résultat), son vainqueur ne peut
 * plus être modifié par l'arbitrage standard : reconstruire rétroactivement la perte de vie et
 * les matchs descendants déjà créés est hors périmètre de cette mission (aucun mécanisme de
 * rollback n'existe). Refus explicite, avant toute écriture — aucune donnée n'est modifiée. Un
 * éventuel mécanisme de réouverture/reconstruction explicite reste à étudier séparément.
 */
export async function dbArbitrateMatch(
  matchId: string,
  tournamentId: string,
  setWinners: { setId: string; winnerId: string | null }[]
): Promise<{ error?: string; matchFinished?: boolean; match?: { id: string; tournamentId: string; bracketRound: number | null; quickMode: boolean } }> {
  try {
    return await withTournamentLock(tournamentId, async (tx) => {
      const match = await tx.match.findFirst({
        where: { id: matchId, tournamentId },
        include: {
          sets: true,
          tournament: { select: { id: true, quickMode: true } },
        },
      });
      if (!match) return { error: "Match introuvable." };
      if (!match.player1Id || !match.player2Id) return { error: "Match incomplet (joueur manquant)." };

      const isQuickMode = match.tournament.quickMode;

      if (isQuickMode && match.quickAdvanceProcessedAt !== null) {
        return {
          error:
            "Ce résultat a déjà été propagé dans le tournoi (perte de vie et matchs suivants déjà créés) : il ne peut plus être modifié par l'arbitrage normal.",
        };
      }

      const p1Wins = setWinners.filter((s) => s.winnerId === match.player1Id).length;
      const p2Wins = setWinners.filter((s) => s.winnerId === match.player2Id).length;
      const total = match.sets.length;
      const allPlayed = setWinners.every((s) => s.winnerId !== null);

      let newWinnerId: string | null = null;
      if (p1Wins > p2Wins && (allPlayed || p1Wins > Math.floor(total / 2))) newWinnerId = match.player1Id;
      else if (p2Wins > p1Wins && (allPlayed || p2Wins > Math.floor(total / 2))) newWinnerId = match.player2Id;

      const newStatus: MatchStatus = allPlayed && newWinnerId ? "FINISHED" : "IN_PROGRESS";
      // Idempotence (contre-audit DO-SPORT-001, tests §3/§7) : un rejeu identique d'une
      // correction déjà appliquée (même vainqueur, match déjà FINISHED) ne doit jamais
      // redéclencher l'avancement — seule une transition réelle (vers FINISHED, ou un
      // changement de vainqueur sur un match déjà FINISHED) le déclenche.
      const matchFinished = newStatus === "FINISHED" && (match.status !== "FINISHED" || match.winnerId !== newWinnerId);

      for (const { setId, winnerId } of setWinners) {
        await tx.matchSet.update({
          where: { id: setId },
          data: {
            winnerId,
            validatedP1: winnerId !== null,
            validatedP2: winnerId !== null,
          },
        });
      }

      await tx.match.update({
        where: { id: matchId },
        data: { winnerId: newWinnerId, status: newStatus },
      });

      // En mode standard uniquement : supprimer les rounds suivants si le vainqueur change,
      // pour éviter un bracket incohérent. En mode rapide, WB round N et LB round N sont
      // indépendants — supprimer par bracketRound > N détruirait des matchs LB valides.
      if (!isQuickMode && match.bracketRound !== null && newWinnerId !== match.winnerId) {
        await tx.match.deleteMany({
          where: { tournamentId: match.tournamentId, poolId: null, bracketRound: { gt: match.bracketRound } },
        });
      }

      return {
        matchFinished,
        match: {
          id: matchId,
          tournamentId: match.tournamentId,
          bracketRound: match.bracketRound,
          quickMode: isQuickMode,
        },
      };
    });
  } catch (err) {
    if (isSportEngineUniqueConflict(err)) {
      // Rouvrir un match déjà remplacé sur sa cible par le match suivant (cible reprise entre
      // temps) — jamais silencieux, mais jamais un 500 brut non plus.
      return { error: "Impossible de corriger ce match : sa cible a déjà été réaffectée à un autre match." };
    }
    throw err;
  }
}

// ── Match sets — scoring business logic ───────────────────────────────────────

/**
 * DO-SPORT-001 (Étape 3) — écriture conditionnelle atomique (`UPDATE ... WHERE winner_id IS
 * NULL`) : une double proposition concurrente pour le même set (double-clic, deux requêtes
 * simultanées) ne peut jamais faire gagner les deux — la seconde constate `count === 0` et
 * renvoie l'erreur métier existante, jamais une course entre lecture et écriture séparées.
 */
export async function dbProposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2
): Promise<{ error?: string; set: ReturnType<typeof mapMatchSet> }> {
  const result = await prisma.matchSet.updateMany({
    where: { id: matchSetId, winnerId: null },
    data: {
      winnerId,
      ...(playerSide === 1 ? { validatedP1: true } : { validatedP2: true }),
    },
  });

  if (result.count === 0) {
    const existing = await prisma.matchSet.findUnique({ where: { id: matchSetId } });
    if (!existing) return { error: "Set introuvable.", set: null as never };
    return { error: "Ce set a déjà un vainqueur.", set: null as never };
  }

  const updated = await prisma.matchSet.findUniqueOrThrow({ where: { id: matchSetId } });
  return { set: mapMatchSet(updated) };
}

/**
 * DO-SPORT-001 (Étape 2) — toute la séquence (relecture du set/match, validation, décision de
 * finalisation, libération de cible) tourne désormais sous le verrou tournoi
 * (withTournamentLock) : deux confirmations concurrentes pour LE MÊME set, ou deux matchs du
 * même tournoi finalisés simultanément sur deux cibles, se sérialisent naturellement — chaque
 * exécution relit l'état réel laissé par la précédente avant de décider quoi que ce soit.
 */
export async function dbConfirmWinner(
  matchSetId: string,
  playerSide: 1 | 2
): Promise<{ error?: string; disputed?: boolean; matchFinished?: boolean; match?: { id: string; tournamentId: string; bracketRound: number | null; quickMode: boolean } }> {
  const initial = await prisma.matchSet.findUnique({
    where: { id: matchSetId },
    select: { match: { select: { tournamentId: true } } },
  });
  if (!initial) return { error: "Set introuvable." };

  return withTournamentLock(initial.match.tournamentId, async (tx) => {
    const set = await tx.matchSet.findUnique({
      where: { id: matchSetId },
      include: {
        match: {
          include: {
            sets: true,
            tournament: { select: { id: true, quickMode: true } },
          },
        },
      },
    });

    if (!set) return { error: "Set introuvable." };
    if (!set.winnerId) return { error: "Aucun vainqueur proposé." };

    const alreadyValidated = playerSide === 1 ? set.validatedP1 : set.validatedP2;
    const otherValidated = playerSide === 1 ? set.validatedP2 : set.validatedP1;

    if (alreadyValidated) return { error: "Vous avez déjà proposé ce résultat." };

    await tx.matchSet.update({
      where: { id: matchSetId },
      data: playerSide === 1 ? { validatedP1: true } : { validatedP2: true },
    });

    if (!otherValidated) return {};

    // Les deux camps ont validé — reflète la validation qu'on vient d'appliquer avant de
    // vérifier la finalisation.
    const updatedSets = set.match.sets.map((s) =>
      s.id === matchSetId ? { ...s, ...(playerSide === 1 ? { validatedP1: true } : { validatedP2: true }) } : s
    );
    return await tryFinalizeMatch(tx, { ...set.match, sets: updatedSets });
  });
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

/**
 * DO-SPORT-001 (Étape 2/4) — cœur tx-scopé de dbMarkWinnerDirect() : désigne directement le
 * vainqueur d'une manche et déclenche la finalisation du match. Extrait en fonction séparée
 * (DO-SCORING-001) pour être réutilisable depuis une transaction déjà ouverte — notamment
 * dbRecordThrow() (checkout X01) qui tourne sous son propre withTournamentLock() et ne doit
 * jamais ouvrir une seconde transaction imbriquée pour finaliser la manche qu'elle vient de
 * clôturer.
 */
async function markWinnerDirectTx(tx: Prisma.TransactionClient, matchSetId: string, winnerId: string) {
  const set = await tx.matchSet.findUnique({
    where: { id: matchSetId },
    include: {
      match: {
        include: {
          sets: true,
          tournament: { select: { id: true, quickMode: true } },
        },
      },
    },
  });

  if (!set) return { error: "Set introuvable." };

  await tx.matchSet.update({
    where: { id: matchSetId },
    data: { winnerId, validatedP1: true, validatedP2: true },
  });

  const updatedSets = set.match.sets.map((s) =>
    s.id === matchSetId ? { ...s, winnerId, validatedP1: true, validatedP2: true } : s
  );

  return await tryFinalizeMatch(tx, { ...set.match, sets: updatedSets });
}

/**
 * DO-SPORT-001 (Étape 2) — même verrou tournoi que dbConfirmWinner(), pour les mêmes raisons
 * (arbitrage direct organisateur, mode traditionnel).
 */
export async function dbMarkWinnerDirect(
  matchSetId: string,
  winnerId: string
): Promise<{ error?: string; matchFinished?: boolean; match?: { id: string; tournamentId: string; bracketRound: number | null; quickMode: boolean } }> {
  const initial = await prisma.matchSet.findUnique({
    where: { id: matchSetId },
    select: { match: { select: { tournamentId: true } } },
  });
  if (!initial) return { error: "Set introuvable." };

  return withTournamentLock(initial.match.tournamentId, (tx) => markWinnerDirectTx(tx, matchSetId, winnerId));
}

/**
 * DO-SPORT-001 (Étape 2/4) — décide si un match est réellement terminé et, si oui, libère sa
 * cible au profit du prochain match PENDING en file d'attente. Appelé exclusivement depuis
 * l'intérieur d'une transaction déjà verrouillée sur le tournoi (withTournamentLock) — jamais
 * de nouvel appel réseau ni de nouvelle transaction ici.
 *
 * Idempotence (Étape 3) : un match déjà FINISHED ne peut plus jamais être "re-finalisé" — un
 * rejeu (retry réseau après un succès déjà appliqué, double soumission) constate l'état déjà
 * terminal et renvoie un no-op explicite, jamais une seconde libération/affectation de cible.
 *
 * Concurrence (Étape 4) : la recherche du "prochain match PENDING" et son affectation à la
 * cible libérée se font dans la MÊME transaction verrouillée — deux matchs de ce tournoi
 * terminés "simultanément" sur deux cibles s'exécutent en réalité l'un après l'autre ; le
 * second voit déjà le match choisi par le premier passé en IN_PROGRESS, donc jamais le même
 * prochain match affecté deux fois. La contrainte partielle `matches_one_active_per_board`
 * (migration DO-SPORT-001) reste un filet de sécurité au niveau PostgreSQL si ce raisonnement
 * applicatif avait un trou — jamais le seul mécanisme.
 */
async function tryFinalizeMatch(tx: Prisma.TransactionClient, match: {
  id: string;
  player1Id: string;
  player2Id: string | null;
  bracketRound: number | null;
  boardNumber: number;
  status: MatchStatus;
  sets: { winnerId: string | null; validatedP1: boolean; validatedP2: boolean }[];
  tournament: { id: string; quickMode: boolean };
}): Promise<{ matchFinished?: boolean; match?: { id: string; tournamentId: string; bracketRound: number | null; quickMode: boolean } }> {
  if (match.status === "FINISHED") return {};

  const confirmedSets = match.sets.filter((s) => s.validatedP1 && s.validatedP2 && s.winnerId !== null);
  const totalSets = match.sets.length;

  if (totalSets === 0 || confirmedSets.length < totalSets) return {};

  const p1Wins = confirmedSets.filter((s) => s.winnerId === match.player1Id).length;
  const p2Wins = confirmedSets.filter((s) => s.winnerId === match.player2Id).length;

  const winnerId = p1Wins >= p2Wins ? match.player1Id : match.player2Id;
  if (!winnerId) return {};

  await tx.match.update({
    where: { id: match.id },
    data: { status: "FINISHED", winnerId },
  });

  // Prendre le prochain match en attente et lui assigner la cible libérée.
  //
  // DO-SPORT-002 — l'ancien fallback "rétro-compatibilité" qui activait un match PENDING sans
  // toucher son boardNumber a été retiré : depuis DO-SPORT-001, tout match PENDING (standard ou
  // rapide) a systématiquement boardNumber=0 à la création (plus jamais de cible préaffectée,
  // voir bracket.ts/quickTournament.ts/pool.ts). Ce fallback pouvait sélectionner un match dont
  // le boardNumber préaffecté N'ÉTAIT PAS la cible qui venait de se libérer, et tenter de
  // l'activer dessus alors qu'elle restait occupée par un autre match actif — l'index unique
  // partiel matches_one_active_per_board refusait alors l'écriture et faisait échouer toute la
  // transaction de finalisation (bug confirmé par l'audit Codex post-DO-SPORT-001).
  if (match.boardNumber > 0) {
    const next = await tx.match.findFirst({
      where: { tournamentId: match.tournament.id, boardNumber: 0, status: "PENDING" },
      orderBy: { id: "asc" },
    });
    if (next) {
      await tx.match.update({
        where: { id: next.id },
        data: { status: "IN_PROGRESS", boardNumber: match.boardNumber },
      });
    }
  }

  return {
    matchFinished: true,
    match: { id: match.id, tournamentId: match.tournament.id, bracketRound: match.bracketRound, quickMode: match.tournament.quickMode },
  };
}

// ── Progression de tour standard — tx-aware (DO-SCORING-002) ─────────────────
//
// DO-SCORING-002 (Étape 4) — déplacé depuis lib/actions/bracket.ts : cette logique n'a aucune
// dépendance Next.js (pas d'auth, pas de revalidatePath/redirect), c'est une conséquence
// sportive pure qui doit pouvoir tourner DANS la même transaction verrouillée qu'un checkout
// X01 (dbRecordThrow) sans ouvrir de second verrou sur le même tournoi. lib/actions/bracket.ts
// importe désormais ces fonctions depuis ici plutôt que l'inverse — jamais lib/db qui dépend de
// lib/actions, toujours le sens établi du reste du code base.

/**
 * DO-SPORT-002 — `tx` optionnel (défaut : `prisma` global) : permet une lecture sous le verrou
 * tournoi déjà tenu quand elle participe à une décision sportive (chemin byes de
 * doAdvanceToNextRoundTx ci-dessous, ou generateBracket() qui l'appelle hors verrou).
 */
export async function getAdvancingPlayerIds(
  tournamentId: string,
  tournament: NonNullable<Awaited<ReturnType<typeof dbGetTournament>>>,
  tx: Prisma.TransactionClient = prisma,
): Promise<string[]> {
  if (tournament.nb_pools === 1) {
    const registrations = await dbListRegistrations(tournamentId, "PAID", tx);
    return registrations.map((r) => r.id);
  }

  const [allMatches, pools] = await Promise.all([
    dbListMatches(tournamentId, undefined, tx),
    dbListPools(tournamentId, tx),
  ]);
  const poolMatches = allMatches.filter((m) => m.pool_id !== null);
  if (!pools.length) return [];

  const advancing: string[] = [];
  for (let rank = 0; rank < tournament.advancement_per_pool; rank++) {
    for (const pool of pools) {
      const poolMatchResults = poolMatches.filter((m) => m.pool_id === pool.id);

      const players = pool.players.map((p) => ({
        registration_id: p.id,
        player_name: p.player_name,
        wins: 0,
        losses: 0,
        sets_won: 0,
        sets_lost: 0,
      }));

      for (const m of poolMatchResults) {
        if (!m.winner_id) continue;
        const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
        const winner = players.find((p) => p.registration_id === m.winner_id);
        const loser = players.find((p) => p.registration_id === loserId);
        if (winner) winner.wins++;
        if (loser) loser.losses++;

        for (const s of m.sets) {
          if (!s.winner_id) continue;
          const setLoserId = s.winner_id === m.player1_id ? m.player2_id : m.player1_id;
          const setWinner = players.find((p) => p.registration_id === s.winner_id);
          const setLoser = players.find((p) => p.registration_id === setLoserId);
          if (setWinner) setWinner.sets_won++;
          if (setLoser) setLoser.sets_lost++;
        }
      }

      const standings = computePoolStandings(players);
      if (standings[rank]) advancing.push(standings[rank].registration_id);
    }
  }

  return advancing;
}

/**
 * DO-SPORT-001 (Étape 2/4/5), déplacé et rendu tx-first par DO-SCORING-002 — décide si le tour
 * courant est bien terminé et crée le tour suivant (ou clôture le tournoi si c'était le
 * dernier), le tout sous le `tx` fourni par l'appelant. Deux appelants :
 * - lib/actions/bracket.ts::doAdvanceToNextRound() ouvre son propre withTournamentLock() puis
 *   délègue ici (comportement observable inchangé pour l'arbitrage/la confirmation de set) ;
 * - dbRecordThrow() (ci-dessous) l'appelle avec le `tx` de SA PROPRE transaction déjà verrouillée
 *   quand un checkout X01 vient de finaliser un match — la libération de cible, la création du
 *   tour suivant et la clôture éventuelle du tournoi deviennent alors une SEULE conséquence
 *   métier atomique avec la volée elle-même : si la progression échoue, la volée de checkout
 *   elle-même est annulée par le rollback (jamais un match FINISHED/cible libérée sans
 *   progression, jamais une progression partielle).
 */
/**
 * DO-BETA-001 — message distingué explicitement de toute autre erreur de doAdvanceToNextRoundTx :
 * "le tour n'est pas encore complet" n'est PAS un échec, c'est l'issue normale et attendue
 * chaque fois qu'un match se termine sur une cible pendant que d'autres cibles jouent encore le
 * même tour (le cas le plus courant dans un tournoi multi-cibles réel). dbRecordThrow() (plus
 * bas) doit pouvoir la distinguer d'une VRAIE erreur (tournoi introuvable, incohérence) — voir
 * son propre commentaire.
 */
const ROUND_INCOMPLETE_ERROR = "Tous les matchs du tour en cours doivent être terminés.";

export async function doAdvanceToNextRoundTx(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  currentBracketRound: number,
): Promise<{ error?: string; finished?: boolean }> {
  const [tournament, allMatches] = await Promise.all([
    dbGetTournament(tournamentId, tx),
    dbListMatches(tournamentId, undefined, tx),
  ]);
  if (!tournament) return { error: "Tournoi introuvable." };

  const bracketMatches = allMatches.filter(
    (m) => m.pool_id === null && m.bracket_round === currentBracketRound,
  );
  if (!bracketMatches.length) return { error: "Aucun match trouvé pour ce tour." };

  const allFinished = bracketMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return { error: ROUND_INCOMPLETE_ERROR };

  if (bracketMatches.length === 1) {
    // Miroir du mode rapide : la fin du bracket clôture automatiquement le tournoi, sans
    // intervention manuelle de l'organisateur — désormais dans la MÊME transaction que la
    // volée/l'arbitrage qui vient de produire ce dernier résultat. Idempotence explicite
    // (jamais un try/catch qui absorberait une VRAIE erreur, DO-SCORING-002 Étape 4) : si le
    // tournoi est déjà FINISHED (rejeu), on ne retente pas la transition — `tournament` a été
    // relu sous CE verrou au tout début de cette fonction, donc son statut est fiable ici.
    if (tournament.status !== "FINISHED") {
      await dbUpdateTournamentStatusTx(tx, tournamentId, "FINISHED");
    }
    return { finished: true };
  }

  const nextRound = currentBracketRound + 1;

  // Idempotence : le tour suivant existe-t-il déjà (créé par un appel concurrent déjà passé
  // sous ce même verrou) ? Un rejeu ne doit jamais créer une seconde fois les mêmes matchs.
  const alreadyExists = allMatches.some(
    (m) => m.pool_id === null && m.bracket_type === "SINGLE" && m.bracket_round === nextRound,
  );
  if (alreadyExists) return {};

  const sortedMatches = [...bracketMatches].sort(
    (a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0),
  );

  const maxPosition = Math.max(...sortedMatches.map((m) => m.bracket_position ?? 0));
  const expectedSlots = maxPosition + 1;
  const hasByes = sortedMatches.length < expectedSlots;

  const rounds = [...tournament.rounds].sort((a, b) => a.order - b.order);
  const nextMatches: Parameters<typeof bulkCreateMatchesTx>[2] = [];
  let boardCounter = 1;

  if (hasByes) {
    // Tour 1 avec byes : recalculer le seeding pour apparier les bye-joueurs avec les vainqueurs R1
    const advancingPlayers = await getAdvancingPlayerIds(tournamentId, tournament, tx);
    const pairs = seedBracket(advancingPlayers);
    const matchByPos = new Map(sortedMatches.map((m) => [m.bracket_position!, m]));
    const pairsByPos = new Map(pairs.map((p) => [p.bracket_position, p]));

    for (let j = 0; j < pairs.length / 2; j++) {
      const pos0 = 2 * j;
      const pos1 = 2 * j + 1;

      const m0 = matchByPos.get(pos0);
      const m1 = matchByPos.get(pos1);
      const pair0 = pairsByPos.get(pos0);
      const pair1 = pairsByPos.get(pos1);

      // Vainqueur : celui du match DB si réel, sinon le joueur bye du seeding
      const p1 = m0 ? m0.winner_id! : pair0?.player1_id;
      const p2 = m1 ? m1.winner_id! : pair1?.player1_id;

      if (!p1 || !p2) continue;

      const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
      const isFirst = boardCounter <= tournament.nb_boards;
      boardCounter++;

      nextMatches.push({
        player1Id: p1,
        player2Id: p2,
        bracketRound: nextRound,
        bracketPosition: j,
        boardNumber: isFirst ? boardNum : 0,
        status: isFirst ? "IN_PROGRESS" : "PENDING",
        roundIds: rounds.map((r) => r.id),
      });
    }
  } else {
    // Tour standard sans byes : appariement séquentiel des vainqueurs
    const winners = sortedMatches.map((m) => m.winner_id!);

    for (let j = 0; j < Math.floor(winners.length / 2); j++) {
      const p1 = winners[j * 2];
      const p2 = winners[j * 2 + 1];

      const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
      const isFirst = boardCounter <= tournament.nb_boards;
      boardCounter++;

      nextMatches.push({
        player1Id: p1,
        player2Id: p2,
        bracketRound: nextRound,
        bracketPosition: j,
        boardNumber: isFirst ? boardNum : 0,
        status: isFirst ? "IN_PROGRESS" : "PENDING",
        roundIds: rounds.map((r) => r.id),
      });
    }
  }

  try {
    await bulkCreateMatchesTx(tx, tournamentId, nextMatches);
  } catch (err) {
    if (isSportEngineUniqueConflict(err)) {
      // Filet de sécurité DB : une exécution concurrente a gagné la course malgré le verrou
      // (ne devrait jamais arriver en pratique) — jamais une erreur utilisateur.
      return {};
    }
    throw err;
  }
  return {};
}

// ── Volées X01 — saisie traditionnelle persistée (DO-SCORING-001) ────────────

function mapMatchSetThrow(t: {
  id: string;
  matchSetId: string;
  playerId: string;
  sequence: number;
  scoreEntered: number;
  remainingBefore: number;
  remainingAfter: number;
  bust: boolean;
  checkoutSegment: number | null;
  checkoutMultiplier: number | null;
  cancelledAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    match_set_id: t.matchSetId,
    player_id: t.playerId,
    sequence: t.sequence,
    score_entered: t.scoreEntered,
    remaining_before: t.remainingBefore,
    remaining_after: t.remainingAfter,
    bust: t.bust,
    checkout_segment: t.checkoutSegment,
    checkout_multiplier: t.checkoutMultiplier,
    cancelled: t.cancelledAt !== null,
    created_at: t.createdAt.toISOString(),
  };
}

/**
 * Historique complet (y compris volées annulées, exposées via `cancelled: true` pour un
 * affichage transparent) d'une manche, dans l'ordre de saisie. Base de la reconstruction
 * d'état côté client — voir lib/utils/x01State.ts pour le calcul du restant/joueur actif à
 * partir de cette liste.
 */
export async function dbListMatchSetThrows(matchSetId: string) {
  const rows = await prisma.matchSetThrow.findMany({
    where: { matchSetId },
    orderBy: { sequence: "asc" },
  });
  return rows.map(mapMatchSetThrow);
}

type RecordThrowOutcome = {
  bust: boolean;
  reason: string | null;
  impossibleCheckout: boolean;
  matchSetFinished: boolean;
  matchFinished: boolean;
  match?: { id: string; tournamentId: string; bracketRound: number | null; quickMode: boolean };
  throwId: string;
  /** DO-SCORING-002 (Étape 2) — vrai uniquement en cas de rejeu d'une commande dont la volée a
   * depuis été annulée : le rejeu ne réapplique jamais l'effet, il le signale explicitement. */
  cancelled: boolean;
};
export type RecordThrowResult = { error: string } | RecordThrowOutcome;

/**
 * DO-SCORING-003 — reconstruction STRICTEMENT en lecture d'un rejeu de commande déjà appliquée
 * (`clientRequestId` retrouvé, paramètres identiques déjà vérifiés par l'appelant). N'écrit plus
 * JAMAIS : ni `MatchSetThrow`, ni `MatchSet`, ni `Match`, ni tournoi ; aucun appel à
 * `markWinnerDirectTx()`/`tryFinalizeMatch()` ; aucune progression DO-SPORT standard ou rapide ;
 * aucune modification de cible ni de vie.
 *
 * Défaut corrigé (Codex, post-DO-SCORING-002) : l'ancienne version rappelait
 * `markWinnerDirectTx()` pour toute volée de checkout encore non annulée — y compris quand cette
 * volée n'était PLUS celle qui déterminait le vainqueur réel du set (arbitrage entre-temps en
 * faveur d'un autre joueur). Un retry tardif du client A rejouait alors l'ANCIEN vainqueur A et
 * écrasait silencieusement la correction. Un replay n'a plus aucune autorité pour réparer ou
 * réappliquer quoi que ce soit : il reconstruit uniquement à partir des faits déjà tranchés au
 * moment de l'écriture d'origine (`row`).
 *
 * `matchSetFinished`/`matchFinished` sont toujours renvoyés à `false` : aucun appelant ne les
 * utilise pour autre chose que déclencher un effet (republier sur Mercure, lib/actions/score.ts)
 * — un replay, par construction, n'en produit jamais un nouveau. `cancelled` reste le signal
 * utile pour distinguer "commande historiquement appliquée" (false) de "volée depuis annulée"
 * (true) ; l'état RÉEL actuel du match (potentiellement changé par arbitrage) reste consultable
 * séparément (dbListMatchSetThrows/dbGetTournament), jamais recalculé ni réaffirmé ici.
 */
function replayThrowOutcome(row: { id: string; bust: boolean; cancelledAt: Date | null }): RecordThrowOutcome {
  return {
    bust: row.bust,
    reason: null,
    impossibleCheckout: false,
    matchSetFinished: false,
    matchFinished: false,
    match: undefined,
    throwId: row.id,
    cancelled: row.cancelledAt !== null,
  };
}

/**
 * DO-SCORING-001/002 — enregistrement atomique d'une volée X01, sous le verrou tournoi :
 * 1. idempotence STRICTE (DO-SCORING-002 Étape 1) — une clé `clientRequestId` déjà vue doit
 *    correspondre exactement à la même commande (même joueur, même score, même fléchette de
 *    fermeture) ; un rejeu identique renvoie le résultat déjà appliqué (ou son statut d'annulation,
 *    Étape 2), un rejeu avec des paramètres différents est refusé explicitement, sans écriture ;
 * 2. relit le set/match/round *sous le verrou*, jamais une valeur lue par l'appelant avant ;
 * 3. le match doit toujours accepter une saisie (IN_PROGRESS, manche pas déjà validée, pas
 *    Cricket) ;
 * 4. le joueur soumis doit être exactement celui attendu — l'alternance stricte se déduit du
 *    nombre de volées non annulées déjà enregistrées pour cette manche (jamais transmise par le
 *    client) : joueur 1 commence, puis alternance à chaque volée, bust compris ;
 * 5. applique les règles X01 existantes (lib/utils/x01.ts) PLUS la validation réelle de la
 *    fléchette de fermeture (DO-SCORING-002 Étape 5, voir plus bas) ;
 * 6. enregistre la volée (jamais un UPDATE — historique append-oriented) ;
 * 7. si la volée ferme la manche (restant à 0, pas de bust), déclenche la finalisation sportive
 *    déjà existante (markWinnerDirectTx → tryFinalizeMatch) ;
 * 8. DO-SCORING-002 (Étape 4) — si cette finalisation de manche finalise également le MATCH
 *    (dernière manche du match), la progression sportive nécessaire (création du tour suivant
 *    standard, ou avancement du tournoi rapide) est déclenchée avec CE MÊME `tx`, jamais un
 *    second verrou ni un appel séparé après le commit : volée + victoire de manche + victoire de
 *    match + libération de cible + progression + nouvel état tournoi forment une seule
 *    conséquence métier atomique. Si la progression échoue, l'erreur est propagée (jamais
 *    absorbée) — la transaction entière, y compris la volée de checkout, est annulée par
 *    PostgreSQL ; un nouvel essai (même `clientRequestId`) repart alors d'un état totalement
 *    propre, comme si rien n'avait été tenté.
 *
 * Ne fait jamais confiance à un "nouvel état" envoyé par le client : seuls `scoreEntered` et,
 * pour un checkout, `checkoutDart` (la saisie utilisateur) sont transmis — tout le reste (restant
 * avant/après, bust, joueur attendu, légalité de la fermeture) est recalculé côté serveur à
 * partir de l'historique réel en base.
 */
export async function dbRecordThrow(
  matchSetId: string,
  tournamentId: string,
  player: 1 | 2,
  scoreEntered: number,
  clientRequestId: string,
  checkoutDart?: CheckoutDart | null,
): Promise<RecordThrowResult> {
  if (!Number.isInteger(scoreEntered) || scoreEntered < 0 || scoreEntered > 180) {
    return { error: "Volée invalide (0 à 180)." };
  }
  if (checkoutDart != null && !isValidDartShape(checkoutDart)) {
    return { error: "Fléchette de fermeture invalide (segment ou multiplicateur)." };
  }

  return withTournamentLock(tournamentId, async (tx) => {
    const set = await tx.matchSet.findFirst({
      where: { id: matchSetId },
      include: {
        match: { select: { id: true, tournamentId: true, status: true, player1Id: true, player2Id: true } },
        round: { select: { gameType: true, finishType: true } },
      },
    });
    if (!set) return { error: "Manche introuvable." };
    if (set.match.tournamentId !== tournamentId) return { error: "Manche introuvable." };

    const p1Id = set.match.player1Id;
    const p2Id = set.match.player2Id;
    if (!p2Id) return { error: "Match incomplet (joueur manquant)." };
    const submittedPlayerId = player === 1 ? p1Id : p2Id;

    // Étape 1 (DO-SCORING-002) — idempotence stricte : une clé existante doit représenter une
    // commande immuable, jamais silencieusement rejouée avec des paramètres différents.
    const existing = await tx.matchSetThrow.findUnique({
      where: { matchSetId_clientRequestId: { matchSetId, clientRequestId } },
    });
    if (existing) {
      const sameCommand =
        existing.playerId === submittedPlayerId &&
        existing.scoreEntered === scoreEntered &&
        existing.checkoutSegment === (checkoutDart?.segment ?? null) &&
        existing.checkoutMultiplier === (checkoutDart?.multiplier ?? null);
      if (!sameCommand) {
        return {
          error:
            "Cet identifiant de volée a déjà été utilisé pour une commande différente : aucune écriture effectuée.",
        };
      }
      return replayThrowOutcome(existing);
    }

    if (set.round.gameType === "CRICKET") return { error: "Cette manche ne supporte pas la saisie de volées." };
    if (set.winnerId !== null) return { error: "Cette manche est déjà terminée." };
    if (set.match.status !== "IN_PROGRESS") return { error: "Ce match n'accepte plus de saisie." };

    const allThrows = await tx.matchSetThrow.findMany({
      where: { matchSetId },
      orderBy: { sequence: "asc" },
    });
    const activeThrows = allThrows.filter((t) => t.cancelledAt === null);

    const expectedPlayerId = activeThrows.length % 2 === 0 ? p1Id : p2Id;
    if (submittedPlayerId !== expectedPlayerId) {
      return { error: "Ce n'est pas au tour de ce joueur." };
    }

    const startScore = x01StartScore(set.round.gameType);
    const lastOwnThrow = [...activeThrows].reverse().find((t) => t.playerId === submittedPlayerId);
    const remainingBefore = lastOwnThrow ? lastOwnThrow.remainingAfter : startScore;
    const finishType = set.round.finishType as FinishType;

    const validation = validateVolee(scoreEntered, remainingBefore, finishType);

    // Étape 5 (DO-SCORING-002) — une volée qui atteint numériquement zéro n'est un checkout
    // VALIDE que si la fléchette de fermeture est fournie, structurellement légale, compatible
    // avec la volée saisie, respecte réellement la règle configurée (SINGLE : n'importe
    // laquelle ; DOUBLE : un double ; MASTER : un double ou un triple ; TRIPLE : un triple), ET
    // que le "préfixe" (le reste de la volée avant cette fléchette de fermeture) est lui-même
    // réalisable avec au plus deux fléchettes légales (DO-SCORING-003 — ex. une volée de 180
    // fermée par un simple D1 laisserait un préfixe de 178, strictement impossible : le maximum
    // réalisable en deux fléchettes est T20+T20=120). Sinon : bust, exactement comme les autres
    // violations de règle X01 déjà en place — jamais un gain accordé sur la seule foi du score
    // restant.
    let finalBust = validation.bust;
    let finalRemainingAfter = validation.remainingAfter;
    let finalReason = validation.reason;
    let persistedSegment: number | null = null;
    let persistedMultiplier: number | null = null;

    if (!validation.bust && validation.remainingAfter === 0) {
      if (!checkoutDart) {
        finalBust = true;
        finalRemainingAfter = remainingBefore;
        finalReason = "Bust ! Fléchette de fermeture manquante pour valider ce checkout.";
      } else if (checkoutDartValue(checkoutDart) > scoreEntered) {
        return { error: "La fléchette de fermeture ne peut pas dépasser la volée saisie." };
      } else {
        persistedSegment = checkoutDart.segment;
        persistedMultiplier = checkoutDart.multiplier;
        if (!satisfiesFinishType(checkoutDart, finishType)) {
          finalBust = true;
          finalRemainingAfter = remainingBefore;
          finalReason = `Bust ! La fermeture de cette manche exige ${finishRuleLabel(finishType)}.`;
        } else if (!isPrefixAchievable(scoreEntered - checkoutDartValue(checkoutDart))) {
          finalBust = true;
          finalRemainingAfter = remainingBefore;
          finalReason = "Bust ! Cette volée n'est pas réalisable avec au plus deux fléchettes avant la fermeture.";
        }
      }
    }

    const nextSequence = allThrows.length > 0 ? allThrows[allThrows.length - 1].sequence + 1 : 1;

    let created;
    try {
      created = await tx.matchSetThrow.create({
        data: {
          matchSetId,
          playerId: submittedPlayerId,
          sequence: nextSequence,
          scoreEntered,
          remainingBefore,
          remainingAfter: finalRemainingAfter,
          bust: finalBust,
          checkoutSegment: persistedSegment,
          checkoutMultiplier: persistedMultiplier,
          clientRequestId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Filet de sécurité DB : une exécution concurrente a inséré cette même commande entre
        // notre lecture d'idempotence et cet insert (ne devrait jamais arriver sous le verrou
        // tournoi déjà tenu, mais jamais le seul mécanisme — même discipline que DO-SPORT-001).
        const winner = await tx.matchSetThrow.findUnique({
          where: { matchSetId_clientRequestId: { matchSetId, clientRequestId } },
        });
        if (winner) return replayThrowOutcome(winner);
      }
      throw err;
    }

    let matchSetFinished = false;
    let finalize: Awaited<ReturnType<typeof markWinnerDirectTx>> = {};
    if (!finalBust && finalRemainingAfter === 0) {
      matchSetFinished = true;
      finalize = await markWinnerDirectTx(tx, matchSetId, submittedPlayerId);
    }

    const matchFinished = "matchFinished" in finalize ? (finalize.matchFinished ?? false) : false;
    const finalizedMatch = "match" in finalize ? finalize.match : undefined;

    // Étape 4 (DO-SCORING-002) — même frontière transactionnelle : si CE checkout vient de
    // finaliser le MATCH (pas seulement la manche), la progression sportive nécessaire tourne
    // ici, avec le même tx déjà verrouillé — jamais un second verrou, jamais un appel Prisma
    // global séparé après le commit.
    //
    // DO-BETA-001 — la répétition générale multi-cibles a révélé qu'une VRAIE erreur (tournoi
    // introuvable, incohérence) doit annuler tout le rollback comme prévu, MAIS que
    // doAdvanceToNextRoundTx() renvoie aussi `error` pour un cas parfaitement normal : "les
    // autres matchs de ce tour ne sont pas encore tous terminés" — la situation la plus banale
    // qui soit dès qu'un tournoi a plus d'une cible (le premier match à finir pendant que ses
    // co-équipiers de tour jouent encore). Avant ce correctif, CE cas annulait le checkout
    // lui-même (transaction entière annulée) — un joueur qui fermait correctement sa manche sur
    // la cible 1 pendant qu'un match tournait encore sur la cible 2 perdait sa volée. Seule une
    // vraie erreur reste fatale ici ; "tour pas encore complet" laisse le match déjà finalisé
    // (cible déjà libérée par markWinnerDirectTx ci-dessus) sans avancer le tour — exactement le
    // même traitement que lib/actions/score.ts::confirmWinner/markWinnerDirect appliquent déjà
    // au même retour d'erreur (`.catch(() => null)`), jamais un nouveau comportement inventé ici.
    if (matchFinished && finalizedMatch && finalizedMatch.bracketRound !== null) {
      const progression = finalizedMatch.quickMode
        ? await doAdvanceQuickTournamentTx(tx, tournamentId, finalizedMatch.id)
        : await doAdvanceToNextRoundTx(tx, tournamentId, finalizedMatch.bracketRound);
      if (progression.error && progression.error !== ROUND_INCOMPLETE_ERROR) {
        throw new Error(`Progression sportive impossible après ce checkout : ${progression.error}`);
      }
    }

    return {
      bust: finalBust,
      reason: finalReason,
      impossibleCheckout: validation.impossibleCheckout,
      matchSetFinished,
      matchFinished,
      match: finalizedMatch,
      throwId: created.id,
      cancelled: false,
    };
  });
}

/**
 * DO-SCORING-001 (Étape 6) — annule UNIQUEMENT la dernière volée non annulée d'une manche, sous
 * le verrou tournoi. Jamais une suppression (voir docblock de MatchSetThrow, schema.prisma) :
 * marque `cancelledAt`, ce qui suffit à faire disparaître son effet — y compris la fléchette de
 * fermeture éventuellement associée (DO-SCORING-002 Étape 6 : `checkoutSegment`/
 * `checkoutMultiplier` vivent sur la MÊME ligne, donc déjà exclus de toute reconstruction dès
 * que la ligne est filtrée par `cancelled`, sans code supplémentaire) — de toute reconstruction
 * d'état ultérieure.
 *
 * Idempotence : `cancelRequestId` identifie la commande d'annulation elle-même (distincte du
 * `clientRequestId` de la volée annulée) — un rejeu de la même commande renvoie le même résultat
 * sans tenter de ré-annuler une volée déjà annulée ni, pire, annuler une AUTRE volée devenue
 * entre-temps la "dernière" (double-clic, retry réseau sur la commande d'annulation elle-même).
 *
 * Limites volontaires (Étape 6 DO-SCORING-001 "limite importante", affinée par DO-SCORING-002
 * Étape 3) — refus explicite, sans écriture, dans trois cas :
 * - la manche a été clôturée manuellement par l'organisateur (dbMarkWinnerDirect/forceWinner)
 *   plutôt que par cette volée elle-même — annuler la volée ne restaurerait pas fidèlement un
 *   état dont elle n'est pas la cause ;
 * - le MATCH est déjà FINISHED : sa conséquence sportive est déjà propagée hors de la saisie X01
 *   (cible libérée, tour suivant/tournoi rapide potentiellement déjà avancés) — jamais de
 *   tentative de reconstruction rétroactive du tournoi ;
 * - une manche SUIVANTE (round_order supérieur, même match) a déjà commencé (au moins une volée
 *   active, ou un vainqueur déjà désigné) — rouvrir celle-ci laisserait deux manches "actives"
 *   simultanément, jamais un rollback multi-manches ici.
 */
export async function dbCancelLastThrow(
  matchSetId: string,
  tournamentId: string,
  cancelRequestId: string,
): Promise<{ error?: string; cancelledThrowId?: string }> {
  return withTournamentLock(tournamentId, async (tx) => {
    const existingCancel = await tx.matchSetThrow.findUnique({
      where: { matchSetId_cancelRequestId: { matchSetId, cancelRequestId } },
    });
    if (existingCancel) return { cancelledThrowId: existingCancel.id };

    const set = await tx.matchSet.findFirst({
      where: { id: matchSetId },
      include: {
        match: { select: { id: true, tournamentId: true, status: true } },
        round: { select: { roundOrder: true } },
      },
    });
    if (!set) return { error: "Manche introuvable." };
    if (set.match.tournamentId !== tournamentId) return { error: "Manche introuvable." };

    const last = await tx.matchSetThrow.findFirst({
      where: { matchSetId, cancelledAt: null },
      orderBy: { sequence: "desc" },
    });
    if (!last) return { error: "Aucune volée à annuler." };

    const wasCheckout = !last.bust && last.remainingAfter === 0;

    if (set.winnerId !== null && !wasCheckout) {
      return { error: "Cette manche a été clôturée manuellement par l'organisateur : l'annulation de volée ne s'applique pas ici." };
    }
    if (wasCheckout && set.match.status === "FINISHED") {
      return {
        error:
          "Cette volée a déjà clôturé le match et sa conséquence sportive a été propagée (cible libérée, tour suivant potentiellement généré) : elle ne peut plus être annulée.",
      };
    }

    // DO-SCORING-002 (Étape 3) — une manche déjà close ne peut être rouverte que si aucune
    // manche suivante n'a commencé (volée active, ou vainqueur déjà désigné).
    if (wasCheckout) {
      const laterSets = await tx.matchSet.findMany({
        where: { matchId: set.matchId, round: { roundOrder: { gt: set.round.roundOrder } } },
        select: { id: true, winnerId: true },
      });
      if (laterSets.length > 0) {
        const anyLaterHasWinner = laterSets.some((s) => s.winnerId !== null);
        const anyLaterHasActiveThrow = anyLaterHasWinner
          ? true
          : (await tx.matchSetThrow.count({
              where: { matchSetId: { in: laterSets.map((s) => s.id) }, cancelledAt: null },
            })) > 0;
        if (anyLaterHasWinner || anyLaterHasActiveThrow) {
          return {
            error: "Impossible d'annuler : une manche suivante a déjà commencé (volée enregistrée ou vainqueur désigné).",
          };
        }
      }
    }

    try {
      await tx.matchSetThrow.update({
        where: { id: last.id },
        data: { cancelledAt: new Date(), cancelRequestId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await tx.matchSetThrow.findUnique({
          where: { matchSetId_cancelRequestId: { matchSetId, cancelRequestId } },
        });
        if (winner) return { cancelledThrowId: winner.id };
      }
      throw err;
    }

    if (wasCheckout) {
      // La manche avait été validée par le checkout qu'on vient d'annuler — la rouvrir.
      await tx.matchSet.update({
        where: { id: matchSetId },
        data: { winnerId: null, validatedP1: false, validatedP2: false },
      });
    }

    return { cancelledThrowId: last.id };
  });
}

// ── Mode rapide — double élimination ─────────────────────────────────────────

/**
 * Retourne toutes les inscriptions PAID d'un tournoi avec leurs vies restantes.
 * Utilisé pour déterminer l'état du bracket en mode rapide.
 *
 * DO-SPORT-001 — paramétré par `tx` : appelé exclusivement depuis doAdvanceQuickTournament()
 * sous withTournamentLock(), jamais indépendamment (voir ce fichier, section avancement).
 */
export async function dbGetQuickTournamentState(tx: Prisma.TransactionClient, tournamentId: string) {
  const rows = await tx.registration.findMany({
    where: { tournamentId, status: "PAID" },
    select: {
      id: true,
      playerName: true,
      lives: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, player_name: r.playerName, lives: r.lives }));
}

/**
 * Décrémente les vies d'un joueur de 1 et retourne le nouveau compte.
 * Protégé par un floor à 0 pour éviter les valeurs négatives. Atomique par construction
 * (`{ decrement: 1 }` compile en `SET lives = lives - 1`, jamais une lecture puis écriture
 * séparées) — l'idempotence "exactement une fois par match terminé" est garantie par
 * l'appelant (Match.quickAdvanceProcessedAt, voir doAdvanceQuickTournament), pas ici : cette
 * fonction décrémente à chaque appel, par design.
 */
export async function dbDecrementLives(tx: Prisma.TransactionClient, registrationId: string): Promise<number> {
  const updated = await tx.registration.update({
    where: { id: registrationId },
    data: { lives: { decrement: 1 } },
    select: { lives: true },
  });
  // Sécurité : ne pas laisser passer en négatif (ne devrait pas arriver en prod)
  if (updated.lives < 0) {
    await tx.registration.update({ where: { id: registrationId }, data: { lives: 0 } });
    return 0;
  }
  return updated.lives;
}

/**
 * Remet les vies de tous les joueurs PAID d'un tournoi à 2.
 * Appelé lors de la (re)génération du bracket rapide.
 */
export async function dbResetAllLives(tx: Prisma.TransactionClient, tournamentId: string): Promise<void> {
  await tx.registration.updateMany({
    where: { tournamentId, status: "PAID" },
    data: { lives: 2 },
  });
}

/**
 * Retourne les matchs de bracket encore actifs (non FINISHED) en mode rapide.
 * Exclut les matchs de poule (poolId non null).
 */
export async function dbGetActiveQuickBracketMatches(tx: Prisma.TransactionClient, tournamentId: string) {
  const rows = await tx.match.findMany({
    where: {
      tournamentId,
      poolId: null,
      status: { not: "FINISHED" },
      bracketType: { in: ["WINNERS", "LOSERS", "GRAND_FINAL"] },
    },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      bracketType: true,
      bracketRound: true,
    },
  });
  return rows.map((m) => ({
    id: m.id,
    player1_id: m.player1Id,
    player2_id: m.player2Id,
    bracket_type: m.bracketType,
    bracket_round: m.bracketRound,
  }));
}

/**
 * Supprime tous les matchs de bracket quickMode (WINNERS, LOSERS, GRAND_FINAL)
 * et les rounds associés. Appelé lors de la régénération du bracket rapide.
 */
export async function dbDeleteQuickBracketMatchesAndRounds(tx: Prisma.TransactionClient, tournamentId: string): Promise<void> {
  await tx.match.deleteMany({
    where: {
      tournamentId,
      poolId: null,
      bracketType: { in: ["WINNERS", "LOSERS", "GRAND_FINAL"] },
    },
  });
  await tx.round.deleteMany({ where: { tournamentId } });
}

/**
 * Crée les 3 rounds (manche unique par match) pour le mode rapide.
 * Ordre : 1=501, 2=Cricket, 3=701.
 * Retourne les IDs pour être passés lors de la création des matchs.
 */
export async function dbCreateQuickTournamentRounds(
  tx: Prisma.TransactionClient,
  tournamentId: string
): Promise<{ id501: string; idCricket: string; id701: string }> {
  const r501 = await tx.round.create({
    data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" },
    select: { id: true },
  });
  const rCricket = await tx.round.create({
    data: { tournamentId, roundOrder: 2, gameType: "CRICKET", entryType: "SINGLE", finishType: "SINGLE" },
    select: { id: true },
  });
  const r701 = await tx.round.create({
    data: { tournamentId, roundOrder: 3, gameType: "701", entryType: "SINGLE", finishType: "DOUBLE" },
    select: { id: true },
  });
  return { id501: r501.id, idCricket: rCricket.id, id701: r701.id };
}

/**
 * Récupère les IDs des 3 rounds quickMode d'un tournoi (501, Cricket, 701).
 * Retourne null si les rounds n'ont pas encore été créés.
 */
export async function dbGetQuickTournamentRoundIds(
  tx: Prisma.TransactionClient,
  tournamentId: string
): Promise<{ id501: string; idCricket: string; id701: string } | null> {
  const rounds = await tx.round.findMany({
    where: { tournamentId },
    select: { id: true, gameType: true },
    orderBy: { roundOrder: "asc" },
  });
  const r501     = rounds.find((r) => r.gameType === "501");
  const rCricket = rounds.find((r) => r.gameType === "CRICKET");
  const r701     = rounds.find((r) => r.gameType === "701");
  if (!r501 || !rCricket || !r701) return null;
  return { id501: r501.id, idCricket: rCricket.id, id701: r701.id };
}

/**
 * Promeut les matchs PENDING (board=0) vers les cibles libres après création dynamique.
 * Appelé après chaque génération de matchs en mode rapide pour éviter les cibles vides.
 *
 * DO-SPORT-001 (Étape 4) — paramétré par `tx`, toujours appelé depuis l'intérieur d'une
 * transaction déjà verrouillée sur le tournoi (withTournamentLock) : la lecture des cibles
 * libres puis l'affectation des matchs en attente ne peuvent plus s'entrelacer avec un appel
 * concurrent pour le même tournoi — jamais deux matchs promus sur la même cible libérée.
 */
export async function dbPromoteUnassignedMatches(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  nbBoards: number
): Promise<void> {
  const activeMatches = await tx.match.findMany({
    where: { tournamentId, status: "IN_PROGRESS", boardNumber: { gt: 0 } },
    select: { boardNumber: true },
  });
  const usedBoards = new Set(activeMatches.map((m) => m.boardNumber));

  const freeBoards: number[] = [];
  for (let i = 1; i <= nbBoards; i++) {
    if (!usedBoards.has(i)) freeBoards.push(i);
  }
  if (freeBoards.length === 0) return;

  const pending = await tx.match.findMany({
    where: { tournamentId, status: "PENDING", boardNumber: 0 },
    select: { id: true },
    orderBy: { id: "asc" },
    take: freeBoards.length,
  });

  for (let i = 0; i < pending.length; i++) {
    await tx.match.update({
      where: { id: pending[i].id },
      data: { status: "IN_PROGRESS", boardNumber: freeBoards[i] },
    });
  }
}

/** Sélectionne l'ID du round correspondant au format de jeu demandé (fallback 501). */
export function selectRoundId(
  roundIds: { id501: string; idCricket: string; id701: string },
  gameType: string,
): string {
  if (gameType === "CRICKET") return roundIds.idCricket;
  if (gameType === "701") return roundIds.id701;
  return roundIds.id501;
}

/**
 * DO-SPORT-001, déplacé et rendu tx-first par DO-SCORING-002 — même logique que
 * doAdvanceToNextRoundTx() ci-dessus, pour le mode rapide : perte de vie, calcul des joueurs
 * disponibles, création Grande Finale/nouveaux matchs WB/LB, promotion des cibles libres, et
 * clôture du tournoi si c'était le dernier match actif — le tout sous le `tx` fourni par
 * l'appelant, jamais un second verrou. Appelée par lib/actions/quickTournament.ts::
 * doAdvanceQuickTournament() (son propre withTournamentLock()) ET par dbRecordThrow()
 * ci-dessous (bien que la saisie X01 volée-par-volée ne concerne en pratique jamais le mode
 * rapide — le tournoi rapide reste toujours arbitré directement, voir CLAUDE.md — ce branchement
 * est conservé par symétrie avec dbConfirmWinner/dbMarkWinnerDirect qui gèrent déjà les deux
 * modes de façon générique).
 */
export async function doAdvanceQuickTournamentTx(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  finishedMatchId: string,
): Promise<{ error?: string; finished?: boolean }> {
  const tournament = await dbGetTournament(tournamentId, tx);
  if (!tournament) return { error: "Tournoi introuvable." };

  const finishedMatch = await tx.match.findUnique({
    where: { id: finishedMatchId },
    select: { player1Id: true, player2Id: true, winnerId: true, quickAdvanceProcessedAt: true },
  });
  if (!finishedMatch || !finishedMatch.winnerId) return {};
  if (finishedMatch.quickAdvanceProcessedAt !== null) return {}; // déjà traité — rejeu sans effet

  const loserId =
    finishedMatch.winnerId === finishedMatch.player1Id
      ? finishedMatch.player2Id
      : finishedMatch.player1Id;
  if (!loserId) return {};

  // Marqué avant toute autre écriture, dans la même transaction : si tout le reste échoue,
  // le rollback annule aussi ce marquage — jamais un match marqué "traité" sans l'avoir
  // réellement été.
  await tx.match.update({ where: { id: finishedMatchId }, data: { quickAdvanceProcessedAt: new Date() } });

  await dbDecrementLives(tx, loserId);

  const [allPlayers, activeMatches, roundIds] = await Promise.all([
    dbGetQuickTournamentState(tx, tournamentId),
    dbGetActiveQuickBracketMatches(tx, tournamentId),
    dbGetQuickTournamentRoundIds(tx, tournamentId),
  ]);
  if (!roundIds) return { error: "Erreur lors de la récupération de l'état du tournoi." };

  const activePlayers = allPlayers.filter((p) => p.lives > 0);
  const totalActive = activePlayers.length;

  // Joueurs actuellement dans un match actif
  const inMatchIds = new Set<string>(
    activeMatches.flatMap((m) => [m.player1_id, m.player2_id].filter(Boolean) as string[]),
  );

  // Joueurs disponibles par bracket
  const availableWB = activePlayers.filter((p) => p.lives === 2 && !inMatchIds.has(p.id));
  const availableLB = activePlayers.filter((p) => p.lives === 1 && !inMatchIds.has(p.id));

  // ── Fin de tournoi ─────────────────────────────────────────────────────────
  if (totalActive <= 1 && activeMatches.length === 0) {
    if (tournament.status !== "FINISHED") {
      await dbUpdateTournamentStatusTx(tx, tournamentId, "FINISHED");
    }
    return { finished: true };
  }

  // ── Grande Finale ─────────────────────────────────────────────────────────
  // Condition : exactement 1 WB + 1 LB disponibles, aucun autre match actif
  if (
    availableWB.length === 1 &&
    availableLB.length === 1 &&
    totalActive === 2 &&
    activeMatches.length === 0
  ) {
    const maxGFRound = await tx.match.aggregate({
      where: { tournamentId, bracketType: "GRAND_FINAL" },
      _max: { bracketRound: true },
    });
    const gfRound = (maxGFRound._max.bracketRound ?? 0) + 1;
    const format = getQuickModeGameFormat(totalActive, "GRAND_FINAL");
    const roundId = selectRoundId(roundIds, format.game_type);

    await bulkCreateMatchesTx(tx, tournamentId, [{
      player1Id: availableWB[0].id,
      player2Id: availableLB[0].id,
      bracketRound: gfRound,
      bracketPosition: 0,
      boardNumber: 0,
      status: "PENDING",
      roundIds: [roundId],
      bracketType: "GRAND_FINAL" as BracketType,
    }]);

    await dbPromoteUnassignedMatches(tx, tournamentId, tournament.nb_boards);
    return {};
  }

  // ── Nouveaux matchs WB ────────────────────────────────────────────────────
  const newMatches: Parameters<typeof bulkCreateMatchesTx>[2] = [];

  if (availableWB.length >= 2) {
    const wbPairs = pairPlayers(availableWB.map((p) => p.id));
    const maxWBRound = await tx.match.aggregate({
      where: { tournamentId, bracketType: "WINNERS" },
      _max: { bracketRound: true },
    });
    const nextWBRound = (maxWBRound._max.bracketRound ?? 0) + 1;
    const wbFormat = getQuickModeGameFormat(totalActive, "WINNERS");
    const wbRoundId = selectRoundId(roundIds, wbFormat.game_type);

    wbPairs.forEach((pair, i) => {
      newMatches.push({
        player1Id: pair[0],
        player2Id: pair[1],
        bracketRound: nextWBRound,
        bracketPosition: i,
        boardNumber: 0,
        status: "PENDING",
        roundIds: [wbRoundId],
        bracketType: "WINNERS" as BracketType,
      });
    });
  }

  // ── Nouveaux matchs LB ────────────────────────────────────────────────────
  if (availableLB.length >= 2) {
    const lbPairs = pairPlayers(availableLB.map((p) => p.id));
    const maxLBRound = await tx.match.aggregate({
      where: { tournamentId, bracketType: "LOSERS" },
      _max: { bracketRound: true },
    });
    const nextLBRound = (maxLBRound._max.bracketRound ?? 0) + 1;
    const lbFormat = getQuickModeGameFormat(totalActive, "LOSERS");
    const lbRoundId = selectRoundId(roundIds, lbFormat.game_type);

    lbPairs.forEach((pair, i) => {
      newMatches.push({
        player1Id: pair[0],
        player2Id: pair[1],
        bracketRound: nextLBRound,
        bracketPosition: i,
        boardNumber: 0,
        status: "PENDING",
        roundIds: [lbRoundId],
        bracketType: "LOSERS" as BracketType,
      });
    });
  }

  if (newMatches.length > 0) {
    await bulkCreateMatchesTx(tx, tournamentId, newMatches);
  }

  // Promouvoir les matchs en attente vers les cibles libres
  await dbPromoteUnassignedMatches(tx, tournamentId, tournament.nb_boards);

  return {};
}

// ── Organization (liaison BApps Studio / SterPlatform) ────────────────────────

export async function dbGetOrganization(userId: string) {
  return prisma.organization.findUnique({ where: { userId } });
}

export async function dbSetOrganizationSlug(userId: string, sterOrganizationSlug: string) {
  return prisma.organization.upsert({
    where: { userId },
    create: { userId, sterOrganizationSlug },
    update: { sterOrganizationSlug },
  });
}

export async function dbClearOrganizationSlug(userId: string) {
  await prisma.organization.updateMany({
    where: { userId },
    data: { sterOrganizationSlug: null },
  });
}

export async function dbUpdateRegistrationPaymentId(registrationId: string, sterPaymentId: string) {
  await prisma.registration.update({
    where: { id: registrationId },
    data: { sterPaymentId },
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
    ster_payment_id: r.sterPaymentId,
    tournament_name: r.tournament.name,
    tournament_date: dateFr,
    tournament_location: r.tournament.location,
  };
}
