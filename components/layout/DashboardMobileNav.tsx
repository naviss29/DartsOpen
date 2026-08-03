"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@naviss29/design-system";
import { dashboardNavLinks } from "./DashboardSidebar";

/** Équivalent de DashboardSidebar sous md: (mobile first) — bandeau horizontal, zone tactile ≥44px. */
export default function DashboardMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
      {dashboardNavLinks.map((link) => {
        const current = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              current ? "bg-brand-turquoise/10 text-brand-turquoise" : "text-brand-dark hover:bg-slate-100",
            )}
          >
            <span aria-hidden="true">{link.icon}</span> {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
