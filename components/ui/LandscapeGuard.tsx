"use client";

import { useEffect, useState } from "react";

interface Props {
  children: React.ReactNode;
}

/**
 * Affiche un overlay "Tournez votre téléphone" sur mobile en mode portrait.
 * Ne fait rien sur desktop (largeur ≥ 768px) ni en mode paysage.
 *
 * L'API screen.orientation.lock() exige un contexte plein écran (PWA) et
 * n'est pas disponible dans un navigateur standard — on informe l'utilisateur
 * plutôt que de tenter un verrouillage qui serait ignoré.
 */
export function LandscapeGuard({ children }: Props) {
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    const check = () => {
      // Portrait = hauteur > largeur ET écran mobile (< 768px)
      setShowOverlay(window.innerWidth < 768 && window.innerHeight > window.innerWidth);
    };

    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return (
    <>
      {children}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 text-white px-6 text-center">
          <div className="text-6xl mb-5 animate-spin" style={{ animationDuration: "2s", animationIterationCount: 1 }}>
            📱
          </div>
          <p className="text-xl font-bold mb-2">Tournez votre téléphone</p>
          <p className="text-sm text-gray-400">
            Cette vue est optimisée pour le mode paysage.
          </p>
        </div>
      )}
    </>
  );
}
