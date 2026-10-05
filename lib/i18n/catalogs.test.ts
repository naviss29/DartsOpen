import { describe, expect, it } from "vitest";
import { catalogs } from "./catalogs";
import { defaultLocale, isLocale, selectPlural, supportedLocales } from "./config";

describe("catalogues i18n", () => {
  it("publie fr, en et es avec exactement les mêmes clés", () => {
    const reference = Object.keys(catalogs.fr).sort();

    expect(supportedLocales).toEqual(["fr", "en", "es"]);
    for (const locale of supportedLocales) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(reference);
    }
  });

  it("utilise le français comme repli et refuse les langues inconnues", () => {
    expect(defaultLocale).toBe("fr");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });

  it("CGU : porte mot pour mot la phrase de remboursement décidée par Alan (30/09/2026) et l'information de purge", () => {
    // Texte contractuel : une reformulation accidentelle doit casser un test, pas passer inaperçue.
    expect(catalogs.fr["legal.terms.cancellation.cancelledTournament"]).toBe(
      "Si un tournoi est annulé ou n'a pas lieu, le remboursement des inscriptions relève de l'association organisatrice, seule bénéficiaire des sommes encaissées.",
    );
    const purge = catalogs.fr["legal.terms.cancellation.unfinishedTournamentDeletion"];
    expect(purge).toContain("48 heures après le lendemain de sa date");
    expect(purge).toContain("Lorsque l'organisateur peut être joint");
  });

  it("CGU : ne mentionne plus de frais de plateforme prélevés (Q11, décision Alan 01/10/2026)", () => {
    // DartsOpen ne prélève aucun frais par inscription (PLATFORM_FEE_CENTS = 0) : les CGU ne
    // doivent pas laisser croire le contraire, dans aucune langue.
    expect(catalogs.fr["legal.terms.cancellation.organizerPolicy"]).toBe(
      "La politique d'annulation et de remboursement d'une inscription est définie par l'association organisatrice de chaque tournoi.",
    );
    expect(catalogs.en["legal.terms.cancellation.organizerPolicy"]).not.toMatch(/platform fee/i);
    expect(catalogs.es["legal.terms.cancellation.organizerPolicy"]).not.toMatch(/plataforma/i);
  });

  it("CGU : l'argent des inscriptions va directement à l'organisation, jamais via BApps (ADR-0022)", () => {
    expect(catalogs.fr["legal.terms.payment.body"]).toContain("directement par Stripe sur le compte Stripe de l'association organisatrice");
    expect(catalogs.fr["legal.terms.payment.body"]).toContain("ne transite jamais par DartsOpen ni par BApps Studio");
    for (const locale of ["fr", "en", "es"] as const) {
      // « reversé » laisserait croire que l'argent passe d'abord par BApps.
      expect(catalogs[locale]["legal.terms.fees.body"]).not.toMatch(/revers|paid (back|over)|reembols/i);
      expect(catalogs[locale]["legal.terms.payment.body"]).not.toMatch(/SterPlatform|infrastructure/i);
    }
  });

  it("sélectionne la forme plurielle avec un nombre localisé", () => {
    expect(selectPlural("fr", 1, { one: "{count} joueur", other: "{count} joueurs" })).toBe("1 joueur");
    expect(selectPlural("es", 2, { one: "{count} jugador", other: "{count} jugadores" })).toBe("2 jugadores");
  });
});
