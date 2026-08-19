/**
 * DO-OPS-001 — logique pure de la console jour J ("Pilotage"). Aucune requête Prisma ici :
 * chaque fonction reçoit les données déjà chargées par les fonctions `db*` existantes
 * (dbGetTournament/dbListRegistrations/dbListPools/dbListMatches, lib/db/tournament.ts) et se
 * contente de les recomposer pour l'affichage — la console AGRÈGE l'existant, elle ne réimplémente
 * aucune règle métier sportive (voir lib/utils/tournamentStatus.ts pour les transitions de statut,
 * seule source de vérité, jamais dupliquée ici).
 *
 * Fonctions pures, sans effet de bord : testables directement (lib/ops/tournamentConsole.test.ts),
 * même discipline que lib/utils/x01.ts / lib/utils/tournamentStatus.ts / lib/utils/fieldBoard.ts.
 */

export interface ConsoleTournament {
  status: string;
  quick_mode: boolean;
  scoring_mode: string;
  nb_boards: number;
  nb_pools: number;
  max_players: number;
  players_per_team: number;
}

export interface ConsoleRegistration {
  id: string;
  status: string;
}

export interface ConsolePool {
  id: string;
}

export interface ConsoleMatch {
  id: string;
  status: string;
  board_number: number;
  bracket_round: number | null;
  bracket_position: number | null;
  pool_id: string | null;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  player1?: { id: string; player_name: string } | null;
  player2?: { id: string; player_name: string } | null;
}

// ── Vue synthétique (mission §3) ────────────────────────────────────────────────

export interface ConsoleSummary {
  /** Nombre brut d'inscriptions, tous statuts confondus (PENDING/PAID/CANCELLED/REFUND_PENDING/
   * REFUNDED inclus) — jamais utilisé seul comme métrique de participation, voir paidCount. */
  registrationCount: number;
  /** Inscriptions PAID — même population que celle utilisée par le moteur sportif pour la
   * participation réelle (generatePools()/generateQuickBracket(), lib/actions/pool.ts et
   * lib/actions/quickTournament.ts, toutes deux basées sur dbListRegistrations(id, "PAID")).
   * Une inscription = une équipe/entrée, jamais directement un nombre de joueurs. */
  paidCount: number;
  /** DO-OPS-002 (défaut 3) — joueurs réellement confirmés (paidCount × players_per_team),
   * seule valeur comparable à `capacity` (qui est un plafond de JOUEURS, `max_players`, jamais
   * un plafond d'inscriptions/équipes) — comparer paidCount à capacity mélangerait deux unités
   * différentes selon players_per_team. */
  confirmedPlayerCount: number;
  capacity: number;
  boardsCount: number;
  matchesFinished: number;
  matchesInProgress: number;
  matchesPending: number;
  totalMatches: number;
  /** 0-100, 0 si aucun match n'existe encore (jamais NaN). */
  progressPercent: number;
  formatLabel: string;
}

export function buildConsoleSummary(
  tournament: ConsoleTournament,
  registrations: ConsoleRegistration[],
  matches: ConsoleMatch[]
): ConsoleSummary {
  const paidCount = registrations.filter((r) => r.status === "PAID").length;
  const matchesFinished = matches.filter((m) => m.status === "FINISHED").length;
  const matchesInProgress = matches.filter((m) => m.status === "IN_PROGRESS").length;
  const matchesPending = matches.filter((m) => m.status === "PENDING").length;
  const totalMatches = matches.length;

  const formatLabel = tournament.quick_mode
    ? "Mode rapide (double élimination)"
    : tournament.nb_pools > 1
      ? "Poules puis phases finales"
      : "Phases finales directes";

  return {
    registrationCount: registrations.length,
    paidCount,
    confirmedPlayerCount: paidCount * tournament.players_per_team,
    capacity: tournament.max_players,
    boardsCount: tournament.nb_boards,
    matchesFinished,
    matchesInProgress,
    matchesPending,
    totalMatches,
    progressPercent: totalMatches === 0 ? 0 : Math.round((matchesFinished / totalMatches) * 100),
    formatLabel,
  };
}

