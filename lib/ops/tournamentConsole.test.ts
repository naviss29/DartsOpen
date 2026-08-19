import { describe, it, expect } from "vitest";
import {
  buildConsoleSummary,
  buildReadinessChecklist,
  buildNextAction,
  buildBoardsView,
  buildMatchQueue,
  detectIncidents,
  buildParticipantsSummary,
  type ConsoleTournament,
  type ConsoleRegistration,
  type ConsoleMatch,
} from "./tournamentConsole";

// DO-OPS-001 — logique pure de la console jour J. Aucun mock nécessaire : toutes les fonctions
// testées ici sont des transformations pures de données déjà chargées (pas de Prisma, pas de
// Next.js). Les scénarios obligatoires 1 à 10 de la mission sont couverts ici par des assertions
// métier, jamais par de simples snapshots.

function tournament(overrides: Partial<ConsoleTournament> = {}): ConsoleTournament {
  return {
    status: "DRAFT",
    quick_mode: false,
    scoring_mode: "ELECTRONIC",
    nb_boards: 4,
    nb_pools: 2,
    max_players: 16,
    ...overrides,
  };
}

function reg(id: string, status: ConsoleRegistration["status"] = "PAID"): ConsoleRegistration {
  return { id, status };
}

function match(overrides: Partial<ConsoleMatch> & { id: string }): ConsoleMatch {
  return {
    status: "PENDING",
    board_number: 0,
    bracket_round: null,
    bracket_position: null,
    pool_id: null,
    player1_id: "p1",
    player2_id: "p2",
    winner_id: null,
    ...overrides,
  };
}

describe("buildConsoleSummary", () => {
  it("compte correctement inscriptions, matchs par statut, et calcule la progression", () => {
    const t = tournament();
    const registrations = [reg("r1"), reg("r2"), reg("r3", "PENDING")];
    const matches = [
      match({ id: "m1", status: "FINISHED" }),
      match({ id: "m2", status: "IN_PROGRESS", board_number: 1 }),
      match({ id: "m3", status: "PENDING" }),
      match({ id: "m4", status: "PENDING" }),
    ];

    const summary = buildConsoleSummary(t, registrations, matches);

    expect(summary.registrationCount).toBe(3);
    expect(summary.paidCount).toBe(2);
    expect(summary.matchesFinished).toBe(1);
    expect(summary.matchesInProgress).toBe(1);
    expect(summary.matchesPending).toBe(2);
    expect(summary.totalMatches).toBe(4);
    expect(summary.progressPercent).toBe(25);
  });

  it("progression à 0 (jamais NaN) quand aucun match n'existe encore", () => {
    const summary = buildConsoleSummary(tournament(), [], []);
    expect(summary.progressPercent).toBe(0);
    expect(Number.isNaN(summary.progressPercent)).toBe(false);
  });

  it("distingue les trois formats (rapide / poules / bracket direct)", () => {
    expect(buildConsoleSummary(tournament({ quick_mode: true }), [], []).formatLabel).toMatch(/rapide/i);
    expect(buildConsoleSummary(tournament({ quick_mode: false, nb_pools: 4 }), [], []).formatLabel).toMatch(/poules/i);
    expect(buildConsoleSummary(tournament({ quick_mode: false, nb_pools: 1 }), [], []).formatLabel).toMatch(/directes/i);
  });
});

// Scénario obligatoire 1 — tournoi DRAFT → checklist affichée
describe("buildReadinessChecklist — scénario 1 (DRAFT)", () => {
  it("signale le manque d'inscriptions comme bloquant, jamais comme simple avertissement", () => {
    const items = buildReadinessChecklist(tournament({ status: "DRAFT" }), [reg("r1")], []);
    const registrationsItem = items.find((i) => i.id === "registrations")!;
    expect(registrationsItem.level).toBe("blocking");
  });

  it("valide les inscriptions dès que le minimum de 2 payées est atteint", () => {
    const items = buildReadinessChecklist(tournament(), [reg("r1"), reg("r2")], []);
    expect(items.find((i) => i.id === "registrations")!.level).toBe("ok");
  });
});

// Scénario obligatoire 2 — tournoi OPEN → informations de préparation correctes
describe("buildReadinessChecklist — scénario 2 (OPEN)", () => {
  it("poules non générées : avertissement, jamais bloquant (cas légitime avant/après démarrage)", () => {
    const items = buildReadinessChecklist(tournament({ status: "OPEN", nb_pools: 3 }), [reg("r1"), reg("r2")], []);
    const poolsItem = items.find((i) => i.id === "pools")!;
    expect(poolsItem.level).toBe("warning");
  });

  it("poule unique : aucune génération de poules requise, phase finale auto-générée", () => {
    const items = buildReadinessChecklist(tournament({ status: "OPEN", nb_pools: 1 }), [reg("r1"), reg("r2")], []);
    expect(items.find((i) => i.id === "bracket-auto")).toBeDefined();
    expect(items.find((i) => i.id === "pools")).toBeUndefined();
  });

  it("mode rapide : aucun item poules, item format toujours ok", () => {
    const items = buildReadinessChecklist(tournament({ status: "OPEN", quick_mode: true }), [reg("r1"), reg("r2")], []);
    expect(items.find((i) => i.id === "quick-format")!.level).toBe("ok");
    expect(items.find((i) => i.id === "pools")).toBeUndefined();
  });

  it("PENDING_ENTITLEMENT bloque explicitement", () => {
    const items = buildReadinessChecklist(tournament({ status: "PENDING_ENTITLEMENT" }), [reg("r1"), reg("r2")], []);
    expect(items.find((i) => i.id === "entitlement")!.level).toBe("blocking");
  });
});

