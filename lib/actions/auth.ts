"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  email: z.string().trim().email("Email invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

const LoginSchema = z.object({
  email: z.string().trim().email("Email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export type AuthState = {
  error?: string;
  errors?: Record<string, string[]>;
  success?: boolean;
  email?: string;
} | undefined;

export async function register(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = RegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Session nulle = confirmation email requise par Supabase
  if (!data.session) {
    return { success: true, email: parsed.data.email };
  }

  redirect("/dashboard");
}

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Identifiants incorrects." };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("Email invalide."),
});

export async function requestPasswordReset(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = ForgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

  // On retourne toujours success pour ne pas révéler si l'email existe
  if (error) console.error("resetPasswordForEmail:", error.message);
  return { success: true, email: parsed.data.email };
}

const ResetPasswordSchema = z.object({
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Les mots de passe ne correspondent pas.",
  path: ["confirm"],
});

export async function updatePassword(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = ResetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) return { error: "Impossible de mettre à jour le mot de passe. Le lien a peut-être expiré." };

  redirect("/dashboard");
}
