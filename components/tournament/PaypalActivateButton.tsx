"use client";

import { useState } from "react";

interface Props {
  baseFeeEuros: number;
  maxPlayers: number;
}

export function PaypalActivateButton({ baseFeeEuros, maxPlayers }: Props) {
  const [extra, setExtra] = useState<string>("");

  const extraAmount = parseFloat(extra) || 0;
  const total = (baseFeeEuros + extraAmount).toFixed(2);
  const paypalUrl = `https://www.paypal.me/SEProduct/${total}EUR`;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{maxPlayers} joueurs × 0,10 €</span>
          <span className="font-medium text-gray-900">{baseFeeEuros.toFixed(2)} €</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 whitespace-nowrap">Montant libre :</label>
            <div className="relative flex-1">
              <input
                type="number"
                min="0"
                step="0.50"
                placeholder="0.00"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Un coup de pouce pour aider Stêr Eo Production à grandir et continuer à développer DartsOpen. 💚
          </p>
        </div>

        {extraAmount > 0 && (
          <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2">
            <span className="text-gray-700">Total</span>
            <span className="text-green-700">{total} €</span>
          </div>
        )}
      </div>

      <a
        href={paypalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#0070ba] px-4 py-3 text-sm font-semibold text-white hover:bg-[#005ea6] transition-colors"
      >
        💳 Payer {total} € via PayPal
      </a>
    </div>
  );
}
