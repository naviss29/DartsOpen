import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou mécanique (demande d'Alan, 2026-09-27) — réplication préventive : le même test a
 * corrigé et prévenu un incident production réel sur BSsite (ERR_ADDRESS_INVALID) le même
 * jour. Un Route Handler qui construit une URL absolue de redirection à partir de l'hôte de
 * la requête entrante (`request.url`, `request.nextUrl.origin`, `headers.get("host")`…) fuite
 * l'adresse interne du conteneur (`0.0.0.0:3000`) derrière le proxy Coolify au lieu du domaine
 * public. Ce dépôt utilise le même schéma SSO (voir skill `bapps-api-security` §SSO) : aucune
 * violation trouvée à l'ajout de ce test (vérifié), mais rien ne l'empêchait mécaniquement
 * avant. Comme un garde-fou de charte graphique le fait déjà pour le design system.
 *
 * Convention à suivre pour toute URL absolue construite côté serveur :
 * `process.env.NEXT_PUBLIC_APP_URL`, jamais la requête entrante.
 */

// Volontairement précis (pas "tout usage de request.url") : lire request.url pour son
// pathname/searchParams est un usage courant et sûr (aucune information d'hôte n'en
// ressort) — voir le cas adversarial "does not flag..." ci-dessous. Seule la combinaison
// avec une notion d'hôte (base d'un new URL(), .origin/.host/.hostname, en-tête Host) est
// interdite.
// Le premier argument peut être un appel de fonction (ex. ssoStartPath()) — un seul niveau
// de parenthèses imbriquées est toléré, suffisant pour ce dépôt (vérifié : le cas réel de
// l'incident, new URL(ssoStartPath(), request.url), ne matchait PAS une première version de
// ce garde-fou qui excluait toute parenthèse du premier argument).
//
// ATTENTION regex : `[^()]*(?:\([^()]*\)[^()]*)*` et non `(?:[^()]*|\([^()]*\))*` — la
// première version (alternation avec chevauchement, les deux branches pouvant matcher la
// chaîne vide) a un temps exponentiel en cas d'échec sur une entrée sans virgule/parenthèse
// fermante correspondante (ReDoS) : elle a fait boucler ce test pendant des dizaines de
// minutes sur au moins un route.ts réel du dépôt avant d'être corrigée ici. Vérifié
// (`node -e`) : la version ci-dessous reste instantanée sur une entrée pathologique de 200
// caractères sans issue.
const FORBIDDEN_HOST_SOURCE_PATTERN =
  /new URL\([^()]*(?:\([^()]*\)[^()]*)*,\s*(?:request|req)\.url\s*\)|(?:request|req)\.nextUrl\.origin\b|new URL\(\s*(?:request|req)\.url\s*\)\.(?:origin|host|hostname)\b|headers\.get\(\s*["'`]host["'`]\s*\)|headers\.get\(\s*["'`]x-forwarded-host["'`]\s*\)/;

function stripComments(ts: string): string {
  // Retire /* ... */ puis // ... — suffisant ici (pas de faux // dans une chaîne du dépôt
  // testé, vérifié par le test adversarial ci-dessous).
  return ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function findViolations(source: string): string[] {
  const stripped = stripComments(source);
  const pattern = new RegExp(FORBIDDEN_HOST_SOURCE_PATTERN.source, "g");
  return [...stripped.matchAll(pattern)].map((m) => m[0]);
}

/** Tous les `route.ts` sous `app/api/`, chemins relatifs à la racine du dépôt. */
function findRouteFiles(dir: string, base = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...findRouteFiles(full, base));
    } else if (entry === "route.ts") {
      found.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return found.sort();
}

describe("request-url guardrail (Route Handlers)", () => {
  const routeFiles = findRouteFiles(path.resolve(__dirname, "app/api"));

  it("found at least one Route Handler to scan (sanity check — this suite would be vacuous otherwise)", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles)("%s never derives a URL/host from the incoming request", (relativePath: string) => {
    const source = readFileSync(path.resolve(__dirname, "app/api", relativePath), "utf-8");
    const found = findViolations(source);
    expect(
      found,
      `app/api/${relativePath} builds a URL/host from the incoming request (${found.join(", ")}) — ` +
        "behind Coolify's proxy this leaks the container's internal address instead of the " +
        "public domain. Use process.env.NEXT_PUBLIC_APP_URL instead (see callback/route.ts).",
    ).toEqual([]);
  });

  describe("findViolations() adversarial cases", () => {
    it("detects new URL(path, request.url) — the regression's exact shape", () => {
      const found = findViolations(`return NextResponse.redirect(new URL("/login", request.url));`);
      expect(found.length).toBe(1);
    });

    it("detects it even when the first argument is itself a function call (parens in the first arg)", () => {
      const found = findViolations(`return NextResponse.redirect(new URL(ssoStartPath(), request.url));`);
      expect(found.length).toBe(1);
    });

    it("detects the nested form from the real incident: new URL(path, new URL(request.url).origin)", () => {
      const found = findViolations(
        `return NextResponse.redirect(new URL(ssoStartPath(), new URL(request.url).origin));`,
      );
      expect(found.length).toBeGreaterThan(0);
    });

    it("detects an origin derived from request.nextUrl", () => {
      expect(findViolations(`const origin = request.nextUrl.origin;`).length).toBe(1);
    });

    it("detects a Host header read", () => {
      expect(findViolations(`const host = request.headers.get("host");`).length).toBe(1);
    });

    it("ignores a mention in a comment (documentation, not a use)", () => {
      const src = `// jamais new URL(x, request.url) ici : derrière Coolify il reflète l'hôte interne\nconst appUrl = process.env.NEXT_PUBLIC_APP_URL!;`;
      expect(findViolations(src)).toEqual([]);
    });

    it("passes the canonical pattern: building an absolute URL from NEXT_PUBLIC_APP_URL", () => {
      const src = `const appUrl = process.env.NEXT_PUBLIC_APP_URL!;\nreturn NextResponse.redirect(new URL("/login", appUrl));`;
      expect(findViolations(src)).toEqual([]);
    });

    it("does not flag reading query params or the path off request.nextUrl (legitimate, not a host/URL source)", () => {
      const src = `const code = request.nextUrl.searchParams.get("code");\nconst path = request.nextUrl.pathname;`;
      expect(findViolations(src)).toEqual([]);
    });

    it("does not flag parsing the current request's own query string via new URL(request.url) — common, safe (no host leaves the server)", () => {
      const src = `const { searchParams } = new URL(request.url);\nconst id = searchParams.get("id");`;
      expect(findViolations(src)).toEqual([]);
    });

    it("stays linear-time on a pathological new URL( call with no closing match (ReDoS regression guard)", () => {
      // La toute première version du pattern (alternation `[^()]*|\([^()]*\)` chevauchante)
      // mettait plusieurs dizaines de minutes sur une entrée comme celle-ci — ce test doit
      // rester instantané.
      const pathological = `new URL(${"a".repeat(5000)})`;
      const start = Date.now();
      findViolations(pathological);
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });
});
