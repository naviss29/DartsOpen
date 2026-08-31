export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-light text-brand-dark flex flex-col">
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border-muted py-4 px-4 text-center text-xs text-brand-text-secondary space-x-4">
        <a href="/mentions-legales" className="hover:text-brand-dark">Mentions légales</a>
        <a href="/confidentialite" className="hover:text-brand-dark">Confidentialité</a>
        <a href="/cgu" className="hover:text-brand-dark">CGU</a>
      </footer>
    </div>
  );
}
