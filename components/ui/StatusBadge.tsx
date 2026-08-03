import { Pill, type PillTone } from "@naviss29/design-system";

/**
 * Source unique du badge de statut tournoi — remplace 3 copies indépendantes
 * (`app/(dashboard)/dashboard/page.tsx`, `tournaments/page.tsx`, `tournaments/[id]/page.tsx`)
 * qui avaient déjà commencé à diverger entre elles (fallback de couleur présent sur une seule
 * des trois copies). Statut métier inchangé — DRAFT/OPEN/IN_PROGRESS/FINISHED viennent de
 * `lib/utils/tournamentStatus.ts`, jamais redéfinis ici.
 */
const tones: Record<string, PillTone> = {
  DRAFT: "neutral",
  OPEN: "brand",
  IN_PROGRESS: "success",
  FINISHED: "neutral",
};

const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  OPEN: "Inscriptions ouvertes",
  IN_PROGRESS: "En cours",
  FINISHED: "Terminé",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={tones[status] ?? "neutral"} className="whitespace-nowrap">
      {labels[status] ?? status}
    </Pill>
  );
}
