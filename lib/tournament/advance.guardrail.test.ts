import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * Garde-fou (audit sécurité P2, 28/10/2026) : tout export d'un fichier "use server" est une
 * Server Action appelable depuis le navigateur. Les fonctions d'avancement de tournoi, sans
 * contrôle d'accès, ne doivent jamais redevenir exportées depuis un tel fichier.
 */
const root = path.resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const isUseServer = (src: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(src);

describe("fonctions internes d'avancement hors des Server Actions", () => {
  it("lib/tournament/advance.ts n'est pas un fichier \"use server\"", () => {
    expect(isUseServer(read("lib/tournament/advance.ts"))).toBe(false);
  });

  it("aucun fichier \"use server\" de lib/actions n'exporte doAdvance*", () => {
    const dir = path.join(root, "lib", "actions");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .filter((f) => {
        const src = readFileSync(path.join(dir, f), "utf8");
        return isUseServer(src) && /export\s+(async\s+)?function\s+doAdvance/.test(src);
      });
    expect(offenders).toEqual([]);
  });

  it("le détecteur reconnaît bien un fichier \"use server\"", () => {
    expect(isUseServer(read("lib/actions/bracket.ts"))).toBe(true);
  });
});
