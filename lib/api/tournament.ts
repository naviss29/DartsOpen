import { apiFetch } from './client';
import { getServerToken } from './auth';

const ORG_SLUG = process.env.STER_ORG_SLUG ?? process.env.NEXT_PUBLIC_STER_ORG_SLUG ?? 'dartsopen';

async function authFetch(path: string, options: RequestInit = {}) {
  const token = await getServerToken();
  return apiFetch(path, options, token);
}

// ── Tournaments ───────────────────────────────────────────────────────────────

export async function apiListTournaments() {
  const res = await authFetch(`/api/organizations/${ORG_SLUG}/tournaments`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiGetTournament(id: string) {
  const res = await authFetch(`/api/tournaments/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function apiGetTournamentPublic(id: string) {
  const res = await apiFetch(`/api/public/tournaments/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function apiCreateTournament(data: Record<string, unknown>) {
  return authFetch(`/api/organizations/${ORG_SLUG}/tournaments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiUpdateTournament(id: string, data: Record<string, unknown>) {
  return authFetch(`/api/tournaments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function apiDeleteTournament(id: string) {
  return authFetch(`/api/tournaments/${id}`, { method: 'DELETE' });
}

export async function apiUpdateTournamentStatus(id: string, status: string) {
  return authFetch(`/api/tournaments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ── Rounds ────────────────────────────────────────────────────────────────────

export async function apiAddRound(tournamentId: string, data: Record<string, unknown>) {
  return authFetch(`/api/tournaments/${tournamentId}/rounds`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiDeleteRound(tournamentId: string, roundId: string) {
  return authFetch(`/api/tournaments/${tournamentId}/rounds/${roundId}`, { method: 'DELETE' });
}

// ── Registrations ─────────────────────────────────────────────────────────────

export async function apiListRegistrations(tournamentId: string, status?: string) {
  const qs = status ? `?status=${status}` : '';
  const res = await authFetch(`/api/tournaments/${tournamentId}/registrations${qs}`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiAddRegistration(tournamentId: string, data: Record<string, unknown>) {
  return authFetch(`/api/tournaments/${tournamentId}/registrations`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiDeleteRegistration(tournamentId: string, registrationId: string) {
  return authFetch(`/api/tournaments/${tournamentId}/registrations/${registrationId}`, {
    method: 'DELETE',
  });
}

// ── Pools ─────────────────────────────────────────────────────────────────────

export async function apiListPools(tournamentId: string) {
  const res = await authFetch(`/api/tournaments/${tournamentId}/pools`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiListPoolsPublic(tournamentId: string) {
  const res = await apiFetch(`/api/public/tournaments/${tournamentId}/pools`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiGeneratePools(tournamentId: string, data: {
  pools: { name: string; playerIds: string[] }[];
  matches: { poolIndex: number; player1Id: string; player2Id: string; boardNumber: number; status: string }[];
}) {
  return authFetch(`/api/tournaments/${tournamentId}/pools/generate`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Matches ───────────────────────────────────────────────────────────────────

export async function apiListMatches(tournamentId: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await authFetch(`/api/tournaments/${tournamentId}/matches${qs}`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiListMatchesPublic(tournamentId: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await apiFetch(`/api/public/tournaments/${tournamentId}/matches${qs}`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiBulkCreateMatches(tournamentId: string, matches: unknown[]) {
  return authFetch(`/api/tournaments/${tournamentId}/matches/bulk`, {
    method: 'POST',
    body: JSON.stringify({ matches }),
  });
}

export async function apiDeleteBracketMatches(tournamentId: string) {
  return authFetch(`/api/tournaments/${tournamentId}/matches/bracket`, { method: 'DELETE' });
}

// ── Match-sets ────────────────────────────────────────────────────────────────

export async function apiProposeWinner(matchSetId: string, winnerId: string, playerSide: 1 | 2) {
  return apiFetch(`/api/public/match-sets/${matchSetId}/propose`, {
    method: 'POST',
    body: JSON.stringify({ winnerId, playerSide }),
  });
}

export async function apiConfirmWinner(matchSetId: string, playerSide: 1 | 2) {
  return apiFetch(`/api/public/match-sets/${matchSetId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ playerSide }),
  });
}

export async function apiDisputeResult(matchSetId: string) {
  return apiFetch(`/api/public/match-sets/${matchSetId}/dispute`, { method: 'POST' });
}

export async function apiMarkWinnerDirect(matchSetId: string, winnerId: string) {
  return apiFetch(`/api/public/match-sets/${matchSetId}/mark`, {
    method: 'POST',
    body: JSON.stringify({ winnerId }),
  });
}
