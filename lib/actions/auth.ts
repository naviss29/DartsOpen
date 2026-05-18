"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import { setAuthCookies, clearAuthCookies } from "@/lib/api/auth";
import { cookies } from "next/headers";

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  email: z.string().trim().email("Email invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

const LoginSchema = z.object({
  email: z.string().trim().email("Email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("Email invalide."),
});

const ResetPasswordSchema = z.object({
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Les mots de passe ne correspondent pas.",
  path: ["confirm"],
});

export type AuthState = {
  error?: string;
  errors?: Record<string, string[]>;
  success?: boolean;
  email?: string;
  fields?: Record<string, string>;
  ts?: number;
} | undefined;

export async function register(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const raw = {
    name: (formData.get("name") as string) ?? "",
    email: (formData.get("email") as string) ?? "",
    password: (formData.get("password") as string) ?? "",
  };

  const parsed = RegisterSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      fields: { name: raw.name, email: raw.email },
      ts: Date.now(),
    };
  }

  const verifyRedirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verified`;

  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: parsed.data.email,
      password: parsed.data.password,
      verifyRedirectUri,
    }),
  });

  if (!res.ok && res.status !== 201) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Une erreur est survenue.", fields: { name: raw.name, email: raw.email }, ts: Date.now() };
  }

  return { success: true, email: parsed.data.email };
}

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const raw = {
    email: (formData.get("email") as string) ?? "",
    password: (formData.get("password") as string) ?? "",
  };

  const parsed = LoginSchema.safeParse(raw);

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, fields: { email: raw.email }, ts: Date.now() };
  }

  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
  });

  if (!res.ok) {
    return { error: "Identifiants incorrects.", fields: { email: raw.email }, ts: Date.now() };
  }

  const data = await res.json() as { token: string; refresh_token: string };
  await setAuthCookies(data.token, data.refresh_token);

  redirect('/dashboard');
}

export async function logout() {
  const store = await cookies();
  const refreshToken = store.get('ster_refresh_token')?.value;

  if (refreshToken) {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {});
  }

  await clearAuthCookies();
  redirect('/login');
}

export async function requestPasswordReset(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get("email") as string) ?? "";
  const parsed = ForgotPasswordSchema.safeParse({ email });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, fields: { email }, ts: Date.now() };
  }

  await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      email: parsed.data.email,
      resetRedirectBaseUrl: process.env.NEXT_PUBLIC_APP_URL,
    }),
  }).catch(() => {});

  return { success: true, email: parsed.data.email };
}

export async function updatePassword(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = ResetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const token = (formData.get("token") as string) ?? "";

  if (!token) {
    return { error: "Token manquant. Veuillez utiliser le lien reçu par email." };
  }

  const res = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password: parsed.data.password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Impossible de mettre à jour le mot de passe. Le lien a peut-être expiré." };
  }

  redirect('/login?reset=success');
}
