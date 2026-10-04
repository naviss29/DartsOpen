"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { selectCurrentOrganization } from "@/lib/actions/currentOrganization";
import type { MessageKey } from "@/lib/i18n/catalogs";

export type OrganizationChoice = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" };

/**
 * ADR-0021 / L6 — « Organization active » du header (charte §10.1, position 4) : nom tronqué
 * (160 px tablette, 240 px desktop) et, s'il y en a plusieurs, choix de l'organisation dans
 * laquelle on travaille. Variante `drawer` : sous 768 px, première information du menu mobile
 * (charte §4.1), atteignable en une interaction. Aucun rendu sans vraie organisation (compte
 * hérité) : il n'y a rien à choisir.
 */
export default function OrganizationSelector({
  organizations,
  currentId,
  variant,
}: {
  organizations: OrganizationChoice[];
  currentId: string | null;
  variant: "header" | "drawer";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  if (organizations.length === 0) return null;

  const current = organizations.find((o) => o.id === currentId) ?? null;
  const roleLabel = (role: OrganizationChoice["role"]) => t(`orgSelector.role.${role}` as MessageKey);
  const selectId = `bapps-organization-${variant}`;

  const wrapperClass =
    variant === "header"
      ? "hidden min-w-0 flex-col md:flex md:max-w-[160px] lg:max-w-[240px]"
      : "flex min-w-0 flex-col gap-1 px-4 pt-4";

  function onChange(nextId: string) {
    setError("");
    startTransition(async () => {
      try {
        const result = await selectCurrentOrganization(nextId);
        if (result?.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        console.error("[OrganizationSelector] changement d'organisation impossible", err);
        setError(t("orgSelector.updateError"));
      }
    });
  }

  return (
    <div className={wrapperClass}>
      {variant === "drawer" && (
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-sidenav-icon)" }}>
          {t("orgSelector.label")}
        </span>
      )}
      {organizations.length === 1 ? (
        // Une seule vraie organisation : pas de choix à faire, simple rappel du contexte.
        <p className="min-w-0 truncate text-sm font-medium text-white" title={`${organizations[0].name} · ${roleLabel(organizations[0].role)}`}>
          {organizations[0].name}
        </p>
      ) : (
        <>
          <label className="sr-only" htmlFor={selectId}>
            {t("orgSelector.label")}
          </label>
          <select
            id={selectId}
            value={current?.id ?? ""}
            disabled={isPending}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-10 w-full min-w-0 truncate rounded-md border border-white/30 bg-transparent px-2 py-1 text-sm text-white"
            aria-describedby={error ? `${selectId}-error` : undefined}
          >
            {!current && (
              <option value="" disabled className="text-brand-dark">
                {t("orgSelector.placeholder")}
              </option>
            )}
            {organizations.map((o) => (
              <option key={o.id} value={o.id} className="text-brand-dark">
                {o.name} · {roleLabel(o.role)}
              </option>
            ))}
          </select>
        </>
      )}
      {error && (
        <span id={`${selectId}-error`} role="alert" className="mt-1 text-xs text-white">
          {error}
        </span>
      )}
    </div>
  );
}
