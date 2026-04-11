// AniList GraphQL API (free, no key required, 90 req/min)
// All public functions are wrapped with the shared TTL cache.
import { cached, TTL } from '../lib/cache.js';

const ENDPOINT = 'https://graphql.anilist.co';

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) throw new Error('AniList rate-limited (429)');
  if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`AniList error: ${json.errors[0].message}`);
  return json.data;
}

// ─── Shared fragment to keep queries DRY ────────────────────────────────────
const MEDIA_FIELDS = `
  id idMal
  title { romaji english native }
  coverImage { large extraLarge }
  bannerImage
  genres
  tags { name rank isMediaSpoiler }
  averageScore meanScore popularity favourites
  episodes status format
  startDate { year month day }
  description(asHtml: false)
`;

// ─── Single anime lookup ─────────────────────────────────────────────────────
async function searchAnime(title) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        ${MEDIA_FIELDS}
        relations {
          edges {
            relationType(version: 2)
            node { id idMal title { romaji english } coverImage { large } averageScore startDate { year } format status }
          }
        }
      }
    }
  `;
  const key = `anilist:search:${title.toLowerCase()}`;
  const data = await cached(key, () => gql(query, { search: title }), TTL.SEARCH);
  return data.Media || null;
}

// ─── Fetch a media entry by MAL ID (for relation enrichment) ─────────────────
async function getByMalId(malId) {
  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: ANIME) {
        ${MEDIA_FIELDS}
        relations {
          edges {
            relationType(version: 2)
            node { id idMal title { romaji english } coverImage { large } averageScore startDate { year } format status }
          }
        }
      }
    }
  `;
  const key = `anilist:byMal:${malId}`;
  const data = await cached(key, () => gql(query, { malId }), TTL.ANIME);
  return data.Media || null;
}

// ─── AniList's own recommendation engine for a media ID ──────────────────────
async function getAniListRecommendations(anilistId, limit = 12) {
  const query = `
    query ($id: Int, $perPage: Int) {
      Media(id: $id, type: ANIME) {
        recommendations(perPage: $perPage, sort: [RATING_DESC]) {
          nodes {
            mediaRecommendation {
              id idMal title { romaji english }
              coverImage { large }
              genres averageScore popularity episodes
              startDate { year }
              status format
            }
          }
        }
      }
    }
  `;
  const key = `anilist:recs:${anilistId}`;
  const data = await cached(key, () => gql(query, { id: anilistId, perPage: limit }), TTL.RECOMMEND);
  return (data.Media?.recommendations?.nodes || [])
    .map(n => n.mediaRecommendation)
    .filter(Boolean);
}

