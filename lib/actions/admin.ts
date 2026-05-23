"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { dbArbitrateMatch } from "@/lib/db/tournament";

export async function arbitrateMatch(
  matchId: string,
  tournamentId: string,
  setWinners: { setId: string; winnerId: string | null }[]
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) redirect("/login");

  const result = await dbArbitrateMatch(matchId, setWinners).catch(() => ({
    error: "Erreur lors de la correction du match.",
  }));
  if (result.error) return result;

  revalidatePath(`/tournaments/${tournamentId}/pools`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}
