import { redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { AppHeader } from "@naviss29/design-system";
import DashboardSidebar from "@/components/layout/DashboardSidebar";
import DashboardMobileNav from "@/components/layout/DashboardMobileNav";
import LogoutButton from "@/components/LogoutButton";
import DashboardApplicationSwitcher from "@/components/layout/DashboardApplicationSwitcher";
import { getMyOrganizationsProducts } from "@/lib/api/organizations";

/**
 * DO-OPS-001 — `LandscapeGuard` (overlay bloquant "Tournez votre téléphone") enveloppait
 * auparavant TOUT le dashboard depuis ce layout : n'importe quelle page organisateur, y compris
 * la nouvelle console jour J (mobile-first, priorité absolue de cette mission), affichait cet
 * écran bloquant à un organisateur en portrait sur téléphone — exactement le défaut identifié
 * par l'audit stratégique ("back-office bloquant ou mal adapté au portrait"). Seule la vue
 * bracket (arbre large, effectivement optimisée pour le paysage) garde ce garde-fou, appliqué
 * localement dans `bracket/page.tsx` — jamais plus au niveau du layout global.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');
  const organizations = await getMyOrganizationsProducts();

  return (
    <div className="flex min-h-screen bg-brand-light">
      <DashboardSidebar />
      {/* BAPPS-UX-UNIFICATION-006-FIX-001 — `overflow-hidden` retiré : combiné à l'`overflow-auto`
          de `main` ci-dessous, ce conteneur créait un second contexte de défilement concurrent
          à celui du document, empêchant tout `sticky` posé sur AppHeader/la sidebar de produire
          un effet réel (aucun ancêtre scrollable entre eux et le viewport). Le scroll de
          référence redevient le document, comme dans BSsite (même shell, même contrat). */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* BAPPS-SHELL-001 — AppHeader (DS) : continuité visuelle avec la sidebar sombre,
            jamais de bande blanche entre les deux (UX-UI-Standards.md §3ter). Toujours visible
            (desktop ET mobile). L'email porte son propre min-w-0/truncate ; le bouton de
            déconnexion reste shrink-0 — c'est l'email qui absorbe tout rétrécissement, jamais
            le bouton qui sort du viewport.
            BAPPS-UX-UNIFICATION-006 LOT 2 — le déclencheur du menu mobile (DashboardMobileNav)
            vit désormais DANS le slot `start` d'AppHeader (charte §10.1 : ouverture du menu
            mobile en premier dans l'ordre du header), plus jamais une seconde bande `md:hidden`
            empilée sous le header — sous 768px, il n'existe plus qu'une seule barre
            structurelle de 64px, le menu s'ouvrant en drawer superposé (charte §4.1/§11.3).
            BAPPS-UX-UNIFICATION-006-FIX-001 — `sticky top-0 z-10` : header réellement épinglé
            en haut du défilement document (charte §4.1 "header sticky en haut"), jamais un
            simple `className` sans effet réel. `z-10` garantit que le header reste au-dessus
            du contenu qui défile sous lui. */}
        <AppHeader
          start={<DashboardMobileNav />}
          className="sticky top-0 z-10"
          end={
            <>
              <span className="hidden min-w-0 truncate text-sm text-white/80 sm:block">{user.email}</span>
              <DashboardApplicationSwitcher organizations={organizations} />
              <span className="shrink-0">
                <LogoutButton className="text-white/90 hover:text-white" />
              </span>
            </>
          }
        />
        {/* BAPPS-UX-UNIFICATION-006-FIX-001 — `overflow-auto` retiré (voir commentaire ci-dessus) ;
            padding vertical du contenu : 24px sous 1024px (mobile ET tablette), 32px dès 1024px
            (`lg:`, charte §4.1 "Padding contenu ... 24/32 dès 1 024"). Auparavant `sm:py-8`
            appliquait déjà 32px vertical dès 640px, soit 384px trop tôt sur toute la plage
            tablette 640-1023px. Le padding horizontal (`px-4 sm:px-6`) est inchangé — hors
            périmètre de cette correction. */}
        <main className="min-w-0 flex-1 overflow-x-hidden">
          <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
