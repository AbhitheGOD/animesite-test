import { getRecommendations } from '../recommender.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
}
