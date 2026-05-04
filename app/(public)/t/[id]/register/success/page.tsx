import Link from "next/link";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ name?: string }> }

export const metadata: Metadata = { title: "Inscription confirmée — DartsOpen" };

export default async function RegisterSuccessPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { name } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-6xl">🎯</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Inscription confirmée !</h1>
          {name && (
            <p className="text-gray-300">
              L&apos;équipe <span className="font-semibold text-white">{decodeURIComponent(name)}</span> est bien inscrite.
            </p>
          )}
          <p className="text-gray-400 text-sm">
            Votre paiement a bien été encaissé. Rendez-vous le jour du tournoi !
          </p>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-300 space-y-1">
          <p>Le jour J, scannez le QR code affiché sur votre cible pour saisir vos scores directement depuis votre smartphone.</p>
        </div>

        <Link
          href={`/t/${id}/live`}
          className="inline-block rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors"
        >
          Suivre le tournoi en direct →
        </Link>
      </div>
    </div>
  );
}
