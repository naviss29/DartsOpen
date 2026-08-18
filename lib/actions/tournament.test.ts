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
  return { ...actual, resolveTournamentSizeEntitlement: vi.fn(), consumeTournamentSizeCredit: vi.fn() };
});
vi.mock("@/lib/db/tournament", () => ({
  dbCreateTournament: vi.fn(),
  dbUpdateTournament: vi.fn(),
  dbUpdateTournamentStatus: vi.fn(),
  dbDeleteTournament: vi.fn(),
  dbConfirmTournamentEntitlement: vi.fn(),
  dbAddRound: vi.fn(),
  dbDeleteRound: vi.fn(),
}));

const { createTournament, updateTournament, retryTournamentEntitlementConfirmation } = await import("./tournament");
const { getUser } = await import("@/lib/api/auth");
const { getOwnedTournament } = await import("@/lib/actions/access");
const { isOnlinePaymentAllowed } = await import("@/lib/payments/onlinePaymentGuard");
const { resolveTournamentSizeEntitlement, consumeTournamentSizeCredit } = await import("@/lib/entitlements/tournamentSizeGuard");
const { dbCreateTournament, dbUpdateTournament, dbDeleteTournament, dbConfirmTournamentEntitlement } = await import("@/lib/db/tournament");
const { redirect } = await import("next/navigation");

const USER = { id: "user-1", email: "alan@example.com", roles: [], isVerified: true };

// max_players par défaut à 10 (palier gratuit) : les tests DO-PAYMENT-GUARD-001 ci-dessous ne
// portent pas sur la règle des 10 joueurs (DARTSOPEN-MONETIZATION-001, testée séparément plus
// bas) — rester dans le palier gratuit évite de déclencher resolveTournamentSizeEntitlement()
// par effet de bord et de fausser leurs assertions sur isOnlinePaymentAllowed/dbCreateTournament.
// idempotency_key est requis par createTournament() depuis DARTSOPEN-MONETIZATION-002.
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
    idempotency_key: "idem-key-1",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.mocked(getUser).mockReset().mockResolvedValue(USER as never);
  vi.mocked(getOwnedTournament).mockReset().mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10, status: "DRAFT", idempotency_key: "idem-key-1" } as never);
  vi.mocked(isOnlinePaymentAllowed).mockReset();
  vi.mocked(resolveTournamentSizeEntitlement).mockReset();
  vi.mocked(consumeTournamentSizeCredit).mockReset();
  vi.mocked(dbCreateTournament).mockReset().mockResolvedValue({ id: "tournament-1" } as never);
  vi.mocked(dbUpdateTournament).mockReset().mockResolvedValue({} as never);
  vi.mocked(dbDeleteTournament).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(dbConfirmTournamentEntitlement).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(redirect).mockClear();
});

