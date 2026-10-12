import { afterEach, describe, expect, it, vi } from "vitest";
import { canIndexPublicPages, publicMetadata, publicUrl, serializeJsonLd, shouldNoIndex } from "./seo";

afterEach(() => vi.unstubAllEnvs());

describe("SEO français", () => {
  it("n'indexe que l'origine de production connue, même avec NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const url of ["", "https://dev.bapps-studio.com", "https://test.dev.bapps-studio.com", "http://localhost:3000", "https://evil.example", "https://dartsopen.bapps-studio.com?preview=1", "https://dartsopen.bapps-studio.com/preview", "https://user:pass@dartsopen.bapps-studio.com"]) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", url);
      expect(canIndexPublicPages()).toBe(false);
      expect(shouldNoIndex("/")).toBe(true);
    }
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dartsopen.bapps-studio.com");
    expect(canIndexPublicPages()).toBe(true);
    expect(shouldNoIndex("/t/test/register")).toBe(false);
  });

  it.each(["/", "/p/joueur", "/classement", "/t/test/score", "/t/test/tv", "/t/test/live", "/t/test/register/success", "/dashboard", "/api/test"])("exclut %s sans dépendre d'un blocage robots.txt", (path) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dartsopen.bapps-studio.com");
    expect(shouldNoIndex(path)).toBe(true);
    expect(shouldNoIndex(path + "/")).toBe(true);
  });

  it("produit une canonical absolue sans reprendre de paramètres de visite", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dartsopen.bapps-studio.com");
    const metadata = publicMetadata("Titre", "Description", "/t/test/register", "/image.png");
    expect(metadata.alternates?.canonical).toBe(publicUrl("/t/test/register"));
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph?.url).toBe(publicUrl("/t/test/register"));
    expect(metadata.twitter).toMatchObject({ title: "Titre", description: "Description", card: "summary_large_image" });
  });

  it("conserve le contenu JSON sans permettre de fermer la balise script", () => {
    const value = { name: '</script><script>alert("x")</script>', description: "été & festival" };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(value);
  });
});
