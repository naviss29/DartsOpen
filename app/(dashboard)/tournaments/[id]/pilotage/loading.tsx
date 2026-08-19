/**
 * DO-OPS-001 (mission §16) — squelette de chargement de la console jour J, convention de
 * fichier Next.js standard (aucune logique, jamais de dépendance à une donnée).
 */
export default function PilotageLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="h-24 rounded-xl bg-slate-100" />
      <div className="h-20 rounded-xl bg-slate-100" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-xl bg-slate-100" />
        <div className="h-28 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}
