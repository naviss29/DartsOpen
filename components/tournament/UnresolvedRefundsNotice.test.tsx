import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnresolvedRefundsNotice } from "./UnresolvedRefundsNotice";
import { catalogs, translate, type MessageKey } from "@/lib/i18n/catalogs";

/** F13 — le refus d'un remboursement doit être visible et compréhensible par l'organisateur. */
const tFor = (locale: keyof typeof catalogs) => (key: MessageKey, values?: Record<string, string | number>) =>
  translate(catalogs[locale], key, values);
const formatDate = () => "4 octobre 2026 à 10:00";

describe("UnresolvedRefundsNotice", () => {
  it("n'affiche rien sans remboursement en suspens", () => {
    const { container } = render(<UnresolvedRefundsNotice refunds={[]} t={tFor("fr")} formatDate={formatDate} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("remboursement en cours : libellé « en cours », pas de consigne d'échec", () => {
    render(
      <UnresolvedRefundsNotice
        refunds={[{ id: "r1", player_name: "Équipe A", refund_failed_at: null }]}
        t={tFor("fr")}
        formatDate={formatDate}
      />,
    );
    expect(screen.getByText("Remboursements à suivre")).toBeInTheDocument();
    expect(screen.getByText(/Remboursement en cours/)).toBeInTheDocument();
    expect(screen.queryByText(/Stripe a refusé/)).not.toBeInTheDocument();
  });

  it("remboursement refusé : date de l'échec et consigne claire (aucune relance automatique)", () => {
    render(
      <UnresolvedRefundsNotice
        refunds={[{ id: "r1", player_name: "Équipe A", refund_failed_at: "2026-10-04T08:00:00.000Z" }]}
        t={tFor("fr")}
        formatDate={formatDate}
      />,
    );
    expect(screen.getByText(/Remboursement refusé le 4 octobre 2026 à 10:00/)).toBeInTheDocument();
    expect(screen.getByText(/aucune nouvelle tentative n’est faite automatiquement/)).toBeInTheDocument();
  });

  it.each(["en", "es"] as const)("traduit en %s (aucun texte français résiduel)", (locale) => {
    render(
      <UnresolvedRefundsNotice
        refunds={[{ id: "r1", player_name: "Team A", refund_failed_at: "2026-10-04T08:00:00.000Z" }]}
        t={tFor(locale)}
        formatDate={formatDate}
      />,
    );
    expect(screen.getByText(catalogs[locale]["refunds.title"])).toBeInTheDocument();
    expect(screen.queryByText(/Remboursement/)).not.toBeInTheDocument();
  });
});
