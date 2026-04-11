// Jikan v4 — unofficial MyAnimeList API (no key required)
// All public functions are wrapped with the shared TTL cache so that
// repeated calls (warm serverless invocations, paginated UI, enrichment
// loops) never re-hit the 3 req/s rate limit unnecessarily.
import { cached, TTL } from '../lib/cache.js';

const BASE = 'https://api.jikan.moe/v4';

async function _fetch(url) {
  const res = await fetch(url);
  if (res.status === 429) throw new Error('Jikan rate-limited (429)');
  if (!res.ok) throw new Error(`Jikan request failed: ${res.status} ${url}`);
  return res.json();
}

/** Full-text search – returns raw Jikan data array */
async function searchAnime(query, { limit = 12, page = 1, type, status, genres, minScore, maxScore, startYear, endYear, orderBy, sort } = {}) {
  const params = new URLSearchParams({
    q: query,
    limit,
    page,
    sfw: 'true',
  });
  if (type)      params.set('type', type);           // tv, movie, ova, ona, special, music
  if (status)    params.set('status', status);       // airing, complete, upcoming
  if (genres)    params.set('genres', genres);       // comma-sep MAL genre IDs
  if (minScore)  params.set('min_score', minScore);
  if (maxScore)  params.set('max_score', maxScore);
  if (startYear) params.set('start_date', `${startYear}-01-01`);
  if (endYear)   params.set('end_date',   `${endYear}-12-31`);
  if (orderBy)   params.set('order_by', orderBy);   // score, popularity, rank
  if (sort)      params.set('sort', sort);           // asc, desc

  const key = `jikan:search:${params.toString()}`;
  const data = await cached(key, () => _fetch(`${BASE}/anime?${params}`), TTL.SEARCH);
  return data.data || [];
}

/** Full anime detail (includes relations, streaming links, etc.) */
async function getAnimeById(malId) {
  const key = `jikan:anime:${malId}`;
  const data = await cached(key, () => _fetch(`${BASE}/anime/${malId}/full`), TTL.ANIME);
  return data.data || null;
}

/** MAL user-curated recommendations for an anime */
async function getRecommendations(malId) {
  const key = `jikan:recs:${malId}`;
  const data = await cached(key, () => _fetch(`${BASE}/anime/${malId}/recommendations`), TTL.RECOMMEND);
  return (data.data || []).slice(0, 10).map(r => r.entry);
}

/** Top-scoring anime in a MAL genre */
async function getByGenre(genreId, limit = 12) {
  const key = `jikan:genre:${genreId}:${limit}`;
  const data = await cached(key, () => _fetch(`${BASE}/anime?genres=${genreId}&order_by=score&sort=desc&limit=${limit}&sfw=true`), TTL.GENRE);
  return data.data || [];
}

/** Currently airing seasonal anime */
async function getSeasonNow(limit = 24) {
  const key = `jikan:season:now:${limit}`;
  const data = await cached(key, () => _fetch(`${BASE}/seasons/now?limit=${limit}&sfw=true`), TTL.TRENDING);
  return data.data || [];
}

// MAL genre IDs for common genres
export const GENRE_IDS = {
  action: 1, adventure: 2, comedy: 4, drama: 8, fantasy: 10,
  horror: 14, mystery: 7, psychological: 40, romance: 22,
  scifi: 24, sports: 30, supernatural: 37, thriller: 41,
  shonen: 27, seinen: 42, isekai: 62, mecha: 18,
};

export { searchAnime, getAnimeById, getRecommendations, getByGenre, getSeasonNow };
