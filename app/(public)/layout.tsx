import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { getI18n } from "@/lib/i18n/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark flex flex-col">
      <div className="flex-1">{children}</div>
      <footer className="flex flex-wrap items-center justify-center gap-4 border-t border-border-muted px-4 py-4 text-center text-xs text-brand-text-secondary">
        <a href="/mentions-legales" className="hover:text-brand-dark">{t("footer.legal")}</a>
        <a href="/confidentialite" className="hover:text-brand-dark">{t("footer.privacy")}</a>
        <a href="/cgu" className="hover:text-brand-dark">{t("footer.terms")}</a>
        <LanguageSwitcher className="text-brand-dark" />
      </footer>
    </div>
  );
}
