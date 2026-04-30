"use client";

import { useActionState } from "react";
import { register } from "@/lib/actions/auth";
import Link from "next/link";

export function RegisterForm() {
  const [state, action, isPending] = useActionState(register, undefined);

  if (state?.success) {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">📬</div>
        <h3 className="text-lg font-semibold text-gray-900">Vérifiez votre boîte mail</h3>
        <p className="text-sm text-gray-600">
          Un lien de confirmation a été envoyé à{" "}
          <span className="font-medium text-gray-900">{state.email}</span>.
        </p>
        <p className="text-sm text-gray-500">
          Cliquez sur ce lien pour activer votre compte, puis revenez vous connecter.
        </p>
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
          Vous ne trouvez pas l&apos;email ? Vérifiez vos spams.
        </div>
        <Link
          href="/login"
          className="inline-block mt-2 text-sm font-medium text-green-600 hover:text-green-700"
        >
          Retour à la connexion →
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

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Nom de l&apos;association
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          placeholder="Fléchettes Club d'Orléans"
        />
        {state?.errors?.name && (
          <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          placeholder="contact@monclub.fr"
        />
        {state?.errors?.email && (
          <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          placeholder="8 caractères minimum"
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
        {isPending ? "Création…" : "Créer mon compte"}
      </button>

      <p className="text-center text-sm text-gray-600">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-green-600 hover:text-green-700">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
