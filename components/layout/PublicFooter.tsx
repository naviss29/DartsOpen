import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { getI18n } from "@/lib/i18n/server";

/**
 * Pied de page public (liens légaux + langue). Extrait de `app/(public)/layout.tsx` pour être
 * partagé avec la page « introuvable » (`app/not-found.tsx`), qui vit hors du groupe (public) :
 * un visiteur perdu doit retrouver les mêmes repères que sur les pages publiques.
 */
export default async function PublicFooter() {
  const { t } = await getI18n();

  return (
    <footer className="flex flex-wrap items-center justify-center gap-4 border-t border-border-muted px-4 py-4 text-center text-xs text-brand-text-secondary">
      <a href="/mentions-legales" className="hover:text-brand-dark">{t("footer.legal")}</a>
      <a href="/confidentialite" className="hover:text-brand-dark">{t("footer.privacy")}</a>
      <a href="/cgu" className="hover:text-brand-dark">{t("footer.terms")}</a>
      <LanguageSwitcher className="text-brand-dark" />
    </footer>
  );
}
