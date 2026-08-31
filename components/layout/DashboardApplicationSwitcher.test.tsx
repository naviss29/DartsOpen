// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
