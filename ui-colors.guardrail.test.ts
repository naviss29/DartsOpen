import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BAPPS-UX-UNIFICATION-007-LOT3 (durci LOT3-FIX-001, audit Codex défaut C) — guardrail
 * couleurs/typographie de l'UI générique.
 *
 * Complète design-tokens.guardrail.test.ts (qui verrouille app/globals.css) en verrouillant
 * cette fois le CONTENU des pages/composants eux-mêmes : aucune classe couleur Tailwind
 * native (`slate-500`, `red-600`, `amber-50`, ...) ni littéral hex/rgb/hsl ne doit réapparaître
 * en dehors des tokens sémantiques du design-system (`bg-surface-secondary`, `text-danger`,
 * `border-warning-border`, les alias `brand-*` de app/globals.css, ...), et aucune police
 * autre qu'Inter (ou un repli générique déjà présent dans la pile canonique) ne doit être
 * introduite.
 *
 * Exception métier DartsOpen (charte/UX-UI-Standards §4/§16, pré-approuvée explicitement pour
 * cette application ; charte BApps §6.3 : "les couleurs métier fortes sont autorisées seulement
 * si elles codent une information propre au métier") : les écrans de scoring, TV/broadcast et
 * bracket peuvent légitimement avoir besoin d'un littéral de couleur pour une vraie donnée de
 * jeu (valeur de fléchette, zone de cible, visuel de bracket). `BUSINESS_VISUALIZATION_FILES`
 * liste ces fichiers.
 *
 * LOT3-FIX-001 (audit Codex) — cette exception NE DOIT PLUS être une exclusion de fichier
 * entière : ces fichiers sont désormais balayés comme n'importe quel autre (ils ne sont plus
 * dans `isExcludedPath`). Seul un littéral explicitement documenté dans
 * `BUSINESS_COLOR_EXEMPTIONS` (couple exact fichier + littérale, avec sa justification métier)
 * est toléré ; tout le reste — couleur Tailwind générique, hex/rgb/hsl non documenté, police
 * non canonique — continue d'échouer le test dans ces fichiers exactement comme ailleurs.
 * Aujourd'hui `BUSINESS_COLOR_EXEMPTIONS` est vide : à l'issue de LOT 3 ces fichiers n'utilisent
 * déjà plus aucun littéral (ils consomment les mêmes tokens sémantiques que le reste de l'app
 * pour les états génériques "en cours"/"terminé"/"prochain" — voir sweep ci-dessous, qui le
 * prouve en les incluant réellement dans le balayage). La liste reste prête à documenter une
 * vraie couleur métier future (ex. rendu visuel d'une zone de cible de fléchettes) sans jamais
 * redevenir un bypass large — voir `filterExemptBusinessColors()` et les tests adversariaux du
 * bloc "fine-grained business-color exemption" plus bas, qui prouvent qu'une couleur générique
 * injectée dans un de ces fichiers est toujours rejetée.
 *
 * Deux exceptions techniques distinctes, non liées au métier, restent des exclusions de fichier
 * entières (aucune donnée de jeu n'y transite, rien à documenter finement) :
 * - `app/global-error.tsx` : error boundary racine Next.js, doit rendre ses propres
 *   `<html>/<body>` et ne peut dépendre d'aucune classe Tailwind/CSS applicative (c'est
 *   exactement le filet de secours pour le cas où le reste de l'app a échoué à charger) — d'où
 *   des styles inline avec littéraux, une convention Next.js documentée dans le fichier lui-même.
 * - `app/manifest.ts` : Web App Manifest — la spec exige des chaînes de couleur littérales
 *   (`background_color`/`theme_color`), consommées par le navigateur avant tout CSS ; les
 *   valeurs utilisées sont déjà les hex canoniques exacts (page.background/accent).
 */

const REPO_ROOT = path.resolve(__dirname, ".");
const SCAN_ROOTS = ["app", "components"];

// Répertoires/fichiers jamais du "chrome UI générique" — hors périmètre par nature.
const NON_SOURCE_SEGMENTS = ["node_modules", ".next", "generated", "__fixtures__", "fixtures"];

/**
 * Charte §4/§16/§6.3 — visuels de jeu réels (scoring/TV/bracket), business DartsOpen.
 * N'est PLUS une liste d'exclusion de balayage (voir LOT3-FIX-001 ci-dessus) : sert uniquement
 * à scoper `BUSINESS_COLOR_EXEMPTIONS` (un fichier hors de cette liste ne peut jamais porter
 * d'exemption) et à documenter quels fichiers sont attendus comme "vraie visualisation de jeu".
 */
const BUSINESS_VISUALIZATION_FILES = [
  "components/tournament/ScoreForm.tsx",
  "components/tournament/ScoreBoard.tsx",
  "components/tournament/TvBoard.tsx",
  "components/tournament/MatchBoard.tsx",
  "components/tournament/BracketView.tsx",
  "components/tournament/BracketLive.tsx",
  "components/tournament/QuickBracketView.tsx",
  "components/tournament/QuickBracketLive.tsx",
  "app/(public)/t/[id]/score/page.tsx",
  "app/(public)/t/[id]/tv/page.tsx",
  "app/(public)/t/[id]/live/page.tsx",
];

/** Exceptions techniques (non métier) — voir docblock ci-dessus. Restent des exclusions de fichier entières. */
const TECHNICAL_EXCEPTION_FILES = ["app/global-error.tsx", "app/manifest.ts"];

const EXCLUDED_FILES = new Set([...TECHNICAL_EXCEPTION_FILES]);

function isExcludedPath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  if (NON_SOURCE_SEGMENTS.some((seg) => normalized.split("/").includes(seg))) return true;
  if (normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx")) return true;
  if (EXCLUDED_FILES.has(normalized)) return true;
  return false;
}

/**
 * Exemption fine — un littéral de couleur précis, dans un fichier précis, documenté avec sa
 * justification métier (charte §6.3). Jamais un pattern large ni un fichier entier : seul un
 * `match` strictement égal (même chaîne que celle détectée par `findColorViolations`) dans le
 * `file` déclaré est toléré.
 */
interface BusinessColorExemption {
  file: string;
  literal: string;
  reason: string;
}

/**
 * Vide aujourd'hui — voir docblock ci-dessus (aucun littéral métier réel dans ces fichiers à
 * l'issue de LOT 3). Une vraie couleur métier future (ex. zone de cible de fléchettes) se
 * documente ici, un couple (fichier, littérale) à la fois — jamais en élargissant
 * `BUSINESS_VISUALIZATION_FILES` ni en réintroduisant une exclusion de fichier.
 */
const BUSINESS_COLOR_EXEMPTIONS: BusinessColorExemption[] = [];

function isExemptBusinessColor(
  relPath: string,
  match: string,
  exemptions: BusinessColorExemption[] = BUSINESS_COLOR_EXEMPTIONS,
): boolean {
  const normalized = relPath.split(path.sep).join("/");
  return exemptions.some((e) => e.file === normalized && e.literal === match);
}

/** Pure — sépare la logique de filtrage pour la rendre testable avec une liste d'exemptions arbitraire. */
function filterExemptBusinessColors(
  violations: Violation[],
  relPath: string,
  exemptions: BusinessColorExemption[] = BUSINESS_COLOR_EXEMPTIONS,
): Violation[] {
  return violations.filter((v) => !isExemptBusinessColor(relPath, v.match, exemptions));
}

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      const rel = path.relative(REPO_ROOT, abs);
      if (isExcludedPath(rel)) continue;
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
      } else if (/\.(tsx|ts)$/.test(entry)) {
        out.push(rel);
      }
    }
  }
  walk(path.resolve(REPO_ROOT, root));
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Ligne commentée (`//...`) — jamais une URL (`https://...`) : on exige qu'elle ne soit pas
    // immédiatement précédée de `:`.
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const COLOR_HUES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const SHADES = "50|100|200|300|400|500|600|700|800|900|950";
const TAILWIND_COLOR_RE = new RegExp(`\\b(?:${COLOR_HUES})-(?:${SHADES})\\b`, "g");
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const RGB_HSL_RE = /\brgba?\(|\bhsla?\(/g;

interface Violation {
  kind: string;
  match: string;
}

/**
 * `relPath`, si fourni, applique `BUSINESS_COLOR_EXEMPTIONS` (LOT3-FIX-001) : un littéral
 * détecté est retiré des violations uniquement s'il correspond exactement à une exemption
 * documentée pour ce fichier. Sans `relPath` (cas des tests adversariaux unitaires ci-dessous,
 * qui testent le scanner sur un extrait de code hors contexte de fichier), aucun filtrage
 * métier n'est appliqué — la détection brute reste testable seule.
 */
function findColorViolations(source: string, relPath?: string): Violation[] {
  const clean = stripComments(source);
  const violations: Violation[] = [];
  for (const m of clean.matchAll(TAILWIND_COLOR_RE)) {
    violations.push({ kind: "tailwind-native-color", match: m[0] });
  }
  for (const m of clean.matchAll(HEX_RE)) {
    violations.push({ kind: "hex-literal", match: m[0] });
  }
  for (const m of clean.matchAll(RGB_HSL_RE)) {
    violations.push({ kind: "rgb-hsl-literal", match: m[0] });
  }
  return relPath ? filterExemptBusinessColors(violations, relPath) : violations;
}

// Familles autorisées dans une déclaration de police explicite : Inter (mandat charte §7.2),
// ses replis canoniques (`ui-sans-serif`, `system-ui`, `sans-serif`), le mot-clé neutre
// `inherit`/`unset`, et la pile monospace (convention déjà établie par `.tabular-score` dans
// app/globals.css pour l'alignement de chiffres — jamais une police "de marque" alternative).
const ALLOWED_FONT_KEYWORDS = [
  "inter",
  "ui-sans-serif",
  "system-ui",
  "sans-serif",
  "ui-monospace",
  "monospace",
  "inherit",
  "unset",
];

const FONT_FAMILY_DECL_RE = /font-family\s*:\s*([^;\n]+)/gi;
const FONT_FAMILY_JS_RE = /fontFamily\s*:\s*(["'`])((?:(?!\1).)*)\1/gi;
const TAILWIND_ARBITRARY_FONT_RE = /\bfont-\[[^\]]+\]/g;
const TAILWIND_SERIF_RE = /\bfont-serif\b/g;

function findFontViolations(source: string): Violation[] {
  const clean = stripComments(source);
  const violations: Violation[] = [];

  for (const m of clean.matchAll(FONT_FAMILY_DECL_RE)) {
    const value = m[1].toLowerCase();
    if (!ALLOWED_FONT_KEYWORDS.some((kw) => value.includes(kw))) {
      violations.push({ kind: "non-inter-font-family", match: m[0].trim() });
    }
  }
  for (const m of clean.matchAll(FONT_FAMILY_JS_RE)) {
    const value = m[2].toLowerCase();
    if (!ALLOWED_FONT_KEYWORDS.some((kw) => value.includes(kw))) {
      violations.push({ kind: "non-inter-font-family", match: m[0] });
    }
  }
  for (const m of clean.matchAll(TAILWIND_ARBITRARY_FONT_RE)) {
    if (!ALLOWED_FONT_KEYWORDS.some((kw) => m[0].toLowerCase().includes(kw))) {
      violations.push({ kind: "non-inter-font-arbitrary", match: m[0] });
    }
  }
  for (const m of clean.matchAll(TAILWIND_SERIF_RE)) {
    violations.push({ kind: "non-inter-font-serif", match: m[0] });
  }
  return violations;
}

describe("ui-colors guardrail (generic UI chrome — BAPPS-UX-UNIFICATION-007 LOT 3)", () => {
  describe("real source sweep", () => {
    const files = SCAN_ROOTS.flatMap((root) => listSourceFiles(root));

    it("scanned at least a representative number of files (sanity check — never a silently empty sweep)", () => {
      expect(files.length).toBeGreaterThan(40);
    });

    it("contains no forbidden Tailwind native color class / hex / rgb / hsl literal in generic UI chrome (business-visualization files included — LOT3-FIX-001, only a documented BUSINESS_COLOR_EXEMPTIONS entry is tolerated there, never a file-level bypass)", () => {
      const offenders: string[] = [];
      for (const rel of files) {
        const source = readFileSync(path.resolve(REPO_ROOT, rel), "utf-8");
        const violations = findColorViolations(source, rel);
        for (const v of violations) offenders.push(`${rel}: [${v.kind}] ${v.match}`);
      }
      expect(offenders, `forbidden color literal(s) found:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("the business-visualization files are actually included in this sweep (not silently skipped — the fix for the LOT3 file-level exemption)", () => {
      for (const rel of BUSINESS_VISUALIZATION_FILES) {
        expect(files, `expected ${rel} to be part of the scanned files`).toContain(rel);
      }
    });

    it("contains no non-Inter font declaration in generic UI chrome", () => {
      const offenders: string[] = [];
      for (const rel of files) {
        const source = readFileSync(path.resolve(REPO_ROOT, rel), "utf-8");
        const violations = findFontViolations(source);
        for (const v of violations) offenders.push(`${rel}: [${v.kind}] ${v.match}`);
      }
      expect(offenders, `non-Inter font declaration(s) found:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("the documented business-visualization and technical-exception files still exist at their declared paths (a silent rename would otherwise desync BUSINESS_COLOR_EXEMPTIONS scoping or silently widen the technical-exception bypass without anyone noticing)", () => {
      for (const rel of BUSINESS_VISUALIZATION_FILES) {
        expect(() => statSync(path.resolve(REPO_ROOT, rel)), `missing: ${rel}`).not.toThrow();
      }
      for (const rel of TECHNICAL_EXCEPTION_FILES) {
        expect(() => statSync(path.resolve(REPO_ROOT, rel)), `missing: ${rel}`).not.toThrow();
      }
    });

    it("every BUSINESS_COLOR_EXEMPTIONS entry is scoped to a file actually listed in BUSINESS_VISUALIZATION_FILES (the exemption mechanism can never silently apply to an arbitrary generic-UI file)", () => {
      const known = new Set(BUSINESS_VISUALIZATION_FILES);
      for (const exemption of BUSINESS_COLOR_EXEMPTIONS) {
        expect(known.has(exemption.file), `exemption references unknown file: ${exemption.file}`).toBe(true);
      }
    });
  });

  describe("findColorViolations() adversarial cases", () => {
    it("detects a Tailwind native slate class", () => {
      expect(findColorViolations('<div className="border-slate-300">')).toEqual([
        { kind: "tailwind-native-color", match: "slate-300" },
      ]);
    });

    it("detects a Tailwind native red/amber/emerald/blue/gray class (the families named in the mission brief)", () => {
      const src = '<div className="text-red-600 bg-amber-50 border-emerald-200 text-blue-600 bg-gray-100">';
      const found = findColorViolations(src).map((v) => v.match);
      expect(found).toEqual(["red-600", "amber-50", "emerald-200", "blue-600", "gray-100"]);
    });

    it("detects a hex literal in an inline style", () => {
      expect(findColorViolations('style={{ color: "#ff0000" }}')).toEqual([
        { kind: "hex-literal", match: "#ff0000" },
      ]);
    });

    it("detects an rgb()/hsl() literal", () => {
      const src = 'style={{ background: "rgb(255,0,0)" }}; const x = "hsl(0 100% 50%)"';
      const kinds = findColorViolations(src).map((v) => v.kind);
      expect(kinds).toEqual(["rgb-hsl-literal", "rgb-hsl-literal"]);
    });

    it("ignores a color literal mentioned only in a comment (documentation, not a declaration)", () => {
      const src = `// historique : remplacé #94a3b8 (slate-400) par text-disabled\nconst x = "text-disabled";`;
      expect(findColorViolations(src)).toEqual([]);
    });

    it("does not flag canonical semantic token classes (no hue/shade token embedded in their names)", () => {
      const src =
        '<div className="bg-surface-secondary text-danger border-warning-border text-success-solid bg-brand-turquoise text-brand-text-secondary">';
      expect(findColorViolations(src)).toEqual([]);
    });

    it("does not flag a URL that happens to contain '//' right after scanning (comment-stripping never eats real code)", () => {
      const src = `const url = "https://example.com"; // pas un littéral couleur`;
      expect(findColorViolations(src)).toEqual([]);
    });
  });

  describe("findFontViolations() adversarial cases", () => {
    it("detects a hardcoded non-Inter fontFamily in a JS/TS style object", () => {
      expect(findFontViolations('style={{ fontFamily: "Comic Sans MS" }}')).toEqual([
        { kind: "non-inter-font-family", match: 'fontFamily: "Comic Sans MS"' },
      ]);
    });

    it("detects a hardcoded non-Inter font-family in a CSS declaration", () => {
      expect(findFontViolations("p { font-family: 'Times New Roman'; }")).toEqual([
        { kind: "non-inter-font-family", match: "font-family: 'Times New Roman'" },
      ]);
    });

    it("detects the Tailwind font-serif utility (never Inter)", () => {
      expect(findFontViolations('<h1 className="font-serif">')).toEqual([
        { kind: "non-inter-font-serif", match: "font-serif" },
      ]);
    });

    it("detects an arbitrary Tailwind font utility naming a non-Inter family", () => {
      expect(findFontViolations(`<p className="font-['Georgia']">`)).toEqual([
        { kind: "non-inter-font-arbitrary", match: "font-['Georgia']" },
      ]);
    });

    it("does not flag Inter itself, generic sans-serif fallbacks, or the pre-existing monospace convention", () => {
      const src = [
        'style={{ fontFamily: "Inter, sans-serif" }}',
        "body { font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif; }",
        '<span className="font-mono tabular-nums">',
      ].join("\n");
      expect(findFontViolations(src)).toEqual([]);
    });
  });

  describe("path exclusion & fine-grained business-color exemption — proof the business-visualization exception is no longer a blanket bypass (LOT3-FIX-001, audit Codex defect C)", () => {
    it("does NOT path-exclude the documented business-visualization files anymore (they are scanned like any other file — only BUSINESS_COLOR_EXEMPTIONS can tolerate a specific literal there)", () => {
      for (const rel of BUSINESS_VISUALIZATION_FILES) {
        expect(isExcludedPath(rel), `expected ${rel} to NOT be path-excluded`).toBe(false);
      }
    });

    it("still excludes the documented technical exception files (global-error.tsx / manifest.ts — unrelated to the business-color scoping fix, see docblock)", () => {
      for (const rel of TECHNICAL_EXCEPTION_FILES) {
        expect(isExcludedPath(rel), `expected ${rel} to be excluded`).toBe(true);
      }
    });

    it("a generic UI color injected into a business-visualization file (not a scoring/target/TV/bracket value) IS still caught and rejected by the guardrail (the adversarial proof the mission asked for — the file-level bypass is gone)", () => {
      const rel = "components/tournament/ScoreForm.tsx";
      // slate/gray chrome, e.g. a card border or muted label — no dart/target/TV/bracket meaning
      // whatsoever, exactly the kind of generic-UI color the sweep must keep rejecting even here.
      const injectedGenericUiColor = '<div className="border-slate-200 bg-gray-100 text-gray-500">Chargement…</div>';
      const violations = findColorViolations(injectedGenericUiColor, rel);
      expect(violations.map((v) => v.match)).toEqual(["slate-200", "gray-100", "gray-500"]);
      // Reverted: nothing above mutated the real file — this snippet was never written to disk,
      // only passed in-memory to the scanner (see also the real-source sweep above, which proves
      // the actual current content of the 11 files stays clean).
    });

    it("a documented BUSINESS_COLOR_EXEMPTIONS entry tolerates only its exact declared literal, in its exact file — a different literal in the very same file is still caught (never a per-file bypass in disguise)", () => {
      const rel = "components/tournament/ScoreForm.tsx";
      // #1e3a8a : hypothétique couleur de zone de cible documentée ; red-600 : couleur générique
      // UI qui n'a rien à voir avec une donnée de jeu — ne doit jamais profiter de l'exemption
      // voisine.
      const snippet = '<div className="bg-[#1e3a8a] text-red-600">Zone triple</div>';
      const rawViolations = findColorViolations(snippet); // sans relPath : détection brute, non filtrée
      expect(rawViolations.map((v) => v.match).sort()).toEqual(["#1e3a8a", "red-600"]);

      const customExemptions: BusinessColorExemption[] = [
        { file: rel, literal: "#1e3a8a", reason: "Test — simule une zone de cible de fléchettes documentée" },
      ];
      const filtered = filterExemptBusinessColors(rawViolations, rel, customExemptions);
      expect(filtered.map((v) => v.match)).toEqual(["red-600"]);
    });

    it("an exemption never leaks to a different file, even with the identical literal (exemptions are scoped per-file, never global)", () => {
      const violations: Violation[] = [{ kind: "hex-literal", match: "#1e3a8a" }];
      const customExemptions: BusinessColorExemption[] = [
        { file: "components/tournament/ScoreForm.tsx", literal: "#1e3a8a", reason: "Test" },
      ];
      const filtered = filterExemptBusinessColors(violations, "components/tournament/TvBoard.tsx", customExemptions);
      expect(filtered).toEqual(violations);
    });

    it("does NOT exclude an arbitrary generic-UI file with a similar-looking name (exclusion is by exact documented path, never a loose prefix/keyword match)", () => {
      expect(isExcludedPath("components/tournament/ScoreFormWrapper.tsx")).toBe(false);
      expect(isExcludedPath("components/ui/Button.tsx")).toBe(false);
      expect(isExcludedPath("app/(dashboard)/dashboard/page.tsx")).toBe(false);
    });

    it("excludes non-source directories (node_modules, .next, generated) regardless of file content", () => {
      expect(isExcludedPath("lib/generated/prisma/client/index.ts")).toBe(true);
      expect(isExcludedPath("node_modules/@naviss29/design-system/dist/index.js")).toBe(true);
    });

    it("excludes test files themselves (a fixture with a deliberately forbidden color in a *.test.ts must never fail this guardrail)", () => {
      expect(isExcludedPath("components/ui/Button.test.tsx")).toBe(true);
    });
  });
});
