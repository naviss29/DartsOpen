"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { CURRENT_ORG_COOKIE, getMyMemberships, realMemberships } from "@/lib/auth/organizationAccess";
import { getI18n } from "@/lib/i18n/server";

/**
 * ADR-0021 / L6 — mémorise l'organisation courante choisie dans le sélecteur. L'identifiant
 * soumis n'est jamais cru : il doit figurer parmi les VRAIES appartenances relues auprès de
 * SterPlatform (jamais une organisation héritée partagée). Le cookie n'est qu'une préférence,
 * getCurrentOrganization() le revérifie à chaque lecture — un membre retiré entre-temps perd
 * simplement cette organisation.
 */
export async function selectCurrentOrganization(organizationId: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) redirect("/login");

  const { t } = await getI18n();
  // getMyMemberships() ne lève jamais (pannes converties en UNAVAILABLE) : redirect() reste
  // hors de tout try/catch et se propage normalement.
  const memberships = await getMyMemberships();
  if (memberships.status === "UNAUTHENTICATED") redirect("/login");
  if (memberships.status === "UNAVAILABLE") return { error: t("orgAccess.roleUnavailable") };

  const match = realMemberships(memberships.memberships).find((m) => m.id === organizationId);
  if (!match) return { error: t("orgSelector.updateError") };

  try {
    const store = await cookies();
    store.set(CURRENT_ORG_COOKIE, match.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch (err) {
    console.error("[selectCurrentOrganization] cookie d'organisation courante non enregistré", err);
    return { error: t("orgSelector.updateError") };
  }

  revalidatePath("/", "layout");
  return {};
}
