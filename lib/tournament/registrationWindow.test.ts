import { describe, expect, it, vi } from "vitest";
import { isTournamentDatePast } from "./registrationWindow";

describe("isTournamentDatePast", () => {
  const tournamentDate = new Date("2026-11-14T00:00:00.000Z"); // @db.Date

  it("laisse les inscriptions ouvertes avant le tournoi", () => {
    expect(isTournamentDatePast(tournamentDate, new Date("2026-11-13T20:00:00Z"))).toBe(false);
  });

  it("laisse les inscriptions ouvertes le jour même, jusqu'à minuit heure de Paris", () => {
    expect(isTournamentDatePast(tournamentDate, new Date("2026-11-14T09:00:00Z"))).toBe(false);
    // 22 h 30 UTC = 23 h 30 à Paris : toujours le 14.
    expect(isTournamentDatePast(tournamentDate, new Date("2026-11-14T22:30:00Z"))).toBe(false);
  });

  it("ferme les inscriptions dès le lendemain à Paris", () => {
    // 23 h 30 UTC le 14 = 0 h 30 le 15 à Paris.
    expect(isTournamentDatePast(tournamentDate, new Date("2026-11-14T23:30:00Z"))).toBe(true);
    expect(isTournamentDatePast("2026-11-14", new Date("2026-12-01T12:00:00Z"))).toBe(true);
  });

  it("ne bloque pas sur une date illisible et le journalise", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isTournamentDatePast("pas une date", new Date())).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
