import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * DO-OPS-001 (mission §12/§18) — aucun navigateur automatisé disponible dans cet environnement
 * (ni Playwright ni Puppeteer installés dans ce dépôt) : cette vérification structurelle est le
 * repli explicitement prévu par la mission ("vérifie structure/CSS et indique honnêtement la
 * limite"). Elle n'atteste pas d'un rendu réel à 320/360px, seulement de l'ABSENCE des motifs qui
 * casseraient le portrait (garde plein écran imposant le paysage, tableau forcé à défiler
 * horizontalement pour l'information principale) — et de la PRÉSENCE des classes de grille
 * empilée attendues. Un vrai contrôle visuel reste à faire manuellement ou via un outillage de
 * navigateur non disponible ici (limite assumée, voir le rapport final).
 */
function readSource(relativePath: string): string {
  return readFileSync(path.join(__dirname, relativePath), "utf-8");
}

describe("Console jour J — absence de dépendance au mode paysage (scénario obligatoire 15)", () => {
  it("la page pilotage n'importe pas LandscapeGuard", () => {
    const source = readSource("page.tsx");
    expect(source).not.toMatch(/LandscapeGuard/);
  });

  it("le layout dashboard global n'importe plus LandscapeGuard (ne bloque plus tout le dashboard en portrait)", () => {
    const source = readFileSync(path.join(__dirname, "../../../layout.tsx"), "utf-8");
    expect(source).not.toMatch(/import\s*\{\s*LandscapeGuard/);
  });

  it("LandscapeGuard reste appliqué localement à la vue bracket (seule vue effectivement large)", () => {
    const source = readFileSync(path.join(__dirname, "../bracket/page.tsx"), "utf-8");
    expect(source).toMatch(/<LandscapeGuard>/);
  });
});

describe("Console jour J — pas de tableau débordant pour l'information principale (scénario obligatoire 14)", () => {
  it("aucun overflow-x-auto n'enveloppe le contenu de la page pilotage", () => {
    const source = readSource("page.tsx");
    expect(source).not.toMatch(/overflow-x-auto/);
  });

  it("les cibles et statistiques utilisent des grilles empilées (grid-cols-1/2), jamais une largeur minimale forcée", () => {
    const source = readSource("page.tsx");
    expect(source).toMatch(/grid-cols-1/);
    expect(source).toMatch(/grid-cols-2/);
    expect(source).not.toMatch(/min-w-\[/);
  });

  it("les actions rapides utilisent flex-wrap (jamais une rangée figée qui déborderait sur petit écran)", () => {
    const source = readSource("page.tsx");
    expect(source).toMatch(/flex-wrap/);
  });
});
