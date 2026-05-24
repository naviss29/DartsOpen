const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const ORG_SLUG = process.env.STER_ORG_SLUG ?? process.env.NEXT_PUBLIC_STER_ORG_SLUG ?? 'dartsopen';

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Organization-Slug': ORG_SLUG,
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, { ...options, headers });
}
