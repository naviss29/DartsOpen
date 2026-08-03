"use client";

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light px-4">
      <div className="text-center space-y-4">
        <p className="text-amber-600 font-medium">Cette page est en cours de migration.</p>
        <p className="text-sm text-brand-text-secondary">Disponible à partir de la Phase 5c.</p>
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
