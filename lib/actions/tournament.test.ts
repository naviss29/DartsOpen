import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// DO-PAYMENT-GUARD-001 — tests des server actions elles-mêmes (pas seulement du schéma
// Zod ci-dessous) : createTournament/updateTournament sont le point d'entrée unique de
// création/modification d'un tournoi, y compris pour un appel direct contournant l'UI
// (un Server Action Next.js reste un endpoint HTTP appelable directement).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));
vi.mock("@/lib/actions/access", () => ({ getOwnedTournament: vi.fn() }));
vi.mock("@/lib/payments/onlinePaymentGuard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/onlinePaymentGuard")>();
  return { ...actual, isOnlinePaymentAllowed: vi.fn() };
});
vi.mock("@/lib/entitlements/tournamentSizeGuard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/entitlements/tournamentSizeGuard")>();
  return { ...actual, authorizeTournamentSize: vi.fn() };
});
vi.mock("@/lib/db/tournament", () => ({
  dbCreateTournament: vi.fn(),
  dbUpdateTournament: vi.fn(),
  dbUpdateTournamentStatus: vi.fn(),
  dbDeleteTournament: vi.fn(),
  dbAddRound: vi.fn(),
  dbDeleteRound: vi.fn(),
}));

const { createTournament, updateTournament } = await import("./tournament");
const { getUser } = await import("@/lib/api/auth");
const { getOwnedTournament } = await import("@/lib/actions/access");
const { isOnlinePaymentAllowed } = await import("@/lib/payments/onlinePaymentGuard");
const { authorizeTournamentSize } = await import("@/lib/entitlements/tournamentSizeGuard");
const { dbCreateTournament, dbUpdateTournament } = await import("@/lib/db/tournament");
const { redirect } = await import("next/navigation");

const USER = { id: "user-1", email: "alan@example.com", roles: [], isVerified: true };

// max_players par défaut à 10 (palier gratuit) : les tests DO-PAYMENT-GUARD-001 ci-dessous ne
// portent pas sur la règle des 10 joueurs (DARTSOPEN-MONETIZATION-001, testée séparément plus
// bas) — rester dans le palier gratuit évite de déclencher authorizeTournamentSize() par effet
// de bord et de fausser leurs assertions sur isOnlinePaymentAllowed/dbCreateTournament.
function tournamentFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    name: "Open de fléchettes 2026",
    date: "2026-06-15",
    location: "Salle des fêtes",
    max_players: "10",
    entry_fee: "0",
    nb_pools: "8",
    nb_boards: "4",
    advancement_per_pool: "1",
    players_per_team: "2",
    registration_mode: "ONSITE",
    payment_mode: "ONSITE",
    scoring_mode: "ELECTRONIC",
    quick_mode: "false",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.mocked(getUser).mockReset().mockResolvedValue(USER as never);
  vi.mocked(getOwnedTournament).mockReset().mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
  vi.mocked(isOnlinePaymentAllowed).mockReset();
  vi.mocked(authorizeTournamentSize).mockReset();
  vi.mocked(dbCreateTournament).mockReset().mockResolvedValue({ id: "tournament-1" } as never);
  vi.mocked(dbUpdateTournament).mockReset().mockResolvedValue({} as never);
  vi.mocked(redirect).mockClear();
});

describe("createTournament — DO-PAYMENT-GUARD-001", () => {
  it("1. organisation sans Stripe opérationnel : création d'un tournoi gratuit autorisée", async () => {
    const fd = tournamentFormData({ registration_mode: "ONLINE", entry_fee: "0" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(isOnlinePaymentAllowed).not.toHaveBeenCalled();
    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/tournaments/tournament-1/activate");
  });

  it("2. organisation sans Stripe opérationnel : création avec paiement en ligne refusée", async () => {
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "10" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(result?.error).toMatch(/stripe connect opérationnel/i);
  });

  it("4. contournement par appel direct de la Server Action (pas seulement l'UI) refusé", async () => {
    // Un appel qui ne passe jamais par TournamentForm (donc jamais par le disabled/hidden
    // input côté client) — seul le contrôle serveur peut bloquer ce cas.
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: false, reason: "NO_ORGANIZATION" });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "25" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbCreateTournament).not.toHaveBeenCalled();
  });

  it("5. organisation Stripe opérationnelle : création avec paiement en ligne autorisée", async () => {
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: true });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "15" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
  });

  it("6. organisation Stripe opérationnelle : tournoi gratuit toujours autorisé (Stripe n'oblige jamais le paiement)", async () => {
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: true });
    const fd = tournamentFormData({ registration_mode: "ONLINE", entry_fee: "0" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    // entry_fee à 0 ne déclenche jamais le contrôle Stripe, même avec Stripe opérationnel.
    expect(isOnlinePaymentAllowed).not.toHaveBeenCalled();
    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
  });

  it("8. aucune écriture partielle : dbCreateTournament jamais appelé après un refus", async () => {
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "10" });

    await createTournament(undefined, fd);

    expect(dbCreateTournament).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("un tournoi ONSITE avec entry_fee positif n'est jamais bloqué (pas un paiement en ligne)", async () => {
    const fd = tournamentFormData({ registration_mode: "ONSITE", payment_mode: "ONSITE", entry_fee: "10" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(isOnlinePaymentAllowed).not.toHaveBeenCalled();
    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
  });

  it("DARTSOPEN-MONETIZATION-001 (mission §5/§6) : inscription en ligne + paiement sur place n'est jamais bloqué, même sans Stripe opérationnel — registration_mode et payment_mode sont indépendants", async () => {
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONSITE", entry_fee: "10" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(isOnlinePaymentAllowed).not.toHaveBeenCalled();
    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
  });
});

