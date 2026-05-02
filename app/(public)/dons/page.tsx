import Link from "next/link";
import { DonsPaypalButton } from "@/components/DonsPaypalButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Soutenir DartsOpen — Stêr Eo Production" };

export default function DonsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div className="space-y-2">
          <p className="text-green-400 text-sm font-medium">🎯 DartsOpen</p>
          <h1 className="text-3xl font-bold text-white">Soutenir le projet</h1>
          <p className="text-gray-400">
            DartsOpen est développé et maintenu par{" "}
            <strong className="text-white">Stêr Eo Production</strong>.
            Votre soutien nous aide à maintenir la plateforme et à développer de nouvelles fonctionnalités.
          </p>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-4 text-left">
          <h2 className="font-semibold text-white text-center">À quoi servent vos dons ?</h2>
          <ul className="space-y-3 text-sm text-gray-300">
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>Financer l&apos;hébergement de l&apos;application pour qu&apos;elle reste disponible 24h/24</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>Développer de nouvelles fonctionnalités : bracket avancé, notifications, application mobile…</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>Garder DartsOpen accessible à toutes les associations, quelle que soit leur taille</span>
            </li>
          </ul>
        </div>

        <p className="text-gray-400 text-sm">Choisissez librement le montant de votre contribution.</p>

        <DonsPaypalButton />

        <div className="text-sm text-gray-500 space-y-1 pt-4 border-t border-white/10">
          <p>
            Une question ?{" "}
            <Link href="/contact" className="text-green-400 hover:text-green-300">
              Contactez-nous
            </Link>
          </p>
          <p>Les frais de plateforme DartsOpen (0,10 € / joueur) contribuent également à ce financement.</p>
        </div>
      </div>
    </div>
  );
}
