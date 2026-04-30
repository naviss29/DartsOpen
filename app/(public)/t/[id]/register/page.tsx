import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { RegisterTeamForm } from "@/components/tournament/RegisterTeamForm";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }

export const metadata: Metadata = { title: "Inscription — DartsOpen" };

export default async function RegisterPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { cancelled } = await searchParams;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, date, location, entry_fee, max_players, status")
    .eq("id", id)
    .eq("status", "OPEN")
    .single();

  if (!tournament) notFound();

  const { count } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", id)
    .eq("status", "PAID");

  const isFull = (count ?? 0) >= tournament.max_players;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* En-tête */}
        <div className="text-center space-y-2">
          <p className="text-green-400 text-sm font-medium">🎯 DartsOpen</p>
          <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
          <p className="text-gray-400 text-sm">
            📅 {new Date(tournament.date).toLocaleDateString("fr-FR")} &nbsp;·&nbsp;
            📍 {tournament.location}
          </p>
          <p className="text-gray-300 text-sm">
            {count ?? 0} / {tournament.max_players} équipes inscrites
          </p>
        </div>

        {cancelled && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-300 text-center">
            Paiement annulé. Vous pouvez réessayer.
          </div>
        )}

        {isFull ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center space-y-2">
            <p className="text-2xl">😔</p>
            <p className="font-semibold text-white">Tournoi complet</p>
            <p className="text-gray-400 text-sm">Toutes les places sont prises.</p>
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-white">Inscription de votre équipe</h2>
              {tournament.entry_fee > 0 && (
                <p className="text-green-400 font-medium mt-1">
                  {(tournament.entry_fee / 100).toFixed(2)} € par équipe
                </p>
              )}
            </div>
            <RegisterTeamForm tournamentId={id} isFree={tournament.entry_fee === 0} />
          </div>
        )}
      </div>
    </div>
  );
}
