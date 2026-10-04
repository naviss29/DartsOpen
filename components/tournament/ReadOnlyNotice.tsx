import { Alert } from "@naviss29/design-system";
import { getI18n } from "@/lib/i18n/server";

/**
 * ADR-0021 / L6 — bandeau des pages tournoi pour un MEMBER : il voit tout (y compris les
 * données personnelles à l'écran, D2) mais aucune action de gestion. Le dire explicitement
 * évite qu'il cherche des boutons masqués ou croie à un bug.
 */
export async function ReadOnlyNotice() {
  const { t } = await getI18n();
  return (
    <Alert tone="info">
      <p>{t("orgAccess.readOnlyNotice")}</p>
    </Alert>
  );
}
