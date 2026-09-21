import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { resolveLocalePreference } from "@/lib/i18n/config";

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
    expect(response.headers.get("set-cookie")).toContain("bapps_locale_shared=es");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
  });

  it("partage la préférence entre les sous-domaines BApps", async () => {
    const response = await POST(
      new Request("https://marketplace.bapps-studio.com/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "en" }),
      }),
    );

    expect(response.headers.get("set-cookie")).toContain("bapps_locale_shared=en");
    expect(response.headers.get("set-cookie")).toContain("Domain=bapps-studio.com");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("donne la priorité au cookie partagé et conserve l'ancien choix local en repli", () => {
    expect(resolveLocalePreference("es", "fr")).toBe("es");
    expect(resolveLocalePreference(undefined, "en")).toBe("en");
    expect(resolveLocalePreference("invalid", undefined)).toBe("fr");
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
