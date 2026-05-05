import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mot de passe oublié — DartsOpen" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Mot de passe oublié</h2>
      <ForgotPasswordForm />
    </>
  );
}
