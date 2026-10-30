import { Fragment, type ReactNode } from "react";

const SLOT = /(\{[A-Za-z]+\})/;

/**
 * Insère des éléments (lien, nom en gras) dans une phrase traduite, à la place de `{nom}`.
 *
 * Pourquoi : la place d'un lien dans la phrase change d'une langue à l'autre. Découper la
 * phrase en fragments traduits séparément (« avant », « lien », « après ») figerait l'ordre
 * des mots du français — le standard i18n l'interdit. Un emplacement inconnu reste affiché
 * tel quel plutôt que de disparaître : une clé mal écrite se voit à l'écran et en test.
 */
export function withSlots(text: string, slots: Record<string, ReactNode>): ReactNode {
  return text.split(SLOT).map((part, index) => {
    const name = /^\{([A-Za-z]+)\}$/.exec(part)?.[1];
    const content = name !== undefined && name in slots ? slots[name] : part;
    return <Fragment key={index}>{content}</Fragment>;
  });
}