// ── Checklist de préparation (mission §4) ───────────────────────────────────────

export type ChecklistLevel = "ok" | "warning" | "blocking";

export interface ChecklistItem {
  id: string;
  label: string;
  level: ChecklistLevel;
  detail: string;
}

/**
 * Le minimum de 2 inscriptions payées n'est pas une règle inventée ici : c'est exactement la
 * garde déjà appliquée côté serveur par generatePools()/generateQuickBracket() (lib/actions/
 * pool.ts, lib/actions/quickTournament.ts) — reflétée, jamais dupliquée en une seconde source de
 * vérité divergente.
 */
const MIN_PAID_REGISTRATIONS = 2;

export function buildReadinessChecklist(
  tournament: ConsoleTournament,
  registrations: ConsoleRegistration[],
  pools: ConsolePool[]
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const paidCount = registrations.filter((r) => r.status === "PAID").length;

  items.push({
    id: "boards",
    label: "Cibles configurées",
    // DO-OPS-002 (défaut 4) — décision PO documentée dans le rapport de mission : nb_boards < 1
    // est déjà impossible à créer (TournamentSchema, lib/actions/tournament.ts :
    // z.coerce.number().int().min(1).max(32)), MAIS la transition serveur OPEN → IN_PROGRESS
    // elle-même (dbUpdateTournamentStatusTx, lib/db/tournament.ts) n'applique aucune garde sur
    // les cibles. Jamais "blocking" ici : la console ne doit jamais laisser croire à une garde
    // serveur qui n'existe pas À CETTE étape précise (Option B de la mission, pas de nouvelle
    // règle PO inventée).
    level: tournament.nb_boards >= 1 ? "ok" : "warning",
    detail:
      tournament.nb_boards >= 1
        ? `${tournament.nb_boards} cible(s) configurée(s).`
        : "Aucune cible configurée sur ce tournoi.",
  });

  items.push({
    id: "registrations",
    label: "Inscriptions suffisantes",
    level: paidCount >= MIN_PAID_REGISTRATIONS ? "ok" : "blocking",
    detail:
      paidCount >= MIN_PAID_REGISTRATIONS
        ? `${paidCount} inscription(s) payée(s) — minimum de ${MIN_PAID_REGISTRATIONS} atteint.`
        : `${paidCount} inscription(s) payée(s) — au moins ${MIN_PAID_REGISTRATIONS} sont nécessaires pour générer poules/bracket.`,
  });

  if (tournament.quick_mode) {
    items.push({
      id: "quick-format",
      label: "Format de jeu",
      level: "ok",
      detail: "Manches générées automatiquement par le mode rapide (501 → Cricket → 701 selon l'effectif).",
    });
  } else if (tournament.nb_pools > 1) {
    items.push({
      id: "pools",
      label: "Poules générées",
      // Avertissement, jamais bloquant : generatePools() reste appelable après le démarrage
      // (canGenerate accepte OPEN et IN_PROGRESS, voir pools/page.tsx) — un cas métier légitime.
      level: pools.length > 0 ? "ok" : "warning",
      detail:
        pools.length > 0
          ? `${pools.length} poule(s) déjà générée(s).`
          : "Les poules ne sont pas encore générées — possible avant ou juste après le démarrage.",
    });
  } else {
    items.push({
      id: "bracket-auto",
      label: "Phases finales",
      level: "ok",
      detail: "Bracket à élimination directe généré automatiquement (poule unique).",
    });
  }

  items.push({
    id: "scoring-mode",
    label: "Mode de scoring",
    level: "ok",
    detail:
      tournament.scoring_mode === "TRADITIONAL"
        ? "Saisie traditionnelle (marqueur/organisateur à la cible)."
        : "Saisie électronique (chaque joueur saisit son côté).",
  });

  if (tournament.status === "PENDING_ENTITLEMENT") {
    items.push({
      id: "entitlement",
      label: "Confirmation du crédit tournoi",
      level: "blocking",
      detail: "Ce tournoi attend la confirmation de son crédit ou de son abonnement — non démarrable en l'état.",
    });
  }

  return items;
}

