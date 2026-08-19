import { prisma } from "@/lib/db/client";
import type { SterUser } from "@/lib/api/auth";

export type PlayerSide = 1 | 2;

export type MatchSetChain = {
  match: {
    id: string;
    tournamentId: string;
    player1Id: string;
    player2Id: string | null;
  };
  player1Email: string;
  player2Email: string | null;
  /** DO-FIELD-ACCESS-001 — game_type de la Round de CE set (ex. "501", "CRICKET") : nécessaire
   * pour distinguer, côté autorisation, la désignation directe Cricket (saisie normale terrain)
   * du raccourci "désigner manuellement le gagnant" du mode X01 (voir
   * lib/actions/fieldAccess.ts::canMarkWinnerDirect). */
  gameType: string;
};

/**
 * Charge le set de match et remonte la chaîne réelle set → match → tournoi depuis la base
 * (jamais depuis les identifiants transmis par le client). Le `tournamentId` fourni doit
 * correspondre exactement au tournoi réel du match : sinon un `matchSetId` valide mais
 * rattaché à un autre tournoi ne doit jamais être accepté (SEC-001, cohérence des
 * identifiants).
 */
export async function loadMatchSetChain(matchSetId: string, tournamentId: string): Promise<MatchSetChain | null> {
  const set = await prisma.matchSet.findUnique({
    where: { id: matchSetId },
    select: {
      round: { select: { gameType: true } },
      match: {
        select: {
          id: true,
          tournamentId: true,
          player1Id: true,
          player2Id: true,
          player1: { select: { playerEmail: true } },
          player2: { select: { playerEmail: true } },
        },
      },
    },
  });
  if (!set) return null;
  if (set.match.tournamentId !== tournamentId) return null;

  return {
    match: {
      id: set.match.id,
      tournamentId: set.match.tournamentId,
      player1Id: set.match.player1Id,
      player2Id: set.match.player2Id,
    },
    player1Email: set.match.player1.playerEmail,
    player2Email: set.match.player2?.playerEmail ?? null,
    gameType: set.round.gameType,
  };
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * DartsOpen n'a pas de compte joueur : l'inscription (`Registration`) se fait par nom/e-mail,
 * sans création de compte SterPlatform. Le seul lien vérifiable côté serveur entre
 * l'utilisateur authentifié (SSO SterPlatform) et un côté du match est donc l'adresse e-mail
 * de la Registration — jamais le `playerSide` transmis par le client, qui n'est qu'une
 * déclaration non prouvée. Retourne le côté réellement autorisé pour cet utilisateur, ou
 * `null` s'il ne correspond à aucun des deux joueurs du match.
 */
export function resolveAuthorizedSide(user: SterUser, chain: MatchSetChain): PlayerSide | null {
  const email = normalizeEmail(user.email);
  if (!email) return null;
  if (normalizeEmail(chain.player1Email) === email) return 1;
  if (chain.player2Email && normalizeEmail(chain.player2Email) === email) return 2;
  return null;
}

export function isValidMatchPlayer(chain: MatchSetChain, playerId: string): boolean {
  return playerId === chain.match.player1Id || playerId === chain.match.player2Id;
}
