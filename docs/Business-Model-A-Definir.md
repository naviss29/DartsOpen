# Modèle économique DartsOpen — état technique vs décision Product Owner

> BAPPS-LEGAL-009 — ce document sépare explicitement ce qui existe aujourd'hui dans le code
> (implémentation technique) de ce qui a été validé comme modèle économique définitif par le
> Product Owner. **Une constante, un montant ou un ancien document technique ne constitue
> jamais une décision de business model** — voir la règle de gouvernance formalisée dans
> `BApps-Studio/12-Legal/README.md`.
>
> **Mise à jour DO-PAYPAL-REMOVAL-001** — le volet PayPal décrit ci-dessous (`activate/page.tsx`,
> `PaypalActivateButton.tsx`, `/dons`) a été **entièrement supprimé** du produit : DartsOpen ne
> propose plus aucun prélèvement ni contribution via PayPal, nulle part. Le modèle économique
> réel repose désormais exclusivement sur SterPlatform (accès gratuit selon limites, abonnements
> DartsOpen, crédits tournoi). La description ci-dessous du parcours PayPal est conservée à
> titre d'historique (elle explique pourquoi la question tarifaire ci-dessous restait ouverte) ;
> elle ne décrit plus rien d'actif dans le produit.

## Ce qui existe réellement dans le code aujourd'hui

- `lib/platformFee.ts::PLATFORM_FEE_CENTS = 10` — 0,10 € par joueur. Introduit dans un
  commentaire dès la phase 4 (30/04/2026, intégration Stripe directe historique), repris tel
  quel lors de la migration DO-003 (03/08/2026) vers l'architecture de paiement SterPlatform.
  Jamais recalculé ni revalidé depuis sa création initiale.
- **Inscription en ligne payante** (`lib/actions/registration.ts`) : ce montant × le nombre de
  joueurs par équipe est transmis en tant que `platformFeeCents` à
  `createPaymentCheckout` (SterPlatform → Stripe Connect, destination charge). **Prélèvement
  technique réel et automatique** dès qu'un tournoi a un `entry_fee > 0` et une organisation
  liée avec Stripe Connect opérationnel — aucun moyen pour l'organisateur de le contourner sur
  ce chemin.
- **Activation d'un tournoi** (`app/(dashboard)/tournaments/[id]/activate/page.tsx` +
  `components/tournament/PaypalActivateButton.tsx`) : un lien `paypal.me/SEProduct/<montant>`
  (montant × joueurs max, don libre additionnel possible) est proposé à la création de tout
  tournoi, payant ou non. **Non technique­ment appliqué** : la page « Continuer vers mon
  tournoi » ne vérifie aucun paiement PayPal avant de laisser l'organisateur poursuivre — c'est
  une demande de contribution sur la confiance, pas un prélèvement automatique comme celui de
  Stripe.
- Ce fonctionnement est mentionné aux organisateurs à plusieurs endroits de l'interface
  (`activate/page.tsx`, `settings/page.tsx`, `dons/page.tsx`) et, depuis BAPPS-LEGAL-009, sur
  la page publique `/cgu`, reformulée pour ne plus le présenter comme un tarif contractuel
  arrêté (voir section suivante).

## Ce qui n'a jamais été décidé par le Product Owner

- Aucune validation explicite du montant de 0,10 € comme prix officiel, commission retenue ou
  modèle économique final de DartsOpen.
- Aucune décision sur : un pourcentage plutôt qu'un montant fixe, un abonnement organisateur,
  une gratuité totale, ou tout autre modèle.
- Le montant actuel est un artefact technique hérité d'une intégration Stripe directe
  antérieure à l'architecture BApps Studio actuelle — jamais recréé ni requalifié comme
  décision produit depuis.

## Action prise dans le cadre de BAPPS-LEGAL-009

Aucune modification du prélèvement technique lui-même (ni le montant, ni le mécanisme Stripe,
ni le lien PayPal) : changer cela reviendrait à choisir un nouveau tarif sans mandat du
Product Owner, ce que la mission interdit explicitement. Seule la **communication** a été
corrigée :

- La page publique `/cgu` (`app/(public)/cgu/page.tsx`) affichait ce montant comme un tarif
  contractuel définitif et contenait un espace réservé `[à définir]` visible sur une page
  publique — les deux ont été corrigés : la section « Frais de plateforme » indique désormais
  explicitement qu'il s'agit de l'état technique actuel, pas d'un tarif arrêté, et le
  composant `TodoField` (placeholder public) a été supprimé du produit.
- Le reste des CGU (organisation d'un tournoi, contenu publié, comportement des
  utilisateurs, résultats/classement, disponibilité du service) a été complété — ces sections
  ne dépendent d'aucune décision de modèle économique et peuvent être publiées telles quelles.

## Reste à faire — nécessite une décision Product Owner

- Confirmer, modifier ou remplacer le montant de 0,10 € comme modèle économique officiel de
  DartsOpen (fixe, pourcentage, abonnement, gratuité...) — cette question reste ouverte,
  indépendamment de la suppression de PayPal.
- ~~Décider si l'activation par PayPal doit devenir un prélèvement réellement vérifié ou
  rester une contribution volontaire~~ — **résolu par DO-PAYPAL-REMOVAL-001** : PayPal est
  supprimé, la question ne se pose plus.
- Une fois le tarif définitif décidé : mettre à jour `/cgu` (section « Frais de plateforme ») avec le tarif
  définitif, et lever la mention « non contractuel » qui y figure depuis BAPPS-LEGAL-009.
