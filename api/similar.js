import { getAnimeById } from '../sources/jikan.js';
import { getSimilarByMalId } from '../sources/anilist.js';
import { normalizeAniList } from '../recommender.js';

// MAL genre names that differ from AniList's genre names
const MAL_TO_ANILIST_GENRE = {
  'Suspense':      'Thriller',
  'Sci-Fi':        'Sci-Fi',
  'Slice of Life': 'Slice of Life',
  'Mahou Shoujo':  'Mahou Shoujo',
};

// AniList valid top-level genres (others are tags, not genres)
const ANILIST_GENRES = new Set([
  'Action','Adventure','Comedy','Drama','Ecchi','Fantasy','Horror',
  'Mahou Shoujo','Mecha','Music','Mystery','Psychological','Romance',
  'Sci-Fi','Slice of Life','Sports','Supernatural','Thriller',
]);

function toAniListGenres(malGenres) {
  return malGenres
    .map(g => MAL_TO_ANILIST_GENRE[g] ?? g)
    .filter(g => ANILIST_GENRES.has(g));
}

async function resolveGenres(req, malId) {
  const raw = (req.query.genres || '').split(',').filter(Boolean);
  const genres = toAniListGenres(raw.length ? raw : await (async () => {
    const anime = await getAnimeById(malId);
    return (anime?.genres || []).map(g => g.name).slice(0, 3);
  })());
  return genres;
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
