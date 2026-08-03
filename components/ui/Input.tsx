import { Input as BaseInput, cn, type InputProps } from "@naviss29/design-system";

interface Props extends InputProps {
  /**
   * `light` (défaut) — le champ du design-system est déjà pensé pour un fond clair.
   * `dark` — écrans publics (inscription, saisie de score) : remplace les 5 copies
   * indépendantes de la classe `inputCn` recopiée à la main, déjà en léger désaccord entre
   * elles (ombre présente/absente, couleur de texte) avant cette mission.
   */
  tone?: "light" | "dark";
}

const darkOverride =
  "border-darts-border bg-darts-surface text-darts-text placeholder-darts-text-secondary/60 focus:ring-darts-green";

export default function Input({ tone = "light", className, ...props }: Props) {
  return <BaseInput className={cn(tone === "dark" && darkOverride, className)} {...props} />;
}
