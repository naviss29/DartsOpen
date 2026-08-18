/**
 * DO-SCORING-001 — règles métier X01 pures, extraites de l'ancienne implémentation
 * client-only (components/tournament/ScoreForm.tsx::SetScoreTracker::handleVolee, avant cette
 * mission) sans changement de comportement : mêmes valeurs impossibles, même seuil de bust,
 * même règle "laisser 1" en double/master out. Rendues testables et réutilisables côté serveur
 * (lib/db/tournament.ts::dbRecordThrow) — le client ne calcule plus jamais la conséquence d'une
 * volée, il ne fait que l'afficher une fois confirmée par le serveur.
 */

export const IMPOSSIBLE_VOLEE = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);
export const IMPOSSIBLE_CHECKOUT = new Set([159, 162, 163, 165, 166, 168, 169]);

export type FinishType = "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER";

export interface VoleeValidation {
  bust: boolean;
  reason: string | null;
  impossibleCheckout: boolean;
  remainingAfter: number;
}

/**
 * Valide une volée par rapport au score restant d'UN joueur et au type de fermeture de la
 * manche. Ne connaît rien de l'alternance des joueurs ni de la persistance — pure fonction de
 * (volée, restant, type de fermeture) → conséquence, testable indépendamment de la base.
 */
export function validateVolee(
  voleeScore: number,
  remaining: number,
  finishType: FinishType,
): VoleeValidation {
  if (IMPOSSIBLE_VOLEE.has(voleeScore)) {
    return {
      bust: true,
      reason: `${voleeScore} est impossible à réaliser en une volée.`,
      impossibleCheckout: false,
      remainingAfter: remaining,
    };
  }

  const newRemaining = remaining - voleeScore;

  if (newRemaining < 0) {
    return {
      bust: true,
      reason: `Bust ! reste à ${remaining}.`,
      impossibleCheckout: false,
      remainingAfter: remaining,
    };
  }

  if ((finishType === "DOUBLE" || finishType === "MASTER") && newRemaining === 1) {
    return {
      bust: true,
      reason: `Bust ! Impossible de laisser 1 en ${finishType === "MASTER" ? "master" : "double"} out.`,
      impossibleCheckout: false,
      remainingAfter: remaining,
    };
  }

  const impossibleCheckout = newRemaining > 0 && IMPOSSIBLE_CHECKOUT.has(newRemaining);
  return { bust: false, reason: null, impossibleCheckout, remainingAfter: newRemaining };
}

/** Score de départ d'une manche X01 à partir du game_type de la Round ("501"/"701"/"901"/"1001"). */
export function x01StartScore(gameType: string): number {
  const n = parseInt(gameType, 10);
  return Number.isFinite(n) ? n : 501;
}

export interface X01ThrowLike {
  id: string;
  player_id: string;
  sequence: number;
  score_entered: number;
  remaining_after: number;
  bust: boolean;
  cancelled: boolean;
}

/**
 * DO-SCORING-001 (Étape 5) — reconstruit le score restant d'UN joueur à partir de l'historique
 * persisté : le restant après la dernière volée non annulée de ce joueur, ou le score de départ
 * s'il n'a encore rien lancé. Jamais un état local — cette fonction est la seule source de
 * vérité côté client, alimentée uniquement par des props venues du serveur (voir
 * components/tournament/ScoreForm.tsx::SetScoreTracker).
 */
export function computeRemaining(throws: X01ThrowLike[], playerId: string, startScore: number): number {
  for (let i = throws.length - 1; i >= 0; i--) {
    const t = throws[i];
    if (!t.cancelled && t.player_id === playerId) return t.remaining_after;
  }
  return startScore;
}

/**
 * Joueur attendu pour la prochaine volée : alternance stricte à partir du nombre de volées non
 * annulées déjà enregistrées (jamais du contenu des volées elles-mêmes) — joueur 1 commence
 * toujours une manche, un bust cède quand même le tour. Comme seule la dernière volée peut
 * jamais être annulée (voir dbCancelLastThrow), les volées non annulées restent toujours un
 * préfixe contigu de la séquence : compter suffit, jamais besoin de rejouer l'alternance
 * volée par volée.
 */
export function computeActivePlayer(throws: X01ThrowLike[], player1Id: string, player2Id: string): string {
  const activeCount = throws.filter((t) => !t.cancelled).length;
  return activeCount % 2 === 0 ? player1Id : player2Id;
}

/**
 * DO-SCORING-002 (Étape 5) — la fléchette de fermeture d'une volée qui atteint exactement zéro.
 * `segment` : 1-20, ou 25 pour le bull (pas de distinction simple/double bull dans `segment` —
 * elle se fait par `multiplier`, voir isValidDartShape). `multiplier` : 1=simple, 2=double,
 * 3=triple (jamais 3 sur le bull, il n'existe pas de triple bull aux fléchettes).
 */
export interface CheckoutDart {
  segment: number;
  multiplier: 1 | 2 | 3;
}

export const BULL_SEGMENT = 25;

/** Légalité structurelle d'une fléchette, indépendamment de toute règle de fermeture. */
export function isValidDartShape(dart: CheckoutDart): boolean {
  if (!Number.isInteger(dart.segment) || !Number.isInteger(dart.multiplier)) return false;
  if (dart.multiplier < 1 || dart.multiplier > 3) return false;
  if (dart.segment === BULL_SEGMENT) return dart.multiplier !== 3; // pas de triple bull
  return dart.segment >= 1 && dart.segment <= 20;
}

/** Valeur en points d'une fléchette structurellement valide. */
export function checkoutDartValue(dart: CheckoutDart): number {
  return dart.segment * dart.multiplier;
}

const FINISH_RULE_LABEL: Record<FinishType, string> = {
  SINGLE: "n'importe quelle fléchette légale",
  DOUBLE: "un double",
  MASTER: "un double ou un triple",
  TRIPLE: "un triple",
};

/**
 * Décision Product Owner (DO-SCORING-002) — la vraie signification de chaque `finishType` :
 * SINGLE/open-out accepte toute fléchette légale amenant à zéro ; DOUBLE exige un double en
 * dernière fléchette ; MASTER un double OU un triple ; TRIPLE un triple. Ne suppose jamais que
 * "le score restant tombe à zéro" suffit à valider la fermeture — c'est précisément le défaut
 * que cette fonction corrige (Codex, post-DO-SCORING-001).
 */
export function satisfiesFinishType(dart: CheckoutDart, finishType: FinishType): boolean {
  switch (finishType) {
    case "DOUBLE": return dart.multiplier === 2;
    case "MASTER": return dart.multiplier === 2 || dart.multiplier === 3;
    case "TRIPLE": return dart.multiplier === 3;
    case "SINGLE": default: return true;
  }
}

export function finishRuleLabel(finishType: FinishType): string {
  return FINISH_RULE_LABEL[finishType] ?? FINISH_RULE_LABEL.SINGLE;
}
