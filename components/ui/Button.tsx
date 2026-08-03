import { Button as BaseButton, type ButtonProps } from "@naviss29/design-system";
import { cn } from "@/lib/utils/cn";

/**
 * Habillage DartsOpen du Button du design-system BApps Studio — jamais une réimplémentation :
 * mêmes tailles, mêmes états (hover/focus/disabled), seule la couleur de fond change pour les
 * variantes "action" (primary = vert cible, danger-solid = rouge cible), cohérent avec les 18
 * boutons d'action déjà verts à la main avant cette mission. `secondary`/`ghost`/`danger`/`text`
 * restent identiques au design-system (déjà neutres, pas de raison de les surcharger).
 *
 * `danger`/`danger-solid` existent et fonctionnent dans le runtime compilé du design-system
 * (@naviss29/design-system@0.1.1) mais son type `ButtonVariant` publié n'en liste que 4
 * ("primary" | "secondary" | "ghost" | "text") — décalage type/runtime dans le paquet lui-même,
 * hors périmètre de cette mission (paquet d'un autre dépôt, bapps-shared). On élargit donc le
 * type localement plutôt que de renoncer à ces variantes ; le seul cast vers le type restreint
 * du paquet se fait au point de passage vers BaseButton, ci-dessous.
 */
type RuntimeVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid" | "text";

// ButtonProps est une union discriminée (lien vs bouton) : un Omit direct l'aplatirait et
// ferait perdre les champs propres à chaque variante (`disabled`, `type` côté bouton, `href`
// côté lien) — on distribue l'Omit sur chaque membre de l'union avant de rajouter `variant`.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Props = DistributiveOmit<ButtonProps, "variant"> & { variant?: RuntimeVariant };

const toneOverrides: Partial<Record<RuntimeVariant, string>> = {
  primary: "bg-darts-green hover:bg-darts-green/90",
  "danger-solid": "bg-darts-red hover:bg-darts-red/90",
};

export default function Button({ variant = "primary", className, ...props }: Props) {
  const override = toneOverrides[variant];
  return (
    <BaseButton
      {...props}
      variant={variant as ButtonProps["variant"]}
      className={cn(override, className)}
    />
  );
}
