import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nouveau mot de passe — DartsOpen" };

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token = "" } = await searchParams;

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Nouveau mot de passe</h2>
      <ResetPasswordForm token={token} />
    </>
  );
}
