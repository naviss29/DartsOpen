import { describe, it, expect, vi, beforeEach } from "vitest";

// SEC-001 — proposeWinner/confirmWinner/disputeResult vérifiaient l'authentification via
// getUser() mais jamais que l'utilisateur authentifié était réellement l'un des deux joueurs
// du match, ni que le matchSetId transmis appartenait au tournamentId transmis. Ces tests
// démontrent que ces trois actions (et markWinnerDirect, déjà organisateur-only, pour la
// cohérence des identifiants) refusent désormais toute action non autorisée — cf.
// lib/actions/scoreAuthorization.test.ts pour la logique d'autorisation elle-même.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));
vi.mock("@/lib/actions/access", () => ({ getOwnedTournament: vi.fn() }));
vi.mock("@/lib/actions/scoreAuthorization", () => ({
  loadMatchSetChain: vi.fn(),
  resolveAuthorizedSide: vi.fn(),
  isValidMatchPlayer: vi.fn(),
}));
vi.mock("@/lib/db/tournament", () => ({
  dbProposeWinner: vi.fn(),
  dbConfirmWinner: vi.fn(),
  dbDisputeResult: vi.fn(),
  dbMarkWinnerDirect: vi.fn(),
}));
vi.mock("@/lib/actions/bracket", () => ({ doAdvanceToNextRound: vi.fn() }));
vi.mock("@/lib/actions/quickTournament", () => ({ doAdvanceQuickTournament: vi.fn() }));
vi.mock("@/lib/mercure", () => ({ publishMatchUpdate: vi.fn() }));

const { proposeWinner, confirmWinner, disputeResult, markWinnerDirect } = await import("./score");
const { getUser } = await import("@/lib/api/auth");
const { getOwnedTournament } = await import("@/lib/actions/access");
const { loadMatchSetChain, resolveAuthorizedSide, isValidMatchPlayer } = await import(
  "@/lib/actions/scoreAuthorization"
);
const { dbProposeWinner, dbConfirmWinner, dbDisputeResult, dbMarkWinnerDirect } = await import(
  "@/lib/db/tournament"
);

const PLAYER_A = { id: "user-a", email: "alice@example.com", roles: [], isVerified: true };
const PLAYER_B = { id: "user-b", email: "bob@example.com", roles: [], isVerified: true };
const STRANGER = { id: "user-x", email: "mallory@example.com", roles: [], isVerified: true };
const ORGANIZER = { id: "user-org", email: "organisateur@example.com", roles: [], isVerified: true };

const CHAIN = {
  match: { id: "match-1", tournamentId: "tournament-1", player1Id: "reg-1", player2Id: "reg-2" },
  player1Email: "alice@example.com",
  player2Email: "bob@example.com",
};

beforeEach(() => {
  vi.mocked(getUser).mockReset();
  vi.mocked(getOwnedTournament).mockReset();
  vi.mocked(loadMatchSetChain).mockReset();
  vi.mocked(resolveAuthorizedSide).mockReset();
  vi.mocked(isValidMatchPlayer).mockReset().mockReturnValue(true);
  vi.mocked(dbProposeWinner).mockReset().mockResolvedValue({ set: {} } as never);
  vi.mocked(dbConfirmWinner).mockReset().mockResolvedValue({} as never);
  vi.mocked(dbDisputeResult).mockReset().mockResolvedValue({} as never);
  vi.mocked(dbMarkWinnerDirect).mockReset().mockResolvedValue({} as never);
});

describe("proposeWinner — SEC-001", () => {
  it("refuse un utilisateur non authentifié", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const result = await proposeWinner("set-1", "reg-1", 1, "tournament-1");

    expect(result.error).toMatch(/authentifi/i);
    expect(loadMatchSetChain).not.toHaveBeenCalled();
    expect(dbProposeWinner).not.toHaveBeenCalled();
  });

  it("refuse quand le matchSetId ne correspond pas au tournamentId réel (identifiant manipulé)", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_A as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(null);

    const result = await proposeWinner("set-1", "reg-1", 1, "tournament-AUTRE");

    expect(result.error).toBeDefined();
    expect(dbProposeWinner).not.toHaveBeenCalled();
  });

  it("refuse un utilisateur authentifié mais étranger au match", async () => {
    vi.mocked(getUser).mockResolvedValue(STRANGER as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(null);

    const result = await proposeWinner("set-1", "reg-1", 1, "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbProposeWinner).not.toHaveBeenCalled();
  });

  it("l'organisateur du tournoi n'a pas de droit spécial ici s'il n'est pas lui-même un joueur du match", async () => {
    vi.mocked(getUser).mockResolvedValue(ORGANIZER as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(null);

    const result = await proposeWinner("set-1", "reg-1", 1, "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbProposeWinner).not.toHaveBeenCalled();
  });

  it("refuse quand le playerSide fourni par le client ne correspond pas au côté réellement calculé côté serveur (falsification)", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_B as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(2);

    const result = await proposeWinner("set-1", "reg-2", 1, "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbProposeWinner).not.toHaveBeenCalled();
  });

  it("refuse un winnerId étranger au match même pour un joueur autorisé sur son côté", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_A as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(1);
    vi.mocked(isValidMatchPlayer).mockReturnValue(false);

    const result = await proposeWinner("set-1", "reg-intrus", 1, "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbProposeWinner).not.toHaveBeenCalled();
  });

  it("joueur A (côté 1) peut proposer un vainqueur — parcours légitime", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_A as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(1);

    const result = await proposeWinner("set-1", "reg-1", 1, "tournament-1");

    expect(result.error).toBeUndefined();
    expect(dbProposeWinner).toHaveBeenCalledWith("set-1", "reg-1", 1);
  });

  it("joueur B (côté 2) peut proposer un vainqueur — parcours légitime", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_B as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(2);

    const result = await proposeWinner("set-1", "reg-2", 2, "tournament-1");

    expect(result.error).toBeUndefined();
    expect(dbProposeWinner).toHaveBeenCalledWith("set-1", "reg-2", 2);
  });
});

