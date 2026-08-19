import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { getOwnedTournamentOrNull } from "@/lib/actions/access";

/**
 * DO-FIELD-ACCESS-001 — accès terrain temporaire (QR code de cible), sans compte SterPlatform.
 *
 * Un participant ne doit pas être obligé de créer/retrouver un compte BApps pour saisir son
 * match : "participant de tournoi ≠ utilisateur SterPlatform." Cet accès n'authentifie jamais
 * une personne physique — il prouve seulement "ce visiteur a scanné le QR d'une cible qui avait,
 * à ce moment-là, tel match actif" et n'accorde jamais plus que les droits de saisie normaux de
 * CE match. Jamais un droit organisateur, jamais un droit permanent de tournoi.
 *
 * Le token opaque (32 octets, `crypto.randomBytes`, source cryptographiquement sûre) n'est
 * jamais stocké en base : seul son hash SHA-256 l'est (`FieldSession.tokenHash`) — une fuite de
 * la base ne permet donc jamais de rejouer un accès terrain déjà émis. La comparaison lors de la
 * vérification passe par une recherche sur cet index unique (jamais une comparaison manuelle de
 * chaînes) : avec 256 bits d'entropie et une recherche par hash indexé, un canal auxiliaire par
 * timing n'apporte aucun avantage pratique à un attaquant.
 */

export const FIELD_SESSION_COOKIE = "do_field_session";

/**
 * Durée de validité : assez longue pour couvrir un match réel (parfois plusieurs dizaines de
 * minutes en X01, potentiellement plus en tournoi rapide) sans forcer un rescan agaçant en plein
 * match, assez courte pour ne jamais devenir un accès permanent au tournoi. Le vrai rempart reste
 * la revalidation dynamique de l'état sportif (match toujours IN_PROGRESS) à chaque appel — cette
 * expiration n'est qu'un filet de sécurité supplémentaire, jamais le seul mécanisme.
 */
const FIELD_SESSION_DURATION_MS = 6 * 60 * 60 * 1000; // 6h

const FIELD_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type FieldSessionRole = "PLAYER" | "REFEREE";

/**
 * Cœur pur, sans dépendance à `next/headers` (donc testable directement contre un vrai
 * PostgreSQL sans contexte de requête Next.js) : crée la ligne `FieldSession` et retourne le
 * token brut. Le token ne transite qu'en mémoire le temps de cet appel et dans l'en-tête
 * Set-Cookie posé par l'appelant — jamais persisté en base (seul son hash l'est), jamais
 * journalisé (aucun `console.*` ne le référence nulle part dans ce fichier).
 */
export async function createFieldSessionToken(
  tournamentId: string,
  matchId: string,
  role: FieldSessionRole,
): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  await prisma.fieldSession.create({
    data: {
      tokenHash: hashToken(rawToken),
      tournamentId,
      matchId,
      role,
      expiresAt: new Date(Date.now() + FIELD_SESSION_DURATION_MS),
    },
  });
  return rawToken;
}

/**
 * Émet une session terrain temporaire pour UN match précis et pose le cookie HttpOnly côté
 * navigateur (délègue la création à createFieldSessionToken ci-dessus).
 */
export async function issueFieldSession(
  tournamentId: string,
  matchId: string,
  role: FieldSessionRole,
): Promise<void> {
  const rawToken = await createFieldSessionToken(tournamentId, matchId, role);
  const store = await cookies();
  store.set(FIELD_SESSION_COOKIE, rawToken, {
    ...FIELD_COOKIE_OPTIONS,
    maxAge: Math.floor(FIELD_SESSION_DURATION_MS / 1000),
  });
}

export type FieldAccess = { ok: true; role: FieldSessionRole } | { ok: false; error: string };

const NO_FIELD_ACCESS = (): FieldAccess => ({
  ok: false,
  error: "Aucun accès terrain valide pour ce match. Scannez le QR code de la cible.",
});