// ── Incidents et anomalies (mission §8) ─────────────────────────────────────────

export type IncidentSeverity = "warning" | "critical";

export interface Incident {
  id: string;
  severity: IncidentSeverity;
  message: string;
}

/**
 * Chaque règle ci-dessous se déduit d'un état RÉELLEMENT persisté (jamais une règle métier
 * inventée) : `boardNumber`/`status` des matchs, tels qu'écrits par bulkCreateMatchesTx()/
 * dbPromoteUnassignedMatches() (lib/db/tournament.ts) — `status: "PENDING"` implique toujours
 * `boardNumber: 0` (cible non affectée), `status: "IN_PROGRESS"` implique toujours un
 * `boardNumber` réel (1..nb_boards, garanti par un index unique partiel côté DB pour l'unicité
 * cible↔match actif). Un résultat "contesté" n'est PAS détectable ici : dbDisputeResult() ne pose
 * aucun marqueur persisté (voir le rapport final, point décisions PO) — inventer une règle pour
 * le deviner serait précisément ce que la mission interdit.
 */
export function detectIncidents(tournament: ConsoleTournament, matches: ConsoleMatch[]): Incident[] {
  const incidents: Incident[] = [];
  const active = matches.filter((m) => m.status === "IN_PROGRESS");
  const pending = matches.filter((m) => m.status === "PENDING");

  const usedBoards = new Set(active.map((m) => m.board_number));
  const freeBoardsCount = Array.from({ length: tournament.nb_boards }, (_, i) => i + 1).filter(
    (b) => !usedBoards.has(b)
  ).length;
  if (freeBoardsCount > 0 && pending.length > 0) {
    incidents.push({
      id: "free-board-with-queue",
      severity: "warning",
      message: `${freeBoardsCount} cible(s) libre(s) alors que ${pending.length} match(s) attendent une cible.`,
    });
  }

  const invalidBoardMatches = active.filter((m) => m.board_number < 1 || m.board_number > tournament.nb_boards);
  if (invalidBoardMatches.length > 0) {
    incidents.push({
      id: "match-without-valid-board",
      severity: "critical",
      message: `${invalidBoardMatches.length} match(s) en cours sans cible valide.`,
    });
  }

  const boardCounts = new Map<number, number>();
  for (const m of active) boardCounts.set(m.board_number, (boardCounts.get(m.board_number) ?? 0) + 1);
  const conflictBoards = [...boardCounts.entries()].filter(([, count]) => count > 1);
  if (conflictBoards.length > 0) {
    incidents.push({
      id: "board-conflict",
      severity: "critical",
      message: `${conflictBoards.length} cible(s) avec plusieurs matchs actifs simultanément.`,
    });
  }

  if (tournament.status === "IN_PROGRESS" && active.length === 0 && pending.length === 0 && matches.length > 0) {
    incidents.push({
      id: "no-active-no-pending",
      severity: "warning",
      message:
        "Le tournoi est en cours mais aucun match n'est actif ni en attente — vérifiez si un tour suivant doit être généré ou si le tournoi peut être clôturé.",
    });
  }

  return incidents;
}

// ── Prochaine action (mission §5) ───────────────────────────────────────────────

export interface NextAction {
  id: string;
  title: string;
  description: string;
  href?: string;
  tone: "action" | "info" | "warning";
}

