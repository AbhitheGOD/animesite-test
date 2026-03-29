import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRecommendations, getTrendingNow, normalizeAniList } from './recommender.js';
import { getAnimeById, searchAnime } from './sources/jikan.js';
import { getSimilarByMalId } from './sources/anilist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const WAITLIST_FILE = path.join(__dirname, '.tmp', 'waitlist.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve the frontend

// ── GET /api/search?q=naruto ─────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
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
});

// ── GET /api/anime?id=20 ─────────────────────────────────────────────────────
app.get('/api/anime', async (req, res) => {
  const malId = parseInt(req.query.id);
  if (!malId) return res.status(400).json({ error: 'Missing ?id=' });

  try {
    const [anime, anilist] = await Promise.all([
      getAnimeById(malId),
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($malId:Int){Media(idMal:$malId,type:ANIME){bannerImage coverImage{extraLarge large}}}`,
          variables: { malId }
        })
      }).then(r => r.json()).then(d => d.data?.Media || null).catch(() => null),
    ]);
    if (!anime) return res.status(404).json({ error: 'Anime not found' });

    // Extract YouTube ID from embed_url when youtube_id is missing
    if (anime.trailer && !anime.trailer.youtube_id && anime.trailer.embed_url) {
      const m = anime.trailer.embed_url.match(/embed\/([^?/]+)/);
      if (m) anime.trailer.youtube_id = m[1];
    }

    res.json({
      ...anime,
      bannerImage: anilist?.bannerImage || null,
      anilistPoster: anilist?.coverImage?.extraLarge || anilist?.coverImage?.large || null,
    });
  } catch (err) {
    console.error('[anime]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// MAL → AniList genre name mapping
const MAL_TO_ANILIST = { 'Suspense': 'Thriller', 'Award Winning': null, 'Boys Love': null, 'Girls Love': null, 'Hentai': null, 'Erotica': null, 'Avant Garde': null };
const ANILIST_GENRES = new Set(['Action','Adventure','Comedy','Drama','Ecchi','Fantasy','Horror','Mahou Shoujo','Mecha','Music','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller']);
function toAniListGenres(raw) {
  return raw.map(g => g in MAL_TO_ANILIST ? MAL_TO_ANILIST[g] : g).filter(g => g && ANILIST_GENRES.has(g));
}

// ── GET /api/similar?id=20&page=1&genres=Action,Adventure ────────────────────
app.get('/api/similar', async (req, res) => {
  const malId = parseInt(req.query.id);
  const page  = parseInt(req.query.page) || 1;
  if (!malId) return res.status(400).json({ error: 'Missing ?id=' });

  try {
    let rawGenres = (req.query.genres || '').split(',').filter(Boolean);
    if (!rawGenres.length) {
      const anime = await getAnimeById(malId);
      rawGenres = (anime?.genres || []).map(g => g.name).slice(0, 3);
    }
    let genres = toAniListGenres(rawGenres);
    // Fallback: if none matched, use first raw genre anyway
    if (!genres.length && rawGenres.length) genres = rawGenres.slice(0, 1);
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
});

// ── GET /api/recommend?q=Naruto&page=1 ───────────────────────────────────────
app.get('/api/recommend', async (req, res) => {
  const query = (req.query.q || '').trim();
  const page  = parseInt(req.query.page) || 1;
  if (!query) return res.status(400).json({ error: 'Missing query param ?q=' });

  try {
    const result = await getRecommendations(query, page);
    res.json(result);
  } catch (err) {
    console.error('[recommend]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/trending ────────────────────────────────────────────────────────
app.get('/api/trending', async (req, res) => {
  try {
    const trending = await getTrendingNow();
    res.json(trending);
  } catch (err) {
    console.error('[trending]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/supabase-config ─────────────────────────────────────────────────
app.get('/api/supabase-config', (req, res) => {
  res.json({
    url:     process.env.SUPABASE_URL     || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  });
});

// ── POST /api/waitlist ───────────────────────────────────────────────────────
app.post('/api/waitlist', (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Load existing list
  let list = [];
  if (existsSync(WAITLIST_FILE)) {
    try { list = JSON.parse(readFileSync(WAITLIST_FILE, 'utf8')); } catch {}
  }

  if (list.includes(email)) {
    return res.json({ message: 'Already on the list!' });
  }

  list.push(email);
  import('fs').then(fs => {
    fs.mkdirSync(path.join(__dirname, '.tmp'), { recursive: true });
    writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2));
  });

  console.log(`[waitlist] New signup: ${email} (total: ${list.length})`);
  res.json({ message: 'You\'re on the list!', total: list.length });
});

// Local dev only — Vercel handles its own listener
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`\n  AniScout backend running → http://localhost:${PORT}\n`);
  });
}

export default app;
