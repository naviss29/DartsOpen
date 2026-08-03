import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));
vi.mock("@/lib/api/organizations", () => ({ getMyOrganizations: vi.fn() }));
vi.mock("@/lib/db/tournament", () => ({
  dbSetOrganizationSlug: vi.fn(),
  dbClearOrganizationSlug: vi.fn(),
}));

const { linkOrganization, unlinkOrganization } = await import("./organization");
const { getUser } = await import("@/lib/api/auth");
const { getMyOrganizations } = await import("@/lib/api/organizations");
const { dbSetOrganizationSlug, dbClearOrganizationSlug } = await import("@/lib/db/tournament");
const { redirect } = await import("next/navigation");

const USER = { id: "user-1", email: "alan@example.com", roles: [], isVerified: true };

function formDataWithSlug(slug: string) {
  const fd = new FormData();
  fd.set("slug", slug);
  return fd;
}

describe("linkOrganization", () => {
  beforeEach(() => {
    vi.mocked(getUser).mockReset().mockResolvedValue(USER as never);
    vi.mocked(getMyOrganizations).mockReset();
    vi.mocked(dbSetOrganizationSlug).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(redirect).mockClear();
  });

  it("redirige vers /login si l'utilisateur n'est pas authentifié", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(linkOrganization(undefined, formDataWithSlug("dartsopen-club"))).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("refuse un slug vide sans appeler SterPlatform", async () => {
    const result = await linkOrganization(undefined, formDataWithSlug(""));
    expect(result?.error).toBeDefined();
    expect(getMyOrganizations).not.toHaveBeenCalled();
  });

  it("lie l'organisation quand l'utilisateur est OWNER", async () => {
    vi.mocked(getMyOrganizations).mockResolvedValue([
      { slug: "dartsopen-club", name: "DartsOpen Club", role: "OWNER", verified: true, subscriptions: [] },
    ] as never);
    const result = await linkOrganization(undefined, formDataWithSlug("dartsopen-club"));
    expect(result).toBeUndefined();
    expect(dbSetOrganizationSlug).toHaveBeenCalledWith("user-1", "dartsopen-club");
  });

  it("lie l'organisation quand l'utilisateur est ADMIN", async () => {
    vi.mocked(getMyOrganizations).mockResolvedValue([
      { slug: "dartsopen-club", name: "DartsOpen Club", role: "ADMIN", verified: true, subscriptions: [] },
    ] as never);
    const result = await linkOrganization(undefined, formDataWithSlug("dartsopen-club"));
    expect(result).toBeUndefined();
    expect(dbSetOrganizationSlug).toHaveBeenCalledWith("user-1", "dartsopen-club");
  });

  it("refuse un utilisateur simple MEMBER (pas de droit de liaison)", async () => {
    vi.mocked(getMyOrganizations).mockResolvedValue([
      { slug: "dartsopen-club", name: "DartsOpen Club", role: "MEMBER", verified: true, subscriptions: [] },
    ] as never);
    const result = await linkOrganization(undefined, formDataWithSlug("dartsopen-club"));
    expect(result?.error).toBeDefined();
    expect(dbSetOrganizationSlug).not.toHaveBeenCalled();
  });

  it("refuse un slug qui n'appartient pas à l'utilisateur (jamais le client, toujours revérifié serveur)", async () => {
    vi.mocked(getMyOrganizations).mockResolvedValue([
      { slug: "autre-club", name: "Autre Club", role: "OWNER", verified: true, subscriptions: [] },
    ] as never);
    const result = await linkOrganization(undefined, formDataWithSlug("dartsopen-club"));
    expect(result?.error).toBeDefined();
    expect(dbSetOrganizationSlug).not.toHaveBeenCalled();
  });

  it("retourne une erreur si SterPlatform est indisponible", async () => {
    vi.mocked(getMyOrganizations).mockResolvedValue(null);
    const result = await linkOrganization(undefined, formDataWithSlug("dartsopen-club"));
    expect(result?.error).toBeDefined();
    expect(dbSetOrganizationSlug).not.toHaveBeenCalled();
  });
});

describe("unlinkOrganization", () => {
  beforeEach(() => {
    vi.mocked(getUser).mockReset().mockResolvedValue(USER as never);
    vi.mocked(dbClearOrganizationSlug).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(redirect).mockClear();
  });

  it("redirige vers /login si l'utilisateur n'est pas authentifié", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(unlinkOrganization()).rejects.toThrow("NEXT_REDIRECT");
    expect(dbClearOrganizationSlug).not.toHaveBeenCalled();
  });

  it("délie l'organisation de l'utilisateur connecté", async () => {
    await unlinkOrganization();
    expect(dbClearOrganizationSlug).toHaveBeenCalledWith("user-1");
  });
});
