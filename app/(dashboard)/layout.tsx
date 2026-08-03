import { redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { LandscapeGuard } from "@/components/ui/LandscapeGuard";
import DashboardSidebar from "@/components/layout/DashboardSidebar";
import DashboardMobileNav from "@/components/layout/DashboardMobileNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <LandscapeGuard>
      <div className="flex min-h-screen bg-gray-50">
        <DashboardSidebar userEmail={user.email} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <DashboardMobileNav />
          <main className="flex-1 overflow-auto">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
          </main>
        </div>
      </div>
    </LandscapeGuard>
  );
}
