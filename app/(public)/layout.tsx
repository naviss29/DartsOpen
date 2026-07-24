export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex-1">{children}</div>
      <footer className="border-t border-white/10 py-4 px-4 text-center text-xs text-gray-500 space-x-4">
        <a href="/mentions-legales" className="hover:text-gray-300">Mentions légales</a>
        <a href="/confidentialite" className="hover:text-gray-300">Confidentialité</a>
        <a href="/cgu" className="hover:text-gray-300">CGU</a>
        <a href="/contact" className="hover:text-gray-300">Contact</a>
      </footer>
    </div>
  );
}
