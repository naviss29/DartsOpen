"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { getMyOrganizations } from "@/lib/api/organizations";
import { dbSetOrganizationSlug, dbClearOrganizationSlug } from "@/lib/db/tournament";

/**
 * Lie l'organisateur DartsOpen connecté à l'une de ses organisations BApps Studio
 * (SterPlatform) — mission DO-003. Le slug soumis par le formulaire n'est jamais fait
 * confiance tel quel : revérifié côté serveur contre la liste réelle des organisations de
 * l'utilisateur (même discipline que la résolution SIREN côté SterPlatform — ne jamais
 * accepter un aperçu client falsifié).
 */
export async function linkOrganization(_prevState: { error?: string } | undefined, formData: FormData): Promise<{ error?: string } | undefined> {
  const user = await getUser();
  if (!user) redirect("/login");

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { error: "Sélectionnez une organisation." };

  const organizations = await getMyOrganizations();
  if (!organizations) return { error: "Impossible de récupérer vos organisations BApps Studio. Réessayez." };

  const match = organizations.find((o) => o.slug === slug);
  if (!match) return { error: "Cette organisation ne vous appartient pas." };
  if (match.role !== "OWNER" && match.role !== "ADMIN") {
    return { error: "Seuls les rôles Propriétaire ou Administrateur peuvent lier une organisation." };
  }

  await dbSetOrganizationSlug(user.id, slug);
  revalidatePath("/settings");
}

export async function unlinkOrganization(): Promise<void> {
  const user = await getUser();
  if (!user) redirect("/login");

  await dbClearOrganizationSlug(user.id);
  revalidatePath("/settings");
}