// Scénario obligatoire 5 — cibles libres / Scénario 6 — cibles occupées
describe("buildBoardsView — scénarios 5/6", () => {
  it("cible libre sans file d'attente : status free, aucun indice de prochain match", () => {
    const boards = buildBoardsView(tournament({ nb_boards: 2 }), []);
    expect(boards).toHaveLength(2);
    expect(boards.every((b) => b.status === "free" && b.match === null && b.nextMatchHint === null)).toBe(true);
  });

  it("cible occupée : status active, match attaché", () => {
    const m = match({ id: "m1", status: "IN_PROGRESS", board_number: 1 });
    const boards = buildBoardsView(tournament({ nb_boards: 2 }), [m]);
    expect(boards[0]).toMatchObject({ board: 1, status: "active", match: m });
    expect(boards[1]).toMatchObject({ board: 2, status: "free" });
  });

  it("deux matchs actifs sur la même cible (donnée corrompue) : signalé comme anomalie", () => {
    const m1 = match({ id: "m1", status: "IN_PROGRESS", board_number: 1 });
    const m2 = match({ id: "m2", status: "IN_PROGRESS", board_number: 1 });
    const boards = buildBoardsView(tournament({ nb_boards: 1 }), [m1, m2]);
    expect(boards[0].status).toBe("anomaly");
  });

  it("cible libre avec file d'attente : le premier match en attente est proposé comme indice, jamais dupliqué sur plusieurs cibles libres", () => {
    const q1 = match({ id: "q1", status: "PENDING" });
    const q2 = match({ id: "q2", status: "PENDING" });
    const boards = buildBoardsView(tournament({ nb_boards: 2 }), [q1, q2]);
    expect(boards[0].nextMatchHint?.id).toBe("q1");
    expect(boards[1].nextMatchHint?.id).toBe("q2");
  });
});

// Scénario obligatoire 7 — plusieurs matchs en attente
describe("buildMatchQueue — scénario 7", () => {
  it("place les matchs de poule avant les matchs de bracket, puis trie par round/position", () => {
    const bracketLate = match({ id: "bracket-2", status: "PENDING", pool_id: null, bracket_round: 2, bracket_position: 0 });
    const bracketEarly = match({ id: "bracket-1", status: "PENDING", pool_id: null, bracket_round: 1, bracket_position: 1 });
    const pool = match({ id: "pool-1", status: "PENDING", pool_id: "pool-a" });
    const finished = match({ id: "done", status: "FINISHED" });

    const queue = buildMatchQueue([bracketLate, bracketEarly, pool, finished]);

    expect(queue.map((m) => m.id)).toEqual(["pool-1", "bracket-1", "bracket-2"]);
  });
});

// Scénario obligatoire 8 — état sans match en cours / Scénario 9 — anomalie détectable
describe("detectIncidents — scénarios 8/9", () => {
  it("tournoi IN_PROGRESS sans aucun match actif ni en attente, mais avec un historique : incident détecté", () => {
    const incidents = detectIncidents(
      tournament({ status: "IN_PROGRESS", nb_boards: 2 }),
      [match({ id: "m1", status: "FINISHED" })]
    );
    expect(incidents.some((i) => i.id === "no-active-no-pending")).toBe(true);
  });

  it("tournoi IN_PROGRESS sans aucun match du tout (pas encore généré) : pas d'incident (pas un vrai blocage)", () => {
    const incidents = detectIncidents(tournament({ status: "IN_PROGRESS" }), []);
    expect(incidents.some((i) => i.id === "no-active-no-pending")).toBe(false);
  });

  it("cible libre alors que des matchs attendent : anomalie détectée", () => {
    const incidents = detectIncidents(
      tournament({ nb_boards: 2 }),
      [match({ id: "m1", status: "IN_PROGRESS", board_number: 1 }), match({ id: "m2", status: "PENDING" })]
    );
    expect(incidents.some((i) => i.id === "free-board-with-queue")).toBe(true);
  });

  it("aucun état anormal détectable : liste vide", () => {
    const incidents = detectIncidents(
      tournament({ status: "IN_PROGRESS", nb_boards: 1 }),
      [match({ id: "m1", status: "IN_PROGRESS", board_number: 1 })]
    );
    expect(incidents).toEqual([]);
  });

  it("match actif avec une cible hors bornes (0 ou > nb_boards) : anomalie critique", () => {
    const incidents = detectIncidents(
      tournament({ nb_boards: 2 }),
      [match({ id: "m1", status: "IN_PROGRESS", board_number: 0 })]
    );
    expect(incidents.some((i) => i.id === "match-without-valid-board" && i.severity === "critical")).toBe(true);
  });
});