describe("updateTournament — DO-PAYMENT-GUARD-001", () => {
  it("3. organisation sans Stripe opérationnel : activation ultérieure du paiement refusée", async () => {
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "20" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbUpdateTournament).not.toHaveBeenCalled();
  });

  it("interroge isOnlinePaymentAllowed avec le propriétaire réel du tournoi (association_id), jamais l'utilisateur courant seul", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "owner-42", max_players: 10 } as never);
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: true });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "20" });
    fd.set("tournament_id", "tournament-1");

    await updateTournament(undefined, fd);

    expect(isOnlinePaymentAllowed).toHaveBeenCalledWith("owner-42");
  });

  it("organisation Stripe opérationnelle : activation du paiement en ligne autorisée", async () => {
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: true });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "20" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result).toBeUndefined();
    expect(dbUpdateTournament).toHaveBeenCalledTimes(1);
  });

  it("aucune écriture partielle : dbUpdateTournament jamais appelé après un refus", async () => {
    vi.mocked(isOnlinePaymentAllowed).mockResolvedValue({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
    const fd = tournamentFormData({ registration_mode: "ONLINE", payment_mode: "ONLINE", entry_fee: "20" });
    fd.set("tournament_id", "tournament-1");

    await updateTournament(undefined, fd);

    expect(dbUpdateTournament).not.toHaveBeenCalled();
  });

  it("repasser un tournoi en gratuit/ONSITE reste toujours autorisé sans Stripe", async () => {
    const fd = tournamentFormData({ registration_mode: "ONSITE", entry_fee: "0" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(isOnlinePaymentAllowed).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(dbUpdateTournament).toHaveBeenCalledTimes(1);
  });
});

describe("createTournament — DARTSOPEN-MONETIZATION-001 (règle des 10 joueurs)", () => {
  it("FREE : 10 joueurs acceptés sans aucune vérification d'entitlement", async () => {
    const fd = tournamentFormData({ max_players: "10" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(authorizeTournamentSize).not.toHaveBeenCalled();
    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
  });

  it("FREE : plus de 10 joueurs refusé sans abonnement ni crédit", async () => {
    vi.mocked(authorizeTournamentSize).mockResolvedValue({ allowed: false, reason: "NO_ENTITLEMENT" });
    const fd = tournamentFormData({ max_players: "16" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbCreateTournament).not.toHaveBeenCalled();
  });

  it("sans organisation liée : plus de 10 joueurs refusé avec un message orientant vers la liaison + l'achat", async () => {
    vi.mocked(authorizeTournamentSize).mockResolvedValue({ allowed: false, reason: "NO_ORGANIZATION" });
    const fd = tournamentFormData({ max_players: "16" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toMatch(/liez d'abord votre compte/i);
    expect(dbCreateTournament).not.toHaveBeenCalled();
  });

  it("contournement par appel direct de la Server Action avec maxPlayers=64 sans entitlement (mission §11) refusé", async () => {
    vi.mocked(authorizeTournamentSize).mockResolvedValue({ allowed: false, reason: "NO_ENTITLEMENT" });
    const fd = tournamentFormData({ max_players: "64" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbCreateTournament).not.toHaveBeenCalled();
  });

  it("SUBSCRIPTION/CREDIT : plus de 10 joueurs accepté quand authorizeTournamentSize autorise", async () => {
    vi.mocked(authorizeTournamentSize).mockResolvedValue({ allowed: true });
    const fd = tournamentFormData({ max_players: "32" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
  });

  it("aucune écriture partielle : dbCreateTournament jamais appelé après un refus d'entitlement", async () => {
    vi.mocked(authorizeTournamentSize).mockResolvedValue({ allowed: false, reason: "NO_ENTITLEMENT" });
    const fd = tournamentFormData({ max_players: "16" });

    await createTournament(undefined, fd);

    expect(dbCreateTournament).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("updateTournament — DARTSOPEN-MONETIZATION-001 (règle des 10 joueurs)", () => {
  it("ne re-vérifie jamais un tournoi déjà >10 dont la valeur reste inchangée (ne casse jamais un tournoi existant, mission §12/§15)", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 32 } as never);
    const fd = tournamentFormData({ max_players: "32" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(authorizeTournamentSize).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(dbUpdateTournament).toHaveBeenCalledTimes(1);
  });

  it("ne re-vérifie pas quand la valeur diminue tout en restant au-dessus de 10", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 32 } as never);
    const fd = tournamentFormData({ max_players: "20" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(authorizeTournamentSize).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("contournement 'créer à 10 puis modifier à 64' (mission §2/§11) refusé sans entitlement", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
    vi.mocked(authorizeTournamentSize).mockResolvedValue({ allowed: false, reason: "NO_ENTITLEMENT" });
    const fd = tournamentFormData({ max_players: "64" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbUpdateTournament).not.toHaveBeenCalled();
  });

  it("une augmentation réelle au-delà de 10 est acceptée quand authorizeTournamentSize autorise", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
    vi.mocked(authorizeTournamentSize).mockResolvedValue({ allowed: true });
    const fd = tournamentFormData({ max_players: "64" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result).toBeUndefined();
    expect(dbUpdateTournament).toHaveBeenCalledTimes(1);
  });

  it("réduire un tournoi de 64 à 10 ne consomme jamais de crédit (retour dans le palier gratuit)", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 64 } as never);
    const fd = tournamentFormData({ max_players: "10" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(authorizeTournamentSize).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

// Schémas extraits pour test — miroir de tournament.ts
const TournamentSchema = z.object({
  name: z.string().min(3, "Le nom doit contenir au moins 3 caractères.").trim(),
  date: z.string().min(1, "La date est requise."),
  location: z.string().min(2, "Le lieu est requis.").trim(),
  max_players: z.coerce.number().int().min(2).max(512),
  entry_fee: z.coerce.number().min(0).transform((v) => Math.round(v * 100)),
  nb_pools: z.coerce.number().int().min(1).max(64),
  nb_boards: z.coerce.number().int().min(1).max(32),
  advancement_per_pool: z.coerce.number().int().min(1).max(8),
  players_per_team: z.coerce.number().int().min(1).max(10),
  registration_mode: z.enum(["ONLINE", "ONSITE"]).default("ONLINE"),
  scoring_mode: z.enum(["ELECTRONIC", "TRADITIONAL"]).default("ELECTRONIC"),
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
    entry_fee: "10",
    nb_pools: "8",
    nb_boards: "4",
    advancement_per_pool: "1",
    players_per_team: "2",
    registration_mode: "ONLINE",
    scoring_mode: "ELECTRONIC",
  };

  it("accepte des données valides", () => {
    const result = TournamentSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_players).toBe(32);
      expect(result.data.players_per_team).toBe(2);
    }
  });

  it("transforme entry_fee en centimes (×100)", () => {
    const result = TournamentSchema.safeParse({ ...validData, entry_fee: "10" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.entry_fee).toBe(1000);
  });

  it("arrondit entry_fee pour éviter les flottants (9.99 → 999)", () => {
    const result = TournamentSchema.safeParse({ ...validData, entry_fee: "9.99" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.entry_fee).toBe(999);
  });

  it("accepte scoring_mode ELECTRONIC", () => {
    const result = TournamentSchema.safeParse({ ...validData, scoring_mode: "ELECTRONIC" });
    expect(result.success).toBe(true);
  });

  it("accepte scoring_mode TRADITIONAL", () => {
    const result = TournamentSchema.safeParse({ ...validData, scoring_mode: "TRADITIONAL" });
    expect(result.success).toBe(true);
  });

  it("rejette un scoring_mode invalide", () => {
    const result = TournamentSchema.safeParse({ ...validData, scoring_mode: "MANUAL" });
    expect(result.success).toBe(false);
  });

  it("accepte registration_mode ONSITE", () => {
    const result = TournamentSchema.safeParse({ ...validData, registration_mode: "ONSITE" });
    expect(result.success).toBe(true);
  });

  it("rejette players_per_team à 0", () => {
    const result = TournamentSchema.safeParse({ ...validData, players_per_team: "0" });
    expect(result.success).toBe(false);
  });

  it("rejette players_per_team supérieur à 10", () => {
    const result = TournamentSchema.safeParse({ ...validData, players_per_team: "11" });
    expect(result.success).toBe(false);
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
