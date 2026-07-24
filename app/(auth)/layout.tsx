export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            🎯 DartsOpen
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Plateforme de gestion de tournois de fléchettes
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {children}
        </div>
        <div className="mt-6 text-center text-xs text-gray-400 space-x-3">
          <a href="/mentions-legales" className="hover:text-gray-600">Mentions légales</a>
          <a href="/confidentialite" className="hover:text-gray-600">Confidentialité</a>
          <a href="/cgu" className="hover:text-gray-600">CGU</a>
        </div>
      </div>
    </div>
  );
}
