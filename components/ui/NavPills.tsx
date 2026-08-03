import Link from "next/link";
import { cn } from "@naviss29/design-system";

interface Item {
  href: string;
  label: string;
  current?: boolean;
  /** Compteur optionnel affiché à droite du libellé (ex. nombre de joueurs inscrits). */
  badge?: string | number;
  /** Étape pas encore accessible (ex. phases finales avant le démarrage du tournoi) — rendu comme un span non cliquable. */
  disabled?: boolean;
  /** Explique pourquoi l'onglet est désactivé (attribut title). */
  disabledReason?: string;
}

/**
 * Navigation secondaire par pastilles — remplace le motif recopié à la main dans 5 pages
 * (players/pools/bracket/tournoi/PrintButton), déjà en pratique une "Tabs" non construite
 * (le `Tabs` du design-system existe mais suppose un contenu affiché en place, pas une
 * navigation entre routes — pas adapté ici).
 */
export default function NavPills({ items }: { items: Item[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {items.map((item) =>
        item.disabled ? (
          <span
            key={item.href}
            title={item.disabledReason}
            className="cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400"
          >
            {item.label}
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.current ? "page" : undefined}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              item.current
                ? "bg-darts-green text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:border-darts-green hover:text-darts-green",
            )}
          >
            {item.label}
            {item.badge !== undefined && (
              <span
                className={cn(
                  "ml-2 rounded-full px-2 py-0.5 text-xs",
                  item.current ? "bg-white/20" : "bg-gray-100 text-gray-600",
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        ),
      )}
    </nav>
  );
}
