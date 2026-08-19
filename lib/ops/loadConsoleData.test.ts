import { describe, it, expect, vi, beforeEach } from "vitest";

// DO-OPS-002 (défaut 2, scénarios obligatoires 4/5/6/7) — une panne sur l'une des trois lectures
// critiques (inscriptions/poules/matchs) ne doit JAMAIS devenir un tableau vide silencieux :
// loadTournamentConsoleData() doit journaliser puis laisser l'erreur se propager telle quelle.
vi.mock("@/lib/db/tournament", () => ({
  dbListRegistrations: vi.fn(),
  dbListPools: vi.fn(),
  dbListMatches: vi.fn(),
}));

const { dbListRegistrations, dbListPools, dbListMatches } = await import("@/lib/db/tournament");
const { loadTournamentConsoleData } = await import("./loadConsoleData");

beforeEach(() => {
  vi.mocked(dbListRegistrations).mockReset().mockResolvedValue([{ id: "r1", status: "PAID" }] as never);
  vi.mocked(dbListPools).mockReset().mockResolvedValue([{ id: "p1" }] as never);
  vi.mocked(dbListMatches).mockReset().mockResolvedValue([{ id: "m1", status: "PENDING" }] as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadTournamentConsoleData — chemin normal", () => {
  it("retourne les trois collections telles que renvoyées par les fonctions db*", async () => {
    const result = await loadTournamentConsoleData("t1");
    expect(result.registrations).toEqual([{ id: "r1", status: "PAID" }]);
    expect(result.pools).toEqual([{ id: "p1" }]);
    expect(result.matches).toEqual([{ id: "m1", status: "PENDING" }]);
  });
});

// Scénario obligatoire 4
describe("loadTournamentConsoleData — erreur dbListRegistrations", () => {
  it("propage l'erreur (jamais un tableau vide) et la journalise", async () => {
    const error = new Error("connexion DB perdue");
    vi.mocked(dbListRegistrations).mockRejectedValue(error);

    await expect(loadTournamentConsoleData("t1")).rejects.toThrow("connexion DB perdue");
    expect(console.error).toHaveBeenCalledWith("[loadTournamentConsoleData]", error);
  });
});

// Scénario obligatoire 5
describe("loadTournamentConsoleData — erreur dbListPools", () => {
  it("propage l'erreur (jamais un tableau vide) et la journalise", async () => {
    const error = new Error("timeout poules");
    vi.mocked(dbListPools).mockRejectedValue(error);

    await expect(loadTournamentConsoleData("t1")).rejects.toThrow("timeout poules");
    expect(console.error).toHaveBeenCalledWith("[loadTournamentConsoleData]", error);
  });
});

// Scénario obligatoire 6
describe("loadTournamentConsoleData — erreur dbListMatches", () => {
  it("propage l'erreur (jamais un tableau vide) et la journalise", async () => {
    const error = new Error("timeout matchs");
    vi.mocked(dbListMatches).mockRejectedValue(error);

    await expect(loadTournamentConsoleData("t1")).rejects.toThrow("timeout matchs");
    expect(console.error).toHaveBeenCalledWith("[loadTournamentConsoleData]", error);
  });
});

// Scénario obligatoire 7 — aucun calcul de prochaine action sur données critiques indisponibles :
// puisque la page attend `await loadTournamentConsoleData(id)` avant tout calcul (buildConsoleSummary/
// buildNextAction/etc.), une erreur ici empêche structurellement ces calculs de s'exécuter — la
// rejection elle-même EST la preuve qu'aucune valeur (même vide) n'atteint jamais ces fonctions.
describe("loadTournamentConsoleData — aucune valeur partielle ne fuit en cas d'erreur", () => {
  it("un échec sur une seule des trois lectures fait échouer l'ensemble (Promise.all), rien n'est retourné", async () => {
    vi.mocked(dbListMatches).mockRejectedValue(new Error("panne matches"));

    await expect(loadTournamentConsoleData("t1")).rejects.toThrow("panne matches");
  });
});
