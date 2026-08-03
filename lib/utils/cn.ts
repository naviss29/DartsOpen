import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Identique à `cn` de @naviss29/design-system, réimplémenté localement : ce paquet bundle tout
 * son point d'entrée (dist/index.js) derrière un unique "use client" en tête de fichier, ce qui
 * tainte même les exports purs (cn, tokens...) comme client-only pour Next.js — cassait le rendu
 * de tous les composants serveur qui l'utilisaient (Card, Button, FormField, Input, Select,
 * TextArea, ScoreDisplay, NavPills, EmptyState) avec "Attempted to call cn() from the server".
 * Bug du paquet amont (bapps-shared, autre dépôt), contourné ici sans le modifier.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
