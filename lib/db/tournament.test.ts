import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMatch = vi.fn();
const findManyPool = vi.fn();
const findFirstMatch = vi.fn();
const findFirstPoolPlayer = vi.fn();
const deleteManyRegistration = vi.fn();
const updateManyRegistration = vi.fn();

vi.mock("./client", () => ({
  prisma: {
    match: {
      findMany: (...args: unknown[]) => findManyMatch(...args),
      findFirst: (...args: unknown[]) => findFirstMatch(...args),
    },
    pool: { findMany: (...args: unknown[]) => findManyPool(...args) },
    poolPlayer: { findFirst: (...args: unknown[]) => findFirstPoolPlayer(...args) },
    registration: {
      deleteMany: (...args: unknown[]) => deleteManyRegistration(...args),
      updateMany: (...args: unknown[]) => updateManyRegistration(...args),
    },
  },
}));

import {
  dbListMatches,
  dbListPools,
  dbEraseRegistration,
  dbUpdateRegistration,
  dbAnonymizeExpiredContacts,
  CONTACT_RETENTION_MONTHS,
} from "./tournament";

beforeEach(() => {
  findFirstMatch.mockReset();
  findFirstPoolPlayer.mockReset();
  deleteManyRegistration.mockReset();
  updateManyRegistration.mockReset();
  updateManyRegistration.mockResolvedValue({ count: 0 });
});

/**
 * Simule ce que Prisma renverrait si le `select`/`include` d'un appel était un
 * jour élargi par erreur (régression) vers l'ensemble des colonnes de
 * `Registration` — reproduit exactement la fuite corrigée par BAPPS-LEGAL-005
 * (§2/§4) : `mapMatch`/`mapPool` ne doivent plus jamais transmettre ces champs,
 * quoi que Prisma renvoie en amont.
 */
