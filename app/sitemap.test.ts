import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { tournament: { findMany: query } } }));
import sitemap from "./sitemap";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

it("ne lit aucune donnée et n'annonce aucune URL de recette", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.dev.bapps-studio.com");
  expect(await sitemap()).toEqual([]);
  expect(query).not.toHaveBeenCalled();
});

it("publie uniquement les champs publics attendus avec des URL absolues", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dartsopen.bapps-studio.com");
  query.mockResolvedValue([{ id: "open-tournament" }]);
  const entries = await sitemap();
  expect(entries).toContainEqual(expect.objectContaining({ url: "https://dartsopen.bapps-studio.com/t/open-tournament/register" }));
  expect(entries.every((entry) => entry.url.startsWith("https://dartsopen.bapps-studio.com/"))).toBe(true);
  expect(entries.some((entry) => entry.url.includes("/dashboard") || entry.url.includes("/api") || entry.url.includes("/p/"))).toBe(false);
  expect(query).toHaveBeenCalledWith({ where: { status: "OPEN" }, select: { id: true }, orderBy: { id: "asc" } });
});

it("rend visible une panne de base plutôt que publier un sitemap vide trompeur", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dartsopen.bapps-studio.com");
  query.mockRejectedValue(new Error("database unavailable"));
  await expect(sitemap()).rejects.toThrow("database unavailable");
});
