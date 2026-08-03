import { ContactForm } from "@/components/ContactForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contact — DartsOpen" };

export default function ContactPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <p className="text-brand-turquoise text-sm font-medium">🎯 DartsOpen</p>
          <h1 className="text-2xl font-bold text-brand-dark">Nous contacter</h1>
          <p className="text-brand-text-secondary text-sm">
            Une question, une idée, un problème ? On vous répond dans les meilleurs délais.
          </p>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-6">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
