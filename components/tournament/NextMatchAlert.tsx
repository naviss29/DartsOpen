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
        className={`bg-darts-surface border-2 border-darts-green rounded-2xl p-10 text-center max-w-lg w-full mx-4 shadow-2xl shadow-darts-green/20 transition-all duration-500 ${
          visible ? "scale-100 opacity-100" : "scale-90 opacity-0"
        }`}
      >
        <div className="text-5xl mb-4 animate-bounce">🎯</div>
        <p className="text-darts-green text-sm font-semibold uppercase tracking-widest mb-2">
          Prochain match — Cible {boardNumber}
        </p>
        <h2 className="text-3xl font-bold text-darts-text mb-2">
          {match.player1.player_name}
        </h2>
        <p className="text-darts-text-secondary text-xl mb-2">contre</p>
        <h2 className="text-3xl font-bold text-darts-text mb-6">
          {match.player2.player_name}
        </h2>
        <div className="inline-flex items-center gap-2 rounded-full bg-darts-green/20 border border-darts-green/30 px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-darts-green animate-pulse" />
          <span className="text-darts-green text-sm font-medium">
            Préparez-vous — Cible {boardNumber}
          </span>
        </div>
      </div>
    </div>
  );
}
