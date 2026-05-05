"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";
import Link from "next/link";

export function ForgotPasswordForm() {
  const [state, action, isPending] = useActionState(requestPasswordReset, undefined);

  if (state?.success) {
    return (
      <div className="text-center space-y-4">
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700">
          Un email de réinitialisation a été envoyé à <strong>{state.email}</strong>. Vérifiez votre boîte de réception.
        </div>
        <Link href="/login" className="text-sm font-medium text-green-600 hover:text-green-700">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <p className="text-sm text-gray-600">
        Saisissez votre adresse email. Vous recevrez un lien pour réinitialiser votre mot de passe.
      </p>

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

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Envoi…" : "Envoyer le lien"}
      </button>

      <p className="text-center text-sm text-gray-600">
        <Link href="/login" className="font-medium text-green-600 hover:text-green-700">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
