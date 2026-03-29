export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url     = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(500).json({ error: 'Supabase env vars not configured on server.' });
  }
  res.json({ url, anonKey });
}