/**
 * Cœur pur, sans dépendance à `next/headers` : vérifie strictement, pour LE match indiqué, qu'un
 * TOKEN BRUT donné (déjà extrait du cookie par l'appelant) correspond à une session terrain
 * valide : hash retrouvé en base → non expiré → tournoi ET match correspondant exactement →
 * match TOUJOURS actif (revalidation dynamique, jamais une confiance aveugle en la seule
 * existence de la ligne).
 *
 * Un changement de match sur la cible (ancien match terminé, nouveau match promu par DO-SPORT)
 * invalide naturellement toute ancienne session : elle référence encore l'ANCIEN `matchId`, qui
 * ne correspond plus au match désormais actif — aucune révocation explicite n'est nécessaire
 * pour ce cas, ni pour la fin du match (le contrôle `status === "IN_PROGRESS"` couvre les deux).
 *
 * Lecture seule (aucune écriture).
 */
export async function verifyFieldToken(
  rawToken: string | undefined,
  tournamentId: string,
  matchId: string,
): Promise<FieldAccess> {
  if (!rawToken) return NO_FIELD_ACCESS();

  const session = await prisma.fieldSession.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!session) return NO_FIELD_ACCESS();

  if (session.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Accès terrain expiré. Scannez à nouveau le QR code de la cible." };
  }
  if (session.tournamentId !== tournamentId || session.matchId !== matchId) {
    return {
      ok: false,
      error: "Cet accès terrain ne correspond plus à ce match. Scannez à nouveau le QR code de la cible.",
    };
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { status: true, tournamentId: true, tournament: { select: { status: true } } },
  });
  if (!match || match.tournamentId !== tournamentId || match.status !== "IN_PROGRESS") {
    return { ok: false, error: "Ce match n'est plus actif. Scannez à nouveau le QR code de la cible." };
  }
  // DO-FIELD-ACCESS-002 — un match individuel resté IN_PROGRESS ne suffit plus : le tournoi
  // LUI-MÊME doit être IN_PROGRESS (jamais DRAFT/OPEN/FINISHED/PENDING_ENTITLEMENT). Un match
  // techniquement encore IN_PROGRESS alors que le tournoi a basculé FINISHED (clôture manuelle,
  // incident) ne doit jamais rester exploitable via une session terrain déjà émise.
  if (match.tournament.status !== "IN_PROGRESS") {
    return { ok: false, error: "Ce tournoi n'est plus en cours. Scannez à nouveau le QR code de la cible." };
  }

  return { ok: true, role: session.role };
}

/**
 * Variante liée au contexte Next.js : lit le cookie du visiteur courant et délègue à
 * verifyFieldToken() ci-dessus. Appelable aussi bien depuis une Server Action que depuis le
 * rendu d'un composant serveur (pour décider quoi afficher) — toujours en lecture seule.
 */
export async function verifyFieldSession(tournamentId: string, matchId: string): Promise<FieldAccess> {
  const store = await cookies();
  return verifyFieldToken(store.get(FIELD_SESSION_COOKIE)?.value, tournamentId, matchId);
}

export type ScoringAuthorization =
  | { ok: true; actor: "ORGANIZER" }
  | { ok: true; actor: "FIELD"; role: FieldSessionRole }
  | { ok: false; error: string };

/**
 * Combine l'accès organisateur existant (inchangé, toujours prioritaire) et l'accès terrain :
 * les actions de saisie (recordThrow, cancelLastThrow, markWinnerDirect pour les parcours
 * normaux) acceptent désormais l'un OU l'autre. Jamais l'inverse — une session terrain n'emprunte
 * jamais les droits organisateur, elle ouvre seulement une porte supplémentaire à côté de la
 * porte organisateur déjà existante, qui continue de fonctionner exactement comme avant.
 */
export async function authorizeScoring(tournamentId: string, matchId: string): Promise<ScoringAuthorization> {
  const organizer = await getOwnedTournamentOrNull(tournamentId);
  if (organizer) return { ok: true, actor: "ORGANIZER" };

  const field = await verifyFieldSession(tournamentId, matchId);
  if (!field.ok) return { ok: false, error: field.error };
  return { ok: true, actor: "FIELD", role: field.role };
}

