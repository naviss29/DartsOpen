"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { requestPasswordReset } from "@/lib/actions/auth";
import Link from "next/link";
import { Alert, Button, Input } from "@naviss29/design-system";

export function ForgotPasswordForm() {
  const [state, action, isPending] = useActionState(requestPasswordReset, undefined);
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("error") === "expired";

  if (state?.success) {
    return (
      <div className="text-center space-y-4">
        <Alert tone="success">
          Un email de réinitialisation a été envoyé à <strong>{state.email}</strong>. Vérifiez votre boîte de réception.
        </Alert>
        <Link href="/login" className="text-sm font-medium text-green-600 hover:text-green-700">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form key={state?.ts} action={action} className="space-y-5">
      {isExpired && (
        <Alert tone="warning">
          Le lien de réinitialisation a expiré. Saisissez votre email pour en recevoir un nouveau.
        </Alert>
      )}
      {state?.error && (
        <Alert tone="error">{state.error}</Alert>
      )}

      <p className="text-sm text-gray-600">
        Saisissez votre adresse email. Vous recevrez un lien pour réinitialiser votre mot de passe.
      </p>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.fields?.email}
          placeholder="association@exemple.fr"
        />
        {state?.errors?.email && (
          <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full"
      >
        {isPending ? "Envoi…" : "Envoyer le lien"}
      </Button>

      <p className="text-center text-sm text-gray-600">
        <Link href="/login" className="font-medium text-green-600 hover:text-green-700">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