/**
 * Règles simples, dérivées de l'état déjà calculé (checklist/incidents/résumé) — jamais un
 * second moteur : cette fonction ne fait qu'ordonner des `if` sur des valeurs déjà réelles.
 */
export function buildNextAction(
  tournamentId: string,
  tournament: ConsoleTournament,
  checklist: ChecklistItem[],
  summary: ConsoleSummary,
  pools: ConsolePool[],
  incidents: Incident[]
): NextAction {
  if (tournament.status === "PENDING_ENTITLEMENT") {
    return {
      id: "wait-entitlement",
      title: "Confirmer le crédit tournoi",
      description: "Ce tournoi ne peut pas encore être configuré : la confirmation du crédit/abonnement est en attente.",
      tone: "warning",
    };
  }

  if (tournament.status === "DRAFT") {
    return {
      id: "configure",
      title: "Configurer le tournoi",
      description: "Complétez la configuration (manches, cibles, effectif) puis ouvrez les inscriptions.",
      href: `/tournaments/${tournamentId}`,
      tone: "action",
    };
  }

  if (tournament.status === "OPEN") {
    const blocking = checklist.find((c) => c.level === "blocking");
    if (blocking) {
      return {
        id: `resolve-${blocking.id}`,
        title: blocking.label,
        description: blocking.detail,
        href: `/tournaments/${tournamentId}/players`,
        tone: "warning",
      };
    }
    return {
      id: "start",
      title: "Démarrer le tournoi",
      description: "La configuration est prête : vous pouvez démarrer le tournoi.",
      tone: "action",
    };
  }

  if (tournament.status === "IN_PROGRESS") {
    if (tournament.quick_mode && summary.totalMatches === 0) {
      return {
        id: "generate-quick-bracket",
        title: "Générer le bracket rapide",
        description: "Le tournoi est démarré mais aucun match n'a encore été généré.",
        href: `/tournaments/${tournamentId}/bracket`,
        tone: "action",
      };
    }
    if (!tournament.quick_mode && tournament.nb_pools > 1 && pools.length === 0) {
      return {
        id: "generate-pools",
        title: "Générer les poules",
        description: "Le tournoi est démarré mais les poules ne sont pas encore générées.",
        href: `/tournaments/${tournamentId}/pools`,
        tone: "action",
      };
    }
    if (incidents.length > 0) {
      return {
        id: "resolve-incident",
        title: "Intervenir — anomalie détectée",
        description: incidents[0].message,
        tone: "warning",
      };
    }
    if (summary.matchesInProgress > 0 || summary.matchesPending > 0) {
      return {
        id: "monitor",
        title: "Surveiller les matchs en cours",
        description: `${summary.matchesInProgress} match(s) en cours, ${summary.matchesPending} en attente.`,
        tone: "info",
      };
    }
    if (summary.totalMatches > 0 && summary.matchesFinished === summary.totalMatches) {
      return {
        id: "close",
        title: "Clôturer le tournoi",
        description: "Tous les matchs générés sont terminés.",
        tone: "action",
      };
    }
    return {
      id: "wait",
      title: "En attente",
      description: "Aucun match actif ni en attente pour le moment.",
      tone: "info",
    };
  }

  return {
    id: "finished",
    title: "Tournoi terminé",
    description: "Consultez le classement et les résultats finaux.",
    href: "/classement",
    tone: "info",
  };
}

// ── Vue cibles (mission §6) ──────────────────────────────────────────────────────

export type BoardStatus = "free" | "active" | "anomaly";

export interface BoardView {
  board: number;
  status: BoardStatus;
  match: ConsoleMatch | null;
  /** Prochain match de la file qui occuperait cette cible en premier si elle se libère —
   * indicatif seulement (reassignFreeBoards()/dbPromoteUnassignedMatches() décident réellement). */
  nextMatchHint: ConsoleMatch | null;
}

