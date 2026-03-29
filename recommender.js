// Aggregates data from Jikan, AniList, and Kitsu to build recommendations
import * as Jikan from './sources/jikan.js';
import * as AniList from './sources/anilist.js';


// Genre keyword → { anilistName, malId }
const GENRE_MAP = {
  action:        { anilist: 'Action',       malId: 1  },
  adventure:     { anilist: 'Adventure',    malId: 2  },
  comedy:        { anilist: 'Comedy',       malId: 4  },
  drama:         { anilist: 'Drama',        malId: 8  },
  fantasy:       { anilist: 'Fantasy',      malId: 10 },
  horror:        { anilist: 'Horror',       malId: 14 },
  mystery:       { anilist: 'Mystery',      malId: 7  },
  psychological: { anilist: 'Psychological',malId: 40 },
  romance:       { anilist: 'Romance',      malId: 22 },
  'sci-fi':      { anilist: 'Sci-Fi',       malId: 24 },
  scifi:         { anilist: 'Sci-Fi',       malId: 24 },
  sports:        { anilist: 'Sports',       malId: 30 },
  supernatural:  { anilist: 'Supernatural', malId: 37 },
  thriller:      { anilist: 'Thriller',     malId: 41 },
  shonen:        { anilist: 'Action',       malId: 27 }, // shonen is a demographic, map to Action for AniList
  seinen:        { anilist: 'Action',       malId: 42 },
  isekai:        { anilist: 'Isekai',       malId: 62 },
  mecha:         { anilist: 'Mecha',        malId: 18 },
};

function detectGenre(query) {
  return GENRE_MAP[query.toLowerCase().trim()] || null;
}

// Normalize an anime entry into a standard shape
function normalizeJikan(a) {
  return {
    malId: a.mal_id,
    title: a.title_english || a.title,
    titleJapanese: a.title_japanese,
    score: a.score,
    year: a.year || a.aired?.prop?.from?.year,
    episodes: a.episodes,
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
  return {
    malId: a.idMal,
    anilistId: a.id,
    title: a.title?.english || a.title?.romaji,
    score: a.averageScore ? a.averageScore / 10 : null,
    year: a.startDate?.year,
    episodes: a.episodes,
    genres: a.genres || [],
    themes: (a.tags || []).filter(t => t.rank >= 60).map(t => t.name),
    synopsis: a.description,
    poster: a.coverImage?.large,
    banner: a.bannerImage,
    status: a.status,
    source: 'anilist',
  };
}

// Jitter-free rate limit helper (Jikan allows ~3 req/s)
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getRecommendationsByGenre(label, { anilist: anilistGenre, malId: malGenreId }, page = 1) {
  const PER_PAGE = 24;

  const [anilistResults, jikanResults] = await Promise.allSettled(
    page === 1
      ? [AniList.getTopByGenre(anilistGenre, page, PER_PAGE), Jikan.getByGenre(malGenreId, 10)]
      : [AniList.getTopByGenre(anilistGenre, page, PER_PAGE)]
  );

  const seen = new Set();
  const merged = [];

  if (anilistResults.status === 'fulfilled') {
    for (const a of anilistResults.value.media || []) {
      const key = a.idMal || `al-${a.id}`;
      if (!seen.has(key)) { seen.add(key); merged.push({ ...normalizeAniList(a), relevance: 'genre-top' }); }
    }
  }

  if (page === 1 && jikanResults.status === 'fulfilled') {
    for (const a of jikanResults.value) {
      if (!seen.has(a.mal_id)) { seen.add(a.mal_id); merged.push({ ...normalizeJikan(a), relevance: 'genre-top' }); }
    }
  }

  const hasNextPage = anilistResults.status === 'fulfilled'
    ? (anilistResults.value.hasNextPage ?? true)
    : false;

  const top = page === 1 ? (merged[0] || null) : null;

  return {
    isGenreSearch: true,
    genreLabel: label.charAt(0).toUpperCase() + label.slice(1),
    page,
    hasNextPage,
    baseAnime: top ? { ...top, synopsis: top.synopsis || `Top ${label} anime, ranked by score.` } : null,
    recommendations: merged,
    trending: [],
  };
}

export async function getRecommendations(query, page = 1) {
  // 0. Detect if the query is a genre keyword — route to genre path if so
  const genreMatch = detectGenre(query);
  if (genreMatch) {
    return getRecommendationsByGenre(query, genreMatch, page);
  }

  // 1. Search MAL for the input anime
  const searchResults = await Jikan.searchAnime(query);
  if (!searchResults.length) throw new Error(`No anime found for "${query}"`);

  const base = searchResults[0];
  const malId = base.mal_id;
  const baseNorm = normalizeJikan(base);

  // 2. Fetch MAL recommendations + AniList similar in parallel
  await delay(400); // respect Jikan rate limit
  const [malRecs, anilistBase] = await Promise.allSettled([
    Jikan.getRecommendations(malId),
    AniList.searchAnime(baseNorm.title),
  ]);

  const recEntries = malRecs.status === 'fulfilled' ? malRecs.value : [];
  const anilistData = anilistBase.status === 'fulfilled' ? anilistBase.value : null;

  // 3. Get AniList similar-by-genre using the base anime's genres
  const genres = anilistData?.genres || baseNorm.genres;

  const [anilistSimilar] = await Promise.allSettled([
    AniList.getSimilarByGenres(genres.slice(0, 3), [malId], 10),
  ]);

  // 4. Build merged list, dedup by malId
  const seen = new Set([malId]);
  const merged = [];

  // MAL recs first (highest relevance)
  for (const r of recEntries) {
    if (!seen.has(r.mal_id)) {
      seen.add(r.mal_id);
      merged.push({
        malId: r.mal_id,
        title: r.title,
        poster: r.images?.jpg?.large_image_url || r.images?.jpg?.image_url,
        score: null,
        year: null,
        episodes: null,
        genres: [],
        source: 'mal',
        relevance: 'recommended',
      });
    }
  }

  // AniList similar
  if (anilistSimilar.status === 'fulfilled') {
    for (const a of anilistSimilar.value.media || []) {
      if (a.idMal && !seen.has(a.idMal)) {
        seen.add(a.idMal);
        merged.push({ ...normalizeAniList(a), relevance: 'genre-match' });
      }
    }
  }

  // 5. Enrich top MAL recs with full details (up to 5 to avoid rate limits)
  const toEnrich = merged.filter(m => m.source === 'mal' && !m.genres.length).slice(0, 5);
  await delay(350);
  const enriched = await Promise.allSettled(
    toEnrich.map(async (m, i) => {
      await delay(i * 350);
      return Jikan.getAnimeById(m.malId);
    })
  );

  for (let i = 0; i < toEnrich.length; i++) {
    if (enriched[i].status === 'fulfilled' && enriched[i].value) {
      const idx = merged.findIndex(m => m.malId === toEnrich[i].malId);
      if (idx !== -1) merged[idx] = { ...merged[idx], ...normalizeJikan(enriched[i].value) };
    }
  }

  return {
    baseAnime: {
      ...baseNorm,
      anilistExtra: anilistData ? {
        banner: anilistData.bannerImage,
        score: anilistData.averageScore,
        popularity: anilistData.popularity,
      } : null,
    },
    recommendations: merged.slice(0, 15),
    trending: (anilistSimilar.status === 'fulfilled' ? anilistSimilar.value : [])
      .slice(0, 6)
      .map(normalizeAniList),
  };
}

export async function getTrendingNow() {
  const [anilistTrending] = await Promise.allSettled([
    AniList.getTrending(10),
  ]);

  const results = [];
  const seen = new Set();

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
