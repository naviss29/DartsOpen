import { RegisterForm } from "@/components/auth/RegisterForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Créer un compte — DartsOpen" };

export default function RegisterPage() {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Créer un compte association</h2>
      <RegisterForm />
    </>
  );
}
