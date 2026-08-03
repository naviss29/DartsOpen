"use client";

import { useActionState } from "react";
import { register } from "@/lib/actions/auth";
import Link from "next/link";
import { Alert, Button, Input } from "@naviss29/design-system";

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
        <Alert tone="warning" className="text-xs">
          Vous ne trouvez pas l&apos;email ? Vérifiez vos spams.
        </Alert>
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
    <form key={state?.ts} action={action} className="space-y-5">
      {state?.error && (
        <Alert tone="error">{state.error}</Alert>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Nom de l&apos;association
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={state?.fields?.name}
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
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={state?.fields?.email}
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
        <Input
          id="password"
          name="password"
          type="password"
          required
          placeholder="8 caractères minimum"
        />
        {state?.errors?.password && (
          <p className="mt-1 text-xs text-red-600">{state.errors.password[0]}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full"
      >
        {isPending ? "Création…" : "Créer mon compte"}
      </Button>

      <p className="text-center text-sm text-gray-600">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-green-600 hover:text-green-700">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
