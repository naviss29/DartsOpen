import { describe, expect, it } from "vitest";
import { PRODUCT_PAGE_PATH, rootRedirectTarget, vitrineBaseUrl } from "./rootRedirect";

describe("rootRedirectTarget", () => {
  it("garde le tableau de bord pour un utilisateur connecté", () => {
    expect(rootRedirectTarget(true, "https://bapps-studio.com")).toBe("/dashboard");
  });

  it("envoie un visiteur sans session vers la page produit de la vitrine", () => {
    expect(rootRedirectTarget(false, "https://bapps-studio.com")).toBe("https://bapps-studio.com/produits/dartsopen");
    expect(rootRedirectTarget(false, "https://dev.bapps-studio.com")).toBe("https://dev.bapps-studio.com/produits/dartsopen");
  });
});

describe("vitrineBaseUrl", () => {
  it("utilise la variable d'environnement en retirant la barre finale", () => {
    expect(vitrineBaseUrl("https://dev.bapps-studio.com/")).toBe("https://dev.bapps-studio.com");
  });

  it("se replie sur la vitrine du même environnement quand la variable est absente ou vide", () => {
    // Hors staging (NEXT_PUBLIC_APP_URL non défini en test) : vitrine de production.
    expect(vitrineBaseUrl(undefined)).toBe("https://bapps-studio.com");
    expect(vitrineBaseUrl("  ")).toBe("https://bapps-studio.com");
  });

  it("expose le chemin de la page produit", () => {
    expect(PRODUCT_PAGE_PATH).toBe("/produits/dartsopen");
  });
});
