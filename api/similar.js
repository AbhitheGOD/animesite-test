import { getAnimeById } from '../sources/jikan.js';
import { getSimilarByMalId } from '../sources/anilist.js';
import { normalizeAniList } from '../recommender.js';

async function resolveGenres(req, malId) {
  const genres = (req.query.genres || '').split(',').filter(Boolean);
  if (genres.length) return genres;
  const anime = await getAnimeById(malId);
  return (anime?.genres || []).map(g => g.name).slice(0, 3);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const malId = parseInt(req.query.id);
  const page  = parseInt(req.query.page) || 1;
  if (!malId) return res.status(400).json({ error: 'Missing ?id=' });

  try {
    const genres = await resolveGenres(req, malId);
    const result = await getSimilarByMalId(malId, genres, page, 24);
    res.json({
      page,
      hasNextPage: result.hasNextPage,
      total: result.total,
      recommendations: result.media.map(normalizeAniList),
    });
  } catch (err) {
    console.error('[similar]', err.message);
    res.status(500).json({ error: err.message });
  }
}
