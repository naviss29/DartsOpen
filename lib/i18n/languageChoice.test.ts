import { describe, expect, it, vi } from "vitest";

// Choix de langue masqué (demande d'Alan, 03/10/2026) : même avec un cookie « en », l'application
// est servie en français et le sélecteur n'affiche rien.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "en" }) }),
}));

import { LANGUAGE_CHOICE_ENABLED } from "./config";
import { getI18n } from "./server";

describe("choix de langue désactivé", () => {
  it("le réglage est désactivé", () => {
    expect(LANGUAGE_CHOICE_ENABLED).toBe(false);
  });

  it("un cookie de langue anglaise est ignoré : français", async () => {
    const { locale } = await getI18n();
    expect(locale).toBe("fr");
  });

  it("une langue demandée explicitement par le code reste servie", async () => {
    const { locale } = await getI18n("es");
    expect(locale).toBe("es");
  });
});
