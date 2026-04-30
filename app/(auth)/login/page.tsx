import { LoginForm } from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Connexion — DartsOpen" };

export default function LoginPage() {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Connexion</h2>
      <LoginForm />
    </>
  );
}
