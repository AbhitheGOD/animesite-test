import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRecommendations, getTrendingNow } from './recommender.js';
import { getAnimeById } from './sources/jikan.js';
import { getSimilarByMalId } from './sources/anilist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const WAITLIST_FILE = path.join(__dirname, '.tmp', 'waitlist.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve the frontend

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

// ── GET /api/similar?id=20&page=1&genres=Action,Adventure ────────────────────
app.get('/api/similar', async (req, res) => {
  const malId = parseInt(req.query.id);
  const page  = parseInt(req.query.page) || 1;
  if (!malId) return res.status(400).json({ error: 'Missing ?id=' });

  try {
    let genres = (req.query.genres || '').split(',').filter(Boolean);
    if (!genres.length) {
      const anime = await getAnimeById(malId);
      genres = (anime?.genres || []).map(g => g.name).slice(0, 3);
    }
    const result = await getSimilarByMalId(malId, genres, page, 24);
    res.json({
      page,
      hasNextPage: result.hasNextPage,
      total: result.total,
      recommendations: result.media.map(a => ({
        malId: a.idMal,
        anilistId: a.id,
        title: a.title?.english || a.title?.romaji,
        score: a.averageScore ? a.averageScore / 10 : null,
        year: a.startDate?.year,
        episodes: a.episodes,
        genres: a.genres || [],
        poster: a.coverImage?.large,
        source: 'anilist',
      })),
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
