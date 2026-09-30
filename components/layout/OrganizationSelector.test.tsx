// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/actions/currentOrganization", () => ({ selectCurrentOrganization: vi.fn() }));

import OrganizationSelector from "./OrganizationSelector";
import { selectCurrentOrganization } from "@/lib/actions/currentOrganization";

const CLUB_A = { id: "org-a", name: "Club A", role: "OWNER" as const };
const CLUB_B = { id: "org-b", name: "Club B", role: "MEMBER" as const };

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(selectCurrentOrganization).mockReset();
});

describe("OrganizationSelector (ADR-0021 / L6)", () => {
  it("compte sans vraie organisation : rien n'est affiché", () => {
    const { container } = render(<OrganizationSelector organizations={[]} currentId={null} variant="header" />);
    expect(container.innerHTML).toBe("");
  });

  it("une seule organisation : nom affiché, pas de choix à faire", () => {
    render(<OrganizationSelector organizations={[CLUB_A]} currentId="org-a" variant="header" />);
    expect(screen.getByText("Club A")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("plusieurs organisations sans choix : invitation à choisir, libellé accessible, rôle traduit", () => {
    render(<OrganizationSelector organizations={[CLUB_A, CLUB_B]} currentId={null} variant="drawer" />);
    const select = screen.getByLabelText("Organisation") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText("Choisir une organisation")).toBeInTheDocument();
    expect(screen.getByText("Club B · Membre")).toBeInTheDocument();
  });

  it("changement : action serveur puis rafraîchissement ; refus serveur affiché, sans rafraîchir", async () => {
    vi.mocked(selectCurrentOrganization).mockResolvedValueOnce({});
    render(<OrganizationSelector organizations={[CLUB_A, CLUB_B]} currentId="org-a" variant="header" />);
    fireEvent.change(screen.getByLabelText("Organisation"), { target: { value: "org-b" } });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(selectCurrentOrganization).toHaveBeenCalledWith("org-b");

    vi.mocked(selectCurrentOrganization).mockResolvedValueOnce({ error: "Impossible de changer d’organisation." });
    fireEvent.change(screen.getByLabelText("Organisation"), { target: { value: "org-a" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de changer d’organisation.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
