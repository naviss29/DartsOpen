import { describe, it, expect, vi, beforeEach } from "vitest";

// Correctif de sécurité (30/09/2026) : addPlayer n'avait aucun contrôle d'accès. Ces tests
// prouvent que la garde propriétaire est appelée AVANT toute écriture, et qu'un refus
// (redirect/notFound de Next.js, qui lèvent) n'écrit jamais d'inscription.
const getOwnedTournament = vi.fn();
const dbReserveRegistrationSlot = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/access", () => ({ getOwnedTournament: (id: string) => getOwnedTournament(id) }));
vi.mock("@/lib/api/sterplatform", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/tournament", () => ({
  dbReserveRegistrationSlot: (...args: unknown[]) => dbReserveRegistrationSlot(...args),
  dbDeleteRegistration: vi.fn(),
  dbEraseRegistration: vi.fn(),
  dbSetSeeded: vi.fn(),
  dbUpdateRegistration: vi.fn(),
}));

const { addPlayer } = await import("@/lib/actions/player");

const TOURNAMENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function form(): FormData {
  const fd = new FormData();
  fd.set("tournament_id", TOURNAMENT_ID);
  fd.set("players_per_team", "1");
  fd.set("player_pseudo_0", "Jean Dupont");
  return fd;
}

describe("addPlayer — contrôle d'accès", () => {
  beforeEach(() => {
    getOwnedTournament.mockReset();
    dbReserveRegistrationSlot.mockReset();
  });

  it("refuse un non-propriétaire sans rien écrire", async () => {
    // notFound() de Next.js lève : on simule ce comportement.
    getOwnedTournament.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(addPlayer(undefined, form())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getOwnedTournament).toHaveBeenCalledWith(TOURNAMENT_ID);
    expect(dbReserveRegistrationSlot).not.toHaveBeenCalled();
  });

  it("autorise le propriétaire à inscrire un joueur", async () => {
    getOwnedTournament.mockResolvedValue({ id: TOURNAMENT_ID, status: "OPEN", players_per_team: 1 });
    dbReserveRegistrationSlot.mockResolvedValue({ outcome: "RESERVED", registration: { id: "r1" } });

    await addPlayer(undefined, form());

    expect(getOwnedTournament).toHaveBeenCalledWith(TOURNAMENT_ID);
    expect(dbReserveRegistrationSlot).toHaveBeenCalledTimes(1);
  });
});
