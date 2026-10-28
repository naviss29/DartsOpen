import Link from "next/link";
import type { Metadata } from "next";
import { Text, Title } from "@naviss29/design-system";
import Button from "@/components/ui/Button";
import PublicFooter from "@/components/layout/PublicFooter";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("notFound.title"), robots: { index: false, follow: false } };
}

/**
 * Page « introuvable » de toute l'application (recette pré-lancement) : sans elle, Next.js
 * affichait sa page 404 anglaise par défaut, sans repère DartsOpen. Le bouton renvoie vers « / »,
 * qui oriente lui-même vers le tableau de bord (session) ou la présentation du produit.
 */
export default async function NotFound() {
  const { t } = await getI18n();

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark flex flex-col">
      <header className="border-b border-border-muted bg-surface px-4 py-3">
        <Link href="/" className="inline-flex min-h-11 items-center" aria-label="DartsOpen">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de confiance, next/image bloque le SVG par défaut */}
          <img src="/brand/logo-horizontal.svg" alt="" width={118} height={50} className="h-7 w-auto" />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <Title>{t("notFound.title")}</Title>
        <Text tone="secondary">{t("notFound.description")}</Text>
        <Button href="/" variant="primary">{t("notFound.home")}</Button>
      </main>
      <PublicFooter />
    </div>
  );
}
