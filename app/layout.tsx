import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BuildSkewGuardReset } from "@/components/ui/BuildSkewGuardReset";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { openGraphLocales } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  const title = t("metadata.title");
  const description = t("metadata.description");

  return {
    title: {
      default: title,
      template: "%s — DartsOpen",
    },
    description,
    openGraph: {
      title,
      description,
      siteName: "DartsOpen — by BApps Studio",
      locale: openGraphLocales[locale],
      type: "website",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, messages } = await getI18n();

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <I18nProvider locale={locale} messages={messages}>
          <BuildSkewGuardReset />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
