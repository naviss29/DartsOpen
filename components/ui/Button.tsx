import { Button as BaseButton, cn, type ButtonProps } from "@naviss29/design-system";

/**
 * Habillage DartsOpen du Button du design-system BApps Studio — jamais une réimplémentation :
 * mêmes tailles, mêmes états (hover/focus/disabled), seule la couleur de fond change pour les
 * variantes "action" (primary = vert cible, danger-solid = rouge cible), cohérent avec les 18
 * boutons d'action déjà verts à la main avant cette mission. `secondary`/`ghost`/`danger`/`text`
 * restent identiques au design-system (déjà neutres, pas de raison de les surcharger).
 */
const toneOverrides: Partial<Record<NonNullable<ButtonProps["variant"]>, string>> = {
  primary: "bg-darts-green hover:bg-darts-green/90",
  "danger-solid": "bg-darts-red hover:bg-darts-red/90",
};

export default function Button(props: ButtonProps) {
  const variant = props.variant ?? "primary";
  const override = toneOverrides[variant];
  return <BaseButton {...props} className={cn(override, props.className)} />;
}
