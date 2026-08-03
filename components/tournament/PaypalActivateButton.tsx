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
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-brand-text-secondary">{maxPlayers} joueurs × 0,10 €</span>
          <span className="font-medium text-brand-dark">{baseFeeEuros.toFixed(2)} €</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <label className="text-sm text-brand-text-secondary whitespace-nowrap">Montant libre :</label>
            <div className="relative flex-1">
              <input
                type="number"
                min="0"
                step="0.50"
                placeholder="0.00"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 pr-8 text-sm text-brand-dark placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-turquoise focus:border-transparent"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-brand-text-secondary">€</span>
            </div>
          </div>
          <p className="text-xs text-brand-text-secondary">
            Un coup de pouce pour aider BApps Studio à continuer à développer DartsOpen. 💚
          </p>
        </div>

        {extraAmount > 0 && (
          <div className="flex justify-between text-sm font-semibold border-t border-slate-200 pt-2">
            <span className="text-brand-dark">Total</span>
            <span className="text-emerald-700">{total} €</span>
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
