import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nouveau mot de passe — DartsOpen" };

export default function ResetPasswordPage() {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Nouveau mot de passe</h2>
      <ResetPasswordForm />
    </>
  );
}
