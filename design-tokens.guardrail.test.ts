import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BAPPS-UX-UNIFICATION-005-FIX-002 — durcissement du guardrail (mini-check Codex sur FIX-001) :
 * l'ancienne version n'inspectait que le PREMIER bloc @theme (`/@theme\s*\{([^}]*)\}/`) et
 * acceptait toute valeur commençant par "var(", donc laissait passer un fallback littéral
 * (`var(--color-accent, #078099)`) ou un second bloc @theme réintroduisant un hex. Ce fichier
 * de thème global n'a aucune raison légitime de contenir un littéral couleur (hex/rgb/hsl) en
 * dehors des commentaires de documentation — donc au lieu d'extraire et de parser des blocs
 * @theme (fragile face à des blocs multiples, `@theme inline`, ou un fallback dans var(...)),
 * on interdit objectivement tout littéral couleur dans l'INTÉGRALITÉ du fichier une fois les
 * commentaires CSS retirés (§4 de la mission).
 */

const COLOR_LITERAL_PATTERN =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|\brgba?\(|\bhsla?\(/;

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function findColorLiterals(css: string): string[] {
  const globalPattern = new RegExp(COLOR_LITERAL_PATTERN.source, "g");
  return [...stripCssComments(css).matchAll(globalPattern)].map((m) => m[0]);
}

describe("design-tokens guardrail", () => {
  const packageJson = JSON.parse(
    readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
  ) as { dependencies?: Record<string, string> };

  const globalsCss = readFileSync(path.resolve(__dirname, "app/globals.css"), "utf-8");

  it("pins @naviss29/design-system to exactly the canonical version", () => {
    expect(packageJson.dependencies?.["@naviss29/design-system"]).toBe("0.8.0");
  });

  it("imports the canonical theme.css in globals.css", () => {
    expect(globalsCss).toContain('@import "@naviss29/design-system/theme.css";');
  });

  it("declares at least one --color-* alias in a @theme block (sanity check — this test suite would be vacuous against an empty/gutted globals.css otherwise)", () => {
    expect(globalsCss).toMatch(/@theme\s*\{[^}]*--color-[\w-]+\s*:\s*var\(/);
  });

  it("never contains a color literal (hex/rgb/rgba/hsl/hsla) anywhere in the global theme file, including inside a var() fallback or a second/inline @theme block", () => {
    const found = findColorLiterals(globalsCss);
    expect(found, `unexpected color literal(s) in app/globals.css: ${found.join(", ")}`).toEqual(
      [],
    );
  });

  describe("findColorLiterals() adversarial cases (BAPPS-UX-UNIFICATION-005-FIX-002 §5)", () => {
    it("detects a plain hex literal", () => {
      expect(findColorLiterals(`@theme {\n  --color-x: #078099;\n}`)).toEqual(["#078099"]);
    });

    it("detects a hex literal used as a var() fallback", () => {
      expect(
        findColorLiterals(`@theme {\n  --color-x: var(--color-accent, #078099);\n}`),
      ).toEqual(["#078099"]);
    });

    it("detects a literal reintroduced in a second @theme block, even when the first block is a valid alias", () => {
      const css = `@theme {\n  --color-ok: var(--color-accent);\n}\n\n@theme {\n  --color-x: #111827;\n}`;
      expect(findColorLiterals(css)).toEqual(["#111827"]);
    });

    it("detects an rgb() literal", () => {
      expect(findColorLiterals(`@theme {\n  --color-x: rgb(7, 128, 153);\n}`)).toEqual(["rgb("]);
    });

    it("detects an rgba() literal", () => {
      expect(findColorLiterals(`@theme {\n  --color-x: rgba(7, 128, 153, 0.5);\n}`)).toEqual([
        "rgba(",
      ]);
    });

    it("detects an hsl() literal", () => {
      expect(findColorLiterals(`@theme {\n  --color-x: hsl(190 91% 31%);\n}`)).toEqual(["hsl("]);
    });

    it("detects an hsla() literal", () => {
      expect(findColorLiterals(`@theme {\n  --color-x: hsla(190, 91%, 31%, .5);\n}`)).toEqual([
        "hsla(",
      ]);
    });

    it("passes valid canonical var() aliases with no literal anywhere", () => {
      const css = `@theme {\n  --color-brand-primary: var(--color-accent);\n  --color-brand-dark: var(--color-text-primary);\n}`;
      expect(findColorLiterals(css)).toEqual([]);
    });

    it("ignores a hex literal mentioned only in a CSS comment (documentation, not a declaration)", () => {
      const css = `/* historique : #94a3b8 remplacé par --color-text-secondary */\n@theme {\n  --color-x: var(--color-text-secondary);\n}`;
      expect(findColorLiterals(css)).toEqual([]);
    });
  });
});