// ─── Similar by genre (used by /api/similar) ─────────────────────────────────
async function getSimilarByGenres(genres, excludeIds = [], limit = 10, page = 1) {
  const query = `
    query ($genres: [String], $notIn: [Int], $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage total }
        media(genre_in: $genres, idMal_not_in: $notIn, type: ANIME, sort: [SCORE_DESC], status: FINISHED) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const key = `anilist:similar:${genres.sort().join(',')}:excl${excludeIds.join(',')}:p${page}`;
  const data = await cached(key, () => gql(query, { genres, notIn: excludeIds, page, perPage: limit }), TTL.SIMILAR);
  return {
    media: data.Page?.media || [],
    hasNextPage: data.Page?.pageInfo?.hasNextPage || false,
  };
}

// ─── Top anime by genre (genre browse pages) ─────────────────────────────────
async function getTopByGenre(genre, page = 1, perPage = 24) {
  const EXCLUDE_TAGS = {
    Action: ['Magical Girl', 'Shoujo', 'Mahou Shoujo'],
    Sports: ['Magical Girl'],
  };
  const excludeTags = EXCLUDE_TAGS[genre] || [];

  const query = `
    query ($genre: String, $excludeTags: [String], $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage currentPage total }
        media(
          genre: $genre,
          tag_not_in: $excludeTags,
          type: ANIME,
          sort: [SCORE_DESC],
          status_not: NOT_YET_RELEASED,
          averageScore_greater: 65
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const key = `anilist:topGenre:${genre}:p${page}:pp${perPage}`;
  const data = await cached(key, () => gql(query, { genre, excludeTags, page, perPage }), TTL.GENRE);
  return {
    media: data.Page?.media || [],
    hasNextPage: data.Page?.pageInfo?.hasNextPage || false,
    total: data.Page?.pageInfo?.total || 0,
  };
}

// ─── Top anime by tag (demographics, e.g. Seinen) ────────────────────────────
async function getTopByTag(tag, page = 1, perPage = 24) {
  const query = `
    query ($tags: [String], $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage currentPage total }
        media(
          tag_in: $tags,
          type: ANIME,
          sort: [SCORE_DESC],
          status_not: NOT_YET_RELEASED,
          averageScore_greater: 65
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const key = `anilist:topTag:${tag}:p${page}:pp${perPage}`;
  const data = await cached(key, () => gql(query, { tags: [tag], page, perPage }), TTL.GENRE);
  return {
    media: data.Page?.media || [],
    hasNextPage: data.Page?.pageInfo?.hasNextPage || false,
    total: data.Page?.pageInfo?.total || 0,
  };
}

// ─── Similar by MAL ID (used by /api/similar) ────────────────────────────────
async function getSimilarByMalId(malId, genres, page = 1, perPage = 24) {
  const query = `
    query ($notIn: [Int], $genres: [String], $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage total }
        media(
          idMal_not_in: $notIn,
          genre_in: $genres,
          type: ANIME,
          sort: [SCORE_DESC],
          status_not: NOT_YET_RELEASED,
          averageScore_greater: 65
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const key = `anilist:similarMal:${malId}:${genres.sort().join(',')}:p${page}`;
  const data = await cached(key, () => gql(query, { notIn: [malId], genres, page, perPage }), TTL.SIMILAR);
  return {
    media: data.Page?.media || [],
    hasNextPage: data.Page?.pageInfo?.hasNextPage || false,
    total: data.Page?.pageInfo?.total || 0,
  };
}

// ─── Advanced filtered search ─────────────────────────────────────────────────
async function searchAdvanced({
  search,
  genres,
  tags,
  yearFrom,
  yearTo,
  scoreMin,
  status,
  format,
  sort = ['SCORE_DESC'],
  page = 1,
  perPage = 24,
  excludeIds = [],
} = {}) {
  const query = `
    query (
      $search: String, $genres: [String], $tags: [String],
      $yearFrom: Int, $yearTo: Int, $scoreMin: Int,
      $status: MediaStatus, $format: MediaFormat,
      $sort: [MediaSort], $page: Int, $perPage: Int,
      $notIn: [Int]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage total currentPage }
        media(
          search: $search,
          genre_in: $genres,
          tag_in: $tags,
          startDate_greater: $yearFrom,
          startDate_lesser: $yearTo,
          averageScore_greater: $scoreMin,
          status: $status,
          format: $format,
          type: ANIME,
          sort: $sort,
          idMal_not_in: $notIn,
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  // AniList date integers are in YYYYMMDD format for startDate comparisons
  const variables = {
    search: search || undefined,
    genres: genres?.length ? genres : undefined,
    tags: tags?.length ? tags : undefined,
    yearFrom: yearFrom ? yearFrom * 10000 : undefined,
    yearTo: yearTo ? yearTo * 10000 + 1231 : undefined,
    scoreMin: scoreMin ? Math.round(scoreMin * 10) : undefined,
    status: status || undefined,
    format: format || undefined,
    sort,
    page,
    perPage,
    notIn: excludeIds.length ? excludeIds : undefined,
  };

  const cacheKey = `anilist:advanced:${JSON.stringify(variables)}`;
  const data = await cached(cacheKey, () => gql(query, variables), TTL.SEARCH);
  return {
    media: data.Page?.media || [],
    hasNextPage: data.Page?.pageInfo?.hasNextPage || false,
    total: data.Page?.pageInfo?.total || 0,
    currentPage: data.Page?.pageInfo?.currentPage || 1,
  };
}

// ─── Trending now ─────────────────────────────────────────────────────────────
async function getTrending(limit = 10) {
  const query = `
    query ($perPage: Int) {
      Page(perPage: $perPage) {
        media(type: ANIME, sort: [TRENDING_DESC], status: RELEASING) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const key = `anilist:trending:${limit}`;
  const data = await cached(key, () => gql(query, { perPage: limit }), TTL.TRENDING);
  return data.Page?.media || [];
}

export {
  searchAnime,
  getByMalId,
  getAniListRecommendations,
  getSimilarByGenres,
  getTopByGenre,
  getTopByTag,
  getSimilarByMalId,
  searchAdvanced,
  getTrending,
};
