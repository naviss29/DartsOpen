import Link from "next/link";
import type { ReactNode } from "react";

export function LegalLayout({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-2">
          <Link href="/" className="text-sm text-brand-turquoise hover:underline">
            ← Retour
          </Link>
          <h1 className="text-2xl font-bold text-brand-dark">{title}</h1>
          <p className="text-xs text-brand-text-secondary">Dernière mise à jour : {updatedAt}</p>
        </div>
        <div className="space-y-6 text-sm leading-relaxed text-brand-dark [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-brand-dark [&_h2]:pt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-brand-turquoise [&_a]:hover:underline">
          {children}
        </div>
      </div>
    </div>
  );
}
