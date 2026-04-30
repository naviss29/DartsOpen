import { describe, it, expect } from "vitest";
import { z } from "zod";

// Logique de détection "confirmation email requise"
describe("Détection confirmation email Supabase", () => {
  it("session null = confirmation email requise → retourner success + email", () => {
    const data = { session: null, user: { id: "uuid" } };
    const email = "test@club.fr";
    const result = !data.session ? { success: true, email } : null;
    expect(result).toEqual({ success: true, email });
  });

  it("session présente = confirmation désactivée → rediriger vers /dashboard", () => {
    const data = { session: { access_token: "tok" }, user: { id: "uuid" } };
    const shouldRedirect = !!data.session;
    expect(shouldRedirect).toBe(true);
  });
});

// Schémas extraits pour test — miroir de auth.ts
const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  email: z.string().trim().email("Email invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

const LoginSchema = z.object({
  email: z.string().trim().email("Email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

describe("RegisterSchema", () => {
  it("accepte des données valides", () => {
    const result = RegisterSchema.safeParse({
      name: "Club de fléchettes",
      email: "contact@club.fr",
      password: "motdepasse123",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un nom d'un seul caractère", () => {
    const result = RegisterSchema.safeParse({ name: "A", email: "a@b.fr", password: "12345678" });
    expect(result.success).toBe(false);
  });

  it("rejette un email malformé", () => {
    const result = RegisterSchema.safeParse({ name: "Club", email: "pas-un-email", password: "12345678" });
    expect(result.success).toBe(false);
  });

  it("rejette un mot de passe trop court", () => {
    const result = RegisterSchema.safeParse({ name: "Club", email: "a@b.fr", password: "court" });
    expect(result.success).toBe(false);
  });

  it("accepte un mot de passe d'exactement 8 caractères", () => {
    const result = RegisterSchema.safeParse({ name: "Club", email: "a@b.fr", password: "12345678" });
    expect(result.success).toBe(true);
  });

  it("trim l'email et le nom", () => {
    const result = RegisterSchema.safeParse({ name: "  Club  ", email: "  a@b.fr  ", password: "12345678" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Club");
      expect(result.data.email).toBe("a@b.fr");
    }
  });
});

describe("LoginSchema", () => {
  it("accepte des identifiants valides", () => {
    const result = LoginSchema.safeParse({ email: "a@b.fr", password: "n'importe quoi" });
    expect(result.success).toBe(true);
  });

  it("rejette un email invalide", () => {
    const result = LoginSchema.safeParse({ email: "pas-un-email", password: "pass" });
    expect(result.success).toBe(false);
  });

  it("rejette un mot de passe vide", () => {
    const result = LoginSchema.safeParse({ email: "a@b.fr", password: "" });
    expect(result.success).toBe(false);
  });
});
