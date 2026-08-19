import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

/**
 * DO-PAYPAL-REMOVAL-001 — preuve structurelle que le legacy PayPal a bien disparu du produit :
 * aucune page/composant PayPal ne doit exister sur disque, aucune route ne doit plus y mener, et
 * aucun lien sortant `paypal.me` ne doit plus être construit nulle part dans le code applicatif
 * (hors node_modules/.next, hors documentation historique déjà explicitement justifiée dans le
 * rapport de mission).
 */
const ROOT = path.join(__dirname, "../..");

describe("DO-PAYPAL-REMOVAL-001 — aucune page/composant PayPal ne subsiste sur disque", () => {
  it("la page d'activation PayPal (/tournaments/[id]/activate) est supprimée", () => {
    expect(existsSync(path.join(ROOT, "app/(dashboard)/tournaments/[id]/activate/page.tsx"))).toBe(false);
  });

  it("la page de dons PayPal (/dons) est supprimée", () => {
    expect(existsSync(path.join(ROOT, "app/(public)/dons/page.tsx"))).toBe(false);
  });

  it("PaypalActivateButton et DonsPaypalButton sont supprimés", () => {
    expect(existsSync(path.join(ROOT, "components/tournament/PaypalActivateButton.tsx"))).toBe(false);
    expect(existsSync(path.join(ROOT, "components/DonsPaypalButton.tsx"))).toBe(false);
  });
});

describe("DO-PAYPAL-REMOVAL-001 — aucune route applicative ne mène plus à PayPal", () => {
  it("createTournament() ne redirige plus jamais vers /activate", () => {
    const source = readFileSync(path.join(ROOT, "lib/actions/tournament.ts"), "utf-8");
    expect(source).not.toMatch(/\/activate/);
  });

  it("aucun lien interne vers /dons ne subsiste dans l'application (recherche exhaustive app/ + components/, hors fichiers de test)", () => {
    // Exclut les *.test.ts(x) : ils contiennent légitimement la chaîne "/dons" dans des
    // assertions NÉGATIVES ("ce lien n'existe plus", voir DashboardSidebar.test.tsx) — on
    // recherche ici un vrai lien dans le code applicatif, pas une preuve de son absence.
    const result = execSync(
      `grep -rn '"/dons"' --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx' "${path.join(ROOT, "app")}" "${path.join(ROOT, "components")}" || true`,
      { encoding: "utf-8" },
    );
    expect(result.trim()).toBe("");
  });

  it("aucun lien paypal.me n'est plus construit nulle part dans le code applicatif (app/, components/, lib/, hors fichiers de test)", () => {
    const result = execSync(
      `grep -rln "paypal.me" --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx' "${path.join(ROOT, "app")}" "${path.join(ROOT, "components")}" "${path.join(ROOT, "lib")}" || true`,
      { encoding: "utf-8" },
    );
    expect(result.trim()).toBe("");
  });
});
