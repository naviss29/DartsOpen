import { ContactForm } from "@/components/ContactForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contact — DartsOpen" };

export default function ContactPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de confiance, next/image bloque le SVG par défaut */}
          <img src="/brand/logo-horizontal.svg" alt="DartsOpen" width={118} height={50} className="h-6 w-auto mx-auto" />
          <h1 className="text-2xl font-bold text-brand-dark">Nous contacter</h1>
          <p className="text-brand-text-secondary text-sm">
            Une question, une idée, un problème ? On vous répond dans les meilleurs délais.
          </p>
        </div>

        <div className="rounded-xl bg-surface border border-border-muted p-6">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
