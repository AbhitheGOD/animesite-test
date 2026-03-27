// Jikan v4 — unofficial MyAnimeList API (no key required)
const BASE = 'https://api.jikan.moe/v4';

async function searchAnime(query) {
  const res = await fetch(`${BASE}/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`);
  if (!res.ok) throw new Error(`Jikan search failed: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

async function getAnimeById(malId) {
  const res = await fetch(`${BASE}/anime/${malId}/full`);
  if (!res.ok) throw new Error(`Jikan fetch failed: ${res.status}`);
  const data = await res.json();
  return data.data || null;
}

async function getRecommendations(malId) {
  const res = await fetch(`${BASE}/anime/${malId}/recommendations`);
  if (!res.ok) throw new Error(`Jikan recommendations failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).slice(0, 10).map(r => r.entry);
}

async function getByGenre(genreId, limit = 10) {
  const res = await fetch(`${BASE}/anime?genres=${genreId}&order_by=score&sort=desc&limit=${limit}&sfw=true`);
  if (!res.ok) throw new Error(`Jikan genre fetch failed: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

// MAL genre IDs for common genres
export const GENRE_IDS = {
  action: 1, adventure: 2, comedy: 4, drama: 8, fantasy: 10,
  horror: 14, mystery: 7, psychological: 40, romance: 22,
  scifi: 24, sports: 30, supernatural: 37, thriller: 41,
  shonen: 27, seinen: 42, isekai: 62, mecha: 18,
};

export { searchAnime, getAnimeById, getRecommendations, getByGenre };
