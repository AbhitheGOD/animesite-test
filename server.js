import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRecommendations, getTrendingNow, normalizeAniList } from './recommender.js';
import { getAnimeById, searchAnime } from './sources/jikan.js';
import { getSimilarByMalId, searchAdvanced } from './sources/anilist.js';

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

// ── GET /api/search-advanced ─────────────────────────────────────────────────
const ALLOWED_SORTS    = new Set(['SCORE_DESC','SCORE','POPULARITY_DESC','POPULARITY','TRENDING_DESC','START_DATE_DESC','START_DATE','FAVOURITES_DESC']);
const ALLOWED_STATUSES = new Set(['FINISHED','RELEASING','NOT_YET_RELEASED','CANCELLED','HIATUS']);
const ALLOWED_FORMATS  = new Set(['TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC']);

app.get('/api/search-advanced', async (req, res) => {
  const { q, genres, tags, year_from, year_to, score_min, status, format, sort = 'SCORE_DESC', page = '1' } = req.query;

  const parsedPage     = Math.max(1, parseInt(page) || 1);
  const parsedYearFrom = year_from ? parseInt(year_from) : undefined;
  const parsedYearTo   = year_to   ? parseInt(year_to)   : undefined;
  const parsedScore    = score_min ? parseFloat(score_min) : undefined;
  const sortValue      = ALLOWED_SORTS.has(sort) ? sort : 'SCORE_DESC';
  const statusValue    = status && ALLOWED_STATUSES.has(status.toUpperCase()) ? status.toUpperCase() : undefined;
  const formatValue    = format && ALLOWED_FORMATS.has(format.toUpperCase()) ? format.toUpperCase() : undefined;
  const genreList      = genres ? genres.split(',').map(g => g.trim()).filter(Boolean) : [];
  const tagList        = tags   ? tags.split(',').map(t => t.trim()).filter(Boolean)   : [];

  const hasFilters = q || genreList.length || tagList.length || parsedYearFrom || parsedYearTo || parsedScore || statusValue || formatValue;
  if (!hasFilters) return res.status(400).json({ error: 'Provide at least one search parameter.' });

  try {
    const result = await searchAdvanced({
      search:   q ? q.trim() : undefined,
      genres:   genreList.length ? genreList : undefined,
      tags:     tagList.length   ? tagList   : undefined,
      yearFrom: parsedYearFrom, yearTo: parsedYearTo, scoreMin: parsedScore,
      status: statusValue, format: formatValue, sort: [sortValue],
      page: parsedPage, perPage: 24,
    });
    res.json({ page: result.currentPage, hasNextPage: result.hasNextPage, total: result.total, results: result.media.map(normalizeAniList) });
  } catch (err) {
    console.error('[search-advanced]', err.message);
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

// ── Hyperbeam VM sessions ────────────────────────────────────────────────────
async function verifySupabaseToken(token) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey     = process.env.SUPABASE_ANON_KEY;
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
  });
  return userRes.ok;
}

app.post('/api/hyperbeam', async (req, res) => {
  const hbApiKey = process.env.HYPERBEAM_API_KEY;
  if (!hbApiKey) return res.status(500).json({ error: 'Hyperbeam API key not configured' });
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (!(await verifySupabaseToken(token))) return res.status(401).json({ error: 'Invalid session' });
    const response = await fetch('https://engine.hyperbeam.com/v0/vm', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${hbApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_url: 'https://www.youtube.com' }),
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text || 'Failed to create Hyperbeam session' });
    }
    const data = await response.json();
    res.json({ session_id: data.session_id, embed_url: data.embed_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/hyperbeam', async (req, res) => {
  const hbApiKey = process.env.HYPERBEAM_API_KEY;
  if (!hbApiKey) return res.status(500).json({ error: 'Hyperbeam API key not configured' });
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (!(await verifySupabaseToken(token))) return res.status(401).json({ error: 'Invalid session' });
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
    const response = await fetch(
      `https://engine.hyperbeam.com/v0/vm/${encodeURIComponent(session_id)}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${hbApiKey}` } }
    );
    res.json({ ok: response.ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/queue/suggest ──────────────────────────────────────────────────
// Bypass RLS for room_queue inserts — verifies JWT + membership server-side,
// then writes with the service role key so any room member can suggest.
app.post('/api/queue/suggest', async (req, res) => {
  const { roomId, videoId, videoTitle, username, accessToken } = req.body;
  if (!roomId || !videoId || !videoTitle || !accessToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey     = process.env.SUPABASE_ANON_KEY;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    // 1. Verify the user's JWT
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': anonKey }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid or expired session' });
    const user = await userRes.json();
    if (!user?.id) return res.status(401).json({ error: 'Could not identify user' });

    // 2. Verify room membership (uses the user's own token — respects SELECT policy)
    const memRes = await fetch(
      `${supabaseUrl}/rest/v1/room_members?room_id=eq.${encodeURIComponent(roomId)}&user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': anonKey } }
    );
    const members = await memRes.json().catch(() => []);
    if (!Array.isArray(members) || members.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    // 3. Insert using service role key (bypasses RLS) if available,
    //    otherwise fall back to the user's own token
    const writeKey    = serviceKey || anonKey;
    const writeBearer = serviceKey ? `Bearer ${serviceKey}` : `Bearer ${accessToken}`;

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/room_queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': writeBearer,
        'apikey': writeKey,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        room_id: roomId, video_id: videoId, video_title: videoTitle,
        suggested_by: user.id, suggested_by_username: username || 'Anonymous',
      }),
    });

    if (!insertRes.ok) {
      const txt = await insertRes.text();
      return res.status(400).json({ error: txt || 'Could not add to queue' });
    }

    res.json({ ok: true });
  } catch (err) {
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
  mkdirSync(path.join(__dirname, '.tmp'), { recursive: true });
  writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2));

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
