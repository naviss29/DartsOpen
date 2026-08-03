"use client";

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light px-4">
      <div className="text-center space-y-4">
        <p className="text-amber-600 font-medium">Une erreur inattendue s&apos;est produite.</p>
        <p className="text-sm text-brand-text-secondary">Merci de réessayer dans quelques instants.</p>
        <button
          onClick={reset}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-brand-dark hover:bg-slate-50 transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
