/**
 * Avancement d'un tournoi après la fin d'un match — fonctions INTERNES, sans contrôle d'accès.
 *
 * Pourquoi ce module et pas `lib/actions/*` : tout export d'un fichier `"use server"` devient
 * une Server Action appelable depuis n'importe quel navigateur avec un simple identifiant
 * d'action (audit sécurité P2, 28/10/2026). Ces deux fonctions n'ont pas de garde
 * `requireTournamentManager` : leurs appelants (saisie de score, forfait, arbitrage, action
 * organisateur `advanceToNextRound`) ont déjà vérifié le droit d'agir, ou agissent pour un
 * joueur/arbitre authentifié par sa preuve de terrain — un organisateur ne peut pas être exigé
 * ici. Ce fichier n'est donc JAMAIS marqué `"use server"` ; seuls les modules serveur l'importent.
 */
import { withTournamentLock, doAdvanceToNextRoundTx, doAdvanceQuickTournamentTx } from "@/lib/db/tournament";

/**
 * DO-SPORT-001 (Étape 2/4/5) — décision et écriture sous le verrou tournoi. DO-SCORING-002
 * (Étape 4) — le cœur (décision + création du tour suivant + clôture éventuelle du tournoi)
 * vit dans lib/db/tournament.ts::doAdvanceToNextRoundTx(), tx-first : cette fonction n'est
 * qu'un ouvre-verrou. dbRecordThrow() (saisie X01) appelle directement le cœur avec SON PROPRE
 * tx quand un checkout vient de finaliser un match.
 */
export async function doAdvanceToNextRound(
  tournamentId: string,
  currentBracketRound: number
): Promise<{ error?: string; finished?: boolean }> {
  return withTournamentLock(tournamentId, (tx) => doAdvanceToNextRoundTx(tx, tournamentId, currentBracketRound));
}

/**
 * Appelé après la finalisation d'un match en mode rapide. DO-SCORING-002 (Étape 4) — le cœur
 * (marquage, décrémentation, calcul, création, promotion, clôture éventuelle du tournoi) vit
 * dans lib/db/tournament.ts::doAdvanceQuickTournamentTx() ; ici, l'ouvre-verrou seulement.
 */
export async function doAdvanceQuickTournament(
  tournamentId: string,
  finishedMatchId: string
): Promise<{ error?: string; finished?: boolean }> {
  try {
    return await withTournamentLock(tournamentId, (tx) => doAdvanceQuickTournamentTx(tx, tournamentId, finishedMatchId));
  } catch (err) {
    console.error("[doAdvanceQuickTournament]", err);
    return { error: "Erreur lors de l'avancement du tournoi." };
  }
}
