/**
 * /api/search-advanced
 *
 * Advanced filtered anime search powered by AniList (which natively supports
 * all filter dimensions) with an optional full-text query.
 *
 * Query params:
 *   q          string   – free-text title search (optional)
 *   genres     string   – comma-sep AniList genre names, e.g. "Action,Drama"
 *   tags       string   – comma-sep AniList tag names, e.g. "Isekai,Time Travel"
 *   year_from  int      – start year (inclusive)
 *   year_to    int      – end year (inclusive)
 *   score_min  float    – minimum score out of 10 (e.g. 7.5)
 *   status     string   – FINISHED | RELEASING | NOT_YET_RELEASED | CANCELLED | HIATUS
 *   format     string   – TV | MOVIE | OVA | ONA | SPECIAL | MUSIC
 *   sort       string   – SCORE_DESC (default) | POPULARITY_DESC | TRENDING_DESC | START_DATE_DESC
 *   page       int      – page number (default 1)
 *
 * Returns:
 *   { page, hasNextPage, total, results: NormalizedAnime[] }
 */
import { searchAdvanced } from '../sources/anilist.js';
import { normalizeAniList } from '../recommender.js';

const ALLOWED_SORTS = new Set([
  'SCORE_DESC', 'SCORE', 'POPULARITY_DESC', 'POPULARITY',
  'TRENDING_DESC', 'START_DATE_DESC', 'START_DATE', 'FAVOURITES_DESC',
]);

const ALLOWED_STATUSES = new Set([
  'FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS',
]);

const ALLOWED_FORMATS = new Set([
  'TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const {
    q,
    genres,
    tags,
    year_from,
    year_to,
    score_min,
    status,
    format,
    sort = 'SCORE_DESC',
    page = '1',
  } = req.query;

  // Validate / sanitize
  const parsedPage     = Math.max(1, parseInt(page) || 1);
  const parsedYearFrom = year_from ? parseInt(year_from) : undefined;
  const parsedYearTo   = year_to   ? parseInt(year_to)   : undefined;
  const parsedScore    = score_min ? parseFloat(score_min) : undefined;
  const sortValue      = ALLOWED_SORTS.has(sort) ? sort : 'SCORE_DESC';
  const statusValue    = status && ALLOWED_STATUSES.has(status.toUpperCase())
    ? status.toUpperCase() : undefined;
  const formatValue    = format && ALLOWED_FORMATS.has(format.toUpperCase())
    ? format.toUpperCase() : undefined;

  const genreList = genres ? genres.split(',').map(g => g.trim()).filter(Boolean) : [];
  const tagList   = tags   ? tags.split(',').map(t => t.trim()).filter(Boolean)   : [];

  // Require at least one filter when there's no text query
  const hasFilters = q || genreList.length || tagList.length || parsedYearFrom ||
                     parsedYearTo || parsedScore || statusValue || formatValue;
  if (!hasFilters) {
    return res.status(400).json({ error: 'Provide at least one search parameter.' });
  }

  try {
    const result = await searchAdvanced({
      search:   q ? q.trim() : undefined,
      genres:   genreList.length ? genreList : undefined,
      tags:     tagList.length   ? tagList   : undefined,
      yearFrom: parsedYearFrom,
      yearTo:   parsedYearTo,
      scoreMin: parsedScore,
      status:   statusValue,
      format:   formatValue,
      sort:     [sortValue],
      page:     parsedPage,
      perPage:  24,
    });

    res.json({
      page:        result.currentPage,
      hasNextPage: result.hasNextPage,
      total:       result.total,
      results:     result.media.map(normalizeAniList),
    });
  } catch (err) {
    console.error('[search-advanced]', err.message);
    res.status(500).json({ error: err.message });
  }
}
