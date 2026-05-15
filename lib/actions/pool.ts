"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { distributePlayersIntoPools } from "@/lib/utils/pools";
import { generateRoundRobin, assignBoards } from "@/lib/utils/bracket";
import { apiListRegistrations, apiGeneratePools, apiGetTournament } from "@/lib/api/tournament";

const POOL_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export async function generatePools(
  tournamentId: string,
  _prevState: { error?: string } | null,
  _formData: FormData
): Promise<{ error?: string }> {
  const tournament = await apiGetTournament(tournamentId) as {
    status: string;
    nb_pools: number;
    nb_boards: number;
    rounds: { id: string; order: number }[];
  } | null;

  if (!tournament) return { error: "Tournoi introuvable." };
  if (tournament.status !== "OPEN") {
    return { error: "Les poules ne peuvent être générées que lorsque le tournoi est ouvert." };
  }

  const players = await apiListRegistrations(tournamentId, "PAID") as { id: string }[];

  if (!players || players.length < 2) {
    return { error: "Il faut au moins 2 équipes inscrites pour générer les poules." };
  }

  // Algorithm stays in TypeScript
  const effectivePools = Math.min(tournament.nb_pools, Math.floor(players.length / 2));
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const poolGroups = distributePlayersIntoPools(shuffled, effectivePools);

  const pools = poolGroups.map((group, i) => ({
    name: `Poule ${POOL_NAMES[i]}`,
    playerIds: group.map((p: { id: string }) => p.id),
  }));

  const matches: {
    poolIndex: number;
    player1Id: string;
    player2Id: string;
    boardNumber: number;
    status: string;
  }[] = [];

  poolGroups.forEach((group: { id: string }[], poolIndex: number) => {
    const playerIds = group.map(p => p.id);
    const pairings = generateRoundRobin(playerIds);
    const assigned = assignBoards(pairings, tournament.nb_boards);
    assigned.forEach((m: { player1_id: string; player2_id: string; board_number: number; status: string }) => {
      matches.push({
        poolIndex,
        player1Id: m.player1_id,
        player2Id: m.player2_id,
        boardNumber: m.board_number,
        status: m.status,
      });
    });
  });

  const res = await apiGeneratePools(tournamentId, { pools, matches });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Erreur lors de la génération des poules." };
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/pools`);
  redirect(`/tournaments/${tournamentId}/pools`);
}