describe("createTournament — idempotency_key (DARTSOPEN-MONETIZATION-002, audit DO-AUD-001/DO-AUD-002)", () => {
  it("refuse une soumission sans idempotency_key (jamais un contournement possible via appel direct)", async () => {
    const fd = tournamentFormData({ idempotency_key: "" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbCreateTournament).not.toHaveBeenCalled();
  });
});

describe("createTournament — défauts serveur 16/1/2 (DARTSOPEN-MONETIZATION-003, contre-audit P5)", () => {
  it("max_players absent du formulaire soumis → 16 côté serveur", async () => {
    // 16 dépasse le palier gratuit (10) : le défaut serveur déclenche donc la vérification
    // d'entitlement comme n'importe quelle valeur >10 explicite — un abonnement actif suffit ici.
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "SUBSCRIPTION" });
    const fd = tournamentFormData();
    fd.delete("max_players");

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(dbCreateTournament).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ max_players: 16 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("nb_pools absent du formulaire soumis → 1 côté serveur", async () => {
    const fd = tournamentFormData();
    fd.delete("nb_pools");

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(dbCreateTournament).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nb_pools: 1 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("nb_boards absent du formulaire soumis → 2 côté serveur", async () => {
    const fd = tournamentFormData();
    fd.delete("nb_boards");

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(dbCreateTournament).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nb_boards: 2 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("un champ présent mais vide n'est jamais défaulté silencieusement — échoue la validation normalement", async () => {
    const fd = tournamentFormData({ max_players: "" });

    const result = await createTournament(undefined, fd);

    expect(result?.errors?.max_players).toBeDefined();
    expect(dbCreateTournament).not.toHaveBeenCalled();
  });
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

describe("createTournament — DARTSOPEN-MONETIZATION-001/002 (règle des 10 joueurs)", () => {
  it("FREE : 10 joueurs acceptés sans aucune vérification d'entitlement", async () => {
    const fd = tournamentFormData({ max_players: "10" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(resolveTournamentSizeEntitlement).not.toHaveBeenCalled();
    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
  });

  it("sans organisation liée : plus de 10 joueurs refusé avec un message orientant vers la liaison + l'achat, jamais de création locale", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "NONE", reason: "NO_ORGANIZATION" });
    const fd = tournamentFormData({ max_players: "16" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toMatch(/liez d'abord votre compte/i);
    expect(dbCreateTournament).not.toHaveBeenCalled();
  });

  it("SUBSCRIPTION : plus de 10 joueurs accepté sans jamais consommer de crédit", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "SUBSCRIPTION" });
    const fd = tournamentFormData({ max_players: "32" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
    expect(consumeTournamentSizeCredit).not.toHaveBeenCalled();
  });

  it("CREDIT : le tournoi est créé localement (PENDING_ENTITLEMENT) AVANT toute tentative de consommation du crédit (audit DO-AUD-001, 'création locale intermédiaire + confirmation')", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("CONFIRMED");
    const fd = tournamentFormData({ max_players: "16" });

    const callOrder: string[] = [];
    vi.mocked(dbCreateTournament).mockImplementation(async () => {
      callOrder.push("create");
      return { id: "tournament-1" } as never;
    });
    vi.mocked(consumeTournamentSizeCredit).mockImplementation(async () => {
      callOrder.push("consume");
      return "CONFIRMED";
    });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(callOrder).toEqual(["create", "consume"]);
    // DARTSOPEN-MONETIZATION-004 (P2, contre-audit) : la référence de consommation est
    // `tournament.id` (identifiant serveur renvoyé par dbCreateTournament), jamais
    // `idempotency_key` (valeur client) — voir le test dédié ci-dessous pour la preuve complète
    // qu'une collision inter-utilisateurs volontaire sur cette valeur ne partage plus de crédit.
    expect(consumeTournamentSizeCredit).toHaveBeenCalledWith("club-a", "tournament-1");
    // DARTSOPEN-MONETIZATION-003 (P3) : créé PENDING_ENTITLEMENT, jamais directement DRAFT.
    expect(dbCreateTournament).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "PENDING_ENTITLEMENT");
    expect(dbConfirmTournamentEntitlement).toHaveBeenCalledWith("tournament-1");
  });

  it("DARTSOPEN-MONETIZATION-004 (P2, contre-audit) : la référence de consommation est l'id serveur du tournoi, jamais idempotency_key (valeur client) — même si celle-ci change, la référence suit l'id réel", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("CONFIRMED");
    vi.mocked(dbCreateTournament).mockResolvedValue({ id: "tournament-real-id-xyz" } as never);
    const fd = tournamentFormData({ max_players: "16", idempotency_key: "stable-key-xyz" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(consumeTournamentSizeCredit).toHaveBeenCalledWith("club-a", "tournament-real-id-xyz");
    expect(consumeTournamentSizeCredit).not.toHaveBeenCalledWith("club-a", "stable-key-xyz");
  });

  it("DARTSOPEN-MONETIZATION-004 (P2, contre-audit) — preuve anti-collision : deux organisateurs de la MÊME organisation soumettant volontairement la MÊME idempotency_key obtiennent deux références de consommation distinctes (tournament.id de chacun), jamais partagées", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("CONFIRMED");
    const sharedIdempotencyKey = "shared-key-chosen-by-both-users";

    vi.mocked(dbCreateTournament).mockResolvedValueOnce({ id: "tournament-user-a" } as never);
    const fdA = tournamentFormData({ max_players: "16", idempotency_key: sharedIdempotencyKey });
    await expect(createTournament(undefined, fdA)).rejects.toThrow("NEXT_REDIRECT");

    vi.mocked(dbCreateTournament).mockResolvedValueOnce({ id: "tournament-user-b" } as never);
    const fdB = tournamentFormData({ max_players: "16", idempotency_key: sharedIdempotencyKey });
    await expect(createTournament(undefined, fdB)).rejects.toThrow("NEXT_REDIRECT");

    // Les deux appels envoient la MÊME idempotency_key côté formulaire, mais deux références de
    // consommation DISTINCTES (l'id réel de chaque tournoi) — jamais la valeur partagée elle-même.
    expect(consumeTournamentSizeCredit).toHaveBeenNthCalledWith(1, "club-a", "tournament-user-a");
    expect(consumeTournamentSizeCredit).toHaveBeenNthCalledWith(2, "club-a", "tournament-user-b");
  });

  it("SUBSCRIPTION : le tournoi est créé directement en DRAFT, jamais PENDING_ENTITLEMENT (aucun crédit à confirmer)", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "SUBSCRIPTION" });
    const fd = tournamentFormData({ max_players: "32" });

    await expect(createTournament(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(dbCreateTournament).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "DRAFT");
    expect(dbConfirmTournamentEntitlement).not.toHaveBeenCalled();
  });

  it("CREDIT refusé (REJECTED) : le tournoi créé localement est retiré (rollback), aucune perte silencieuse d'un tournoi non entitled", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("REJECTED");
    vi.mocked(dbCreateTournament).mockResolvedValue({ id: "tournament-created" } as never);
    const fd = tournamentFormData({ max_players: "16" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbCreateTournament).toHaveBeenCalledTimes(1);
    expect(dbDeleteTournament).toHaveBeenCalledWith("tournament-created");
    expect(dbConfirmTournamentEntitlement).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("DARTSOPEN-MONETIZATION-003 (P3, contre-audit) — même si la suppression compensatoire échoue elle-même, jamais de confirmation : le tournoi n'est jamais rendu exploitable", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("REJECTED");
    vi.mocked(dbCreateTournament).mockResolvedValue({ id: "tournament-created" } as never);
    // La suppression compensatoire elle-même échoue (ex. DB momentanément indisponible) — la
    // cohérence commerciale ne doit jamais en dépendre : le tournoi créé en PENDING_ENTITLEMENT
    // n'a par construction aucune transition possible vers DRAFT/OPEN hors de
    // dbConfirmTournamentEntitlement(), jamais appelé ici.
    vi.mocked(dbDeleteTournament).mockRejectedValue(new Error("db momentanément indisponible"));
    const fd = tournamentFormData({ max_players: "16" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbConfirmTournamentEntitlement).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("DARTSOPEN-MONETIZATION-003 (P2, contre-audit) — CREDIT indéterminé (timeout) : ni confirmé, ni supprimé, le tournoi reste PENDING_ENTITLEMENT", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("INDETERMINATE");
    vi.mocked(dbCreateTournament).mockResolvedValue({ id: "tournament-created" } as never);
    const fd = tournamentFormData({ max_players: "16" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toMatch(/impossible de confirmer/i);
    expect(dbDeleteTournament).not.toHaveBeenCalled();
    expect(dbConfirmTournamentEntitlement).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("erreur de création locale : jamais de tentative de consommation du crédit (audit DO-AUD-001, aucune perte de crédit si la création échoue)", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(dbCreateTournament).mockRejectedValue(new Error("db down"));
    const fd = tournamentFormData({ max_players: "16" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(consumeTournamentSizeCredit).not.toHaveBeenCalled();
  });

  it("contournement par appel direct de la Server Action avec maxPlayers=64 sans entitlement (mission §11) refusé", async () => {
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("REJECTED");
    const fd = tournamentFormData({ max_players: "64" });

    const result = await createTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("updateTournament — DARTSOPEN-MONETIZATION-001/002 (règle des 10 joueurs)", () => {
  it("ne re-vérifie jamais un tournoi déjà >10 dont la valeur reste inchangée (ne casse jamais un tournoi existant, mission §12/§15)", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 32 } as never);
    const fd = tournamentFormData({ max_players: "32" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(resolveTournamentSizeEntitlement).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(dbUpdateTournament).toHaveBeenCalledTimes(1);
  });

  it("ne re-vérifie pas quand la valeur diminue tout en restant au-dessus de 10", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 32 } as never);
    const fd = tournamentFormData({ max_players: "20" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(resolveTournamentSizeEntitlement).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("contournement 'créer à 10 puis modifier à 64' (mission §2/§11) refusé sans entitlement", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "NONE", reason: "NO_ORGANIZATION" });
    const fd = tournamentFormData({ max_players: "64" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbUpdateTournament).not.toHaveBeenCalled();
  });

  it("une augmentation réelle au-delà de 10 est acceptée via abonnement, sans jamais consommer de crédit", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "SUBSCRIPTION" });
    const fd = tournamentFormData({ max_players: "64" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result).toBeUndefined();
    expect(consumeTournamentSizeCredit).not.toHaveBeenCalled();
    expect(dbUpdateTournament).toHaveBeenCalledTimes(1);
  });

  it("une augmentation réelle au-delà de 10 est acceptée via crédit, en utilisant l'id stable du tournoi comme référence", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("CONFIRMED");
    const fd = tournamentFormData({ max_players: "64" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result).toBeUndefined();
    expect(consumeTournamentSizeCredit).toHaveBeenCalledWith("club-a", "tournament-1");
    expect(dbUpdateTournament).toHaveBeenCalledTimes(1);
  });

  it("crédit refusé (REJECTED) à la modification : dbUpdateTournament jamais appelé", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("REJECTED");
    const fd = tournamentFormData({ max_players: "64" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result?.error).toBeDefined();
    expect(dbUpdateTournament).not.toHaveBeenCalled();
  });

  it("DARTSOPEN-MONETIZATION-003 (P2, contre-audit) — crédit indéterminé à la modification : dbUpdateTournament jamais appelé, jamais un refus définitif", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 10 } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("INDETERMINATE");
    const fd = tournamentFormData({ max_players: "64" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(result?.error).toMatch(/impossible de confirmer/i);
    expect(dbUpdateTournament).not.toHaveBeenCalled();
  });

  it("réduire un tournoi de 64 à 10 ne consomme jamais de crédit (retour dans le palier gratuit)", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", max_players: 64 } as never);
    const fd = tournamentFormData({ max_players: "10" });
    fd.set("tournament_id", "tournament-1");

    const result = await updateTournament(undefined, fd);

    expect(resolveTournamentSizeEntitlement).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

describe("retryTournamentEntitlementConfirmation — DARTSOPEN-MONETIZATION-003 (P2/P3, contre-audit)", () => {
  it("no-op si le tournoi n'est pas (ou plus) PENDING_ENTITLEMENT", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", status: "DRAFT", idempotency_key: "idem-key-1" } as never);

    const result = await retryTournamentEntitlementConfirmation("tournament-1");

    expect(result).toBeUndefined();
    expect(resolveTournamentSizeEntitlement).not.toHaveBeenCalled();
    expect(consumeTournamentSizeCredit).not.toHaveBeenCalled();
  });

  it("DARTSOPEN-MONETIZATION-004 (P2, contre-audit) : réutilise l'id réel du tournoi (jamais idempotency_key) comme référence de consommation — exactement la même référence que celle tentée par createTournament()", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", status: "PENDING_ENTITLEMENT", idempotency_key: "idem-key-1" } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("CONFIRMED");

    await retryTournamentEntitlementConfirmation("tournament-1");

    expect(consumeTournamentSizeCredit).toHaveBeenCalledWith("club-a", "tournament-1");
    expect(consumeTournamentSizeCredit).not.toHaveBeenCalledWith("club-a", "idem-key-1");
    expect(dbConfirmTournamentEntitlement).toHaveBeenCalledWith("tournament-1");
  });

  it("SUBSCRIPTION désormais active : confirme directement sans jamais consommer de crédit", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", status: "PENDING_ENTITLEMENT", idempotency_key: "idem-key-1" } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "SUBSCRIPTION" });

    const result = await retryTournamentEntitlementConfirmation("tournament-1");

    expect(result).toBeUndefined();
    expect(consumeTournamentSizeCredit).not.toHaveBeenCalled();
    expect(dbConfirmTournamentEntitlement).toHaveBeenCalledWith("tournament-1");
  });

  it("REJECTED (refus métier certain) : supprime le tournoi resté PENDING_ENTITLEMENT", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", status: "PENDING_ENTITLEMENT", idempotency_key: "idem-key-1" } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("REJECTED");

    await expect(retryTournamentEntitlementConfirmation("tournament-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(dbDeleteTournament).toHaveBeenCalledWith("tournament-1");
  });

  it("INDETERMINATE : ne supprime jamais, ne confirme jamais, renvoie un message temporaire", async () => {
    vi.mocked(getOwnedTournament).mockResolvedValue({ id: "tournament-1", association_id: "user-1", status: "PENDING_ENTITLEMENT", idempotency_key: "idem-key-1" } as never);
    vi.mocked(resolveTournamentSizeEntitlement).mockResolvedValue({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-a" });
    vi.mocked(consumeTournamentSizeCredit).mockResolvedValue("INDETERMINATE");

    const result = await retryTournamentEntitlementConfirmation("tournament-1");

    expect(result?.error).toMatch(/impossible de confirmer/i);
    expect(dbDeleteTournament).not.toHaveBeenCalled();
    expect(dbConfirmTournamentEntitlement).not.toHaveBeenCalled();
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
