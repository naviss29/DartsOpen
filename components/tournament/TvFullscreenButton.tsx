"use client";

import { useEffect, useState } from "react";

/**
 * Le mode TV doit s'afficher plein écran, mais la Fullscreen API refuse tout appel qui n'est pas
 * déclenché par un geste utilisateur réel (spec — le montage du composant au chargement de la
 * page ne compte pas) : on tente quand même au montage (aboutit dans certains contextes
 * kiosque/TV box qui assouplissent cette règle), puis on retente au tout premier clic/tap/touche
 * de la page si la première tentative a été refusée — sur un navigateur standard, c'est ce
 * second essai qui aboutit, sans qu'un bouton dédié soit nécessaire. Le bouton reste affiché en
 * secours (ex. la première tentative ET le premier geste ont tous deux été refusés) et reflète
 * l'état réel courant (bascule plein écran / normal).
 *
 * `document.fullscreenEnabled` sert de détection de fonctionnalité : absent (Safari iPhone, qui
 * ne supporte pas la Fullscreen API) → composant qui ne rend rien, jamais un bouton mort.
 */
export function TvFullscreenButton() {
  // Détecté une seule fois, à l'initialisation (jamais dans l'effect ci-dessous — react-hooks/
  // set-state-in-effect) : `document` est indéfini côté serveur, donc toujours `false` au premier
  // rendu SSR, recalculé côté client à l'hydratation.
  const [supported] = useState(() => typeof document !== "undefined" && document.fullscreenEnabled);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!supported) return;

    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);

    const enter = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    enter();

    const onFirstInteraction = () => enter();
    document.addEventListener("click", onFirstInteraction, { once: true });
    document.addEventListener("touchstart", onFirstInteraction, { once: true });
    document.addEventListener("keydown", onFirstInteraction, { once: true });

    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
    };
  }, [supported]);

  if (!supported) return null;

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isFullscreen}
      className="text-xs text-text-secondary hover:text-text-primary transition-colors"
    >
      {isFullscreen ? "⤫ Quitter le plein écran" : "⛶ Plein écran"}
    </button>
  );
}
