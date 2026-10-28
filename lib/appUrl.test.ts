import { describe, it, expect } from "vitest";
import { requireAppUrl, AppUrlMissingError } from "./appUrl";

describe("requireAppUrl", () => {
  it("renvoie l'URL publique sans barre finale", () => {
    expect(requireAppUrl("https://dartsopen.bapps-studio.com/")).toBe("https://dartsopen.bapps-studio.com");
    expect(requireAppUrl(" https://dartsopen.dev.bapps-studio.com ")).toBe("https://dartsopen.dev.bapps-studio.com");
  });

  it("échoue clairement si la variable manque, au lieu d'un lien localhost", () => {
    expect(() => requireAppUrl(undefined)).toThrow(AppUrlMissingError);
    expect(() => requireAppUrl("")).toThrow(/NEXT_PUBLIC_APP_URL absente/);
    expect(() => requireAppUrl("   ")).toThrow(AppUrlMissingError);
  });

  it("refuse une valeur qui n'est pas une URL http(s)", () => {
    expect(() => requireAppUrl("dartsopen.bapps-studio.com")).toThrow(/invalide/);
    expect(() => requireAppUrl("javascript:alert(1)")).toThrow(/invalide/);
  });
});
