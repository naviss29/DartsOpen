import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const consumeTransaction = vi.fn();
const setAuthCookies = vi.fn();
vi.mock("@/lib/sso/transaction", () => ({ consumeTransaction: () => consumeTransaction() }));
vi.mock("@/lib/api/auth", () => ({ setAuthCookies: (...a: unknown[]) => setAuthCookies(...a) }));

import { GET } from "./route";

const APP = "https://dartsopen.test";
const req = (qs: string) => new NextRequest(`${APP}/api/auth/sso/callback${qs}`);
const location = (r: Response) => new URL(r.headers.get("location")!);
const okExchange = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "t", refresh_token: "r" }), { status: 200 })),
  );

describe("GET /api/auth/sso/callback", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = APP;
    process.env.NEXT_PUBLIC_API_URL = "https://api.test";
    consumeTransaction.mockReset();
    setAuthCookies.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("redirects to /login without exchanging when the state does not match", async () => {
    consumeTransaction.mockResolvedValue({ state: "other", verifier: "v", next: "/dashboard" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await GET(req("?code=c&state=s"));

    expect(location(res).pathname).toBe("/login");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sets the cookies and goes to a valid internal `next` on success", async () => {
    consumeTransaction.mockResolvedValue({ state: "s", verifier: "v", next: "/dashboard?x=1" });
    okExchange();

    const res = await GET(req("?code=c&state=s"));

    expect(setAuthCookies).toHaveBeenCalledWith("t", "r");
    expect(res.headers.get("location")).toBe(`${APP}/dashboard?x=1`);
  });

  it.each(["/\\evil.com", "/\t/evil.com", "//evil.com", "https://evil.com"])(
    "re-filters a malicious `next` read back from the transaction cookie (%j)",
    async (next) => {
      // `/\evil.com` serait résolu en https://evil.com par new URL() : seconde barrière au callback,
      // même si la valeur a été enregistrée par une version antérieure ou altérée.
      consumeTransaction.mockResolvedValue({ state: "s", verifier: "v", next });
      okExchange();

      const res = await GET(req("?code=c&state=s"));

      expect(res.headers.get("location")).toBe(`${APP}/dashboard`);
    },
  );
});
