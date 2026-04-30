"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Props {
  stripeConnected: boolean;
}

export function StripeInfoModal({ stripeConnected }: Props) {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("stripe-info-dismissed");
    if (!dismissed) setOpen(true);
  }, []);

  function close() {
    if (dontShowAgain) {
      localStorage.setItem("stripe-info-dismissed", "1");
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl">💳</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Comment fonctionnent les paiements ?</h2>
            <p className="text-sm text-gray-500 mt-0.5">À lire avant de créer votre premier tournoi</p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-gray-700">
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 space-y-1">
            <p className="font-semibold text-green-800">Ce que reçoit votre association</p>
            <p>
              Les droits d'inscription payés par les équipes sont versés <strong>directement sur votre compte Stripe</strong>,
              déduction faite des frais ci-dessous.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-gray-800">Frais déduits par inscription :</p>
            <ul className="space-y-1.5 pl-2">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">—</span>
                <span>
                  <strong>Frais Stripe</strong> : environ 1,5 % + 0,25 € par transaction
                  (variable selon le pays de la carte)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">—</span>
                <span>
                  <strong>Frais plateforme DartsOpen</strong> : <strong>0,10 € par équipe inscrite</strong>,
                  pour financer l'hébergement et le développement de l'application
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
            <p className="font-semibold text-blue-800">Reversement en clôture d'open</p>
            <p>
              Le virement vers votre compte bancaire est déclenché <strong>automatiquement à la clôture du tournoi</strong>
              (statut "Terminé"). Il apparaît sous 2 à 7 jours ouvrés selon votre banque.
            </p>
          </div>

          {!stripeConnected && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-yellow-800 font-medium">⚠️ Compte Stripe non connecté</p>
              <p className="text-yellow-700 mt-0.5">
                Pour recevoir les paiements, connectez votre compte Stripe dans{" "}
                <Link href="/settings" className="underline font-medium" onClick={close}>
                  Paramètres
                </Link>
                . Les inscriptions gratuites fonctionnent sans Stripe.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="dont-show"
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="rounded border-gray-300 text-green-600"
          />
          <label htmlFor="dont-show" className="text-sm text-gray-500 select-none cursor-pointer">
            Ne plus afficher ce message
          </label>
        </div>

        <button
          onClick={close}
          className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          J'ai compris, créer mon tournoi
        </button>
      </div>
    </div>
  );
}
