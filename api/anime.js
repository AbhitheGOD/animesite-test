import { getAnimeById } from '../sources/jikan.js';

async function getAniListExtra(malId) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($malId:Int){Media(idMal:$malId,type:ANIME){bannerImage coverImage{extraLarge large}}}`,
        variables: { malId }
      })
    });
    const data = await res.json();
    return data.data?.Media || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const malId = parseInt(req.query.id);
  if (!malId) return res.status(400).json({ error: 'Missing ?id=' });

  try {
    const [anime, anilist] = await Promise.all([
      getAnimeById(malId),
      getAniListExtra(malId),
    ]);
    if (!anime) return res.status(404).json({ error: 'Anime not found' });

    res.json({
      ...anime,
      bannerImage: anilist?.bannerImage || null,
      anilistPoster: anilist?.coverImage?.extraLarge || anilist?.coverImage?.large || null,
    });
  } catch (err) {
    console.error('[anime]', err.message);
    res.status(500).json({ error: err.message });
  }
}
