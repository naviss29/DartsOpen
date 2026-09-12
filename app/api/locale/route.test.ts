import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/locale", () => {
  it("persiste une langue supportée dans un cookie HTTP", async () => {
    const response = await POST(
      new Request("http://localhost/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "es" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ locale: "es" });
    expect(response.headers.get("set-cookie")).toContain("bapps_locale=es");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("refuse une langue non supportée sans poser de cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "de" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