/**
 * `markWinnerDirect` sert deux parcours très différents : la désignation directe du gagnant en
 * Cricket (seule voie de saisie existante pour ce mode — une saisie NORMALE terrain) et le
 * raccourci "désigner manuellement le gagnant" du mode X01 (un contournement de la saisie
 * volée-par-volée, plus proche d'une correction/arbitrage que d'une saisie normale). Un joueur
 * terrain (rôle PLAYER) ne doit jamais disposer de ce raccourci X01 ; un arbitre terrain (rôle
 * REFEREE) le peut, au même titre que l'organisateur — sans que cela lui donne accès aux
 * fonctions d'arbitrage organisateur proprement dites (dbArbitrateMatch reste inaccessible en
 * dehors de getOwnedTournament, jamais touché par cette mission).
 */
export function canMarkWinnerDirect(access: ScoringAuthorization & { ok: true }, gameType: string): boolean {
  if (access.actor === "ORGANIZER") return true;
  if (access.role === "REFEREE") return true;
  return gameType === "CRICKET";
}

/**
 * DO-FIELD-ACCESS-002 — preuve arbitre temporaire (`FieldRefereeGrant`), jamais dérivable d'un
 * paramètre d'URL public : seul un appelant qui a déjà passé `getOwnedTournament` (propriété du
 * tournoi vérifiée côté serveur) peut en créer une — voir generateRefereeAccess()
 * (lib/actions/fieldReferee.ts), le seul appelant prévu de cette fonction. Distincte de
 * FieldSession dans son cycle de vie : à usage unique (voir redeemRefereeGrant), courte durée,
 * jamais elle-même une session terrain — seulement un droit d'en obtenir une.
 */
const REFEREE_GRANT_DURATION_MS = 15 * 60 * 1000; // 15 min

export async function createRefereeGrant(tournamentId: string, matchId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  await prisma.fieldRefereeGrant.create({
    data: {
      tokenHash: hashToken(rawToken),
      tournamentId,
      matchId,
      expiresAt: new Date(Date.now() + REFEREE_GRANT_DURATION_MS),
    },
  });
  return rawToken;
}

export type RefereeGrantRedemption = { ok: true; matchId: string } | { ok: false; error: string };

const INVALID_REFEREE_PROOF = (): RefereeGrantRedemption => ({
  ok: false,
  error: "Preuve arbitre invalide. Demandez à l'organisateur un nouveau QR arbitre.",
});

/**
 * Échange une preuve arbitre brute contre l'autorisation d'émettre UNE session terrain
 * REFEREE — jamais la session elle-même (voir le Route Handler /t/{id}/field/referee, seul
 * appelant prévu, qui délègue ensuite l'émission proprement dite à issueFieldSession() avec
 * role="REFEREE"). Consommation atomique à usage unique : le `UPDATE ... WHERE used_at IS NULL`
 * garantit qu'une preuve rejouée (double scan, replay réseau) après une première consommation
 * réussie échoue toujours, y compris sous concurrence réelle (deux requêtes simultanées sur la
 * même ligne se sérialisent au niveau PostgreSQL, la seconde constate `used_at` déjà posé).
 */
export async function redeemRefereeGrant(rawProof: string | undefined, tournamentId: string): Promise<RefereeGrantRedemption> {
  if (!rawProof) return INVALID_REFEREE_PROOF();

  const grant = await prisma.fieldRefereeGrant.findUnique({ where: { tokenHash: hashToken(rawProof) } });
  if (!grant) return INVALID_REFEREE_PROOF();
  if (grant.tournamentId !== tournamentId) return INVALID_REFEREE_PROOF();
  if (grant.usedAt !== null) return { ok: false, error: "Ce QR arbitre a déjà été utilisé. Demandez-en un nouveau à l'organisateur." };
  if (grant.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Ce QR arbitre a expiré. Demandez-en un nouveau à l'organisateur." };
  }

  const match = await prisma.match.findUnique({
    where: { id: grant.matchId },
    select: { status: true, tournamentId: true, tournament: { select: { status: true } } },
  });
  if (!match || match.tournamentId !== tournamentId || match.status !== "IN_PROGRESS" || match.tournament.status !== "IN_PROGRESS") {
    return { ok: false, error: "Ce match n'est plus actif. Demandez un nouveau QR arbitre à l'organisateur." };
  }

  const { count } = await prisma.fieldRefereeGrant.updateMany({
    where: { id: grant.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) {
    return { ok: false, error: "Ce QR arbitre a déjà été utilisé. Demandez-en un nouveau à l'organisateur." };
  }

  return { ok: true, matchId: grant.matchId };
}
