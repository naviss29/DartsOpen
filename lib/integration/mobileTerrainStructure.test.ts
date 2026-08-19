import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * DO-BETA-001 (mission §9) — aucun navigateur automatisé disponible dans cet environnement (ni
 * Playwright ni Puppeteer installés dans ce dépôt, confirmé par DO-OPS-001/002) : cette
 * vérification structurelle est le repli explicitement prévu par la mission. Elle n'atteste pas
 * d'un rendu réel à 320/360px, seulement de l'ABSENCE des motifs qui casseraient le portrait sur
 * les pages effectivement utilisées PAR LES JOUEURS/ARBITRES SUR LE TERRAIN (scan QR, saisie
 * X01) — même principe que app/(dashboard)/tournaments/[id]/pilotage/mobile.test.ts pour la
 * console organisateur. Limite honnête documentée dans le rapport final.
 */
const ROOT = path.join(__dirname, "../..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf-8");
}

describe("DO-BETA-001 — pages terrain (QR/scoring) sans dépendance au mode paysage", () => {
  it("la page de saisie de score public n'importe pas LandscapeGuard", () => {
    const source = readSource("app/(public)/t/[id]/score/page.tsx");
    expect(source).not.toMatch(/LandscapeGuard/);
  });

  it("ScoreForm (saisie X01 traditionnelle/électronique) n'importe pas LandscapeGuard", () => {
    const source = readSource("components/tournament/ScoreForm.tsx");
    expect(source).not.toMatch(/LandscapeGuard/);
  });

  it("aucun overflow-x-auto ne force un défilement horizontal sur la saisie de score ou ScoreForm", () => {
    expect(readSource("app/(public)/t/[id]/score/page.tsx")).not.toMatch(/overflow-x-auto/);
    expect(readSource("components/tournament/ScoreForm.tsx")).not.toMatch(/overflow-x-auto/);
  });

  it("les routes QR de cible (/field, /field/referee) restent de simples redirections, aucune dépendance de mise en page", () => {
    const fieldRoute = readSource("app/(public)/t/[id]/field/route.ts");
    const refereeRoute = readSource("app/(public)/t/[id]/field/referee/route.ts");
    expect(fieldRoute).not.toMatch(/LandscapeGuard/);
    expect(refereeRoute).not.toMatch(/LandscapeGuard/);
  });
});
