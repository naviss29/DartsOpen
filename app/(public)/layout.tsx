import PublicFooter from "@/components/layout/PublicFooter";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-light text-brand-dark flex flex-col">
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
