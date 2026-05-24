import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Email confirmé — DartsOpen" };

export default function VerifiedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Email confirmé !</h2>
        <p className="text-sm text-gray-600 mb-6">
          Votre compte est activé. Vous pouvez maintenant vous connecter.
        </p>
        <Link
          href="/login"
          className="block w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition-colors"
        >
          Se connecter
        </Link>
      </div>
    </div>
  );
}
