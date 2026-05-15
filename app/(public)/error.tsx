"use client";

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="text-center space-y-4">
        <p className="text-amber-400 font-medium">Cette page est en cours de migration.</p>
        <p className="text-sm text-gray-400">Disponible à partir de la Phase 5c.</p>
        <button
          onClick={reset}
          className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
