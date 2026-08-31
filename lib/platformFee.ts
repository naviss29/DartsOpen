/**
 * Frais de plateforme DartsOpen — reste une décision métier propre à DartsOpen (mission
 * DO-003, Phase 6) : `POST /api/internal/organizations/{slug}/payments/checkout` côté
 * SterPlatform prend `platformFeeCents` en paramètre d'entrée, il ne le calcule ni ne le
 * connaît lui-même — le contrat est délibérément générique entre modules. Centraliser cette
 * valeur côté SterPlatform n'aurait aucune source de vérité à y rattacher : c'est DartsOpen
 * qui fixe son propre tarif, pas SterPlatform.
 *
 * Décision Product Owner : DartsOpen ne prélève plus aucun frais par inscription — le modèle
 * économique repose exclusivement sur la limite gratuite (≤10 joueurs) et le crédit
 * tournoi/abonnement au-delà (DARTSOPEN-MONETIZATION-001). Auparavant 10 (0,10 €/joueur),
 * jamais réellement retiré depuis son introduction (DO-003) malgré cette décision.
 */
export const PLATFORM_FEE_CENTS = 0;
