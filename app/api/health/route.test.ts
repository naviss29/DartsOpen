import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "@/package.json";

const queryRawMock = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

describe("GET /api/health (DARTSOPEN, Deployment-Standard §8)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    queryRawMock.mockReset();
  });

  it("répond 200 avec la version déployée (version du package + SHA court du commit)", async () => {
    vi.stubEnv("SOURCE_COMMIT", "9C2D6A1F0E5B2750AB12");
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", version: `${packageJson.version}+9c2d6a1` });
  });

  it("n'interroge jamais la base : un PostgreSQL en panne ne rend pas le conteneur unhealthy", async () => {
    queryRawMock.mockRejectedValue(new Error("connection refused"));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
