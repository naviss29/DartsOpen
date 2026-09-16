"use client";

import Image from "next/image";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ApplicationSwitcher } from "@naviss29/design-system";
import type { OrganizationProductsSummary } from "@/lib/api/organizations";

const PORTAL_URL = process.env.NEXT_PUBLIC_BSSITE_URL ?? "https://bapps-studio.com";

const PRODUCTS = [
  { id: "billetasso", name: "BilletAsso", activationKey: "BILLETASSO", href: "https://billetasso.bapps-studio.com", icon: "/brand/apps/billetasso.svg", descriptionKey: "appSwitcher.billetasso" },
  { id: "eventmanager", name: "EventManager", activationKey: "EVENTMANAGER", href: "https://eventmanager.bapps-studio.com", icon: "/brand/apps/eventmanager.svg", descriptionKey: "appSwitcher.eventmanager" },
  { id: "marketplace", name: "Marketplace", activationKey: "MARKETPLACE", href: "https://marketplace.bapps-studio.com", icon: "/brand/apps/marketplace.svg", descriptionKey: "appSwitcher.marketplace" },
  { id: "connect", name: "Connect", activationKey: "CONNECT", href: "https://connect.bapps-studio.com", icon: "/brand/apps/connect.svg", descriptionKey: "appSwitcher.connect" },
  { id: "dartsopen", name: "DartsOpen", activationKey: "DARTSOPEN", href: "/dashboard", icon: "/brand/dartsopen-symbol.svg", descriptionKey: "appSwitcher.dartsopen" },
] as const;

export default function DashboardApplicationSwitcher({
  organizations,
}: {
  organizations: OrganizationProductsSummary[] | null;
}) {
  const { t } = useI18n();
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
      description: t("appSwitcher.portal"),
      href: `${PORTAL_URL}/dashboard`,
      icon: <Image src="/brand/bapps-symbol.png" alt="" width={512} height={512} className="h-10 w-10 object-contain" />,
    },
    ...accessibleProducts.map((product) => ({
      id: product.id,
      name: product.name,
      description: t(product.descriptionKey),
      href: product.href,
      current: product.id === "dartsopen",
      icon: <Image src={product.icon} alt="" width={40} height={40} className="h-10 w-10 object-contain" />,
    })),
  ];

  return (
    <ApplicationSwitcher
      applications={applications}
      label={t("appSwitcher.label")}
      panelTitle={t("appSwitcher.title")}
      allApplicationsLabel={t("appSwitcher.all")}
      allApplicationsHref={`${PORTAL_URL}/dashboard/produits`}
      className="bapps-application-switcher shrink-0"
    />
  );
}
