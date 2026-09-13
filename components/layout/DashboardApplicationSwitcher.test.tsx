// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { catalogs } from "@/lib/i18n/catalogs";
import DashboardApplicationSwitcher from "./DashboardApplicationSwitcher";

describe("DashboardApplicationSwitcher", () => {
  it("affiche seulement les produits autorisés, identifie DartsOpen et masque l’application mobile", () => {
    render(
      <DashboardApplicationSwitcher
        organizations={[{ activeProducts: [{ product: "DARTSOPEN" }, { product: "BILLETASSO" }] }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Applications" }));

    expect(screen.getByRole("link", { name: /DartsOpen/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /BilletAsso/ })).not.toBeNull();
    expect(screen.queryByRole("link", { name: /Marketplace/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Motorsport Calendar/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Toutes les applications" }).getAttribute("href")).toBe(
      "https://bapps-studio.com/dashboard/produits",
    );
  });

  it("affiche toutes les cartes du sélecteur en espagnol", () => {
    render(
      <I18nProvider locale="es" messages={catalogs.es}>
        <DashboardApplicationSwitcher organizations={[{ activeProducts: [{ product: "DARTSOPEN" }, { product: "BILLETASSO" }] }]} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aplicaciones" }));
    expect(screen.getByText("Cambiar de aplicación")).not.toBeNull();
    expect(screen.getByText("Panel de control")).not.toBeNull();
    expect(screen.getByText("Organización de torneos de dardos")).not.toBeNull();
    expect(screen.getByText("Venta de entradas y control de acceso")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Todas las aplicaciones" })).not.toBeNull();
  });
});
