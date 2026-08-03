import { cn } from "@naviss29/design-system";
import type { HTMLAttributes, ElementType } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  /**
   * `light` — écrans organisateur (fond clair, `bg-white`, remplace le motif
   * `bg-white rounded-xl border border-gray-200` dupliqué 17× avant cette mission).
   * `dark` — écrans publics/score (fond sombre `darts-surface`, remplace les cartes
   * `bg-gray-800`/`bg-gray-900` écrites à la main écran par écran).
   * Le `Card` du design-system partagé reste `bg-white` en dur (voir son code source) — pas
   * adapté aux écrans sombres, d'où ce composant local plutôt qu'une extension de celui-ci.
   */
  tone?: "light" | "dark";
  /** Élément HTML rendu — `section`/`article` là où la sémantique du document le justifie. */
  as?: ElementType;
}

export default function Card({ tone = "light", as: Component = "div", className, children, ...props }: Props) {
  return (
    <Component
      className={cn(
        "rounded-xl border p-4 sm:p-6",
        tone === "light" ? "border-gray-200 bg-white" : "border-darts-border bg-darts-surface text-darts-text",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
