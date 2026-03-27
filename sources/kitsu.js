// Kitsu API — additional ratings, artwork, and synopsis
const BASE = 'https://kitsu.app/api/edge';

async function searchAnime(title) {
  const res = await fetch(
    `${BASE}/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=5&fields[anime]=slug,canonicalTitle,averageRating,posterImage,synopsis,episodeCount,startDate,categories`,
    { headers: { 'Accept': 'application/vnd.api+json' } }
  );
  if (!res.ok) throw new Error(`Kitsu search failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(item => ({
    id: item.id,
    slug: item.attributes.slug,
    title: item.attributes.canonicalTitle,
    rating: item.attributes.averageRating,
    poster: item.attributes.posterImage?.large || item.attributes.posterImage?.medium,
    synopsis: item.attributes.synopsis,
    episodes: item.attributes.episodeCount,
    year: item.attributes.startDate?.slice(0, 4),
  }));
}

async function getTrending(limit = 10) {
  const res = await fetch(
    `${BASE}/trending/anime?limit=${limit}&fields[anime]=slug,canonicalTitle,averageRating,posterImage,episodeCount,startDate`,
    { headers: { 'Accept': 'application/vnd.api+json' } }
  );
  if (!res.ok) throw new Error(`Kitsu trending failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(item => ({
    id: item.id,
    slug: item.attributes.slug,
    title: item.attributes.canonicalTitle,
    rating: item.attributes.averageRating,
    poster: item.attributes.posterImage?.large || item.attributes.posterImage?.medium,
    episodes: item.attributes.episodeCount,
    year: item.attributes.startDate?.slice(0, 4),
  }));
}

export { searchAnime, getTrending };
