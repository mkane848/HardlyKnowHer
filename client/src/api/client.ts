import type { ComboLookupResponse, RecommendResponse } from '../types';

// In dev, this is left empty and Vite's proxy forwards /api to localhost:4000
// (see vite.config.ts). In production, set VITE_API_URL to your deployed
// backend's URL (e.g. https://mtg-recommender-server.onrender.com) since the
// frontend and backend are served from different domains there.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export async function fetchRecommendations(rawList: string): Promise<RecommendResponse> {
  const response = await fetch(`${API_BASE}/api/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list: rawList }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<RecommendResponse>;
}

/**
 * Asks Commander Spellbook (via our server) which combos this commander makes
 * with the user's cards. Only called from an explicit click — never on load.
 */
export async function fetchCombos(rawList: string, commanderName: string): Promise<ComboLookupResponse> {
  const response = await fetch(`${API_BASE}/api/combos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list: rawList, commanderName }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string; retryAfterSeconds?: number });
    const wait = body.retryAfterSeconds ? ` Try again in about ${body.retryAfterSeconds}s.` : '';
    throw new Error((body.error ?? `Request failed with status ${response.status}`) + wait);
  }

  return response.json() as Promise<ComboLookupResponse>;
}
