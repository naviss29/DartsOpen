export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-darts-bg text-darts-text flex flex-col">
      <div className="flex-1">{children}</div>
      <footer className="border-t border-darts-border py-4 px-4 text-center text-xs text-darts-text-secondary space-x-4">
        <a href="/mentions-legales" className="hover:text-darts-text">Mentions légales</a>
        <a href="/confidentialite" className="hover:text-darts-text">Confidentialité</a>
        <a href="/cgu" className="hover:text-darts-text">CGU</a>
        <a href="/contact" className="hover:text-darts-text">Contact</a>
      </footer>
    </div>
  );
}
