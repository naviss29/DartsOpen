"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { distributeWithSeeding } from "@/lib/utils/pools";
import { generateRoundRobin } from "@/lib/utils/bracket";
import { dbListRegistrations, dbGeneratePools } from "@/lib/db/tournament";
import { getOwnedTournament } from "@/lib/actions/access";

const POOL_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export async function generatePools(
  tournamentId: string,
  _prevState: { error?: string } | null,
  _formData: FormData
): Promise<{ error?: string }> {
  const [tournament, players] = await Promise.all([
    getOwnedTournament(tournamentId),
    dbListRegistrations(tournamentId, "PAID"),
  ]);

  if (tournament.status !== "OPEN" && tournament.status !== "IN_PROGRESS") {
    return { error: "Les poules ne peuvent être générées que lorsque le tournoi est ouvert ou en cours." };
  }

  if (!players || players.length < 2) {
    return { error: "Il faut au moins 2 équipes inscrites pour générer les poules." };
  }

  const effectivePools = Math.min(tournament.nb_pools, Math.floor(players.length / 2));
  const seeded = players.filter((p) => p.seeded);
  const unseeded = players.filter((p) => !p.seeded).sort(() => Math.random() - 0.5);
  const poolGroups = distributeWithSeeding(seeded, unseeded, effectivePools);

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

  // Collecter tous les appariements. Les premiers nb_boards matchs démarrent immédiatement
  // sur une cible assignée. Les suivants ont board=0 (non assigné) et attendent dans la queue.
  const allPairings: [string, string][] = [];
  const pairingPool: number[] = [];

  poolGroups.forEach((group: { id: string }[], poolIndex: number) => {
    const playerIds = group.map((p: { id: string }) => p.id);
    generateRoundRobin(playerIds).forEach((pair: [string, string]) => {
      allPairings.push(pair);
      pairingPool.push(poolIndex);
    });
  });

  allPairings.forEach((pair, index) => {
    matches.push({
      poolIndex: pairingPool[index],
      player1Id: pair[0],
      player2Id: pair[1],
      boardNumber: index < tournament.nb_boards ? index + 1 : 0,
      status: index < tournament.nb_boards ? "IN_PROGRESS" : "PENDING",
    });
  });

  const ok = await dbGeneratePools(tournamentId, pools, matches).catch(() => false);
  if (ok === false) return { error: "Erreur lors de la génération des poules." };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/pools`);
  redirect(`/tournaments/${tournamentId}/pools`);
}
