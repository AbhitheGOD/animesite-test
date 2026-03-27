import { getAnimeById } from '../sources/jikan.js';
import { getSimilarByMalId } from '../sources/anilist.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const malId = parseInt(req.query.id);
  const page  = parseInt(req.query.page) || 1;
  if (!malId) return res.status(400).json({ error: 'Missing ?id=' });

  try {
    // Get genres from the anime (page 1 only, cache on client)
    let genres = (req.query.genres || '').split(',').filter(Boolean);

    if (!genres.length) {
      const anime = await getAnimeById(malId);
      genres = (anime?.genres || []).map(g => g.name).slice(0, 3);
    }

    const result = await getSimilarByMalId(malId, genres, page, 24);

    res.json({
      page,
      hasNextPage: result.hasNextPage,
      total: result.total,
      recommendations: result.media.map(a => ({
        malId: a.idMal,
        anilistId: a.id,
        title: a.title?.english || a.title?.romaji,
        score: a.averageScore ? a.averageScore / 10 : null,
        year: a.startDate?.year,
        episodes: a.episodes,
        genres: a.genres || [],
        poster: a.coverImage?.large,
        source: 'anilist',
      })),
    });
  } catch (err) {
    console.error('[similar]', err.message);
    res.status(500).json({ error: err.message });
  }
}
