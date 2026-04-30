"use client";

import { useEffect, useState } from "react";

interface Player { player_name: string }
interface Match { board_number: number; player1: Player; player2: Player }

interface Props {
  boardNumber: number;
  match: Match;
}

export function NextMatchAlert({ boardNumber, match }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Légère pause pour que l'animation CSS se déclenche
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 transition-all duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`bg-gray-900 border-2 border-green-500 rounded-2xl p-10 text-center max-w-lg w-full mx-4 shadow-2xl shadow-green-500/20 transition-all duration-500 ${
          visible ? "scale-100 opacity-100" : "scale-90 opacity-0"
        }`}
      >
        <div className="text-5xl mb-4 animate-bounce">🎯</div>
        <p className="text-green-400 text-sm font-semibold uppercase tracking-widest mb-2">
          Prochain match — Cible {boardNumber}
        </p>
        <h2 className="text-3xl font-bold text-white mb-2">
          {match.player1.player_name}
        </h2>
        <p className="text-gray-400 text-xl mb-2">contre</p>
        <h2 className="text-3xl font-bold text-white mb-6">
          {match.player2.player_name}
        </h2>
        <div className="inline-flex items-center gap-2 rounded-full bg-green-500/20 border border-green-500/30 px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-300 text-sm font-medium">
            Préparez-vous — Cible {boardNumber}
          </span>
        </div>
      </div>
    </div>
  );
}
