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

  it("sélectionne la forme plurielle avec un nombre localisé", () => {
    expect(selectPlural("fr", 1, { one: "{count} joueur", other: "{count} joueurs" })).toBe("1 joueur");
    expect(selectPlural("es", 2, { one: "{count} jugador", other: "{count} jugadores" })).toBe("2 jugadores");
  });
});
