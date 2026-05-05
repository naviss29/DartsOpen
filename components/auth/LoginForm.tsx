"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import Link from "next/link";

export function LoginForm() {
  const [state, action, isPending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          placeholder="association@exemple.fr"
        />
        {state?.errors?.email && (
          <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Mot de passe
          </label>
          <Link href="/forgot-password" className="text-xs text-green-600 hover:text-green-700">
            Mot de passe oublié ?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {state?.errors?.password && (
          <p className="mt-1 text-xs text-red-600">{state.errors.password[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Connexion…" : "Se connecter"}
      </button>

      <p className="text-center text-sm text-gray-600">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-medium text-green-600 hover:text-green-700">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
