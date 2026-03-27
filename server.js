import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRecommendations, getTrendingNow } from './recommender.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const WAITLIST_FILE = path.join(__dirname, '.tmp', 'waitlist.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve the frontend

// ── GET /api/recommend?q=Naruto ──────────────────────────────────────────────
app.get('/api/recommend', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Missing query param ?q=' });

  try {
    const result = await getRecommendations(query);
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

app.listen(PORT, () => {
  console.log(`\n  AniScout backend running → http://localhost:${PORT}\n`);
});
