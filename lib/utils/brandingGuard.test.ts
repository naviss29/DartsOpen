import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Garde-fou anti-régression : les missions QA successives (réalignement graphique BApps
 * Studio, suppression des références Stêr Eo Production, suppression du faux message de
 * migration Stripe/Phase 5c) ont chacune dû nettoyer des reliquats textuels et visuels de
 * l'ancienne identité DartsOpen. Ce test scanne le code source applicatif (pas node_modules,
 * pas .next) pour empêcher leur réapparition silencieuse.
 */
function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.endsWith(".test.tsx") || entry.endsWith(".test.ts")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collectSourceFiles(full, files);
    else if (/\.(tsx?|css)$/.test(entry)) files.push(full);
  }
  return files;
}

const root = join(__dirname, "..", "..");
const sourceFiles = [
  ...collectSourceFiles(join(root, "app")),
  ...collectSourceFiles(join(root, "components")),
];

describe("Garde-fou branding — pas de régression vers l'ancienne identité", () => {
  it("ne mentionne plus Stêr Eo Production ni ses variantes", () => {
    const offenders = sourceFiles.filter((f) => /Ster Eo|Stêr Eo|logoSEP/.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });

  it("ne promet plus une migration Stripe/Phase 5c future", () => {
    const offenders = sourceFiles.filter((f) => /Phase 5c/.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });

  it("n'utilise plus l'emoji 🎯 comme substitut du logo DartsOpen", () => {
    const offenders = sourceFiles.filter((f) => /🎯\s*DartsOpen|DartsOpen\s*🎯/.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });

  it("ne conserve plus de token de palette darts-* ou de police Geist", () => {
    const offenders = sourceFiles.filter((f) => /darts-|Geist/.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });
});
