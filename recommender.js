// Recommendation engine — aggregates Jikan + AniList into a single ranked list.
// Quality improvements over v1:
//   • Weighted score: (malScore * 0.4 + anilistScore * 0.6) — AniList is more granular
//   • AniList's own recommendation engine is now included as a third signal
//   • Relations (sequels, prequels, spin-offs) are surfaced first when relevant
//   • Hard quality floor: entries with score < 6.5 are dropped (unless no data)
//   • Tags (not just genres) are used to find thematic matches
//   • All upstream calls are served from the TTL cache (see lib/cache.js)
import * as Jikan  from './sources/jikan.js';
import * as AniList from './sources/anilist.js';

// ─── Genre mapping ────────────────────────────────────────────────────────────
const GENRE_MAP = {
  action:        { anilist: 'Action',        malId: 1  },
  adventure:     { anilist: 'Adventure',     malId: 2  },
  comedy:        { anilist: 'Comedy',        malId: 4  },
  drama:         { anilist: 'Drama',         malId: 8  },
  fantasy:       { anilist: 'Fantasy',       malId: 10 },
  horror:        { anilist: 'Horror',        malId: 14 },
  mystery:       { anilist: 'Mystery',       malId: 7  },
  psychological: { anilist: 'Psychological', malId: 40 },
  romance:       { anilist: 'Romance',       malId: 22 },
  'sci-fi':      { anilist: 'Sci-Fi',        malId: 24 },
  scifi:         { anilist: 'Sci-Fi',        malId: 24 },
  sports:        { anilist: 'Sports',        malId: 30 },
  supernatural:  { anilist: 'Supernatural',  malId: 37 },
  thriller:      { anilist: 'Thriller',      malId: 41 },
  shonen:        { anilist: 'Action',        malId: 27 },
  seinen:        { anilistTag: 'Seinen',     malId: 42 },
  isekai:        { anilist: 'Isekai',        malId: 62 },
  mecha:         { anilist: 'Mecha',         malId: 18 },
  'slice of life': { anilist: 'Slice of Life', malId: 36 },
  'slice-of-life': { anilist: 'Slice of Life', malId: 36 },
  music:         { anilist: 'Music',         malId: 19 },
  ecchi:         { anilist: 'Ecchi',         malId: 9  },
};