function overFetchedRegistration(overrides: { id: string; playerName: string; lives?: number }) {
  return {
    id: overrides.id,
    tournamentId: "t1",
    playerName: overrides.playerName,
    playerEmail: "joueur@example.com",
    playerPhone: "0612345678",
    playerNames: [],
    status: "PAID",
    qrCodeToken: "secret-qr-token",
    sterPaymentId: "pi_secret",
    entryFeeCents: 1000,
    platformFeeCents: 100,
    feeCollected: true,
    seeded: false,
    lives: overrides.lives ?? 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

const FORBIDDEN_KEYS = [
  "player_email",
  "player_phone",
  "qr_code_token",
  "ster_payment_id",
  "entry_fee_cents",
  "platform_fee_cents",
  "fee_collected",
  "status",
  "seeded",
  "created_at",
  "tournament_id",
];

describe("dbListMatches — aucune donnée personnelle/technique sur une route publique (BAPPS-LEGAL-005 §2/§4)", () => {
  it("ne transmet jamais email/téléphone/qrCodeToken/identifiant de paiement pour player1/player2, même si Prisma renvoie la ligne Registration complète", async () => {
    findManyMatch.mockResolvedValue([
      {
        id: "m1",
        tournamentId: "t1",
        poolId: null,
        bracketRound: 1,
        bracketPosition: 1,
        boardNumber: 1,
        bracketType: "SINGLE",
        status: "FINISHED",
        player1Id: "r1",
        player2Id: "r2",
        winnerId: "r1",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        sets: [],
        player1: overFetchedRegistration({ id: "r1", playerName: "Alice" }),
        player2: overFetchedRegistration({ id: "r2", playerName: "Bob" }),
      },
    ]);

    const [match] = await dbListMatches("t1");

    for (const key of FORBIDDEN_KEYS) {
      expect(match.player1).not.toHaveProperty(key);
      expect(match.player2).not.toHaveProperty(key);
    }
    expect(match.player1).toEqual({ id: "r1", player_name: "Alice", lives: 2 });
    expect(match.player2).toEqual({ id: "r2", player_name: "Bob", lives: 2 });
  });

  it("transmet toujours id/player_name/lives (nécessaires à l'affichage live/TV)", async () => {
    findManyMatch.mockResolvedValue([
      {
        id: "m1",
        tournamentId: "t1",
        poolId: null,
        bracketRound: null,
        bracketPosition: null,
        boardNumber: 1,
        bracketType: "WINNERS",
        status: "IN_PROGRESS",
        player1Id: "r1",
        player2Id: "r2",
        winnerId: null,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        sets: [],
        player1: overFetchedRegistration({ id: "r1", playerName: "Alice", lives: 1 }),
        player2: overFetchedRegistration({ id: "r2", playerName: "Bob", lives: 2 }),
      },
    ]);

    const [match] = await dbListMatches("t1");

    expect(match.player1?.lives).toBe(1);
    expect(match.player2?.lives).toBe(2);
  });
});

describe("dbListPools — aucune donnée personnelle/technique sur une route publique (BAPPS-LEGAL-005 §2/§4)", () => {
  it("ne transmet jamais l'objet registration complet, même si Prisma le renvoie", async () => {
    findManyPool.mockResolvedValue([
      {
        id: "p1",
        tournamentId: "t1",
        name: "Poule A",
        players: [
          {
            registrationId: "r1",
            rank: 1,
            registration: overFetchedRegistration({ id: "r1", playerName: "Alice" }),
          },
        ],
        matches: [],
      },
    ]);

    const [pool] = await dbListPools("t1");
    const [player] = pool.players;

    expect(player).not.toHaveProperty("registration");
    for (const key of FORBIDDEN_KEYS) {
      expect(player).not.toHaveProperty(key);
    }
    expect(player).toEqual({ pool_id: "p1", registration_id: "r1", rank: 1, id: "r1", player_name: "Alice" });
  });
});

describe("dbEraseRegistration (BAPPS-LEGAL-005 §8)", () => {
  it("supprime réellement une inscription sans aucun match ni poule associés (tournoi à venir)", async () => {
    findFirstMatch.mockResolvedValue(null);
    findFirstPoolPlayer.mockResolvedValue(null);

    const result = await dbEraseRegistration("r1", "t1");

    expect(result).toEqual({ anonymized: false });
    expect(deleteManyRegistration).toHaveBeenCalledWith({ where: { id: "r1", tournamentId: "t1" } });
    expect(updateManyRegistration).not.toHaveBeenCalled();
  });

  it("anonymise (jamais de suppression réelle) dès qu'un match référence l'inscription", async () => {
    findFirstMatch.mockResolvedValue({ id: "m1" });
    findFirstPoolPlayer.mockResolvedValue(null);

    const result = await dbEraseRegistration("r1", "t1");

    expect(result).toEqual({ anonymized: true });
    expect(deleteManyRegistration).not.toHaveBeenCalled();
    expect(updateManyRegistration).toHaveBeenCalledWith({
      where: { id: "r1", tournamentId: "t1" },
      data: expect.objectContaining({ playerEmail: "", playerPhone: null, playerNames: [] }),
    });
  });

  it("anonymise dès qu'une PoolPlayer référence l'inscription, même sans match", async () => {
    findFirstMatch.mockResolvedValue(null);
    findFirstPoolPlayer.mockResolvedValue({ registrationId: "r1" });

    const result = await dbEraseRegistration("r1", "t1");

    expect(result).toEqual({ anonymized: true });
    expect(deleteManyRegistration).not.toHaveBeenCalled();
  });

  it("attribue un nom anonymisé unique par inscription (jamais une valeur fixe partagée, qui fusionnerait les statistiques de deux joueurs différents au classement)", async () => {
    findFirstMatch.mockResolvedValue({ id: "m1" });
    findFirstPoolPlayer.mockResolvedValue(null);

    await dbEraseRegistration("registration-aaa", "t1");
    const nameA = updateManyRegistration.mock.calls[0][0].data.playerName;

    await dbEraseRegistration("registration-bbb", "t1");
    const nameB = updateManyRegistration.mock.calls[1][0].data.playerName;

    expect(nameA).not.toBe(nameB);
  });

  it("ne touche jamais les champs de paiement (obligation de conservation comptable distincte)", async () => {
    findFirstMatch.mockResolvedValue({ id: "m1" });
    findFirstPoolPlayer.mockResolvedValue(null);

    await dbEraseRegistration("r1", "t1");

    const data = updateManyRegistration.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("sterPaymentId");
    expect(data).not.toHaveProperty("entryFeeCents");
    expect(data).not.toHaveProperty("platformFeeCents");
    expect(data).not.toHaveProperty("feeCollected");
    expect(data).not.toHaveProperty("qrCodeToken");
  });
});

describe("dbAnonymizeExpiredContacts (BAPPS-LEGAL-005 §9 — rétention des coordonnées)", () => {
  it("purge uniquement les tournois FINISHED de l'organisateur, dont la date dépasse 12 mois, et ne touche jamais le nom/pseudo", async () => {
    updateManyRegistration.mockResolvedValue({ count: 3 });
    const now = new Date("2027-01-01T00:00:00.000Z");

    const count = await dbAnonymizeExpiredContacts("user-1", now);

    expect(count).toBe(3);
    expect(updateManyRegistration).toHaveBeenCalledTimes(1);
    const call = updateManyRegistration.mock.calls[0][0];
    expect(call.where.tournament).toEqual(
      expect.objectContaining({ userId: "user-1", status: "FINISHED" })
    );
    expect(call.where.tournament.date.lt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(call.data).toEqual({ playerEmail: "", playerPhone: null });
    expect(call.data).not.toHaveProperty("playerName");
  });

  it(`calcule le seuil à exactement ${CONTACT_RETENTION_MONTHS} mois avant \`now\``, async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");

    await dbAnonymizeExpiredContacts("user-1", now);

    const cutoff = updateManyRegistration.mock.calls[0][0].where.tournament.date.lt as Date;
    expect(cutoff.toISOString()).toBe("2025-06-15T12:00:00.000Z");
  });
});

describe("dbUpdateRegistration (BAPPS-LEGAL-005 §7 — rectification)", () => {
  it("met à jour uniquement les champs déclaratifs, scopés par id ET tournamentId", async () => {
    await dbUpdateRegistration("r1", "t1", {
      playerName: "Alice Corrigée",
      playerEmail: "alice@example.com",
      playerPhone: "0612345678",
      playerNames: ["Alice", "Bob"],
    });

    expect(updateManyRegistration).toHaveBeenCalledWith({
      where: { id: "r1", tournamentId: "t1" },
      data: {
        playerName: "Alice Corrigée",
        playerEmail: "alice@example.com",
        playerPhone: "0612345678",
        playerNames: ["Alice", "Bob"],
      },
    });
  });
});
