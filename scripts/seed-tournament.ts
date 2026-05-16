/**
 * Remplit un tournoi avec des équipes fictives pour les tests.
 * Usage : npx tsx scripts/seed-tournament.ts <tournament_id> [nb_equipes]
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PRENOMS = [
  "Enzo", "Lucas", "Léo", "Hugo", "Tom", "Mathis", "Axel", "Théo", "Noah", "Ethan",
  "Jade", "Emma", "Léa", "Manon", "Camille", "Inès", "Chloé", "Sarah", "Lucie", "Alice",
  "Baptiste", "Romain", "Julien", "Pierre", "Antoine", "Nicolas", "Maxime", "Quentin", "Kevin", "Dylan",
  "Alan", "Erwan", "Tanguy", "Gwenn", "Yann", "Loïc", "Ronan", "Maëlys", "Tifenn", "Brendan",
];

const NOMS_EQUIPE = [
  "Les Flèches d'Or", "Team Bullseye", "Les Tocards", "Double Out", "Triple Crown",
  "Les Baroudeurs", "Vise et Plante", "Les Pros du Zinc", "Cricket Masters", "501 Forever",
  "Les Dardeurs", "Full House", "Les Finishers", "Top of the Board", "Les Réglos",
  "Brest Darts", "Les Corsaires", "Team Breizh", "Les Mousquetaires", "Double Eagle",
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmail(name: string, i: number): string {
  const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".");
  return `${slug}.${i}@test.fr`;
}

async function main() {
  const tournamentId = process.argv[2];
  const nbEquipes = parseInt(process.argv[3] ?? "0");

  if (!tournamentId) {
    console.error("Usage : npx tsx scripts/seed-tournament.ts <tournament_id> [nb_equipes]");
    process.exit(1);
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true, maxPlayers: true, playersPerTeam: true },
  });

  if (!tournament) {
    console.error("Tournoi introuvable.");
    process.exit(1);
  }

  const existing = await prisma.registration.count({
    where: { tournamentId, status: "PAID" },
  });

  const playersRegistered = existing * tournament.playersPerTeam;
  const slotsLeft = tournament.maxPlayers - playersRegistered;
  const teamsLeft = Math.floor(slotsLeft / tournament.playersPerTeam);
  const teamsToCreate = nbEquipes > 0 ? Math.min(nbEquipes, teamsLeft) : teamsLeft;

  console.log(`\n🎯 Tournoi : ${tournament.name}`);
  console.log(`👥 ${tournament.playersPerTeam} joueur(s) par équipe`);
  console.log(`📊 Places restantes : ${slotsLeft} joueurs (${teamsLeft} équipes)`);
  console.log(`➕ Équipes à créer : ${teamsToCreate}\n`);

  if (teamsToCreate === 0) {
    console.log("✅ Tournoi déjà complet.");
    await prisma.$disconnect();
    return;
  }

  const usedNames = new Set<string>();

  for (let i = 0; i < teamsToCreate; i++) {
    let teamName = randomPick(NOMS_EQUIPE);
    while (usedNames.has(teamName)) {
      teamName = `${randomPick(NOMS_EQUIPE)} ${i + 1}`;
    }
    usedNames.add(teamName);

    const playerNames = Array.from({ length: tournament.playersPerTeam }, () => randomPick(PRENOMS));
    const contactName = playerNames[0];
    const playerName = tournament.playersPerTeam > 1 ? teamName : playerNames[0];

    await prisma.registration.create({
      data: {
        tournamentId,
        playerName,
        playerEmail: randomEmail(contactName, i + 1),
        playerPhone: null,
        playerNames,
        platformFeeCents: 10 * tournament.playersPerTeam,
        feeCollected: false,
        status: "PAID",
      },
    });

    console.log(`  ${i + 1}. ${playerName} (${playerNames.join(", ")}) — ${randomEmail(contactName, i + 1)}`);
  }

  console.log(`\n✅ ${teamsToCreate} équipe(s) insérée(s) avec succès !`);
  await prisma.$disconnect();
}

main();