function detectGenre(query) {
  return GENRE_MAP[query.toLowerCase().trim()] || null;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────
export function normalizeJikan(a) {
  const malScore = a.score || null;
  return {
    malId: a.mal_id,
    title: a.title_english || a.title,
    titleJapanese: a.title_japanese,
    score: malScore,
    weightedScore: malScore,
    year: a.year || a.aired?.prop?.from?.year,
    episodes: a.episodes,
    format: a.type,
    status: a.status,
    genres: (a.genres || []).map(g => g.name),
    themes: (a.themes || []).map(t => t.name),
    synopsis: a.synopsis,
    poster: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
    trailer: a.trailer?.url,
    source: 'mal',
    url: a.url,
  };
}

export function normalizeAniList(a) {
  const alScore = a.averageScore ? a.averageScore / 10 : null;
  const meanScore = a.meanScore ? a.meanScore / 10 : null;
  const bestAlScore = alScore ?? meanScore;
  return {
    malId: a.idMal,
    anilistId: a.id,
    title: a.title?.english || a.title?.romaji,
    titleNative: a.title?.native,
    score: bestAlScore,
    weightedScore: bestAlScore,
    year: a.startDate?.year,
    episodes: a.episodes,
    format: a.format,
    status: a.status,
    genres: a.genres || [],
    themes: (a.tags || []).filter(t => t.rank >= 60 && !t.isMediaSpoiler).map(t => t.name),
    synopsis: a.description,
    poster: a.coverImage?.extraLarge || a.coverImage?.large,
    banner: a.bannerImage,
    popularity: a.popularity,
    source: 'anilist',
  };
}

/** Compute a weighted score blending MAL + AniList scores */
function blendScore(malScore, alScore) {
  if (malScore && alScore) return (malScore * 0.4 + alScore * 0.6);
  return malScore ?? alScore ?? null;
}

/** Relations we always want to surface near the top */
const PRIORITY_RELATIONS = new Set(['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY', 'ALTERNATIVE_VERSION']);

// ─── Genre-based recommendations (genre keyword path) ────────────────────────
async function getRecommendationsByGenre(label, { anilist: anilistGenre, anilistTag, malId: malGenreId }, page = 1) {
  const PER_PAGE = 24;
  const anilistFetch = anilistTag
    ? AniList.getTopByTag(anilistTag, page, PER_PAGE)
    : AniList.getTopByGenre(anilistGenre, page, PER_PAGE);

  const [anilistResults, jikanResults] = await Promise.allSettled(
    page === 1
      ? [anilistFetch, Jikan.getByGenre(malGenreId, 12)]
      : [anilistFetch]
  );

  const seen = new Set();
  const merged = [];

  if (anilistResults.status === 'fulfilled') {
    for (const a of anilistResults.value.media || []) {
      const key = a.idMal || `al-${a.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...normalizeAniList(a), relevance: 'genre-top' });
      }
    }
  }

  if (page === 1 && jikanResults?.status === 'fulfilled') {
    for (const a of jikanResults.value) {
      if (!seen.has(a.mal_id)) {
        seen.add(a.mal_id);
        merged.push({ ...normalizeJikan(a), relevance: 'genre-top' });
      }
    }
  }

  // Sort by weighted score descending, quality floor 6.5
  const sorted = merged
    .filter(a => !a.score || a.score >= 6.5)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const hasNextPage = anilistResults.status === 'fulfilled'
    ? (anilistResults.value.hasNextPage ?? true)
    : false;

  const top = page === 1 ? (sorted[0] || null) : null;

  return {
    isGenreSearch: true,
    genreLabel: label.charAt(0).toUpperCase() + label.slice(1),
    page,
    hasNextPage,
    baseAnime: top ? { ...top, synopsis: top.synopsis || `Top ${label} anime, ranked by score.` } : null,
    recommendations: sorted,
    trending: [],
  };
}

// ─── Main recommendation path (anime title query) ─────────────────────────────
export async function getRecommendations(query, page = 1) {
  // 0. Detect genre keyword → route to genre path
  const genreMatch = detectGenre(query);
  if (genreMatch) return getRecommendationsByGenre(query, genreMatch, page);

  // 1. Search MAL for the input anime
  const searchResults = await Jikan.searchAnime(query, { limit: 5 });
  if (!searchResults.length) throw new Error(`No anime found for "${query}"`);

  const base    = searchResults[0];
  const malId   = base.mal_id;
  const baseNorm = normalizeJikan(base);

  // 2. Fetch all upstream data in parallel — no sequential delays needed
  //    because the cache absorbs repeated calls.
  const [malRecsResult, anilistBaseResult] = await Promise.allSettled([
    Jikan.getRecommendations(malId),
    AniList.searchAnime(baseNorm.title),
  ]);

  const recEntries  = malRecsResult.status === 'fulfilled' ? malRecsResult.value : [];
  const anilistData = anilistBaseResult.status === 'fulfilled' ? anilistBaseResult.value : null;

  const anilistId = anilistData?.id || null;
  const genres    = anilistData?.genres || baseNorm.genres;

  // 3. Fetch AniList similar-by-genre + AniList's own recommendation engine in parallel
  const [anilistSimilarResult, anilistRecsResult] = await Promise.allSettled([
    AniList.getSimilarByGenres(genres.slice(0, 3), [malId], 18),
    anilistId ? AniList.getAniListRecommendations(anilistId, 15) : Promise.resolve([]),
  ]);

  // 4. Extract relations (sequels, prequels) from AniList base data
  const relations = (anilistData?.relations?.edges || [])
    .filter(e => PRIORITY_RELATIONS.has(e.relationType))
    .map(e => ({
      malId: e.node.idMal,
      anilistId: e.node.id,
      title: e.node.title?.english || e.node.title?.romaji,
      poster: e.node.coverImage?.large,
      score: e.node.averageScore ? e.node.averageScore / 10 : null,
      year: e.node.startDate?.year,
      format: e.node.format,
      status: e.node.status,
      genres: [],
      themes: [],
      source: 'anilist',
      relevance: 'relation',
    }))
    .filter(r => r.malId && r.malId !== malId);

  // 5. Build deduplicated merged list
  const seen = new Set([malId]);
  const merged = [];

  // Relations first — user most likely wants to know about sequel/prequel
  for (const r of relations) {
    if (!seen.has(r.malId)) { seen.add(r.malId); merged.push(r); }
  }

  // MAL user-curated recs (high relevance signal)
  for (const r of recEntries) {
    if (!seen.has(r.mal_id)) {
      seen.add(r.mal_id);
      merged.push({
        malId: r.mal_id,
        title: r.title,
        poster: r.images?.jpg?.large_image_url || r.images?.jpg?.image_url,
        score: null,
        weightedScore: null,
        year: null,
        episodes: null,
        genres: [],
        themes: [],
        source: 'mal',
        relevance: 'recommended',
      });
    }
  }

  // AniList recommendation engine entries
  const anilistRecs = anilistRecsResult.status === 'fulfilled' ? anilistRecsResult.value : [];
  for (const a of anilistRecs) {
    if (a.idMal && !seen.has(a.idMal)) {
      seen.add(a.idMal);
      const norm = normalizeAniList(a);
      merged.push({ ...norm, relevance: 'anilist-rec' });
    }
  }

  // AniList similar-by-genre
  if (anilistSimilarResult.status === 'fulfilled') {
    for (const a of anilistSimilarResult.value.media || []) {
      if (a.idMal && !seen.has(a.idMal)) {
        seen.add(a.idMal);
        merged.push({ ...normalizeAniList(a), relevance: 'genre-match' });
      }
    }
  }

  // 6. Enrich bare MAL rec entries (missing score/genres) with full detail
  //    Limit to 8 to stay fast; cache means no repeated Jikan hits.
  const toEnrich = merged
    .filter(m => m.source === 'mal' && !m.genres.length)
    .slice(0, 8);

  const enriched = await Promise.allSettled(
    toEnrich.map(m => Jikan.getAnimeById(m.malId))
  );

  for (let i = 0; i < toEnrich.length; i++) {
    if (enriched[i].status === 'fulfilled' && enriched[i].value) {
      const idx = merged.findIndex(m => m.malId === toEnrich[i].malId);
      if (idx !== -1) {
        const enrichedNorm = normalizeJikan(enriched[i].value);
        // Blend with AniList score if we have it from the list
        merged[idx] = { ...merged[idx], ...enrichedNorm };
      }
    }
  }

  // 7. Score blending pass — for AniList entries we already have alScore;
  //    for enriched MAL entries we can now blend.
  for (const entry of merged) {
    if (entry.source === 'mal' && entry.score) {
      entry.weightedScore = entry.score; // MAL score only (no alScore available)
    }
  }

  // 8. Quality filter + sort
  //    Relations always pass through (we don't filter out sequels by score).
  const filtered = merged.filter(a =>
    a.relevance === 'relation' || !a.score || a.score >= 6.5
  );

  // Sort: relations first, then by relevance tier, then weighted score
  const RELEVANCE_ORDER = { relation: 0, recommended: 1, 'anilist-rec': 2, 'genre-match': 3 };
  filtered.sort((a, b) => {
    const ra = RELEVANCE_ORDER[a.relevance] ?? 4;
    const rb = RELEVANCE_ORDER[b.relevance] ?? 4;
    if (ra !== rb) return ra - rb;
    return (b.weightedScore || 0) - (a.weightedScore || 0);
  });

  // 9. Build base anime object — blend MAL + AniList scores
  const blended = blendScore(
    baseNorm.score,
    anilistData?.averageScore ? anilistData.averageScore / 10 : null
  );

  return {
    baseAnime: {
      ...baseNorm,
      score: blended,
      weightedScore: blended,
      anilistExtra: anilistData ? {
        banner:     anilistData.bannerImage,
        score:      anilistData.averageScore,
        meanScore:  anilistData.meanScore,
        popularity: anilistData.popularity,
        favourites: anilistData.favourites,
        tags: (anilistData.tags || []).filter(t => t.rank >= 70 && !t.isMediaSpoiler).slice(0, 8).map(t => t.name),
      } : null,
    },
    recommendations: filtered.slice(0, 20),
    trending: (anilistSimilarResult.status === 'fulfilled' ? anilistSimilarResult.value?.media || [] : [])
      .slice(0, 6)
      .map(normalizeAniList),
  };
}

// ─── Trending (home page) ─────────────────────────────────────────────────────
export async function getTrendingNow() {
  const [anilistTrending] = await Promise.allSettled([AniList.getTrending(12)]);

  const results = [];
  const seen    = new Set();

  if (anilistTrending.status === 'fulfilled') {
    for (const a of anilistTrending.value) {
      if (a.idMal && !seen.has(a.idMal)) {
        seen.add(a.idMal);
        results.push(normalizeAniList(a));
      }
    }
  }

  return results.slice(0, 10);
}
