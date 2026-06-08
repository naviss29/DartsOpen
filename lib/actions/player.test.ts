import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Schéma Zod extrait de player.ts ──────────────────────────────────────────
// Miroir exact de PlayerSchema — si le schéma change dans player.ts, mettre à jour ici.
const PlayerSchema = z.object({
  tournament_id: z.string().uuid(),
  player_name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  // Email facultatif : "" accepté pour les tournois rapides (inscription sur place, nom seul requis)
  player_email: z.union([z.string().trim().email("Email invalide."), z.literal("")]).optional(),
  player_phone: z
    .string()
    .trim()
    .refine(v => !v || /^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$/.test(v), "Numéro invalide.")
    .optional(),
});

// ── Logique pure extraite de player.ts ────────────────────────────────────────
// Décide si un email de confirmation doit être envoyé après inscription.
function shouldSendEmail(playerEmail: string | undefined): boolean {
  return Boolean(playerEmail && playerEmail.trim().length > 0);
}

// ── Tests validation du schéma ────────────────────────────────────────────────

describe("Inscription joueur — validation du schéma", () => {
  // UUID v4 valide (variante RFC 4122 : 4e groupe commence par 8, 9, a ou b)
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";

  it("valide avec email et téléphone complets", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "Jean Dupont",
      player_email: "jean@exemple.fr",
      player_phone: "0612345678",
    });
    expect(result.success).toBe(true);
  });

  it("valide sans email (mode rapide — inscription sur place)", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "Jean Dupont",
    });
    expect(result.success).toBe(true);
  });

  it("valide avec email vide \"\" (mode rapide — formulaire sans champ email)", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "Jean Dupont",
      player_email: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejette null pour player_email (formData.get() sans champ = null, doit être converti en undefined avant parse)", () => {
    // Bug réel : formData.get("player_email") renvoie null quand le champ n'existe pas.
    // Le correctif dans player.ts convertit null → undefined avec ??.
    // Ce test vérifie que null brut est bien rejeté, justifiant la conversion.
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "Jean Dupont",
      player_email: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejette un email malformé", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "Jean Dupont",
      player_email: "pas-un-email",
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.player_email).toBeDefined();
  });

  it("rejette un nom trop court (< 2 caractères)", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "A",
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.player_name?.[0]).toMatch(/2 caractères/);
  });

  it("rejette un UUID invalide pour tournament_id", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: "pas-un-uuid",
      player_name: "Jean Dupont",
    });
    expect(result.success).toBe(false);
  });

  it("valide sans téléphone (champ optionnel)", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "Jean Dupont",
      player_email: "jean@exemple.fr",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un numéro de téléphone invalide", () => {
    const result = PlayerSchema.safeParse({
      tournament_id: validUuid,
      player_name: "Jean Dupont",
      player_phone: "123",
    });
    expect(result.success).toBe(false);
  });
});

// ── Tests envoi email conditionnel ────────────────────────────────────────────

describe("Inscription joueur — envoi email conditionnel", () => {
  it("envoie un email si une adresse valide est fournie", () => {
    expect(shouldSendEmail("jean@exemple.fr")).toBe(true);
  });

  it("n'envoie pas d'email si le champ est vide (mode rapide)", () => {
    expect(shouldSendEmail("")).toBe(false);
  });

  it("n'envoie pas d'email si le champ est absent (mode rapide)", () => {
    expect(shouldSendEmail(undefined)).toBe(false);
  });

  it("n'envoie pas d'email si le champ ne contient que des espaces", () => {
    expect(shouldSendEmail("   ")).toBe(false);
  });
});
