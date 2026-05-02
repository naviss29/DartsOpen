"use client";

import { useState } from "react";

export function DonsPaypalButton() {
  const [extra, setExtra] = useState("5");
  const amount = Math.max(1, parseFloat(extra) || 5).toFixed(2);
  const paypalUrl = `https://www.paypal.me/SEProduct/${amount}EUR`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300 whitespace-nowrap">Montant :</label>
          <div className="relative flex-1">
            <input
              type="number"
              min="1"
              step="1"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 pr-8 text-sm text-white focus:border-green-500 focus:outline-none text-center"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
          </div>
        </div>
        <div className="flex gap-2 justify-center">
          {["2", "5", "10", "20"].map((v) => (
            <button
              key={v}
              onClick={() => setExtra(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                extra === v ? "bg-green-600 text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
            >
              {v} €
            </button>
          ))}
        </div>
      </div>

      <a
        href={paypalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-3 rounded-xl bg-[#0070BA] hover:bg-[#005ea6] text-white font-semibold px-8 py-4 text-base transition-colors shadow-lg"
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .76-.645h6.745c2.366 0 4.01.792 4.648 2.29.278.654.353 1.354.222 2.147l-.007.042v.39l.24.136c.487.272.875.617 1.163 1.038.462.676.617 1.54.46 2.56-.19 1.21-.625 2.26-1.295 3.118a5.78 5.78 0 0 1-2.102 1.652c-.76.344-1.63.518-2.58.518H11.5l-.433 2.762a.77.77 0 0 1-.76.645H7.076zm9.59-13.27c-.047.297-.1.59-.163.876-.61 2.96-2.7 3.983-5.37 3.983H9.58a.659.659 0 0 0-.651.558l-.827 5.243-.235 1.488h2.334l.432-2.74a.77.77 0 0 1 .76-.645h.48c3.108 0 5.54-1.263 6.252-4.912.297-1.525.143-2.8-.659-3.85z"/>
        </svg>
        Faire un don de {amount} € via PayPal
      </a>
      <p className="text-xs text-gray-500 text-center">Vous serez redirigé vers PayPal. Chaque coup de pouce compte !</p>
    </div>
  );
}
