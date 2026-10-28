import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Next 16 : le lien « ← Retour » de LegalLayout utilise next/link, rendu tel quel en test.
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import CguPage from "@/app/(public)/cgu/page";
import ConfidentialitePage from "@/app/(public)/confidentialite/page";
import MentionsLegalesPage from "@/app/(public)/mentions-legales/page";

// Relecture des textes légaux du 28/10/2026 : vraies pages, catalogue français (seule langue publiée).
afterEach(cleanup);

const pages = { cgu: CguPage, confidentialite: ConfidentialitePage, mentions: MentionsLegalesPage };

describe("pages légales DartsOpen", () => {
  it("le formulaire de contact pointe vers la vitrine (DartsOpen n'a pas de page /contact)", async () => {
    for (const page of Object.values(pages)) {
      const { container } = render(await page());
      const contactLinks = Array.from(container.querySelectorAll("a")).filter((a) => a.textContent === "formulaire de contact");
      expect(contactLinks.length).toBeGreaterThan(0);
      for (const link of contactLinks) expect(link.getAttribute("href")).toBe("https://bapps-studio.com/contact");
      cleanup();
    }
  });

  it("aucun nom interne SterPlatform dans les textes visibles", async () => {
    for (const page of Object.values(pages)) {
      const { container } = render(await page());
      expect(container.textContent).not.toContain("SterPlatform");
      cleanup();
    }
  });

  it("CGU : tarifs renvoyés vers bapps-studio.com/tarifs, plus de mention « non contractuel », apostrophe collée", async () => {
    const { container } = render(await CguPage());
    const text = container.textContent ?? "";
    expect(text).toContain("Les tarifs en vigueur sont ceux affichés sur bapps-studio.com/tarifs au jour de la souscription.");
    expect(text).not.toMatch(/non contractuel/);
    expect(text).toContain("L'organisation effective de l'événement");
    expect(text).not.toMatch(/L' organisation/);
  });

  it("confidentialité : responsable, destinataires réels et contact données personnelles", async () => {
    const { container } = render(await ConfidentialitePage());
    const text = container.textContent ?? "";
    expect(text).toContain("Alan Yvenou, entrepreneur individuel (BApps Studio)");
    expect(text).toContain("Stripe (paiements), Brevo (e-mails), Contabo (hébergement), Cloudflare (sécurité et diffusion)");
    expect(text).toContain("Contact données personnelles");
    expect(text).not.toContain("Délégué à la protection des données");
  });
});
