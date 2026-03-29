import { searchAnime } from '../sources/jikan.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    const results = await searchAnime(q);
    res.json(results.slice(0, 6).map(a => ({
      malId: a.mal_id,
      title: a.title_english || a.title,
      year: a.year || a.aired?.prop?.from?.year,
      poster: a.images?.jpg?.image_url,
      score: a.score,
    })));
  } catch {
    res.json([]);
  }
}
