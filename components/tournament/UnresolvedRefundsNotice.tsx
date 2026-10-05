import { Alert } from "@naviss29/design-system";
import type { MessageKey } from "@/lib/i18n/catalogs";

export type UnresolvedRefund = {
  id: string;
  player_name: string;
  refund_failed_at: string | null;
};

type Props = {
  refunds: UnresolvedRefund[];
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  formatDate: (value: string) => string;
};

/**
 * F13 (audit du 04/10/2026) — remboursements d'inscription non aboutis, sur la page Joueurs de
 * l'organisateur. Sans ce bandeau, un remboursement refusé par Stripe resterait invisible : les
 * inscriptions REFUND_PENDING ne figurent pas dans la liste des inscrits (elles n'occupent pas de
 * place) et l'argent n'aurait été rendu à personne. Aucun bouton de relance : la suite est une
 * décision de l'organisateur. Composant pur (textes et format de date injectés) pour être testé
 * sans requête.
 */
export function UnresolvedRefundsNotice({ refunds, t, formatDate }: Props) {
  if (refunds.length === 0) return null;
  const hasFailure = refunds.some((r) => r.refund_failed_at);

  return (
    <Alert tone={hasFailure ? "error" : "warning"}>
      <p className="font-medium">{t("refunds.title")}</p>
      <p className="mt-1">{t("refunds.intro")}</p>
      <ul className="mt-2 space-y-2">
        {refunds.map((r) => (
          <li key={r.id}>
            <span className="font-medium">{r.player_name}</span>
            {" — "}
            {r.refund_failed_at ? t("refunds.failed", { date: formatDate(r.refund_failed_at) }) : t("refunds.pending")}
          </li>
        ))}
      </ul>
      {hasFailure && <p className="mt-2">{t("refunds.failedHelp")}</p>}
    </Alert>
  );
}
