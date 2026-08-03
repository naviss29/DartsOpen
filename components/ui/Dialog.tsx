"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@naviss29/design-system";

interface Props {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Primitive de modale manquante identifiée par docs/UI-UNIFICATION.md ("ArbitrateMatchModal
 * nécessite un futur composant Dialog") — remplace l'overlay `fixed inset-0` fait main qui
 * n'avait ni `role="dialog"`, ni fermeture au clavier (Échap), ni focus initial sur la boîte
 * (mission §10, accessibilité des modales). Pas de piège de focus cyclique complet (aucune
 * dépendance ajoutée pour ça) — mise au point suffisante pour les modales courtes de ce
 * produit (2-3 actions), focus initial + Échap + clic sur le fond couvrent l'essentiel.
 */
export default function Dialog({ title, description, onClose, children, className }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "w-full max-w-md rounded-xl border border-darts-border bg-darts-surface p-6 shadow-xl focus:outline-none",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-darts-text">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-0.5 text-sm text-darts-text-secondary">
            {description}
          </p>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
