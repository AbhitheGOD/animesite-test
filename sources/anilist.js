// AniList GraphQL API (free, no key required)
const ENDPOINT = 'https://graphql.anilist.co';

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`AniList error: ${json.errors[0].message}`);
  return json.data;
}

async function searchAnime(title) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id idMal title { romaji english }
        coverImage { large }
        bannerImage
        genres tags { name rank }
        averageScore popularity
        episodes status
        description(asHtml: false)
        startDate { year }
      }
    }
  `;
  const data = await gql(query, { search: title });
  return data.Media || null;
}

async function getSimilarByGenres(genres, excludeIds = [], limit = 10) {
  const query = `
    query ($genres: [String], $notIn: [Int], $page: Int) {
      Page(page: $page, perPage: ${limit}) {
        media(genre_in: $genres, idMal_not_in: $notIn, type: ANIME, sort: [SCORE_DESC], status: FINISHED) {
          id idMal title { romaji english }
          coverImage { large }
          genres averageScore popularity episodes
          startDate { year }
        }
      }
    }
  `;
  const data = await gql(query, { genres, notIn: excludeIds, page: 1 });
  return (data.Page?.media || []);
}

async function getTopByGenre(genre, limit = 15) {
  // Use tag_not_in to exclude off-theme sub-genres (e.g. Magical Girls when searching Action)
  const EXCLUDE_TAGS = {
    Action: ['Magical Girl', 'Shoujo', 'Mahou Shoujo'],
    Sports: ['Magical Girl'],
    Shonen: [],
  };
  const excludeTags = EXCLUDE_TAGS[genre] || [];

  const query = `
    query ($genre: String, $excludeTags: [String], $perPage: Int) {
      Page(perPage: $perPage) {
        media(
          genre: $genre,
          tag_not_in: $excludeTags,
          type: ANIME,
          sort: [SCORE_DESC],
          status_not: NOT_YET_RELEASED,
          averageScore_greater: 70
        ) {
          id idMal title { romaji english }
          coverImage { large }
          genres tags { name rank }
          averageScore popularity episodes
          startDate { year }
          description(asHtml: false)
        }
      }
    }
  `;
  const data = await gql(query, { genre, excludeTags, perPage: limit });
  return data.Page?.media || [];
}

async function getTrending(limit = 10) {
  const query = `
    query ($perPage: Int) {
      Page(perPage: $perPage) {
        media(type: ANIME, sort: [TRENDING_DESC], status: RELEASING) {
          id idMal title { romaji english }
          coverImage { large }
          genres averageScore popularity episodes
          startDate { year }
        }
      }
    }
  `;
  const data = await gql(query, { perPage: limit });
  return data.Page?.media || [];
}

export { searchAnime, getSimilarByGenres, getTopByGenre, getTrending };
