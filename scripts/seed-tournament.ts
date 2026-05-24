/**
 * Remplit un tournoi avec des équipes fictives pour les tests.
 * Usage : npm run seed:players
 * Charge .env.local automatiquement — aucune modification de fichier requise.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

// Charge .env.local si présent (sans écraser les vars déjà définies)
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) {
      const [, key, val] = match;
      if (!(key in process.env)) process.env[key] = val.replace(/^["']|["']$/g, "");
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL introuvable. Vérifie ton .env.local.");
  process.exit(1);
}

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
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Liste des tournois
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, maxPlayers: true, playersPerTeam: true, status: true },
  });

  if (tournaments.length === 0) {
    console.log("Aucun tournoi trouvé dans la base.");
    await cleanup(rl);
    return;
  }

  console.log("\nTournois disponibles :\n");
  tournaments.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name}  [${t.status}]  (${t.playersPerTeam} joueur/équipe, max ${t.maxPlayers})`);
  });

  const choixStr = await rl.question("\nNuméro du tournoi : ");
  const choix = parseInt(choixStr.trim()) - 1;
  if (isNaN(choix) || choix < 0 || choix >= tournaments.length) {
    console.error("Choix invalide.");
    await cleanup(rl);
    return;
  }

  const tournament = tournaments[choix];

  const existing = await prisma.registration.count({
    where: { tournamentId: tournament.id, status: "PAID" },
  });
  const slotsLeft = tournament.maxPlayers - existing * tournament.playersPerTeam;
  const teamsLeft = Math.floor(slotsLeft / tournament.playersPerTeam);

  console.log(`\nPlaces restantes : ${slotsLeft} joueurs (${teamsLeft} équipes)`);

  const nbStr = await rl.question(`Nombre d'équipes à créer (max ${teamsLeft}) : `);
  const nbEquipes = parseInt(nbStr.trim());
  if (isNaN(nbEquipes) || nbEquipes <= 0) {
    console.error("Nombre invalide.");
    await cleanup(rl);
    return;
  }

  const teamsToCreate = Math.min(nbEquipes, teamsLeft);
  if (teamsToCreate === 0) {
    console.log("Tournoi déjà complet.");
    await cleanup(rl);
    return;
  }

  console.log(`\nCréation de ${teamsToCreate} équipe(s)...\n`);

  const usedNames = new Set<string>();

  for (let i = 0; i < teamsToCreate; i++) {
    let teamName = randomPick(NOMS_EQUIPE);
    while (usedNames.has(teamName)) teamName = `${randomPick(NOMS_EQUIPE)} ${i + 1}`;
    usedNames.add(teamName);

    const playerNames = Array.from({ length: tournament.playersPerTeam }, () => randomPick(PRENOMS));
    const playerName = tournament.playersPerTeam > 1 ? teamName : playerNames[0];
    const email = randomEmail(playerNames[0], i + 1);

    await prisma.registration.create({
      data: {
        tournamentId: tournament.id,
        playerName,
        playerEmail: email,
        playerPhone: null,
        playerNames,
        platformFeeCents: 10 * tournament.playersPerTeam,
        feeCollected: false,
        status: "PAID",
      },
    });

    console.log(`  ${i + 1}. ${playerName} (${playerNames.join(", ")})`);
  }

  console.log(`\n${teamsToCreate} équipe(s) insérée(s) avec succès !\n`);
  await cleanup(rl);
}

async function cleanup(rl: readline.Interface) {
  rl.close();
  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
