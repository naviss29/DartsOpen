import { cn } from "@naviss29/design-system";

interface Props {
  value: number | string;
  size?: "lg" | "md" | "sm";
  tone?: "default" | "success" | "danger" | "gold";
  label?: string;
  className?: string;
}

const sizeClasses = {
  lg: "text-6xl sm:text-7xl",
  md: "text-4xl sm:text-5xl",
  sm: "text-2xl sm:text-3xl",
};

const toneClasses = {
  default: "text-darts-text",
  success: "text-darts-green",
  danger: "text-darts-red",
  gold: "text-darts-gold",
};

/**
 * Élément central du produit (mission §7) — chiffres à chasse fixe (`.font-score`,
 * `app/globals.css`) pour rester alignés et lisibles à distance, une seule échelle de
 * tailles/couleurs réutilisée partout où un score s'affiche (saisie, cartes de match,
 * mode TV) plutôt que des `text-5xl`/`text-6xl` choisis au cas par cas écran par écran.
 */
export default function ScoreDisplay({ value, size = "md", tone = "default", label, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <span className={cn("font-score font-black leading-none", sizeClasses[size], toneClasses[tone])}>{value}</span>
      {label && (
        <span className="mt-1 text-xs font-medium tracking-wide text-darts-text-secondary uppercase">{label}</span>
      )}
    </div>
  );
}
