import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrganizationLinkForm } from "./OrganizationLinkForm";
import type { MyOrganization } from "@/lib/api/organizations";

vi.mock("@/lib/actions/organization", () => ({
  linkOrganization: vi.fn(async () => undefined),
}));

function org(overrides: Partial<MyOrganization>): MyOrganization {
  return {
    slug: "dartsopen-club",
    name: "DartsOpen Club",
    role: "OWNER",
    verified: true,
    subscriptions: [],
    ...overrides,
  };
}

describe("OrganizationLinkForm", () => {
  it("affiche un message d'information si l'utilisateur n'a aucun rôle OWNER/ADMIN (utilisateur simple)", () => {
    render(<OrganizationLinkForm organizations={[org({ role: "MEMBER" })]} />);
    expect(screen.getByText(/droits nécessaires/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("affiche le formulaire quand l'utilisateur a le rôle OWNER sur au moins une organisation", () => {
    render(<OrganizationLinkForm organizations={[org({ role: "OWNER" })]} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lier cette organisation/i })).toBeInTheDocument();
  });

  it("affiche le formulaire quand l'utilisateur a le rôle ADMIN sur au moins une organisation", () => {
    render(<OrganizationLinkForm organizations={[org({ role: "ADMIN" })]} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("exclut les organisations MEMBER de la liste proposée même si l'utilisateur est OWNER ailleurs", () => {
    render(
      <OrganizationLinkForm
        organizations={[
          org({ slug: "club-a", name: "Club A", role: "OWNER" }),
          org({ slug: "club-b", name: "Club B", role: "MEMBER" }),
        ]}
      />
    );
    expect(screen.getByRole("option", { name: "Club A" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Club B" })).not.toBeInTheDocument();
  });
});
