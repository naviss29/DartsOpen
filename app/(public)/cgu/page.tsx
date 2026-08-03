import type { Metadata } from "next";
import { LegalLayout, TodoField } from "@/components/legal/LegalLayout";

export const metadata: Metadata = { title: "Conditions générales d'utilisation — DartsOpen" };

export default function CguPage() {
  return (
    <LegalLayout title="Conditions générales d'utilisation et de vente" updatedAt="24/07/2026">
      <h2>Objet</h2>
      <p>
        Les présentes conditions régissent l&apos;utilisation de DartsOpen, plateforme de
        gestion de tournois de fléchettes (création de tournois, inscriptions, scoring,
        classement), par les organisateurs et les joueurs.
      </p>

      <h2>Accès au service</h2>
      <p>
        L&apos;accès aux fonctionnalités d&apos;organisation nécessite la création d&apos;un
        compte organisateur. L&apos;inscription à un tournoi en tant que joueur ne nécessite pas
        de compte.
      </p>

      <h2>Frais de plateforme</h2>
      <p>
        DartsOpen applique des frais de plateforme de 0,10&nbsp;€ par joueur inscrit à un
        tournoi payant, prélevés automatiquement lors du paiement. Le solde de l&apos;inscription
        est reversé à l&apos;association organisatrice sur le compte Stripe Connect de son
        organisation BApps Studio.
      </p>

      <h2>Paiement</h2>
      <p>
        Les paiements d&apos;inscription sont initiés par DartsOpen mais traités et encaissés par
        Stripe via l&apos;infrastructure de paiement de BApps Studio (SterPlatform). DartsOpen
        n&apos;a accès à aucune donnée bancaire et n&apos;intervient pas dans la transaction
        financière au-delà du prélèvement des frais de plateforme.
      </p>

      <h2>Annulation et remboursement</h2>
      <p>
        La politique d&apos;annulation et de remboursement d&apos;une inscription est définie
        par l&apos;association organisatrice de chaque tournoi. DartsOpen ne rembourse pas
        directement les frais de plateforme déjà prélevés, sauf disposition légale contraire.
        Modalités précises : <TodoField>[à définir]</TodoField>.
      </p>

      <h2>Responsabilités</h2>
      <p>
        DartsOpen met à disposition un outil technique de gestion de tournois. L&apos;
        organisation effective de l&apos;événement (respect des règles sportives, sécurité sur
        site, litiges entre joueurs) relève de la seule responsabilité de l&apos;association
        organisatrice.
      </p>
      <p>
        DartsOpen s&apos;efforce d&apos;assurer la disponibilité du service mais ne garantit pas
        une disponibilité continue et ne saurait être tenu responsable des interruptions liées
        à la maintenance, à un cas de force majeure ou à une défaillance d&apos;un prestataire
        tiers (Stripe, hébergeur, service d&apos;emailing).
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{" "}
        <a href="/confidentialite">politique de confidentialité</a>.
      </p>

      <h2>Modification des conditions</h2>
      <p>
        Ces conditions peuvent être mises à jour à tout moment. La date de dernière mise à jour
        est indiquée en haut de cette page.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Les présentes conditions sont soumises au droit français. Tout litige relève des
        juridictions compétentes, à défaut de résolution amiable via le{" "}
        <a href="/contact">formulaire de contact</a>.
      </p>
    </LegalLayout>
  );
}
