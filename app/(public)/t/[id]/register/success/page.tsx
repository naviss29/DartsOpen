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
          <h1 className="text-2xl font-bold text-darts-text">Inscription confirmée !</h1>
          {name && (
            <p className="text-darts-text">
              L&apos;équipe <span className="font-semibold text-darts-text">{decodeURIComponent(name)}</span> est bien inscrite.
            </p>
          )}
          <p className="text-darts-text-secondary text-sm">
            Votre paiement a bien été encaissé. Rendez-vous le jour du tournoi !
          </p>
        </div>

        <div className="rounded-xl bg-darts-surface border border-darts-border p-4 text-sm text-darts-text space-y-1">
          <p>Le jour J, scannez le QR code affiché sur votre cible pour saisir vos scores directement depuis votre smartphone.</p>
        </div>

        <Link
          href={`/t/${id}/live`}
          className="inline-block rounded-lg border border-darts-border px-4 py-2 text-sm font-medium text-darts-text hover:bg-darts-surface transition-colors"
        >
          Suivre le tournoi en direct →
        </Link>
      </div>
    </div>
  );
}