// Scénario obligatoire 10 — prochaine action cohérente
describe("buildNextAction — scénario 10", () => {
  it("DRAFT → configurer le tournoi", () => {
    const t = tournament({ status: "DRAFT" });
    const action = buildNextAction("t1", t, [], buildConsoleSummary(t, [], []), [], []);
    expect(action.id).toBe("configure");
  });

  it("OPEN avec un item bloquant → résoudre l'item bloquant, jamais 'démarrer'", () => {
    const t = tournament({ status: "OPEN" });
    const checklist = buildReadinessChecklist(t, [reg("r1")], []);
    const action = buildNextAction("t1", t, checklist, buildConsoleSummary(t, [reg("r1")], []), [], []);
    expect(action.id).toContain("resolve-");
    expect(action.id).not.toBe("start");
  });

  it("OPEN prêt (aucun bloquant) → démarrer le tournoi", () => {
    const t = tournament({ status: "OPEN" });
    const registrations = [reg("r1"), reg("r2")];
    const checklist = buildReadinessChecklist(t, registrations, []);
    const action = buildNextAction("t1", t, checklist, buildConsoleSummary(t, registrations, []), [], []);
    expect(action.id).toBe("start");
  });

  it("IN_PROGRESS mode rapide sans aucun match → générer le bracket rapide", () => {
    const t = tournament({ status: "IN_PROGRESS", quick_mode: true });
    const action = buildNextAction("t1", t, [], buildConsoleSummary(t, [], []), [], []);
    expect(action.id).toBe("generate-quick-bracket");
  });

  it("IN_PROGRESS standard multi-poules sans poules générées → générer les poules", () => {
    const t = tournament({ status: "IN_PROGRESS", nb_pools: 3 });
    const action = buildNextAction("t1", t, [], buildConsoleSummary(t, [], []), [], []);
    expect(action.id).toBe("generate-pools");
  });

  it("IN_PROGRESS avec un incident → intervenir en priorité, avant 'surveiller'", () => {
    const t = tournament({ status: "IN_PROGRESS", nb_pools: 1 });
    const matches = [match({ id: "m1", status: "IN_PROGRESS", board_number: 1 }), match({ id: "m2", status: "PENDING" })];
    const incidents = [{ id: "x", severity: "warning" as const, message: "test" }];
    const action = buildNextAction("t1", t, [], buildConsoleSummary(t, [], matches), [{ id: "p1" }], incidents);
    expect(action.id).toBe("resolve-incident");
  });

  it("IN_PROGRESS avec matchs actifs/en attente, sans incident → surveiller", () => {
    const t = tournament({ status: "IN_PROGRESS", nb_pools: 1 });
    const matches = [match({ id: "m1", status: "IN_PROGRESS", board_number: 1 }), match({ id: "m2", status: "PENDING" })];
    const action = buildNextAction("t1", t, [], buildConsoleSummary(t, [], matches), [{ id: "p1" }], []);
    expect(action.id).toBe("monitor");
  });

  it("IN_PROGRESS entièrement terminé → clôturer", () => {
    const t = tournament({ status: "IN_PROGRESS", nb_pools: 1 });
    const matches = [match({ id: "m1", status: "FINISHED" })];
    const action = buildNextAction("t1", t, [], buildConsoleSummary(t, [], matches), [{ id: "p1" }], []);
    expect(action.id).toBe("close");
  });

  it("FINISHED → aucune action de conduite, seulement une consultation (scénario obligatoire 4)", () => {
    const t = tournament({ status: "FINISHED" });
    const action = buildNextAction("t1", t, [], buildConsoleSummary(t, [], []), [], []);
    expect(action.tone).toBe("info");
    expect(action.id).toBe("finished");
  });
});

describe("buildParticipantsSummary — mission §9 (présence minimale)", () => {
  it("distingue inscrits, engagés dans un match, et inscriptions payées inutilisées", () => {
    const registrations = [reg("r1"), reg("r2"), reg("r3")];
    const matches = [match({ id: "m1", player1_id: "r1", player2_id: "r2" })];

    const summary = buildParticipantsSummary(registrations, matches);

    expect(summary.totalRegistrations).toBe(3);
    expect(summary.paidRegistrations).toBe(3);
    expect(summary.engagedCount).toBe(2);
    expect(summary.unusedPaidCount).toBe(1);
  });

  it("n'accuse jamais une inscription de forfait tant qu'aucun match n'existe (tournoi pas encore démarré)", () => {
    const summary = buildParticipantsSummary([reg("r1"), reg("r2")], []);
    expect(summary.unusedPaidCount).toBe(0);
  });
});
