import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Soutenir DartsOpen — Stêr Eo Production" };

const PAYPAL_URL = "https://www.paypal.com/paypal.me/SEProduct";

export default function DonsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div className="space-y-2">
          <p className="text-green-400 text-sm font-medium">🎯 DartsOpen</p>
          <h1 className="text-3xl font-bold text-white">Soutenir le projet</h1>
          <p className="text-gray-400">
            DartsOpen est développé et maintenu par <strong className="text-white">Stêr Eo Production</strong>,
            une association passionnée de fléchettes.
          </p>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-4 text-left">
          <h2 className="font-semibold text-white text-center">À quoi servent vos dons ?</h2>
          <ul className="space-y-3 text-sm text-gray-300">
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>Payer l'hébergement du serveur (VPS Hostinger) pour maintenir l'application disponible 24h/24</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>Financer les nouvelles fonctionnalités : bracket avancé, notifications, app mobile...</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5 shrink-0">✓</span>
              <span>Garder DartsOpen gratuit et accessible à toutes les associations, quelle que soit leur taille</span>
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <p className="text-gray-400 text-sm">
            Choisissez librement le montant de votre contribution. Chaque coup de pouce compte !
          </p>
          <a
            href={PAYPAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-xl bg-[#0070BA] hover:bg-[#005ea6] text-white font-semibold px-8 py-4 text-base transition-colors shadow-lg"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .76-.645h6.745c2.366 0 4.01.792 4.648 2.29.278.654.353 1.354.222 2.147l-.007.042v.39l.24.136c.487.272.875.617 1.163 1.038.462.676.617 1.54.46 2.56-.19 1.21-.625 2.26-1.295 3.118a5.78 5.78 0 0 1-2.102 1.652c-.76.344-1.63.518-2.58.518H11.5l-.433 2.762a.77.77 0 0 1-.76.645H7.076zm9.59-13.27c-.047.297-.1.59-.163.876-.61 2.96-2.7 3.983-5.37 3.983H9.58a.659.659 0 0 0-.651.558l-.827 5.243-.235 1.488h2.334l.432-2.74a.77.77 0 0 1 .76-.645h.48c3.108 0 5.54-1.263 6.252-4.912.297-1.525.143-2.8-.659-3.85z"/>
            </svg>
            Faire un don via PayPal
          </a>
          <p className="text-xs text-gray-500">
            Vous serez redirigé vers PayPal. Le montant est libre.
          </p>
        </div>

        <div className="text-sm text-gray-500 space-y-1 pt-4 border-t border-white/10">
          <p>Une question ? <Link href="/contact" className="text-green-400 hover:text-green-300">Contactez-nous</Link></p>
          <p>Les frais de plateforme DartsOpen (0,10 € / équipe) contribuent également à ce financement.</p>
        </div>
      </div>
    </div>
  );
}
