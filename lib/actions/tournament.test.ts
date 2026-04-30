import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schémas extraits pour test — miroir de tournament.ts
const TournamentSchema = z.object({
  name: z.string().min(3, "Le nom doit contenir au moins 3 caractères.").trim(),
  date: z.string().min(1, "La date est requise."),
  location: z.string().min(2, "Le lieu est requis.").trim(),
  max_players: z.coerce.number().int().min(2).max(512),
  entry_fee: z.coerce.number().int().min(0),
  nb_pools: z.coerce.number().int().min(1).max(64),
  nb_boards: z.coerce.number().int().min(1).max(32),
});

const RoundSchema = z.object({
  tournament_id: z.string().uuid(),
  order: z.coerce.number().int().min(1),
  game_type: z.enum(["CRICKET", "501", "701", "901", "1001"]),
  entry_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE"]),
  finish_type: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "MASTER"]),
});

describe("TournamentSchema", () => {
  const validData = {
    name: "Open de fléchettes 2026",
    date: "2026-06-15",
    location: "Salle des fêtes",
    max_players: "32",
    entry_fee: "1000",
    nb_pools: "8",
    nb_boards: "4",
  };

  it("accepte des données valides", () => {
    const result = TournamentSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_players).toBe(32);
      expect(result.data.entry_fee).toBe(1000);
    }
  });

  it("rejette un nom trop court", () => {
    const result = TournamentSchema.safeParse({ ...validData, name: "AB" });
    expect(result.success).toBe(false);
  });

  it("rejette un nombre de joueurs inférieur à 2", () => {
    const result = TournamentSchema.safeParse({ ...validData, max_players: "1" });
    expect(result.success).toBe(false);
  });

  it("rejette une date vide", () => {
    const result = TournamentSchema.safeParse({ ...validData, date: "" });
    expect(result.success).toBe(false);
  });

  it("rejette un entry_fee négatif", () => {
    const result = TournamentSchema.safeParse({ ...validData, entry_fee: "-1" });
    expect(result.success).toBe(false);
  });

  it("accepte un entry_fee à 0 (tournoi gratuit)", () => {
    const result = TournamentSchema.safeParse({ ...validData, entry_fee: "0" });
    expect(result.success).toBe(true);
  });

  it("coerce les valeurs string en number", () => {
    const result = TournamentSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.max_players).toBe("number");
      expect(typeof result.data.nb_pools).toBe("number");
    }
  });
});

describe("RoundSchema", () => {
  const validRound = {
    tournament_id: "550e8400-e29b-41d4-a716-446655440000",
    order: 1,
    game_type: "501",
    entry_type: "DOUBLE",
    finish_type: "DOUBLE",
  };

  it("accepte une manche 501 double-in double-out", () => {
    const result = RoundSchema.safeParse(validRound);
    expect(result.success).toBe(true);
  });

  it("accepte Cricket", () => {
    const result = RoundSchema.safeParse({ ...validRound, game_type: "CRICKET" });
    expect(result.success).toBe(true);
  });

  it("accepte finish_type MASTER", () => {
    const result = RoundSchema.safeParse({ ...validRound, finish_type: "MASTER" });
    expect(result.success).toBe(true);
  });

  it("rejette un game_type invalide", () => {
    const result = RoundSchema.safeParse({ ...validRound, game_type: "301" });
    expect(result.success).toBe(false);
  });

  it("rejette un tournament_id non UUID", () => {
    const result = RoundSchema.safeParse({ ...validRound, tournament_id: "pas-un-uuid" });
    expect(result.success).toBe(false);
  });
});
