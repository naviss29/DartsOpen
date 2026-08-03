import Link from "next/link";
import { cn } from "@naviss29/design-system";

interface Item {
  href: string;
  label: string;
  current?: boolean;
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
      {items.map((item) => (
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
        </Link>
      ))}
    </nav>
  );
}