export function buildBoardsView(tournament: ConsoleTournament, matches: ConsoleMatch[]): BoardView[] {
  const active = matches.filter((m) => m.status === "IN_PROGRESS");
  const queue = buildMatchQueue(matches);
  let queueIndex = 0;

  const boards: BoardView[] = [];
  for (let b = 1; b <= tournament.nb_boards; b++) {
    const matchesOnBoard = active.filter((m) => m.board_number === b);
    if (matchesOnBoard.length > 1) {
      boards.push({ board: b, status: "anomaly", match: matchesOnBoard[0], nextMatchHint: null });
    } else if (matchesOnBoard.length === 1) {
      boards.push({ board: b, status: "active", match: matchesOnBoard[0], nextMatchHint: null });
    } else {
      boards.push({ board: b, status: "free", match: null, nextMatchHint: queue[queueIndex] ?? null });
      queueIndex++;
    }
  }
  return boards;
}

// ── File d'attente des matchs (mission §7) ──────────────────────────────────────

/**
 * DO-OPS-002 (défaut 5) — regroupement de LECTURE uniquement (poules avant bracket, puis
 * round/position croissants, pour qu'un humain retrouve facilement un match dans la liste),
 * jamais un ordre de passage garanti : le moteur réel (dbPromoteUnassignedMatches(),
 * lib/db/tournament.ts) promeut les matchs PENDING par `orderBy: { id: "asc" }` — un simple
 * ordre technique de création, sans rapport avec round/position, qu'afficher tel quel serait
 * illisible pour l'organisateur. Le tri ci-dessous ne pilote AUCUNE décision d'affectation de
 * cible (jamais un nouveau moteur de scheduling) ; l'UI (pilotage/page.tsx) ne doit jamais lui
 * associer de numérotation ("#1", "#2"...) qui laisserait croire à un ordre de passage garanti —
 * voir la mission DO-OPS-002 §5, option retenue : présentation sans promesse d'ordre.
 */
export function buildMatchQueue(matches: ConsoleMatch[]): ConsoleMatch[] {
  return matches
    .filter((m) => m.status === "PENDING")
    .slice()
    .sort((a, b) => {
      const aPool = a.pool_id !== null;
      const bPool = b.pool_id !== null;
      if (aPool !== bPool) return aPool ? -1 : 1;
      const aRound = a.bracket_round ?? 0;
      const bRound = b.bracket_round ?? 0;
      if (aRound !== bRound) return aRound - bRound;
      const aPos = a.bracket_position ?? 0;
      const bPos = b.bracket_position ?? 0;
      if (aPos !== bPos) return aPos - bPos;
      return a.id.localeCompare(b.id);
    });
}

// ── Participants / présence (mission §9) ────────────────────────────────────────

export interface ParticipantsSummary {
  totalRegistrations: number;
  paidRegistrations: number;
  /** Inscriptions payées apparaissant comme player1/player2 d'au moins un match. */
  engagedCount: number;
  /** Inscriptions payées n'apparaissant dans AUCUN match — 0 tant qu'aucun match n'existe encore
   * (pas de conclusion prématurée avant que poules/bracket ne soient générés). Ne préjuge jamais
   * d'un forfait : aucune règle de ce type n'est décidée par cette mission. */
  unusedPaidCount: number;
}

export function buildParticipantsSummary(
  registrations: ConsoleRegistration[],
  matches: ConsoleMatch[]
): ParticipantsSummary {
  const engagedIds = new Set<string>();
  for (const m of matches) {
    engagedIds.add(m.player1_id);
    if (m.player2_id) engagedIds.add(m.player2_id);
  }
  const paid = registrations.filter((r) => r.status === "PAID");

  return {
    totalRegistrations: registrations.length,
    paidRegistrations: paid.length,
    engagedCount: paid.filter((r) => engagedIds.has(r.id)).length,
    unusedPaidCount: matches.length === 0 ? 0 : paid.filter((r) => !engagedIds.has(r.id)).length,
  };
}
