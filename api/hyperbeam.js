export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const hbApiKey = process.env.HYPERBEAM_API_KEY;
  if (!hbApiKey) return res.status(500).json({ error: 'Hyperbeam API key not configured' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: 'Server not configured' });

  // Verify caller has a valid Supabase session
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid or expired session' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // ── POST: create a new Hyperbeam VM session ───────────────────────────────
  if (req.method === 'POST') {
    try {
      const response = await fetch('https://engine.hyperbeam.com/v0/vm', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hbApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ start_url: 'https://www.youtube.com' }),
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text || 'Failed to create Hyperbeam session' });
      }

      const data = await response.json();
      return res.json({ session_id: data.session_id, embed_url: data.embed_url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE: terminate a Hyperbeam VM session ──────────────────────────────
  if (req.method === 'DELETE') {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    try {
      const response = await fetch(
        `https://engine.hyperbeam.com/v0/vm/${encodeURIComponent(session_id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${hbApiKey}` } }
      );
      return res.json({ ok: response.ok });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
