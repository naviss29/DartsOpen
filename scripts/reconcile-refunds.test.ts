// @vitest-environment node
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

/**
 * F13 — exécute le vrai point d'entrée CLI (même commande que la tâche planifiée, via tsx) :
 * codes de sortie et refus d'écrire sans mode explicite.
 */
const root = path.resolve(__dirname, "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function run(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(process.execPath, [tsxCli, "scripts/reconcile-refunds.ts", ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

// SterPlatform jamais appelé pour de vrai : adresse locale injoignable, et âge minimal énorme
// pour qu'aucune inscription de la base de test ne soit relue.
const safeEnv: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_API_URL: "http://127.0.0.1:9", STER_API_TOKEN: "test-token" };

describe("scripts/reconcile-refunds.ts (CLI)", () => {
  it("refuse de s'exécuter sans mode explicite (code 2)", () => {
    const r = run([], safeEnv);
    expect(r.status).toBe(2);
    expect(r.output).toContain("--dry-run");
  }, 60_000);

  it("refuse --dry-run et --apply combinés", () => {
    expect(run(["--dry-run", "--apply"], safeEnv).status).toBe(2);
  }, 60_000);

  it.each(["--limit=0", "--limit=1001", "--min-age-minutes=-1", "--inconnu"])("refuse l'argument invalide %s", (arg) => {
    expect(run(["--dry-run", arg], safeEnv).status).toBe(2);
  }, 60_000);

  it("sort en code 2 si DATABASE_URL est absente", () => {
    const env = { ...safeEnv };
    delete env.DATABASE_URL;
    const r = run(["--dry-run"], env);
    expect(r.status).toBe(2);
    expect(r.output).toContain("DATABASE_URL");
  }, 60_000);

  it("sort en code 2 si la configuration SterPlatform est absente", () => {
    const env = { ...safeEnv };
    delete env.STER_API_TOKEN;
    const r = run(["--dry-run"], env);
    expect(r.status).toBe(2);
    expect(r.output).toContain("STER_API_TOKEN");
  }, 60_000);

  it("--dry-run s'exécute contre la base et affiche son bilan (code 0)", () => {
    const r = run(["--dry-run", "--min-age-minutes=50000000"], safeEnv);
    expect(r.output).toContain("DRY-RUN terminé");
    expect(r.output).not.toMatch(/postgres(ql)?:\/\/[^@\s]*:[^@\s]*@/);
    expect(r.status).toBe(0);
  }, 60_000);
});
