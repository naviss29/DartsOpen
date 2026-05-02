/**
 * Remplit un tournoi avec des équipes fictives pour les tests.
 * Usage : npx tsx scripts/seed-tournament.ts <tournament_id> [nb_equipes]
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id, name, max_players, players_per_team, registration_mode")
    .eq("id", tournamentId)
    .single();

  if (error || !tournament) {
    console.error("Tournoi introuvable :", error?.message);
    process.exit(1);
  }

  const { count: existing } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "PAID");

  const playersRegistered = (existing ?? 0) * tournament.players_per_team;
  const slotsLeft = tournament.max_players - playersRegistered;
  const teamsLeft = Math.floor(slotsLeft / tournament.players_per_team);
  const teamsToCreate = nbEquipes > 0 ? Math.min(nbEquipes, teamsLeft) : teamsLeft;

  console.log(`\n🎯 Tournoi : ${tournament.name}`);
  console.log(`👥 ${tournament.players_per_team} joueur(s) par équipe`);
  console.log(`📊 Places restantes : ${slotsLeft} joueurs (${teamsLeft} équipes)`);
  console.log(`➕ Équipes à créer : ${teamsToCreate}\n`);

  if (teamsToCreate === 0) {
    console.log("✅ Tournoi déjà complet.");
    return;
  }

  const usedNames = new Set<string>();
  const registrations = [];

  for (let i = 0; i < teamsToCreate; i++) {
    let teamName = randomPick(NOMS_EQUIPE);
    while (usedNames.has(teamName)) {
      teamName = `${randomPick(NOMS_EQUIPE)} ${i + 1}`;
    }
    usedNames.add(teamName);

    const playerNames = Array.from({ length: tournament.players_per_team }, () =>
      randomPick(PRENOMS)
    );

    const contactName = playerNames[0];

    registrations.push({
      tournament_id: tournamentId,
      player_name: tournament.players_per_team > 1 ? teamName : playerNames[0],
      player_email: randomEmail(contactName, i + 1),
      player_phone: null,
      player_names: playerNames,
      platform_fee_cents: 10 * tournament.players_per_team,
      fee_collected: false,
      status: "PAID",
    });
  }

  const { error: insertError } = await supabase.from("registrations").insert(registrations);

  if (insertError) {
    console.error("❌ Erreur lors de l'insertion :", insertError.message);
    process.exit(1);
  }

  console.log(`✅ ${teamsToCreate} équipe(s) insérée(s) avec succès !\n`);
  registrations.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.player_name} (${r.player_names.join(", ")}) — ${r.player_email}`);
  });
}

main();
