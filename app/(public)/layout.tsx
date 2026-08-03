export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-darts-bg text-darts-text">
      {children}
    </div>
  );
}
