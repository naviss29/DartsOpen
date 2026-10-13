import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db/client";
import { canIndexPublicPages, publicUrl } from "@/lib/seo";

// Seuls les tournois ouverts À L'INSCRIPTION EN LIGNE : la page /register d'un tournoi « sur place »
// refuse l'inscription, elle n'a rien à faire dans un index de recherche.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!canIndexPublicPages()) return [];
  const tournaments = await prisma.tournament.findMany({
    where: { status: "OPEN", registrationMode: "ONLINE" }, select: { id: true }, orderBy: { id: "asc" },
  });
  return tournaments.map((tournament) => ({ url: publicUrl(`/t/${encodeURIComponent(tournament.id)}/register`) }));
}
