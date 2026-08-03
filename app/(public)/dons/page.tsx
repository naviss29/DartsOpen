import Link from "next/link";
import { DonsPaypalButton } from "@/components/DonsPaypalButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Soutenir DartsOpen — Stêr Eo Production" };

export default function DonsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div className="space-y-2">
          <p className="text-darts-green text-sm font-medium">🎯 DartsOpen</p>
          <h1 className="text-3xl font-bold text-darts-text">Soutenir le projet</h1>
          <p className="text-darts-text-secondary">
            DartsOpen est développé et maintenu par{" "}
            <strong className="text-darts-text">Stêr Eo Production</strong>.
            Votre soutien nous aide à maintenir la plateforme et à développer de nouvelles fonctionnalités.
          </p>
        </div>

        <div className="rounded-xl bg-darts-surface border border-darts-border p-6 space-y-4 text-left">
          <h2 className="font-semibold text-darts-text text-center">À quoi servent vos dons ?</h2>
          <ul className="space-y-3 text-sm text-darts-text">
            <li className="flex items-start gap-3">
              <span className="text-darts-green mt-0.5 shrink-0">✓</span>
              <span>Financer l&apos;hébergement de l&apos;application pour qu&apos;elle reste disponible 24h/24</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-darts-green mt-0.5 shrink-0">✓</span>
              <span>Développer de nouvelles fonctionnalités : bracket avancé, notifications, application mobile…</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-darts-green mt-0.5 shrink-0">✓</span>
              <span>Garder DartsOpen accessible à toutes les associations, quelle que soit leur taille</span>
            </li>
          </ul>
        </div>

        <p className="text-darts-text-secondary text-sm">Choisissez librement le montant de votre contribution.</p>

        <DonsPaypalButton />

        <div className="text-sm text-darts-text-secondary space-y-1 pt-4 border-t border-darts-border">
          <p>
            Une question ?{" "}
            <Link href="/contact" className="text-darts-green hover:text-darts-green/80">
              Contactez-nous
            </Link>
          </p>
          <p>Les frais de plateforme DartsOpen (0,10 € / joueur) contribuent également à ce financement.</p>
        </div>
      </div>
    </div>
  );
}
