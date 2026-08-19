import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// DO-FIELD-ACCESS-001/002 — vérifie uniquement le CÂBLAGE de la route (quelle donnée déclenche
// l'émission d'une session, quelle redirection est produite), toujours en mockant la
// persistance : la logique de validité de la session elle-même est prouvée séparément contre
// un vrai PostgreSQL dans lib/actions/fieldAccess.concurrency.test.ts — même découpage que
// app/api/webhooks/sterplatform-payments/route.test.ts.
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
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([
      { id: "match-1", board_number: 2, status: "IN_PROGRESS" },
      { id: "match-2", board_number: 3, status: "IN_PROGRESS" },
    ] as never);

    const res = await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).toHaveBeenCalledWith("t1", "match-1", "PLAYER");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/t/t1/score?board=2");
  });

  it("réponse toujours Cache-Control: no-store (scénario obligatoire 19)", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "IN_PROGRESS" }] as never);

    const res = await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("DO-FIELD-ACCESS-002 — ?role=referee n'a plus aucun effet sur cette route publique (défaut corrigé)", () => {
  it("scénario 1/2 obligatoires : anonyme avec ?role=referee → jamais REFEREE, la session reste PLAYER", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "IN_PROGRESS" }] as never);

    await GET(req("/t/t1/field?board=2&role=referee"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).toHaveBeenCalledWith("t1", "match-1", "PLAYER");
    expect(issueFieldSession).not.toHaveBeenCalledWith("t1", "match-1", "REFEREE");
  });

  it("aucun paramètre équivalent (rôle, role, isReferee...) ne fait basculer l'émission vers REFEREE", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "IN_PROGRESS" }] as never);

    await GET(req("/t/t1/field?board=2&role=REFEREE&isReferee=true&admin=1"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).toHaveBeenCalledWith("t1", "match-1", "PLAYER");
  });
});

describe("GET /t/[id]/field — scénario 2 : cible sans match actif → aucune saisie possible", () => {
  it("n'émet aucune session quand la cible n'a aucun match IN_PROGRESS, redirige quand même vers l'état d'attente existant", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 3, status: "IN_PROGRESS" }] as never);

    const res = await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/t/t1/score?board=2");
  });

  it("n'émet aucune session quand le tournoi n'est pas IN_PROGRESS, même si un match existe sur la cible", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "FINISHED", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "IN_PROGRESS" }] as never);

    await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
  });

  it("n'émet aucune session quand le match de la cible n'est plus IN_PROGRESS (déjà terminé)", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "FINISHED" }] as never);

    await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
  });
});

describe("DO-FIELD-ACCESS-002 — parsing strict du numéro de cible (scénarios obligatoires 14-18)", () => {
  const cases: [string, string][] = [
    ["board=1abc", "1abc"],
    ["board=1.5", "1.5"],
    ["board=0", "0"],
    ["board=-1", "-1"],
    ["board=", ""],
  ];

  it.each(cases)("%s → aucune session émise (entrée invalide)", async ([, raw]) => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 1, status: "IN_PROGRESS" }] as never);

    const res = await GET(req(`/t/t1/field?board=${encodeURIComponent(raw)}`), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
    // Repli sans paramètre board plutôt qu'un board bricolé à partir d'une entrée invalide.
    expect(res.headers.get("location")).toBe("http://localhost/t/t1/score");
  });

  it("board=2 (valide) → session émise normalement", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 2, status: "IN_PROGRESS" }] as never);

    await GET(req("/t/t1/field?board=2"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).toHaveBeenCalledWith("t1", "match-1", "PLAYER");
  });

  it("board au-delà du nombre réel de cibles du tournoi → refusé", async () => {
    vi.mocked(dbGetTournamentPublic).mockResolvedValue({ id: "t1", status: "IN_PROGRESS", nb_boards: 4 } as never);
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 99, status: "IN_PROGRESS" }] as never);

    await GET(req("/t/t1/field?board=99"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
  });
});
