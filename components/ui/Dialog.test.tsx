import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Dialog from "./Dialog";

describe("Dialog", () => {
  it("expose role=dialog, aria-modal et le titre comme accessible name", () => {
    render(
      <Dialog title="Arbitrage" onClose={() => {}}>
        contenu
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Arbitrage" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("ferme au clic sur le fond", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Arbitrage" onClose={onClose}>
        <button>Action</button>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalled();
  });

  it("ne ferme pas au clic à l'intérieur de la boîte", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Arbitrage" onClose={onClose}>
        <button>Action</button>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Action" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ferme sur la touche Échap", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Arbitrage" onClose={onClose}>
        contenu
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
