// @vitest-environment node
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

/**
 * DO-UNFINISHED-PURGE-001 — exécute le vrai point d'entrée CLI (même commande que la tâche
 * planifiée, via tsx) : codes de sortie et refus d'agir sans mode explicite. `--apply` n'est
 * volontairement jamais lancé ici (il agirait sur tous les tournois de la base de test) — son
 * comportement est prouvé par lib/db/unfinishedTournamentPurge.db.test.ts.
 */
const root = path.resolve(__dirname, "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function run(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(process.execPath, [tsxCli, "scripts/purge-unfinished-tournaments.ts", ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("scripts/purge-unfinished-tournaments.ts (CLI)", () => {
  it("refuse de s'exécuter sans mode explicite (code 2)", () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.output).toContain("--dry-run");
  }, 60_000);

  it("refuse --dry-run et --apply combinés", () => {
    expect(run(["--dry-run", "--apply"]).status).toBe(2);
  }, 60_000);

  it("refuse un argument inconnu ou une taille de lot invalide", () => {
    expect(run(["--dry-run", "--batch-size=0"]).status).toBe(2);
    expect(run(["--force"]).status).toBe(2);
  }, 60_000);

  it("sort en code 2 si DATABASE_URL est absente", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const r = run(["--dry-run"], env);
    expect(r.status).toBe(2);
    expect(r.output).toContain("DATABASE_URL");
  }, 60_000);

  it("--dry-run s'exécute contre la base, signale l'envoi indisponible et affiche son bilan (code 0)", () => {
    const r = run(["--dry-run"]);
    expect(r.output).toContain("DRY-RUN terminé");
    expect(r.output).toContain("envoi des rappels indisponible");
    expect(r.output).not.toMatch(/postgres(ql)?:\/\/[^@\s]*:[^@\s]*@/); // jamais d'identifiants dans la sortie
    expect(r.status).toBe(0);
  }, 60_000);
});
