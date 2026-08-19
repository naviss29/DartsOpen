import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { matchSet: { findUnique: vi.fn() } },
}));

const { prisma } = await import("@/lib/db/client");
const { loadMatchSetChain, resolveAuthorizedSide, isValidMatchPlayer } = await import("./scoreAuthorization");

function dbSetRow(matchOverrides: Record<string, unknown> = {}) {
  return {
    round: { gameType: "501" },
    match: {
      id: "match-1",
      tournamentId: "tournament-1",
      player1Id: "reg-1",
      player2Id: "reg-2",
      player1: { playerEmail: "alice@example.com" },
      player2: { playerEmail: "bob@example.com" },
      ...matchOverrides,
    },
  };
}

beforeEach(() => {
  vi.mocked(prisma.matchSet.findUnique).mockReset();
});

describe("loadMatchSetChain", () => {
  it("retourne null si le set n'existe pas", async () => {
    vi.mocked(prisma.matchSet.findUnique).mockResolvedValue(null);

    const chain = await loadMatchSetChain("set-inexistant", "tournament-1");

    expect(chain).toBeNull();
  });

  it("retourne null si le tournamentId transmis par le client ne correspond pas au tournoi réel du match (identifiant manipulé)", async () => {
    vi.mocked(prisma.matchSet.findUnique).mockResolvedValue(dbSetRow() as never);

    const chain = await loadMatchSetChain("set-1", "tournament-AUTRE");

    expect(chain).toBeNull();
  });

  it("charge la chaîne réelle set → match → tournoi et les e-mails des deux joueurs quand tout correspond", async () => {
    vi.mocked(prisma.matchSet.findUnique).mockResolvedValue(dbSetRow() as never);

    const chain = await loadMatchSetChain("set-1", "tournament-1");

    expect(chain).toEqual({
      match: { id: "match-1", tournamentId: "tournament-1", player1Id: "reg-1", player2Id: "reg-2" },
      player1Email: "alice@example.com",
      player2Email: "bob@example.com",
      gameType: "501",
    });
  });

  it("gère un match sans second joueur (bye) : player2Email vaut null au lieu de planter", async () => {
    vi.mocked(prisma.matchSet.findUnique).mockResolvedValue(
      dbSetRow({ player2Id: null, player2: null }) as never
    );

    const chain = await loadMatchSetChain("set-1", "tournament-1");

    expect(chain?.player2Email).toBeNull();
  });
});

describe("resolveAuthorizedSide", () => {
  const chain = {
    match: { id: "match-1", tournamentId: "tournament-1", player1Id: "reg-1", player2Id: "reg-2" },
    player1Email: "alice@example.com",
    player2Email: "bob@example.com",
    gameType: "501",
  };

  function user(email: string) {
    return { id: "user-x", email, roles: [], isVerified: true };
  }

  it("reconnaît le côté 1 par correspondance d'e-mail", () => {
    expect(resolveAuthorizedSide(user("alice@example.com"), chain)).toBe(1);
  });

  it("reconnaît le côté 2 par correspondance d'e-mail", () => {
    expect(resolveAuthorizedSide(user("bob@example.com"), chain)).toBe(2);
  });

  it("la comparaison ignore la casse et les espaces superflus", () => {
    expect(resolveAuthorizedSide(user("  ALICE@Example.com "), chain)).toBe(1);
  });

  it("refuse un utilisateur authentifié dont l'e-mail ne correspond à aucun des deux joueurs", () => {
    expect(resolveAuthorizedSide(user("mallory@example.com"), chain)).toBeNull();
  });

  it("refuse quand le second joueur n'existe pas (bye) même si l'e-mail est vide côté client", () => {
    const byeChain = { ...chain, player2Email: null };
    expect(resolveAuthorizedSide(user("bob@example.com"), byeChain)).toBeNull();
  });
});

describe("isValidMatchPlayer", () => {
  const chain = {
    match: { id: "match-1", tournamentId: "tournament-1", player1Id: "reg-1", player2Id: "reg-2" },
    player1Email: "alice@example.com",
    player2Email: "bob@example.com",
    gameType: "501",
  };

  it("accepte le player1Id du match", () => {
    expect(isValidMatchPlayer(chain, "reg-1")).toBe(true);
  });

  it("accepte le player2Id du match", () => {
    expect(isValidMatchPlayer(chain, "reg-2")).toBe(true);
  });

  it("refuse un identifiant de joueur étranger au match", () => {
    expect(isValidMatchPlayer(chain, "reg-intrus")).toBe(false);
  });
});
