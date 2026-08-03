import type { ReactNode } from "react";
import { cn } from "@naviss29/design-system";

interface Props {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  tone?: "light" | "dark";
  children: ReactNode;
  className?: string;
}

/** Label + champ + aide/erreur cohérents — remplace les libellés écrits en dur écran par écran. */
export default function FormField({ label, htmlFor, hint, error, tone = "light", children, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className={cn("text-sm font-medium", tone === "light" ? "text-gray-700" : "text-darts-text")}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className={cn("text-xs", tone === "light" ? "text-gray-500" : "text-darts-text-secondary")}>{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-darts-red">
          {error}
        </p>
      )}
    </div>
  );
}
