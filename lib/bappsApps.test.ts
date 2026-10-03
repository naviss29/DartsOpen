import { describe, expect, it } from "vitest";
import { bappsAppUrl, isStagingAppUrl } from "./bappsApps";

// Recette du 03/10/2026 : depuis le site de test, le sélecteur d'applications menait en production.
describe("bappsApps", () => {
  it("reconnaît les sites de test (sous-domaine et domaine racine)", () => {
    expect(isStagingAppUrl("https://billetasso.dev.bapps-studio.com")).toBe(true);
    expect(isStagingAppUrl("https://dev.bapps-studio.com")).toBe(true);
    expect(isStagingAppUrl("https://billetasso.bapps-studio.com")).toBe(false);
    expect(isStagingAppUrl("")).toBe(false);
  });

  it("en staging, envoie vers les applications de test", () => {
    expect(bappsAppUrl("https://eventmanager.bapps-studio.com", true)).toBe("https://eventmanager.dev.bapps-studio.com");
    expect(bappsAppUrl("https://bapps-studio.com", true)).toBe("https://dev.bapps-studio.com");
    expect(bappsAppUrl("https://bapps-studio.com/dashboard", true)).toBe("https://dev.bapps-studio.com/dashboard");
  });

  it("en production ou pour un lien déjà de test, ne change rien", () => {
    expect(bappsAppUrl("https://eventmanager.bapps-studio.com", false)).toBe("https://eventmanager.bapps-studio.com");
    expect(bappsAppUrl("https://connect.dev.bapps-studio.com", true)).toBe("https://connect.dev.bapps-studio.com");
    expect(bappsAppUrl("/dashboard", true)).toBe("/dashboard");
  });
});
