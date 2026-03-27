import { getTrendingNow } from '../recommender.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const trending = await getTrendingNow();
    res.json(trending);
  } catch (err) {
    console.error('[trending]', err.message);
    res.status(500).json({ error: err.message });
  }
}
