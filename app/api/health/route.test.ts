import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

describe("GET /api/health (DARTSOPEN)", () => {
  beforeEach(() => queryRawMock.mockReset());

  it("publie une base disponible sans changer le contrat liveness", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("reste HTTP 200 mais signale une base inaccessible", async () => {
    queryRawMock.mockRejectedValue(new Error("connection refused"));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "unreachable" });
  });
});