describe("confirmWinner — SEC-001", () => {
  it("refuse un utilisateur non authentifié", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const result = await confirmWinner("set-1", 1, "tournament-1");

    expect(result.error).toMatch(/authentifi/i);
    expect(dbConfirmWinner).not.toHaveBeenCalled();
  });

  it("refuse un utilisateur étranger au match", async () => {
    vi.mocked(getUser).mockResolvedValue(STRANGER as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(null);

    const result = await confirmWinner("set-1", 1, "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbConfirmWinner).not.toHaveBeenCalled();
  });

  it("refuse la falsification du playerSide", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_A as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(1);

    const result = await confirmWinner("set-1", 2, "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbConfirmWinner).not.toHaveBeenCalled();
  });

  it("refuse quand le matchSetId ne correspond pas au tournamentId réel", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_A as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(null);

    const result = await confirmWinner("set-1", 1, "tournament-AUTRE");

    expect(result.error).toBeDefined();
    expect(dbConfirmWinner).not.toHaveBeenCalled();
  });

  it("joueur B peut confirmer son côté — parcours légitime, avancement du bracket toujours déclenché", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_B as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(2);
    vi.mocked(dbConfirmWinner).mockResolvedValue({
      matchFinished: true,
      match: { id: "match-1", tournamentId: "tournament-1", bracketRound: 1, quickMode: false },
    } as never);
    const { doAdvanceToNextRound } = await import("@/lib/actions/bracket");
    vi.mocked(doAdvanceToNextRound).mockResolvedValue(undefined as never);
    const { publishMatchUpdate } = await import("@/lib/mercure");
    vi.mocked(publishMatchUpdate).mockResolvedValue(undefined as never);

    const result = await confirmWinner("set-1", 2, "tournament-1");

    expect(result.error).toBeUndefined();
    expect(dbConfirmWinner).toHaveBeenCalledWith("set-1", 2);
    expect(doAdvanceToNextRound).toHaveBeenCalledWith("tournament-1", 1);
  });
});

describe("disputeResult — SEC-001", () => {
  it("refuse un utilisateur non authentifié", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const result = await disputeResult("set-1", "tournament-1");

    expect(result.error).toMatch(/authentifi/i);
    expect(dbDisputeResult).not.toHaveBeenCalled();
  });

  it("refuse un utilisateur étranger au match", async () => {
    vi.mocked(getUser).mockResolvedValue(STRANGER as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(null);

    const result = await disputeResult("set-1", "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbDisputeResult).not.toHaveBeenCalled();
  });

  it("refuse quand le matchSetId ne correspond pas au tournamentId réel", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_A as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(null);

    const result = await disputeResult("set-1", "tournament-AUTRE");

    expect(result.error).toBeDefined();
    expect(dbDisputeResult).not.toHaveBeenCalled();
  });

  it("un joueur du match peut contester (aucun playerSide n'est requis pour cette action) — parcours légitime", async () => {
    vi.mocked(getUser).mockResolvedValue(PLAYER_A as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(resolveAuthorizedSide).mockReturnValue(1);

    const result = await disputeResult("set-1", "tournament-1");

    expect(result.error).toBeUndefined();
    expect(dbDisputeResult).toHaveBeenCalledWith("set-1");
  });
});

describe("markWinnerDirect — organisateur uniquement (droit déjà prévu), cohérence des identifiants (SEC-001)", () => {
  it("propage le refus de getOwnedTournament si l'appelant n'est pas l'organisateur du tournoi", async () => {
    vi.mocked(getOwnedTournament).mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(markWinnerDirect("set-1", "reg-1", "tournament-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadMatchSetChain).not.toHaveBeenCalled();
    expect(dbMarkWinnerDirect).not.toHaveBeenCalled();
  });

  it("l'organisateur du tournoi peut désigner un vainqueur — droit déjà prévu par le produit (mode traditionnel)", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-org" } as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);

    const result = await markWinnerDirect("set-1", "reg-1", "tournament-1");

    expect(result.error).toBeUndefined();
    expect(dbMarkWinnerDirect).toHaveBeenCalledWith("set-1", "reg-1");
  });

  it("refuse même l'organisateur si le set appartient réellement à un autre tournoi (tournamentId manipulé)", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-org" } as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(null);

    const result = await markWinnerDirect("set-1", "reg-1", "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbMarkWinnerDirect).not.toHaveBeenCalled();
  });

  it("refuse un winnerId étranger au match", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-org" } as never);
    vi.mocked(loadMatchSetChain).mockResolvedValue(CHAIN as never);
    vi.mocked(isValidMatchPlayer).mockReturnValue(false);

    const result = await markWinnerDirect("set-1", "reg-intrus", "tournament-1");

    expect(result.error).toBeDefined();
    expect(dbMarkWinnerDirect).not.toHaveBeenCalled();
  });
});
