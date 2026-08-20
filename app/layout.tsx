import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BuildSkewGuardReset } from "@/components/ui/BuildSkewGuardReset";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const title = "DartsOpen — Gestion de tournois de fléchettes";
const description = "Plateforme SaaS de gestion de tournois de fléchettes : inscriptions en ligne, scores en temps réel, tableaux de bord sur smartphone. Un produit BApps Studio.";

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s — DartsOpen",
  },
  description,
  openGraph: {
    title,
    description,
    siteName: "DartsOpen — by BApps Studio",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <BuildSkewGuardReset />
        {children}
      </body>
    </html>
  );
}
