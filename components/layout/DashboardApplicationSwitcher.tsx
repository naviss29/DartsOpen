"use client";

import Image from "next/image";
import { ApplicationSwitcher } from "@naviss29/design-system";
import type { OrganizationProductsSummary } from "@/lib/api/organizations";

const PORTAL_URL = process.env.NEXT_PUBLIC_BSSITE_URL ?? "https://bapps-studio.com";

const PRODUCTS = [
  { id: "billetasso", name: "BilletAsso", activationKey: "BILLETASSO", href: "https://billetasso.bapps-studio.com", icon: "/brand/apps/billetasso.svg", description: "Billetterie et contrôle d’accès" },
  { id: "eventmanager", name: "EventManager", activationKey: "EVENTMANAGER", href: "https://eventmanager.bapps-studio.com", icon: "/brand/apps/eventmanager.svg", description: "Équipes, missions et plannings" },
  { id: "marketplace", name: "Marketplace", activationKey: "MARKETPLACE", href: "https://marketplace.bapps-studio.com", icon: "/brand/apps/marketplace.svg", description: "Marchés, stands et exposants" },
  { id: "connect", name: "Connect", activationKey: "CONNECT", href: "https://connect.bapps-studio.com", icon: "/brand/apps/connect.svg", description: "Vitrine publique des organisations" },
  { id: "dartsopen", name: "DartsOpen", activationKey: "DARTSOPEN", href: "/dashboard", icon: "/brand/dartsopen-symbol.svg", description: "Organisation de tournois de fléchettes" },
] as const;

export default function DashboardApplicationSwitcher({
  organizations,
}: {
  organizations: OrganizationProductsSummary[] | null;
}) {
  const activeProductKeys = new Set(
    (organizations ?? []).flatMap((organization) =>
      organization.activeProducts.map((activation) => activation.product),
    ),
  );

  const accessibleProducts = PRODUCTS.filter(
    (product) => product.id === "dartsopen" || activeProductKeys.has(product.activationKey),
  );

  const applications = [
    {
      id: "bapps-studio",
      name: "BApps Studio",
      description: "Tableau de bord",
      href: `${PORTAL_URL}/dashboard`,
      icon: <Image src="/brand/bapps-symbol.png" alt="" width={512} height={512} className="h-10 w-10 object-contain" />,
    },
    ...accessibleProducts.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      href: product.href,
      current: product.id === "dartsopen",
      icon: <Image src={product.icon} alt="" width={40} height={40} className="h-10 w-10 object-contain" />,
    })),
  ];

  return (
    <ApplicationSwitcher
      applications={applications}
      allApplicationsHref={`${PORTAL_URL}/dashboard/produits`}
      className="bapps-application-switcher shrink-0"
    />
  );
}
