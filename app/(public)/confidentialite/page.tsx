import type { Metadata } from "next";
import { LegalLayout, TodoField } from "@/components/legal/LegalLayout";

export const metadata: Metadata = { title: "Politique de confidentialité — DartsOpen" };

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité" updatedAt="24/07/2026">
      <p>
        Cette politique décrit les données personnelles traitées par DartsOpen dans le cadre de
        la gestion de tournois de fléchettes, conformément au Règlement Général sur la
        Protection des Données (RGPD).
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        Stêr Eo Production, éditrice de DartsOpen. Voir les{" "}
        <a href="/mentions-legales">mentions légales</a> pour les coordonnées complètes.
      </p>

      <h2>Données collectées</h2>
      <ul>
        <li>Organisateurs : nom, email, mot de passe (haché), historique des tournois créés</li>
        <li>Joueurs inscrits : nom, email, téléphone (selon le tournoi), nom des coéquipiers</li>
        <li>Paiements : traités directement par Stripe — DartsOpen ne stocke aucune donnée bancaire</li>
        <li>Cookies techniques d&apos;authentification (voir ci-dessous)</li>
      </ul>

      <h2>Finalités</h2>
      <ul>
        <li>Création et gestion des comptes organisateurs</li>
        <li>Inscription des joueurs aux tournois et traitement des paiements associés</li>
        <li>Envoi des emails transactionnels (confirmation d&apos;inscription, etc.)</li>
        <li>Établissement du classement inter-tournois</li>
      </ul>

      <h2>Base légale</h2>
      <p>
        Exécution du contrat (inscription à un tournoi, création de compte organisateur) et
        intérêt légitime (bon fonctionnement du service, prévention des abus).
      </p>

      <h2>Durée de conservation</h2>
      <p>
        Les données sont conservées pendant la durée d&apos;utilisation du service, augmentée
        d&apos;une durée de <TodoField>[délai à définir]</TodoField> après la dernière activité,
        conformément aux obligations légales applicables.
      </p>

      <h2>Destinataires</h2>
      <p>
        Les données ne sont transmises qu&apos;aux prestataires techniques nécessaires au
        fonctionnement du service : Stripe (paiements), Brevo (emails transactionnels). Aucune
        donnée n&apos;est vendue ni cédée à des tiers à des fins commerciales.
      </p>

      <h2>Cookies</h2>
      <p>
        DartsOpen utilise uniquement des cookies techniques strictement nécessaires à
        l&apos;authentification des organisateurs (<code>ster_token</code>,{" "}
        <code>ster_refresh_token</code>), en HttpOnly et sécurisés. Aucun cookie de mesure
        d&apos;audience ou de publicité n&apos;est déposé.
      </p>

      <h2>Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification,
        d&apos;effacement et de portabilité de vos données, ainsi que d&apos;un droit
        d&apos;opposition. Pour exercer ces droits, utilisez le{" "}
        <a href="/contact">formulaire de contact</a>.
      </p>

      <h2>Délégué à la protection des données</h2>
      <p>Contact DPO : <TodoField>[à compléter si applicable]</TodoField>.</p>
    </LegalLayout>
  );
}
