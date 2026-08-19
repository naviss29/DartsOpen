import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// DO-FIELD-ACCESS-002 — câblage de la route d'échange arbitre, toujours mocké : la logique de
// validité de la preuve (hash, expiration, usage unique, tournoi/match) est prouvée séparément
// contre un vrai PostgreSQL dans lib/actions/fieldAccess.concurrency.test.ts.
vi.mock("@/lib/db/tournament", () => ({
  dbListMatches: vi.fn(),
}));
vi.mock("@/lib/actions/fieldAccess", () => ({
  redeemRefereeGrant: vi.fn(),
  issueFieldSession: vi.fn(),
}));

const { GET } = await import("./route");
const { dbListMatches } = await import("@/lib/db/tournament");
const { redeemRefereeGrant, issueFieldSession } = await import("@/lib/actions/fieldAccess");

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

beforeEach(() => {
  vi.mocked(dbListMatches).mockReset();
  vi.mocked(redeemRefereeGrant).mockReset();
  vi.mocked(issueFieldSession).mockReset().mockResolvedValue(undefined);
});

describe("GET /t/[id]/field/referee — preuve valide → session REFEREE (scénario obligatoire 5)", () => {
  it("échange une preuve valide contre une session REFEREE et redirige vers la cible du match résolu", async () => {
    vi.mocked(redeemRefereeGrant).mockResolvedValue({ ok: true, matchId: "match-1" });
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 3 }] as never);

    const res = await GET(req("/t/t1/field/referee?proof=abc"), { params: Promise.resolve({ id: "t1" }) });

    expect(redeemRefereeGrant).toHaveBeenCalledWith("abc", "t1");
    expect(issueFieldSession).toHaveBeenCalledWith("t1", "match-1", "REFEREE");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/t/t1/score?board=3");
  });

  it("réponse toujours Cache-Control: no-store (scénario obligatoire 19)", async () => {
    vi.mocked(redeemRefereeGrant).mockResolvedValue({ ok: true, matchId: "match-1" });
    vi.mocked(dbListMatches).mockResolvedValue([{ id: "match-1", board_number: 3 }] as never);

    const res = await GET(req("/t/t1/field/referee?proof=abc"), { params: Promise.resolve({ id: "t1" }) });

    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /t/[id]/field/referee — preuve invalide/absente → jamais de session REFEREE (scénario obligatoire 6)", () => {
  it("preuve refusée par redeemRefereeGrant → aucune session émise", async () => {
    vi.mocked(redeemRefereeGrant).mockResolvedValue({ ok: false, error: "Preuve arbitre invalide." });

    const res = await GET(req("/t/t1/field/referee?proof=falsifie"), { params: Promise.resolve({ id: "t1" }) });

    expect(issueFieldSession).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/t/t1/score");
  });

  it("absence totale de proof → redeemRefereeGrant appelé avec undefined, jamais de session", async () => {
    vi.mocked(redeemRefereeGrant).mockResolvedValue({ ok: false, error: "Preuve arbitre invalide." });

    await GET(req("/t/t1/field/referee"), { params: Promise.resolve({ id: "t1" }) });

    expect(redeemRefereeGrant).toHaveBeenCalledWith(undefined, "t1");
    expect(issueFieldSession).not.toHaveBeenCalled();
  });
});
