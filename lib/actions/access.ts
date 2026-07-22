import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { dbGetTournament } from "@/lib/db/tournament";

export async function getOwnedTournament(tournamentId: string) {
  const user = await getUser();
  if (!user) redirect("/login");

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament || tournament.association_id !== user.id) notFound();

  return tournament;
}
