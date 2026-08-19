import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// DO-FIELD-ACCESS-001 (scénarios 1/2) — vérifie uniquement le CÂBLAGE de la route (quelle
// donnée déclenche l'émission d'une session, quelle redirection est produite), toujours en
// mockant la persistance : la logique de validité de la session elle-même (hash, expiration,
// revalidation dynamique du match) est prouvée séparément contre un vrai PostgreSQL dans
// lib/actions/fieldAccess.concurrency.test.ts — même découpage que
// app/api/webhooks/sterplatform-payments/route.test.ts (mock DB pour la logique de dispatch,
// PostgreSQL réel ailleurs pour la logique de persistance).
vi.mock("@/lib/db/tournament", () => ({
  dbGetTournamentPublic: vi.fn(),
  dbListMatches: vi.fn(),
}));
vi.mock("@/lib/actions/fieldAccess", () => ({
  issueFieldSession: vi.fn(),
}));

const { GET } = await import("./route");
const { dbGetTournamentPublic, dbListMatches } = await import("@/lib/db/tournament");
const { issueFieldSession } = await import("@/lib/actions/fieldAccess");

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

beforeEach(() => {
  vi.mocked(dbGetTournamentPublic).mockReset();
  vi.mocked(dbListMatches).mockReset();
  vi.mocked(issueFieldSession).mockReset().mockResolvedValue(undefined);
});

describe("GET /t/[id]/field — scénario 1 : QR/cible avec match actif → accès autorisé", () => {
  it("émet une session terrain PLAYER pour le match IN_PROGRESS de la cible scannée et redirige vers /score", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS" } as never);
    vi.mocked(dbListMatches).mockResolvedValue([
      { id: "match-1", board_number: 2, status: "IN_PROGRESS" },
      { id: "match-2", board_number: 3, status: "IN_PROGRESS" },
    ] as never);

    const res = await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).toHaveBeenCalledWith("t1", "match-1", "PLAYER");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/t/t1/score?board=2");
  });

  it("émet une session REFEREE quand ?role=referee est présent (second QR, réservé organisateur)", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS" } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "IN_PROGRESS" }] as never);

    await GET(req("/t/t1/field?board=2&role=referee"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).toHaveBeenCalledWith("t1", "match-1", "REFEREE");
  });
});

describe("GET /t/[id]/field — scénario 2 : cible sans match actif → aucune saisie possible", () => {
  it("n'émet aucune session quand la cible n'a aucun match IN_PROGRESS, redirige quand même vers l'état d'attente existant", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS" } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 3, status: "IN_PROGRESS" }] as never);

    const res = await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/t/t1/score?board=2");
  });

  it("n'émet aucune session quand le tournoi n'est pas IN_PROGRESS, même si un match existe sur la cible", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "FINISHED" } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "IN_PROGRESS" }] as never);

    await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
  });

  it("n'émet aucune session quand le match de la cible n'est plus IN_PROGRESS (déjà terminé)", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS" } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "FINISHED" }] as never);

    await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
  });
});
