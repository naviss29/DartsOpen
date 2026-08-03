/**
 * Frais de plateforme DartsOpen — reste une décision métier propre à DartsOpen (mission
 * DO-003, Phase 6) : `POST /api/internal/organizations/{slug}/payments/checkout` côté
 * SterPlatform prend `platformFeeCents` en paramètre d'entrée, il ne le calcule ni ne le
 * connaît lui-même — le contrat est délibérément générique entre modules. Centraliser cette
 * valeur côté SterPlatform n'aurait aucune source de vérité à y rattacher : c'est DartsOpen
 * qui fixe son propre tarif, pas SterPlatform.
 */
export const PLATFORM_FEE_CENTS = 10;
