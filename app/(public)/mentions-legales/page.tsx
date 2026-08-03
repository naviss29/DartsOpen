import type { Metadata } from "next";
import { LegalLayout, TodoField } from "@/components/legal/LegalLayout";

export const metadata: Metadata = { title: "Mentions légales — DartsOpen" };

export default function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales" updatedAt="24/07/2026">
      <h2>Éditeur du site</h2>
      <p>
        DartsOpen est développé et édité par <strong className="text-brand-dark">BApps Studio</strong>,{" "}
        <TodoField>[forme juridique à compléter]</TodoField>, dont le siège social est situé au 1 rue
        de la Hallebarde, 45000 Orléans.
      </p>
      <p>
        SIREN : <TodoField>à venir</TodoField>.
      </p>
      <p>
        Directeur de la publication : <TodoField>[nom à compléter]</TodoField>.
      </p>
      <p>
        Contact : <a href="mailto:contact@bapps-studio.com">contact@bapps-studio.com</a> ou via
        le{" "}
        <a href="/contact">formulaire de contact</a>.
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé sur un serveur privé virtuel (VPS) chez OVH SAS. Adresse et
        coordonnées complètes de l&apos;hébergeur : <TodoField>[à compléter]</TodoField>.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des contenus présents sur DartsOpen (textes, logos, structure du site)
        est protégé par le droit de la propriété intellectuelle. Toute reproduction non
        autorisée est interdite.
      </p>

      <h2>Prestataires techniques</h2>
      <ul>
        <li>Paiements en ligne : Stripe (Stripe Payments Europe, Limited)</li>
        <li>Envoi des emails transactionnels : Brevo</li>
        <li>Authentification et gestion des comptes organisateurs : SterPlatform (service interne)</li>
      </ul>

      <h2>Médiation et litiges</h2>
      <p>
        En cas de litige, l&apos;utilisateur peut adresser une réclamation via le{" "}
        <a href="/contact">formulaire de contact</a> avant toute action contentieuse.
      </p>
    </LegalLayout>
  );
}
