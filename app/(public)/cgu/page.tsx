import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Conditions générales d'utilisation — DartsOpen" };

export default async function CguPage() {
  // La page n'est pas encore entièrement traduite (écarts historiques dans la baseline i18n) :
  // tout texte ajouté passe par le catalogue, jamais par la baseline. La section « Annulation et
  // remboursement » est traduite en entier pour ne pas mêler deux langues dans un même paragraphe.
  const { t } = await getI18n();
  return (
    <LegalLayout title="Conditions générales d'utilisation" updatedAt="01/10/2026">
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

      <h2>Organisation d&apos;un tournoi et contenu publié</h2>
      <p>
        L&apos;association organisatrice est seule responsable des informations qu&apos;elle
        publie sur un tournoi (description, règlement, lieu, horaires) et des décisions prises
        pendant son déroulement (validation des résultats, arbitrage, gestion des litiges entre
        joueurs). DartsOpen fournit l&apos;outil technique, pas l&apos;organisation de
        l&apos;événement lui-même.
      </p>
      <p>
        Les organisateurs et les joueurs s&apos;engagent à ne publier aucun contenu manifestement
        illicite (propos injurieux, discriminatoires, ou contraires à la loi). DartsOpen peut
        masquer ou supprimer un tournoi, un profil ou un contenu en cas d&apos;abus signalé ou
        d&apos;obligation légale.
      </p>

      {/* ADR-0022 : les inscriptions sont encaissées directement sur le compte Stripe de
          l'organisation — jamais « reversées » par BApps, qui ne touche pas cet argent. */}
      <h2>{t("legal.terms.fees.title")}</h2>
      <p>{t("legal.terms.fees.body")}</p>

      <h2>{t("legal.terms.payment.title")}</h2>
      <p>{t("legal.terms.payment.body")}</p>

      <h2>{t("legal.terms.cancellation.title")}</h2>
      <p>{t("legal.terms.cancellation.organizerPolicy")}</p>
      <p>{t("legal.terms.cancellation.cancelledTournament")}</p>
      {/* DO-UNFINISHED-PURGE-001 (décision Alan 30/09/2026) : information honnête sur la purge
          planifiée — rappel seulement « lorsque l'organisateur peut être joint » (404 SterPlatform ⇒
          suppression sans rappel), voir lib/db/unfinishedTournamentPurge.ts. */}
      <p>{t("legal.terms.cancellation.unfinishedTournamentDeletion")}</p>

      <h2>Résultats et classement</h2>
      <p>
        Les résultats saisis (scores, vainqueurs) et le classement inter-tournois qui en découle
        reflètent les données validées par les organisateurs et arbitres. DartsOpen ne garantit
        pas l&apos;exactitude d&apos;une saisie effectuée par un tiers.
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
