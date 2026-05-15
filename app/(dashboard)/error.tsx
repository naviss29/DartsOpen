"use client";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center space-y-4">
      <p className="text-amber-700 font-medium">Cette page est en cours de migration vers SterPlatform.</p>
      <p className="text-sm text-amber-600">Disponible à partir de la Phase 5c.</p>
      <button
        onClick={reset}
        className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700 hover:bg-amber-100 transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}
