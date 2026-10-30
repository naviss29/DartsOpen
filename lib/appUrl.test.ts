import { describe, it, expect, vi, afterEach } from "vitest";
import { requireAppUrl, AppUrlMissingError } from "./appUrl";

describe("requireAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("renvoie l'URL publique sans barre finale", () => {
    expect(requireAppUrl("https://dartsopen.bapps-studio.com/")).toBe("https://dartsopen.bapps-studio.com");
    expect(requireAppUrl(" https://dartsopen.dev.bapps-studio.com ")).toBe("https://dartsopen.dev.bapps-studio.com");
  });

  it("échoue clairement si la variable manque, au lieu d'un lien localhost", () => {
    // Sans argument, la fonction lit la variable : on la vide (la CI la définit).
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(() => requireAppUrl()).toThrow(AppUrlMissingError);
    expect(() => requireAppUrl("")).toThrow(/NEXT_PUBLIC_APP_URL absente/);
    expect(() => requireAppUrl("   ")).toThrow(AppUrlMissingError);
  });

  it("refuse une valeur qui n'est pas une URL http(s)", () => {
    expect(() => requireAppUrl("dartsopen.bapps-studio.com")).toThrow(/invalide/);
    expect(() => requireAppUrl("javascript:alert(1)")).toThrow(/invalide/);
  });
});
