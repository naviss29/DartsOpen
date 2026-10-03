import { bappsAppUrl } from "@/lib/bappsApps";
import { getUser } from "@/lib/api/auth";
import { redirect } from "next/navigation";
import { Alert, Card, Pill } from "@naviss29/design-system";
import { dbGetOrganization } from "@/lib/db/tournament";
import { getMyOrganizations, getPaymentAuthorization } from "@/lib/api/organizations";
import { getCurrentOrganization } from "@/lib/auth/organizationAccess";
import { getI18n } from "@/lib/i18n/server";
import { OrganizationLinkForm } from "@/components/settings/OrganizationLinkForm";
import { unlinkOrganization } from "@/lib/actions/organization";
import Button from "@/components/ui/Button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Paramètres — DartsOpen" };

const BSSITE_URL = process.env.NEXT_PUBLIC_BSSITE_URL ?? bappsAppUrl("https://bapps-studio.com"); // portail du même environnement

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  // ADR-0021 / L7 — le paiement en ligne et les crédits d'un tournoi rattaché se lisent dans
  // SON organisation (et, à la création, dans l'organisation courante) : c'est donc l'état
  // Stripe Connect de l'organisation courante qui compte d'abord ici. La liaison locale
  // ci-dessous ne sert plus que de repli aux tournois sans organisation (suppression : lot L8).
  const [{ t: translate }, current, org] = await Promise.all([
    getI18n(),
    getCurrentOrganization(),
    dbGetOrganization(user.id),
  ]);
  const slug = org?.sterOrganizationSlug ?? null;
  const currentOrganization = current.status === "OK" ? current.current : null;
  const needsSelection = current.status === "OK" && current.needsSelection;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Paramètres</h1>
        <p className="text-sm text-brand-text-secondary mt-1">Gérez votre compte et votre organisation BApps Studio.</p>
      </div>

      <section>
        <Card className="space-y-3">
          <h2 className="text-h2 text-brand-dark">Mon compte</h2>
          <div className="text-sm text-brand-dark space-y-1">
            <p><span className="text-brand-text-secondary">Email :</span> {user.email}</p>
          </div>
        </Card>
      </section>

      <section>
        <Card className="space-y-4">
          <h2 className="text-h2 text-brand-dark">Paiements</h2>

          {currentOrganization && (
            <div className="space-y-3">
              <p className="text-sm text-brand-text-secondary">
                {translate("settings.payments.currentOrganization", { name: currentOrganization.name })}
              </p>
              <StripeConnectSection slug={currentOrganization.slug} unlinkable={false} />
            </div>
          )}
          {needsSelection && <Alert tone="info">{translate("orgAccess.chooseOrganizationNotice")}</Alert>}

          {/* Liaison locale : seule source pour un compte sans vraie organisation ; sinon repli
              des seuls tournois sans organisation, d'où le titre qui le dit explicitement. */}
          <div className="space-y-3">
            {(currentOrganization || needsSelection) && (
              <>
                <h3 className="text-sm font-semibold text-brand-dark">{translate("settings.payments.legacyTitle")}</h3>
                <p className="text-sm text-brand-text-secondary">{translate("settings.payments.legacyHint")}</p>
              </>
            )}
            {!slug ? (
              <OrganizationSection />
            ) : (
              <StripeConnectSection slug={slug} unlinkable />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

async function OrganizationSection() {
  const organizations = await getMyOrganizations();

  if (!organizations) {
    return (
      <Alert tone="error">
        Impossible de récupérer vos organisations BApps Studio pour le moment. Réessayez plus tard.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-text-secondary">
        Pour recevoir les droits d&apos;inscription en ligne, liez ce compte à l&apos;une de vos
        organisations BApps Studio. Les paiements sont ensuite entièrement gérés depuis BApps
        Studio, jamais depuis DartsOpen.
      </p>
      <OrganizationLinkForm organizations={organizations} />
    </div>
  );
}

/**
 * `unlinkable` : vrai pour la liaison locale (repli des tournois sans organisation), faux pour
 * l'organisation courante, qui n'est pas une liaison DartsOpen mais une appartenance SterPlatform
 * (on en change avec le sélecteur, on ne la « délie » pas).
 */
async function StripeConnectSection({ slug, unlinkable }: { slug: string; unlinkable: boolean }) {
  // DARTSOPEN-MONETIZATION-001 : cette page affichait auparavant le lookup serveur-à-serveur
  // (getStripeConnectStatus, X-App-Token) — un jeton mal configuré y échouait silencieusement
  // (.catch(() => undefined) sans log) et affichait "non opérationnel" même pour une
  // organisation dont Stripe Connect l'était réellement (constaté via la page Stripe de
  // BSsite, qui appelle ce même endpoint JWT). getPaymentAuthorization() est cet endpoint.
  //
  // DARTSOPEN-MONETIZATION-002 (audit priorité 4) : `?? undefined` puis `status?.canReceivePayments`
  // assimilait silencieusement un échec de lecture (authorization === null, ex. jeton expiré,
  // réseau) au même état que "Stripe Connect réellement non opérationnel" — exactement la
  // confusion à l'origine du message erroné constaté en production. Distingue maintenant
  // explicitement les trois cas.
  const authorization = await getPaymentAuthorization(slug);
  const stripeUrl = `${BSSITE_URL}/dashboard/organisations/${slug}/stripe`;

  if (authorization?.canReceivePayments) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-brand-dark">Organisation : <strong>{slug}</strong></p>
          <Pill tone="success">Paiements activés</Pill>
        </div>
        <p className="text-sm text-brand-text-secondary">
          Les droits d&apos;inscription sont intégralement reversés sur le compte bancaire de
          votre organisation — DartsOpen ne prélève aucun frais par inscription.
        </p>
        <div className="flex items-center gap-4">
          <Button href={stripeUrl} variant="secondary">
            Gérer Stripe Connect
          </Button>
          {unlinkable && <UnlinkButton />}
        </div>
      </div>
    );
  }

  if (authorization === null) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-brand-dark">Organisation : <strong>{slug}</strong></p>
          <Pill tone="neutral">Statut momentanément indisponible</Pill>
        </div>
        <Alert tone="info">
          Impossible de vérifier le statut Stripe Connect pour le moment. Rechargez la page dans
          quelques instants — si votre compte est déjà opérationnel, vous n&apos;avez rien à faire.
        </Alert>
        <div className="flex items-center gap-4">
          <Button href={stripeUrl} variant="secondary">
            Voir sur BApps Studio
          </Button>
          {unlinkable && <UnlinkButton />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-dark">Organisation : <strong>{slug}</strong></p>
        <Pill tone="neutral">Paiements non activés</Pill>
      </div>
      <Alert tone="info">
        Le paiement en ligne nécessite un compte Stripe Connect opérationnel pour cette organisation.
      </Alert>
      <div className="flex items-center gap-4">
        <Button href={stripeUrl}>
          Configurer Stripe Connect dans BApps Studio
        </Button>
        {unlinkable && <UnlinkButton />}
      </div>
    </div>
  );
}

function UnlinkButton() {
  return (
    <form action={unlinkOrganization}>
      <button type="submit" className="text-xs text-brand-text-secondary hover:text-brand-dark underline underline-offset-2">
        Délier cette organisation
      </button>
    </form>
  );
}
