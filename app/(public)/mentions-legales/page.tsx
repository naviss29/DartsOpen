import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Mentions légales" };

export default async function MentionsLegalesPage() {
  const { t } = await getI18n();
  return (
    <LegalLayout title="Mentions légales" updatedAt="28/10/2026">
      <h2>Éditeur du site</h2>
      <p>
        DartsOpen est développé et édité par <strong className="text-brand-dark">Alan Yvenou</strong>,
        entrepreneur individuel exerçant sous le nom commercial{" "}
        <strong className="text-brand-dark">BApps Studio</strong> (SIREN 940 014 822), dont le siège
        est situé au 1 rue de la Hallebarde, 45000 Orléans, France.
      </p>
      <p>
        Directeur de la publication : Alan Yvenou.
      </p>
      <p>
        Téléphone : 07 66 23 48 34.
      </p>
      <p>
        Contact RGPD : <a href="mailto:rgpd@bapps-studio.com">rgpd@bapps-studio.com</a>. Contact
        général : <a href="mailto:contact@bapps-studio.com">contact@bapps-studio.com</a> ou via
        le{" "}
        <a href="https://bapps-studio.com/contact">formulaire de contact</a>.
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par Contabo GmbH, Welfenstraße 22, 81541 München, Allemagne
        (immatriculation AG München, HRB 180722).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des contenus présents sur DartsOpen (textes, logos, structure du site)
        est protégé par le droit de la propriété intellectuelle. Toute reproduction non
        autorisée est interdite.
      </p>

      <h2>Prestataires techniques</h2>
      <ul>
        <li>{t("legal.notice.providers.payment")}</li>
        <li>{t("legal.notice.providers.email")}</li>
        <li>{t("legal.notice.providers.auth")}</li>
        <li>{t("legal.notice.providers.cdn")}</li>
      </ul>

      <h2>Médiation et litiges</h2>
      <p>
        En cas de litige, l&apos;utilisateur peut adresser une réclamation via le{" "}
        <a href="https://bapps-studio.com/contact">formulaire de contact</a> avant toute action contentieuse.
      </p>
    </LegalLayout>
  );
}
