import { Button as BaseButton, type ButtonProps } from "@naviss29/design-system";
import Link from "next/link";

/**
 * Injecte `next/link` par défaut via la prop `as` du Button du design-system (0.4.0) — le
 * point d'extension explicitement prévu pour ce cas (une bibliothèque partagée ne peut pas
 * dépendre en dur d'un routeur). Même raison documentée que le Button local de BSsite : sans
 * ce wrapper, chaque appelant devrait repasser `as={Link}` à la main. Aucune classe, aucune
 * couleur, aucune variante ajoutée — délégation intégrale au design-system.
 */
export default function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    return <BaseButton {...props} as={Link} />;
  }
  return <BaseButton {...props} />;
}
