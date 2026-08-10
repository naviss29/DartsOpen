import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = { title: "Politique de confidentialité — DartsOpen" };

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité" updatedAt="10/08/2026">
      <p>
        Cette politique décrit les données personnelles traitées par DartsOpen dans le cadre de
        la gestion de tournois de fléchettes, conformément au Règlement Général sur la
        Protection des Données (RGPD).
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        BApps Studio, éditrice de DartsOpen. Voir les{" "}
        <a href="/mentions-legales">mentions légales</a> pour les coordonnées complètes.
      </p>

      <h2>Données collectées</h2>
      <ul>
        <li>Organisateurs : nom, email, mot de passe (haché), historique des tournois créés</li>
        <li>Joueurs inscrits : pseudo, email, téléphone (selon le tournoi), pseudos des coéquipiers</li>
        <li>Paiements : traités par Stripe via SterPlatform (BApps Studio) — DartsOpen ne stocke aucune donnée bancaire</li>
        <li>Cookies techniques d&apos;authentification (voir ci-dessous)</li>
      </ul>

      <h2>Données rendues publiques</h2>
      <p>
        Le pseudo saisi à l&apos;inscription, ainsi que les résultats et statistiques qui en
        découlent (poules, bracket, classement inter-tournois, page de profil joueur), sont
        accessibles publiquement sans connexion sur les pages du tournoi et sur{" "}
        <a href="/classement">le classement général</a>. L&apos;email et le téléphone ne sont
        jamais rendus publics : ils ne sont utilisés que pour les communications liées au
        tournoi. Vous pouvez inscrire un pseudo plutôt que votre identité complète.
      </p>

      <h2>Finalités</h2>
      <ul>
        <li>Création et gestion des comptes organisateurs</li>
        <li>Inscription des joueurs aux tournois et traitement des paiements associés</li>
        <li>Envoi des emails transactionnels (confirmation d&apos;inscription, etc.)</li>
        <li>Établissement du classement inter-tournois et des pages de résultats publiques</li>
      </ul>

      <h2>Base légale</h2>
      <p>
        Exécution du contrat pour l&apos;inscription à un tournoi et la création d&apos;un
        compte organisateur. Intérêt légitime pour la publication des résultats et du
        classement, indispensable au fonctionnement normal d&apos;une compétition publique — ce
        traitement n&apos;est pas soumis à une case de consentement, mais vous pouvez à tout
        moment demander le retrait de vos données publiques (voir « Vos droits » ci-dessous).
      </p>

      <h2>Durée de conservation</h2>
      <p>
        Le pseudo et les résultats sportifs sont conservés indéfiniment : ils constituent le
        classement inter-tournois, qui n&apos;a pas de date de péremption par nature. L&apos;email
        et le téléphone, en revanche, n&apos;ont plus d&apos;usage une fois le tournoi terminé :
        ils sont supprimés automatiquement 12 mois après la date du tournoi.
      </p>

      <h2>Destinataires</h2>
      <p>
        Les données ne sont transmises qu&apos;aux prestataires techniques nécessaires au
        fonctionnement du service : SterPlatform (paiements via Stripe Connect, authentification),
        Brevo (emails transactionnels). Aucune
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
        d&apos;opposition — y compris pour vos données rendues publiques (pseudo, résultats).
        Ces droits sont exercés par l&apos;organisateur du tournoi concerné, ou par BApps Studio
        si l&apos;organisateur n&apos;est plus joignable. Pour les exercer, utilisez le{" "}
        <a href="/contact">formulaire de contact</a> ou écrivez à{" "}
        <a href="mailto:rgpd@bapps-studio.com">rgpd@bapps-studio.com</a>. Un effacement demandé
        après le début d&apos;un tournoi conserve vos résultats sous un identifiant anonyme,
        pour ne jamais corrompre le classement des autres participants.
      </p>

      <h2>Délégué à la protection des données</h2>
      <p>Contact RGPD : <a href="mailto:rgpd@bapps-studio.com">rgpd@bapps-studio.com</a>.</p>
    </LegalLayout>
  );
}
