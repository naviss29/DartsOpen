import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db/client";
import { canIndexPublicPages, publicUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!canIndexPublicPages()) return [];
  const tournaments = await prisma.tournament.findMany({
    where: { status: "OPEN" }, select: { id: true }, orderBy: { id: "asc" },
  });
  return tournaments.map((tournament) => ({ url: publicUrl(`/t/${encodeURIComponent(tournament.id)}/register`) }));
}
